// The SRI agent ships literal "#CONFIGSTRING#" placeholders and assigns them to window.dT_.cfg.
// Classic reads data-dtconfig separately (and works). Hypothesis: the Gen3/Grail module reads
// dT_.cfg, gets placeholder garbage, and never initializes -- leaving a stub window.dynatrace
// that only queues sendEvent/sendBizEvent, which matches grail=0.
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
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(12000)
  const r = await page.evaluate(() => {
    const cfg = window.dT_?.cfg
    return {
      hasDT_: !!window.dT_,
      cfg: typeof cfg === 'string' ? cfg.slice(0, 180) : String(cfg),
      placeholders: typeof cfg === 'string' && cfg.includes('#CONFIGSTRING#'),
      dynatraceCtor: window.dynatrace?.constructor?.name ?? null,
      methods: window.dynatrace ? Object.getOwnPropertyNames(Object.getPrototypeOf(window.dynatrace)).length : 0,
    }
  })
  console.log(`\n=== ${arm} ===`)
  console.log(`  dT_ present=${r.hasDT_}  placeholders=${r.placeholders}  dynatrace proto methods=${r.methods}`)
  console.log(`  dT_.cfg = ${r.cfg}`)
  await ctx.close()
}
await browser.close()
