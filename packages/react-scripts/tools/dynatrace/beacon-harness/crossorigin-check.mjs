import { chromium } from 'playwright'

// Does crossorigin="anonymous" restore error detail for a cross-origin script?
// Serves identical throwing JS from edge.fscdn.org twice -- once with the attribute, once
// without -- so the ONLY difference is the attribute. The CDN already sends ACAO:*.
//
// This is the evidence behind the crossOriginLoading recommendation in
// ../RUM_ERROR_PROBE_SPEC.md. Measured on int, and the difference is total:
//
//   no attribute   err "Script error."  filename ""  lineno 0   -- and NO rejection event at all
//   crossorigin    err "Uncaught TypeError: Cannot read properties of null (reading 'boom')"
//                  filename xotest-co.js  lineno 4   -- plus the rejection, with its message
//
// Every application chunk is served from edge.fscdn.org, so today's production behaviour is the
// first row: sync errors are opaque and async ones are silent.
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.addInitScript(() => {
  window.__seen = []
  window.addEventListener('error', e => window.__seen.push({ t: 'err', m: e.message, f: e.filename, l: e.lineno }), true)
  window.addEventListener('unhandledrejection', e => window.__seen.push({ t: 'rej', m: (e.reason && e.reason.message) || String(e.reason) }), true)
})
await p.route('**/assets/static/js/xotest-*.js', route =>
  route.fulfill({
    status: 200,
    headers: { 'content-type': 'application/javascript', 'access-control-allow-origin': '*' },
    body: `
      var tag = location.hash || 'NA';
      setTimeout(function(){ Promise.resolve().then(function(){ throw new Error('REJECT-FROM-' + window.__tag) }) }, 200);
      setTimeout(function(){ window.__x = null; window.__x.boom }, 400);
    `,
  })
)
await p.goto('https://integration.familysearch.org/en/frontier/app-react/', { waitUntil: 'domcontentloaded', timeout: 45000 })
await p.waitForTimeout(3000)

for (const withCo of [false, true]) {
  await p.evaluate(async co => {
    window.__seen.length = 0
    window.__tag = co ? 'WITH-CROSSORIGIN' : 'NO-CROSSORIGIN'
    const s = document.createElement('script')
    s.src = `https://edge.fscdn.org/assets/static/js/xotest-${co ? 'co' : 'plain'}.js`
    if (co) s.crossOrigin = 'anonymous'
    document.head.appendChild(s)
  }, withCo)
  await p.waitForTimeout(2500)
  const seen = await p.evaluate(() => window.__seen)
  console.log(`\n--- ${withCo ? 'WITH crossorigin="anonymous"' : 'NO crossorigin attribute'} ---`)
  for (const e of seen.filter(x => !/ResizeObserver/.test(x.m || ''))) console.log('   ', JSON.stringify(e))
  if (!seen.filter(x => !/ResizeObserver/.test(x.m || '')).length) console.log('    (nothing observed)')
}
await b.close()
