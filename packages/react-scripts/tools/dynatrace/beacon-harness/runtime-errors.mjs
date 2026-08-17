import { chromium } from 'playwright'
import { uncompress } from 'snappyjs'
import fs from 'fs'

// Which errors that SURVIVE THE BUILD does RUM actually capture, and with how much detail?
//
// chunk-failure.mjs covers delivery failures. This covers the other family: code that compiles
// and deploys cleanly and then goes wrong at runtime. That distinction is the whole point --
// a syntax error or a statically-resolvable missing import fails the webpack build, so it never
// reaches production. Simulating those measures a case that cannot happen.
//
// What actually gets past the compiler:
//
//   typeerror       reading a property of undefined. The most common production JS error.
//   string-typo     a wrong string literal -- bad key, bad URL, bad flag name. Compiles fine.
//                   Usually produces NO error at all, just wrong behaviour.
//   missing-module  import(`./locales/${lang}`) where lang is wrong at runtime. Webpack builds a
//                   context module and cannot know, so this ships and rejects in the browser.
//   logic           an off-by-one / wrong condition. Silent by construction -- the CONTROL case,
//                   included to demonstrate the blind spot rather than to find one.
//   handler         a TypeError inside an event handler, thrown well after load.
//   promise         an unhandled rejection from an async path.
//
// Each is injected INSIDE a real cross-origin chunk from edge.fscdn.org rather than via
// addInitScript, because where the code lives changes what the browser reports. Chunk <script>
// tags carry no crossorigin attribute (webpack's crossOriginLoading defaults to false), so the
// browser may redact a cross-origin error to a bare "Script error." with no message, file or
// line -- even though the CDN sends Access-Control-Allow-Origin: *. An addInitScript injection
// would be same-origin and would silently hide that, reporting a fidelity the real app does not
// get. Verifying this is the main reason the script exists.

const ENVS = {
  int: 'https://integration.familysearch.org/en/frontier/app-react/',
  beta: 'https://beta.familysearch.org/en/frontier/app-react/',
  prod: 'https://www.familysearch.org/en/frontier/app-react/',
}

const CHUNKS = '**/assets/static/js/*.chunk.js*'
const TARGET_INDEX = 12
const DWELL_MS = 25000
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// Appended to the end of a real chunk, so it runs after that chunk has registered itself and the
// app keeps working. `MARK` makes each case greppable in the beacon; beta's error stream is
// dominated by one zion-flags console warning, so an undistinctive message would be lost in it.
const CASES = {
  // Compiles, ships, throws. `undefined is not an object` in the wild.
  typeerror: m => `var o = window.__missingConfig; o.enabled.value; /*${m}*/`,

  // A wrong string literal. Nothing throws -- the lookup just misses. Expect NOTHING in RUM.
  'string-typo': m => `
    var flags = {'frontier_snow_dynatraceRUM': 'on'}
    var v = flags['frontier_snow_dynatraceRum']   // wrong case, compiles fine
    window.__typoResult = String(v) + ' ${m}'`,

  // Webpack turns import(expr) into a context module; a bad runtime value rejects in the browser.
  'missing-module': m => `
    import('./locales/' + 'zz-NOT-A-REAL-LOCALE-${m}')
      .then(function(){}, function(e){ throw e })`,

  // The control: wrong by one, silent by construction.
  logic: m => `
    var items = [1,2,3]
    var last = items[items.length]      // undefined, not 3
    window.__logicResult = String(last) + ' ${m}'`,

  // Thrown long after load, with the agent certainly live -- isolates message fidelity from timing.
  handler: m => `
    setTimeout(function () {
      var el = document.querySelector('#definitely-not-here-${m}')
      el.getBoundingClientRect()
    }, 6000)`,

  promise: m => `
    setTimeout(function () {
      Promise.resolve().then(function () { throw new Error('rejected ${m}') })
    }, 6500)`,
}

const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : Object.keys(CASES)
const env = process.argv[3] || 'int'
const RUNS = Number(process.argv[4] || 3)

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

// Ground truth, independent of RUM. Without it, "absent from the beacon" cannot be told apart
// from "never fired" -- and for `logic` and `string-typo` nothing firing IS the expected result.
const OBSERVER = () => {
  window.__rt = { errors: [] }
  const note = (kind, message, extra) =>
    window.__rt.errors.push({
      kind,
      message: String(message || '').slice(0, 200),
      ...extra,
      firedMs: Math.round(performance.now()),
      agentPresent: !!window.dtrum,
    })
  window.addEventListener('error', e => {
    const el = e.target && e.target !== window ? e.target : null
    if (el && (el.src || el.href)) return note('resource', el.src || el.href)
    // filename/lineno blank alongside "Script error." is the cross-origin redaction signature
    note('exception', e.message, { filename: e.filename || null, lineno: e.lineno ?? null })
  }, true)
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason
    note('rejection', (r && r.message) || r)
  }, true)
}

const browser = await chromium.launch()
const results = []

for (const kase of only) {
  if (!CASES[kase]) { console.log(`skipping unknown case "${kase}"`); continue }

  for (let run = 0; run < RUNS; run++) {
    const mark = `RTPROBE-${kase}-${run}-${process.pid}`
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: UA })
    const page = await ctx.newPage()

    const bodies = []
    page.on('request', req => {
      if (!/dynatrace\.com/.test(req.url()) || req.method() !== 'POST') return
      try { const b = req.postDataBuffer(); if (b) bodies.push(b) } catch {}
    })

    let seen = 0
    let target = null
    let injected = false
    await page.route(CHUNKS, async route => {
      const base = route.request().url().split('?')[0]
      if (target === null && seen++ === TARGET_INDEX) target = base
      if (base !== target) return route.continue()
      try {
        const real = await route.fetch()
        const text = await real.text()
        injected = true
        // __rtRan is the execution receipt. The silent cases (`logic`, `string-typo`) are
        // supposed to produce no error, so "nothing in the beacon" only means something once
        // the injected code is known to have run.
        const receipt = `window.__rtRan=(window.__rtRan||[]).concat('${mark}');`
        return route.fulfill({ response: real, body: `${text}\n;${receipt}${CASES[kase](mark)}\n` })
      } catch {
        return route.continue()
      }
    })

    await page.addInitScript(OBSERVER)
    await page.goto(ENVS[env], { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(DWELL_MS)

    const probe = await page
      .evaluate(() => ({ ...(window.__rt || { errors: [] }), ran: window.__rtRan || [] }))
      .catch(() => ({ errors: [], ran: [] }))
    await ctx.close()

    const hay = bodies.flatMap(haystacks)
    const ran = (probe.ran || []).includes(mark)
    const opaque = probe.errors.filter(e => e.kind === 'exception' && /Script error/i.test(e.message))
    const detail = {
      injected,
      byMark: hay.some(h => h.includes(mark)),
      // was the specific failure legible in the beacon, or only a generic one?
      legible: hay.some(h => /TypeError|Cannot read propert|undefined is not/i.test(h)),
      opaqueInBeacon: hay.some(h => /Script error/i.test(h)),
      opaqueInPage: opaque.length > 0,
      pageErrors: probe.errors.filter(e => e.kind !== 'resource').length,
      ran,
    }

    results.push({ env, case: kase, run, mark, beacons: bodies.length, detail, errors: probe.errors })
    console.log(
      `${env}/${kase} ${run + 1}/${RUNS} injected=${injected} pageErrors=${detail.pageErrors} ` +
        `beacons=${bodies.length}  ${Object.entries(detail).filter(([k, v]) => v === true && k !== 'injected').map(([k]) => k).join(',') || 'NOTHING'}`
    )
  }
}

await browser.close()
fs.writeFileSync(new URL(`./data/runtime-errors-${env}.json`, import.meta.url), JSON.stringify(results, null, 2))

console.log(`\n=== errors that survive the build (${env}) ===`)
console.log('case            n   code ran   in beacon   legible   opaque "Script error."')
for (const kase of only) {
  const rs = results.filter(r => r.case === kase)
  if (!rs.length) continue
  const c = k => `${rs.filter(r => r.detail[k]).length}/${rs.length}`
  console.log(
    `${kase.padEnd(15)} ${String(rs.length).padStart(2)}   ${c('ran').padEnd(10)} ${c('byMark').padEnd(11)} ${c('legible').padEnd(9)} ${c('opaqueInBeacon')}`
  )
}
console.log('\n"code ran" 0/n means the injection never executed — that row proves nothing.')
const sample = results.find(r => r.errors.some(e => e.kind === 'exception'))
if (sample) {
  const e = sample.errors.find(x => x.kind === 'exception')
  console.log(`\nsample page-observed exception (${sample.case}):`)
  console.log(`  message="${e.message}" filename=${e.filename} lineno=${e.lineno}`)
  console.log('  (blank filename/lineno with "Script error." = cross-origin redaction)')
}
