// Is dtrum.enableManualPageDetection() actually called, per arm? Wraps the method the moment
// window.dtrum is assigned. If the trap never sees dtrum assigned, the result is INCONCLUSIVE,
// not "not called" -- the agent may define dtrum in a way the trap cannot intercept.
// Int only as written: beta/prod need an Imperva allowlist marker appended to the user agent,
// supplied at run time and never committed.
import { chromium } from 'playwright'
const ARMS = { 'global-cdn': 'd7000000-0000-4000-8000-000000000001', 'asyncCS-inline': 'd7000000-0000-4000-8000-000000000003' }
const URL_ = 'https://integration.familysearch.org/en/frontier/app-react/'
const browser = await chromium.launch()
for (const [arm, uuid] of Object.entries(ARMS)) {
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext()
    await ctx.addCookies([{ name: 'fs_anid', value: uuid, domain: '.familysearch.org', path: '/' }])
    const page = await ctx.newPage()
    await page.addInitScript(() => {
      window.__mpd = { trapped: false, calls: 0, at: null }
      const wrap = o => {
        if (!o || o.__wrapped) return o
        const orig = o.enableManualPageDetection
        if (typeof orig === 'function') {
          o.enableManualPageDetection = function () { window.__mpd.calls++; window.__mpd.at ??= Math.round(performance.now()); return orig.apply(this, arguments) }
          o.__wrapped = true
        }
        return o
      }
      let v
      Object.defineProperty(window, 'dtrum', { configurable: true, get: () => v, set: n => { window.__mpd.trapped = true; v = wrap(n) } })
    })
    await page.goto(URL_, { waitUntil: 'load' })
    await page.waitForTimeout(5000)
    const r = await page.evaluate(() => ({ ...window.__mpd, dtrum: !!window.dtrum, wrapped: !!window.dtrum?.__wrapped }))
    const verdict = !r.trapped || !r.wrapped ? 'INCONCLUSIVE (trap missed dtrum)' : r.calls ? `CALLED x${r.calls} at ${r.at}ms` : 'NOT CALLED'
    console.log(`${arm.padEnd(15)} run${i} ${verdict}  dtrum=${r.dtrum}`)
    await ctx.close()
  }
}
await browser.close()
