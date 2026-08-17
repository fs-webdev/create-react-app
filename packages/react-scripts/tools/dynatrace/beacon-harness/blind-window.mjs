import { chromium } from 'playwright'
import { uncompress } from 'snappyjs'
import fs from 'fs'

// Measures the async blind window as a capture curve.
//
// The page loads its OWN tag (whatever dynatrace.ejs rendered), which is the point --
// we are testing the loading strategy, not the agent. Note that
// @dynatrace/rum-javascript-sdk-playwright cannot answer this: its fixture fetches the
// agent from the API and injects it with page.addInitScript(), which runs before any page
// script and therefore bypasses the tag entirely.
//
// At each offset from navigation start we fire two things the agent instruments by
// monkey-patching -- an XHR and a thrown Error -- each carrying a unique marker. Whether
// the marker later appears in an outgoing beacon tells us whether the agent was live at
// that moment. Clicks are deliberately not used: element.click() produces isTrusted:false
// events, so a miss would be ambiguous between "blind window" and "synthetic event ignored".

const ENVS = {
  int: 'https://integration.familysearch.org/en/frontier/app-react/',
  beta: 'https://beta.familysearch.org/en/frontier/app-react/',
  prod: 'https://www.familysearch.org/en/frontier/app-react/',
}

const env = process.argv[2] || 'int'
const RUNS = Number(process.argv[3] || 5)
const OFFSETS = (process.argv[4] || '0,100,250,500,750,1000,1500,2000,3000')
  .split(',').map(Number)
const DWELL_AFTER_LAST_MS = 15000
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// Beacon bodies: Classic is percent-encoded form data, Grail is snappy-compressed JSON.
// Snappy emits literal runs verbatim, so a raw-buffer scan catches markers even when the
// framing defeats uncompress(). Search every representation and take the union.
function haystacks(buf) {
  const out = []
  const raw = buf.toString('latin1')
  out.push(raw)
  try { out.push(decodeURIComponent(raw)) } catch {}
  try { out.push(Buffer.from(uncompress(buf)).toString('utf8')) } catch {}
  // some beacons carry a short framing header before the snappy stream
  for (const skip of [1, 2, 4, 8]) {
    try { out.push(Buffer.from(uncompress(buf.subarray(skip))).toString('utf8')) } catch {}
  }
  return out
}

const browser = await chromium.launch()
const results = []

for (let run = 0; run < RUNS; run++) {
  const runId = `p${Date.now().toString(36)}${run}`
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: UA })
  const page = await ctx.newPage()

  const bodies = []
  page.on('request', req => {
    const u = req.url()
    if (!/dynatrace\.com/.test(u) || req.method() !== 'POST') return
    try {
      const b = req.postDataBuffer()
      if (b) bodies.push(b)
    } catch {}
  })

  // Scheduled in an init script so t=0 really is navigation start -- unreachable from the
  // Playwright side, which cannot act until goto() resolves.
  await page.addInitScript(
    ({ runId, offsets }) => {
      window.__probe = []
      const fire = ms => {
        // Distinct markers per signal: requests are recoverable retroactively from Resource
        // Timing, exceptions are not, so a shared marker would conflate the two.
        const xhrMarker = `dtprobe-${runId}-t${ms}-xhr`
        const errMarker = `dtprobe-${runId}-t${ms}-err`
        try {
          const x = new XMLHttpRequest()
          x.open('GET', `/?${xhrMarker}`)
          x.send()
        } catch {}
        setTimeout(() => { throw new Error(errMarker) }, 0)
        window.__probe.push({ ms, xhrMarker, errMarker, at: Math.round(performance.now()) })
      }
      for (const ms of offsets) ms === 0 ? fire(0) : setTimeout(() => fire(ms), ms)
    },
    { runId, offsets: OFFSETS }
  )

  let agentReadyMs = null
  await page.exposeFunction('__ready', () => { if (agentReadyMs === null) agentReadyMs = Date.now() - t0 })
  await page.addInitScript(() => {
    const iv = setInterval(() => { if (window.dtrum) { clearInterval(iv); window.__ready && window.__ready() } }, 20)
  })

  const t0 = Date.now()
  await page.goto(ENVS[env], { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(Math.max(...OFFSETS) + DWELL_AFTER_LAST_MS)

  const fired = await page.evaluate(() => window.__probe || []).catch(() => [])
  await ctx.close()

  const hay = bodies.flatMap(haystacks)
  const captured = {}
  for (const f of fired) {
    captured[f.ms] = {
      xhr: hay.some(h => h.includes(f.xhrMarker)),
      err: hay.some(h => h.includes(f.errMarker)),
    }
  }

  results.push({ env, run, runId, agentReadyMs, beacons: bodies.length, fired, captured })
  const line = OFFSETS.map(ms => {
    const c = captured[ms] || {}
    return `${ms}:${c.xhr ? 'X' : '.'}${c.err ? 'E' : '.'}`
  }).join(' ')
  console.log(`${env} ${run + 1}/${RUNS} ready=${agentReadyMs ?? '?'}ms beacons=${bodies.length}  ${line}`)
}

await browser.close()
fs.writeFileSync(new URL(`./data/blind-window-${env}.json`, import.meta.url), JSON.stringify(results, null, 2))

console.log(`\n=== capture rate by offset (${env}, n=${results.length}) ===`)
console.log('offset(ms)    XHR captured      Error captured')
for (const ms of OFFSETS) {
  const x = results.filter(r => r.captured[ms]?.xhr).length
  const e = results.filter(r => r.captured[ms]?.err).length
  const bar = n => `${'#'.repeat(Math.round((20 * n) / results.length)).padEnd(20)}`
  console.log(`${String(ms).padStart(9)}   ${String(x).padStart(2)}/${results.length} ${bar(x)}  ${String(e).padStart(2)}/${results.length} ${bar(e)}`)
}
const readys = results.map(r => r.agentReadyMs).filter(v => v != null).sort((a, b) => a - b)
if (readys.length) console.log(`\nagent ready: median ${readys[Math.floor(readys.length / 2)]}ms  range ${readys[0]}-${readys[readys.length - 1]}ms`)
