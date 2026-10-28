// Follow-up on a suspicious n=1 result: the SRI arms sent ZERO Grail beacons while
// global-cdn sent 2. If real, that invalidates the three-arm comparison -- the versioned
// agent takes its config from the baked data-dtconfig, which may predate enabledOnGrail,
// whereas _complete.js carries live tenant config inline.
// Longer dwell, n=3, and record the dtconfig actually served.
import { chromium } from 'playwright'

const ARMS = {
  'global-cdn':     'd7000000-0000-4000-8000-000000000001',
  'asyncCS-script': 'd7000000-0000-4000-8000-000000000002',
  'asyncCS-inline': 'd7000000-0000-4000-8000-000000000003',
}
const URL_ = 'https://integration.familysearch.org/en/frontier/app-react/'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const RUNS = 3, DWELL = 20000

const browser = await chromium.launch()
for (const [arm, uuid] of Object.entries(ARMS)) {
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } })
    await ctx.addCookies([{ name: 'fs_anid', value: uuid, domain: '.familysearch.org', path: '/' }])
    const page = await ctx.newPage()
    const b = { classic: 0, grail: 0, cBytes: 0, gBytes: 0 }
    page.on('request', r => {
      const u = r.url()
      if (!/dynatrace\.com/.test(u) || r.method() !== 'POST') return
      const q = new URL(u).searchParams
      const n = r.postDataBuffer()?.byteLength || 0
      if (q.get('type') === 'js3') { b.classic++; b.cBytes += n }
      else if (q.get('cy') === 'event' || q.get('ty') === 'js') { b.grail++; b.gBytes += n }
    })
    await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 45000 })
    const deadline = Date.now() + DWELL
    let tick = 0
    while (Date.now() < deadline) {
      tick++
      await page.mouse.move(200 + (tick % 400), 200 + ((tick * 7) % 300))
      await page.evaluate(y => window.scrollTo(0, y), (tick % 6) * 250).catch(() => {})
      await page.waitForTimeout(600)
    }
    await page.waitForTimeout(2500)
    const cfg = await page.evaluate(() => {
      const t = [...document.querySelectorAll('script[data-dtconfig]')].map(s => s.getAttribute('data-dtconfig'))
      return { dtconfig: t[0] || null, appId: window.dtrum ? 'present' : 'absent' }
    })
    console.log(`${arm.padEnd(15)} run${i} classic=${b.classic}(${b.cBytes}B) grail=${b.grail}(${b.gBytes}B)`)
    if (i === 0 && cfg.dtconfig) console.log(`  dtconfig: ${cfg.dtconfig.slice(0, 220)}`)
    await ctx.close()
  }
}
await browser.close()
