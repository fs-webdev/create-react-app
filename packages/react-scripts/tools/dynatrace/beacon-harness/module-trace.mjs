// Why do the SRI arms send no Grail beacons when their config is identical to global-cdn's?
// Hypothesis: the Grail channel lives in a secondary module the agent fetches after boot
// (ruxitagent_D_*), and that fetch fails or never happens on the SRI path.
// Trace every js-cdn request + failure, and probe the Gen3 surface.
import { chromium } from 'playwright'

const ARMS = {
  'global-cdn':     'd7000000-0000-4000-8000-000000000001',
  'asyncCS-script': 'd7000000-0000-4000-8000-000000000002',
}
const URL_ = 'https://integration.familysearch.org/en/frontier/app-react/'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const browser = await chromium.launch()
for (const [arm, uuid] of Object.entries(ARMS)) {
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } })
  await ctx.addCookies([{ name: 'fs_anid', value: uuid, domain: '.familysearch.org', path: '/' }])
  const page = await ctx.newPage()
  console.log(`\n=== ${arm} ===`)
  page.on('response', async r => {
    const u = r.url()
    if (/js-cdn\.dynatrace\.com/.test(u)) console.log(`  GET ${r.status()} ${u.replace(/^.*\/jstag\/[^/]+\//, '')}`)
  })
  page.on('requestfailed', r => {
    if (/dynatrace/.test(r.url())) console.log(`  FAILED ${r.failure()?.errorText} ${r.url().slice(0, 110)}`)
  })
  page.on('console', m => { if (/integrity|Subresource|CORS|cross-origin/i.test(m.text())) console.log(`  CONSOLE ${m.text().slice(0, 150)}`) })
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(15000)
  const surface = await page.evaluate(() => {
    const dyn = window.dynatrace
    if (!dyn) return { dynatrace: false }
    const keys = new Set()
    for (let p = dyn; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) Object.getOwnPropertyNames(p).forEach(k => keys.add(k))
    return { dynatrace: true, methods: [...keys].filter(k => typeof dyn[k] === 'function').sort() }
  })
  console.log(`  dynatrace methods: ${surface.dynatrace ? surface.methods.join(',') : 'ABSENT'}`)
  await ctx.close()
}
await browser.close()
