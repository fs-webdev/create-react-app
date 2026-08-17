import { chromium } from 'playwright'
import { uncompress } from 'snappyjs'
import fs from 'fs'

// Does a chunk-load failure reach RUM, and by which path?
//
// This is the `chunk-load` case from ../RUM_ERROR_PROBE_SPEC.md, answered without touching
// frontier-app-react: Playwright aborts the request, the app produces a real ChunkLoadError,
// and we look for it in the outgoing beacons.
//
// Two block points, because they test different things:
//
//   lazy  -- *.chunk.js, requested 1366-2391ms, i.e. well AFTER the agent (~1091ms).
//            Tests capture, not timing. This is what a real chunk failure looks like today.
//   early -- main.*.js / commonVendor.*.js, requested 852-1119ms, racing the agent.
//            Tests the blind window with a real error shape instead of an injected throw.
//            Also covers the spec's `module-eval` case: a failed <script src> fires an error
//            event on the element, which only reaches window in the CAPTURE phase.
//
// retry-chunk-load-plugin is a dependency, so a blocked chunk retries before it finally
// fails. "Blocked at 1400ms" and "threw at 1400ms" are therefore different numbers, and both
// are recorded -- attributing a miss needs the throw time, not the block time.
//
// CACHE WARNING: page.route() disables Chromium's HTTP cache. That silently invalidated every
// warm-cache run earlier in this project. If it applies to a narrow pattern too, the agent
// downloads cold on every run and agent-ready shifts later, biasing the `early` timing. Mode
// `cache-check` measures whether it does. Run it before trusting any `early` result.

const ENVS = {
  int: 'https://integration.familysearch.org/en/frontier/app-react/',
  beta: 'https://beta.familysearch.org/en/frontier/app-react/',
  prod: 'https://www.familysearch.org/en/frontier/app-react/',
}

// Narrow on purpose -- see CACHE WARNING. The trailing * is load-bearing: RetryChunkLoadPlugin
// is configured with maxRetries 5 and a `?cache-bust=<ts>` query (config/webpack.config.js:827),
// so a pattern ending at `.chunk.js` misses every retry. They then succeed, the app recovers,
// and the run looks like "no error was ever produced" when in fact nothing stayed blocked.
const TARGETS = {
  lazy: '**/assets/static/js/*.chunk.js*',
  early: '**/assets/static/js/main.*.js*',
}

// `one:<n>` blocks only the nth *.chunk.js and lets the rest through. Blocking all of them
// (mode `lazy`) stops the app booting, so the dynamic import()'s rejection handler never runs
// and no ChunkLoadError is ever constructed -- measured: 19 resource errors, 0 ChunkLoadError,
// 0 retries. Only a single-chunk block produces the failure the retry plugin actually handles.
const mode = process.argv[2] || 'lazy'
const oneIndex = mode.startsWith('one') ? Number(mode.split(':')[1] || 0) : null
const env = process.argv[3] || 'int'
const RUNS = Number(process.argv[4] || 5)
const DWELL_MS = 25000
const AGENT_RE = /js-cdn\.dynatrace\.com.*_complete\.js/
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// Classic beacons are percent-encoded form data, Grail beacons are snappy-compressed JSON.
// Snappy emits literal runs verbatim, so a raw scan catches markers even when framing defeats
// uncompress(). Search every representation and take the union. (Shared with blind-window.mjs.)
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

// Records what actually happened in the page, independent of RUM -- otherwise "no error in the
// beacon" is ambiguous between blind window, never fired, and filtered.
const OBSERVER = () => {
  window.__chunkProbe = { errors: [], agentReadyMs: null }
  const stamp = () => Math.round(performance.now())
  const note = (kind, message, el) => {
    window.__chunkProbe.errors.push({
      kind,
      message: String(message || '').slice(0, 300),
      // <script> failures reject the import() promise; <link rel=preload|prefetch> failures are
      // silent. Which one it is decides whether a ChunkLoadError was ever possible.
      tag: el ? el.tagName + (el.rel ? `[rel=${el.rel}]` : '') : null,
      firedMs: stamp(),
      agentPresent: !!window.dtrum,
    })
  }
  // capture phase: resource errors do not bubble, and this is also how the early-error buffer
  // in dynatrace.ejs listens
  window.addEventListener('error', e => {
    const el = e.target && e.target !== window ? e.target : null
    if (el && (el.src || el.href)) note('resource', el.src || el.href, el)
    else note('exception', e.message || (e.error && e.error.message))
  }, true)
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason
    note('rejection', (r && r.message) || r)
  }, true)
  const iv = setInterval(() => {
    if (window.dtrum) { clearInterval(iv); window.__chunkProbe.agentReadyMs = stamp() }
  }, 20)
  setTimeout(() => clearInterval(iv), 30000)
}

// Reads transferSize for the agent from Resource Timing. A cache hit reports 0; a network
// fetch reports the real byte count. This is how cache-check tells the two apart.
const AGENT_TRANSFER = () => {
  const e = performance
    .getEntriesByType('resource')
    .find(r => /js-cdn\.dynatrace\.com/.test(r.name) && /_complete\.js/.test(r.name))
  return e ? { transferSize: e.transferSize, duration: Math.round(e.duration) } : null
}

async function cacheCheck() {
  // Load twice in one context, with and without a narrow route registered. If the warm load
  // still reports transferSize 0 with the route present, narrow interception preserves the
  // cache and `early` timings are trustworthy.
  const browser = await chromium.launch()
  const out = {}
  for (const withRoute of [false, true]) {
    const ctx = await browser.newContext({ userAgent: UA })
    const page = await ctx.newPage()
    if (withRoute) await page.route(TARGETS.lazy, r => r.continue())
    const seen = []
    for (const pass of ['cold', 'warm']) {
      await page.goto(ENVS[env], { waitUntil: 'load', timeout: 45000 })
      await page.waitForTimeout(4000)
      seen.push({ pass, ...(await page.evaluate(AGENT_TRANSFER)) })
    }
    out[withRoute ? 'withRoute' : 'noRoute'] = seen
    await ctx.close()
  }
  await browser.close()

  console.log(`\n=== cache-check (${env}) — agent transferSize on a warm load ===`)
  for (const [k, v] of Object.entries(out)) {
    const warm = v.find(x => x.pass === 'warm')
    console.log(`${k.padEnd(10)} cold=${v[0]?.transferSize ?? '?'}  warm=${warm?.transferSize ?? '?'}`)
  }
  const warmNo = out.noRoute?.find(x => x.pass === 'warm')?.transferSize
  const warmYes = out.withRoute?.find(x => x.pass === 'warm')?.transferSize
  if (warmNo === 0 && warmYes === 0) {
    console.log('\nnarrow route PRESERVES the cache — `early` timings are trustworthy')
  } else if (warmNo === 0 && warmYes > 0) {
    console.log('\nnarrow route DISABLES the cache — agent downloads cold every run,')
    console.log('so agent-ready shifts later and `early` timings are biased. Treat as an upper bound.')
  } else {
    console.log('\ninconclusive — the no-route warm load was not a cache hit either')
  }
  fs.writeFileSync(new URL(`./data/chunk-cache-check-${env}.json`, import.meta.url), JSON.stringify(out, null, 2))
}

async function blockRun() {
  const pattern = oneIndex === null ? TARGETS[mode] : TARGETS.lazy
  if (!pattern) throw new Error(`unknown mode "${mode}" — use lazy | one:<n> | early | cache-check`)

  const browser = await chromium.launch()
  const results = []

  for (let run = 0; run < RUNS; run++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: UA })
    const page = await ctx.newPage()

    const bodies = []
    page.on('request', req => {
      const u = req.url()
      if (!/dynatrace\.com/.test(u) || req.method() !== 'POST') return
      try { const b = req.postDataBuffer(); if (b) bodies.push(b) } catch {}
    })

    let agentSeenMs = null
    page.on('response', res => { if (agentSeenMs === null && AGENT_RE.test(res.url())) agentSeenMs = Date.now() - t0 })

    // Every attempt is aborted, including retry-chunk-load-plugin's retries, so blocked.length
    // shows the retry sequence rather than a single event.
    const blocked = []
    let seenChunks = 0
    const targetUrl = { url: null }
    await page.route(pattern, route => {
      const url = route.request().url()
      const base = url.split('?')[0]
      if (oneIndex !== null) {
        // Lock onto one chunk, then abort every attempt at it. Compare on the query-stripped
        // URL: retries arrive as `<same path>?cache-bust=<ts>`, so an exact-URL match would
        // block the first attempt and let all 5 retries through.
        if (targetUrl.url === null && seenChunks++ === oneIndex) targetUrl.url = base
        if (base !== targetUrl.url) return route.continue()
      }
      blocked.push({ url, atMs: Date.now() - t0 })
      route.abort('failed')
    })

    await page.addInitScript(OBSERVER)

    const t0 = Date.now()
    await page.goto(ENVS[env], { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(DWELL_MS)

    const probe = await page.evaluate(() => window.__chunkProbe || { errors: [] }).catch(() => ({ errors: [] }))
    await ctx.close()

    // Two independent ways a chunk failure could surface: the agent's own error string, or the
    // aborted URL recovered from Resource Timing (which is how XHRs survive the blind window).
    const hay = bodies.flatMap(haystacks)
    const files = [...new Set(blocked.map(b => b.url.split('/').pop()))]
    const inBeacon = {
      chunkError: hay.some(h => /ChunkLoadError|Loading chunk|Loading CSS chunk/i.test(h)),
      byFilename: files.some(f => hay.some(h => h.includes(f))),
      probeError: probe.errors.some(e => e.message && hay.some(h => h.includes(e.message.slice(0, 60)))),
    }

    const firstBlock = blocked[0]?.atMs ?? null
    const firstErr = probe.errors[0]?.firedMs ?? null
    results.push({ env, mode, run, files, blocked, agentSeenMs, probe, beacons: bodies.length, inBeacon })
    console.log(
      `${env}/${mode} ${run + 1}/${RUNS} blocked=${blocked.length}@${firstBlock}ms ` +
        `agent=${agentSeenMs ?? '?'}ms errors=${probe.errors.length}@${firstErr ?? '?'}ms ` +
        `beacons=${bodies.length}  captured: ${Object.entries(inBeacon).filter(([, v]) => v).map(([k]) => k).join(',') || 'NONE'}`
    )
  }

  await browser.close()
  const slug = mode.replace(':', '-')
  fs.writeFileSync(new URL(`./data/chunk-failure-${env}-${slug}.json`, import.meta.url), JSON.stringify(results, null, 2))

  const n = results.length
  const pct = k => `${results.filter(r => r.inBeacon[k]).length}/${n}`
  console.log(`\n=== ${mode} block (${env}, n=${n}) ===`)
  console.log(`error string in beacon ("ChunkLoadError"/"Loading chunk")  ${pct('chunkError')}`)
  console.log(`aborted URL in beacon (Resource Timing recovery)           ${pct('byFilename')}`)
  // For a `resource` error the observed message IS the URL, so this duplicates byFilename.
  // It only carries independent information for `exception` / `rejection` errors.
  console.log(`page-observed error message in beacon                      ${pct('probeError')}`)

  const withErrors = results.filter(r => r.probe.errors.length)
  if (withErrors.length) {
    const lag = withErrors
      .map(r => (r.probe.errors[0]?.firedMs ?? 0) - (r.blocked[0]?.atMs ?? 0))
      .sort((a, b) => a - b)
    console.log(`\nblock -> first error lag: median ${lag[Math.floor(lag.length / 2)]}ms (retry delay)`)
    const agentAtThrow = withErrors.filter(r => r.probe.errors[0]?.agentPresent).length
    console.log(`agent present when the error fired: ${agentAtThrow}/${withErrors.length}`)
    console.log(`\nsample error: ${withErrors[0].probe.errors[0].kind} — ${withErrors[0].probe.errors[0].message}`)
  } else {
    console.log('\nNo errors observed in-page. The block may not have hit a requested chunk —')
    console.log('check `blocked` in the JSON before reading anything into the capture rates.')
  }
}

if (mode === 'cache-check') await cacheCheck()
else await blockRun()
