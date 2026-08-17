import { chromium } from 'playwright'
import { uncompress } from 'snappyjs'
import fs from 'fs'

// What does RUM see when the app never boots?
//
// chunk-failure.mjs mode `early` blocked main.*.js and found NOTHING in the beacons -- no error,
// no failed URL -- in 4/4 runs, including the 2 where the agent was already live. That is the
// opposite of the lazy-chunk result, where the failed URL always came through.
//
// n=4 could not distinguish the two explanations, which is why this exists:
//
//   sampling  costAndTrafficControl is 33, so ~1 session in 3 is monitored. P(0 of 4 monitored)
//             is (2/3)^4 = 20% -- entirely unremarkable. At n=12 it drops to 0.8%, so a second
//             empty result is real.
//   lifecycle a page whose bundle never loads may never reach the point where the agent flushes
//             a full beacon. It sent only 2.
//
// So this classifies every beacon rather than counting them: a monitored session sends a full
// Classic payload, a sampled-out one sends a ~1KB stub. That separates "we were not watching"
// from "we were watching and saw nothing", which is the whole question.

const ENVS = {
  int: 'https://integration.familysearch.org/en/frontier/app-react/',
  beta: 'https://beta.familysearch.org/en/frontier/app-react/',
  prod: 'https://www.familysearch.org/en/frontier/app-react/',
}

// Two ways the app fails to start, which are worth telling apart because only one is actionable:
//
//   blocked  main.js never arrives. Nothing we can do -- if the bundle cannot be fetched, no
//            client-side monitoring we ship is running either. Measured: RUM reports NOTHING.
//   throws   main.js arrives and evaluates, then throws at top level. This is the realistic
//            code-defect case: a syntax error fails the build and never ships, but a runtime
//            error during module-eval compiles fine -- a missing browser API, a bad assumption
//            about a global, anything that works in Chrome and dies in Safari.
//
// `throws` is the one where knowing SOMETHING broke has triage value, so it is worth measuring
// exactly how much detail survives.
const mode = process.argv[2] === 'throws' ? 'throws' : 'blocked'
const env = process.argv[3] || 'int'
const RUNS = Number(process.argv[4] || 12)
const DWELL_MS = 25000
const STUB_BYTES = 1500 // below this a Classic beacon is a sampled-out stub, not a real payload
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function haystacks(buf) {
  const out = []
  const raw = buf.toString('latin1')
  out.push(raw)
  try { out.push(decodeURIComponent(raw)) } catch {}
  try { out.push(Buffer.from(uncompress(buf)).toString('utf8')) } catch {}
  for (const skip of [1, 2, 4, 8]) {
    try { out.push(Buffer.from(uncompress(buf.subarray(skip))).toString('utf8')) } catch {}
  }
  return out
}

const browser = await chromium.launch()
const results = []

for (let run = 0; run < RUNS; run++) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: UA })
  const page = await ctx.newPage()

  const beacons = []
  page.on('request', req => {
    const u = req.url()
    if (!/dynatrace\.com/.test(u) || req.method() !== 'POST') return
    try {
      const b = req.postDataBuffer()
      if (!b) return
      const channel = /ty=js&cy=event|cy=event/.test(u) ? 'grail' : /type=js3/.test(u) ? 'classic' : 'other'
      beacons.push({ channel, bytes: b.length, buf: b })
    } catch {}
  })

  const MARK = `DEADBUNDLE-${run}-${process.pid}`
  let mainBlocked = null
  await page.route('**/assets/static/js/main.*.js*', async route => {
    mainBlocked = Date.now() - t0
    if (mode === 'blocked') return route.abort('failed')
    try {
      const real = await route.fetch()
      const text = await real.text()
      // Prepended, so it throws BEFORE the bundle evaluates -- the app never mounts, which is
      // what a defect at the top of the bundle actually does. A receipt global first, so a
      // silent result can still be told apart from "the file never ran".
      const boom = `window.__evalRan='${MARK}';var __cfg=window.__notDefined_${run};__cfg.value.x;`
      return route.fulfill({ response: real, body: `${boom}\n${text}` })
    } catch {
      return route.continue()
    }
  })

  await page.addInitScript(() => {
    window.__dead = { errors: [], agentReadyMs: null }
    window.addEventListener('error', e => {
      const el = e.target && e.target !== window ? e.target : null
      window.__dead.errors.push({
        kind: el && (el.src || el.href) ? 'resource' : 'exception',
        message: (el && (el.src || el.href)) || e.message,
        firedMs: Math.round(performance.now()),
      })
    }, true)
    const iv = setInterval(() => {
      if (window.dtrum) { clearInterval(iv); window.__dead.agentReadyMs = Math.round(performance.now()) }
    }, 20)
    setTimeout(() => clearInterval(iv), 30000)
  })

  const t0 = Date.now()
  await page.goto(ENVS[env], { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(DWELL_MS)
  const probe = await page
    .evaluate(() => ({ ...(window.__dead || { errors: [] }), evalRan: window.__evalRan || null }))
    .catch(() => ({ errors: [], evalRan: null }))
  await ctx.close()

  const classic = beacons.filter(b => b.channel === 'classic')
  const grail = beacons.filter(b => b.channel === 'grail')
  const classicBytes = classic.reduce((a, b) => a + b.bytes, 0)
  // A monitored session sends a real Classic payload; a sampled-out one sends only a stub.
  const monitored = classicBytes > STUB_BYTES || grail.length > 0
  const hay = beacons.flatMap(b => haystacks(b.buf))
  const sawMain = hay.some(h => /main\.[a-f0-9]+\.js/.test(h))
  // Did RUM learn ANYTHING? Even an opaque "Script error." tells an on-call engineer the app is
  // broken, which is the difference between a silent outage and a triageable one.
  const anyError = hay.some(h => /Script error|TypeError|has_error/i.test(h))
  const legible = hay.some(h => /Cannot read propert|undefined is not|TypeError/i.test(h))
  const evalRan = probe.evalRan

  results.push({
    run,
    mode,
    agentReadyMs: probe.agentReadyMs,
    mainTouchedMs: mainBlocked,
    monitored,
    classicBytes,
    counts: { classic: classic.length, grail: grail.length },
    sawMain,
    anyError,
    legible,
    evalRan: !!evalRan,
    errors: probe.errors,
  })
  console.log(
    `${env}/${mode} ${run + 1}/${RUNS} agent=${probe.agentReadyMs ?? 'never'} main@${mainBlocked}ms ` +
      `classic=${classic.length}/${classicBytes}B grail=${grail.length} ` +
      `${mode === 'throws' ? `evalRan=${!!evalRan} ` : ''}` +
      `anyErrorInRUM=${anyError} legible=${legible} pageErrors=${probe.errors.length}`
  )
}

await browser.close()
fs.writeFileSync(new URL(`./data/dead-bundle-${env}-${mode}.json`, import.meta.url), JSON.stringify(results, null, 2))

const n = results.length
const c = k => `${results.filter(r => r[k]).length}/${n}`
console.log(`\n=== dead bundle / ${mode} (${env}, n=${n}) ===`)
console.log(`agent loaded anyway              : ${results.filter(r => r.agentReadyMs != null).length}/${n}`)
console.log(`beacons sent (grail present)     : ${results.filter(r => r.counts.grail > 0).length}/${n}`)
if (mode === 'throws') console.log(`injected code evaluated          : ${c('evalRan')}`)
console.log(`ANY error reached RUM            : ${c('anyError')}`)
console.log(`  ...with a legible message      : ${c('legible')}`)
// In `throws` mode main.js returns 200, so this counts an ordinary successful resource entry
// and says nothing about the failure. It is only a failure signal in `blocked` mode.
console.log(`main.js URL in beacon            : ${c('sawMain')}${mode === 'throws' ? '  (loaded fine here — not a failure signal)' : ''}`)

if (mode === 'blocked') {
  console.log(
    results.some(r => r.sawMain)
      ? '\nReported after all — the earlier 0/4 was sampling.'
      : '\nREAL GAP: beacons were flowing and the failed bundle still never reached RUM.\nNothing client-side can fix this: if the bundle cannot be fetched, neither can anything we ship in it.'
  )
} else {
  const any = results.filter(r => r.anyError).length
  const leg = results.filter(r => r.legible).length
  console.log(
    leg > 0
      ? '\nTRIAGEABLE: the failure reaches RUM with a usable message.'
      : any > 0
        ? '\nDETECTABLE BUT OPAQUE: RUM shows an error, so an outage is visible, but not which line.\nThat is the gap crossOriginLoading would close.'
        : '\nSILENT: a bundle that throws on evaluation produces no RUM error at all.'
  )
}
