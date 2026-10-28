// Does the agent actually BOOT on each arm? arm-verify only reads HTML.
//
// SRI fails CLOSED: a stale integrity hash makes the browser refuse to execute the
// script, and the rendered tag still looks perfect. Only a real browser catches that.
// Also captures console/pageerror so an integrity violation is visible as its own line.
import { chromium } from 'playwright'

const ARMS = {
  'off':            'd7000000-0000-4000-8000-000000000000',
  'global-cdn':     'd7000000-0000-4000-8000-000000000001',
  'asyncCS-script': 'd7000000-0000-4000-8000-000000000002',
  'asyncCS-inline': 'd7000000-0000-4000-8000-000000000003',
}
const URL_ = 'https://integration.familysearch.org/en/frontier/app-react/'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const browser = await chromium.launch()
for (const [arm, uuid] of Object.entries(ARMS)) {
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } })
  await ctx.addCookies([{ name: 'fs_anid', value: uuid, domain: '.familysearch.org', path: '/' }])
  const page = await ctx.newPage()
  const sriErrors = []
  const beacons = { classic: 0, grail: 0 }
  page.on('console', m => { if (/integrity|Subresource/i.test(m.text())) sriErrors.push(m.text().slice(0, 120)) })
  page.on('request', r => {
    const u = r.url()
    if (!/dynatrace\.com/.test(u) || r.method() !== 'POST') return
    const q = new URL(u).searchParams
    if (q.get('type') === 'js3') beacons.classic++
    else if (q.get('cy') === 'event' || q.get('ty') === 'js') beacons.grail++
  })
  const t0 = Date.now()
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 45000 })
  // Wait for the agent, but do not fail the run if it never comes -- that IS the result.
  const readyAt = await page.evaluate(() => new Promise(res => {
    const t = performance.now()
    const iv = setInterval(() => {
      if (window.dtrum) { clearInterval(iv); res(Math.round(performance.now() - t)) }
    }, 20)
    setTimeout(() => { clearInterval(iv); res(null) }, 12000)
  }))
  await page.waitForTimeout(4000)
  const r = await page.evaluate(() => {
    const dt = window.dtrum, dyn = window.dynatrace
    const proto = o => { const s = new Set(); for (let p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) Object.getOwnPropertyNames(p).forEach(k => s.add(k)); return s }
    const dynKeys = dyn ? proto(dyn) : new Set()
    return {
      dtrum: !!dt, dynatrace: !!dyn,
      gen3: ['sendEvent', 'sendBizEvent', 'setUser', 'getSessionId'].filter(k => dynKeys.has(k)),
      reportError: typeof dt?.reportError,
      appName: window.dtinfo?.appName ?? null,
      buffer: Array.isArray(window.__dtEarlyErrors) ? window.__dtEarlyErrors.length : 'absent',
    }
  })
  console.log(
    `${arm.padEnd(15)} dtrum=${r.dtrum} dynatrace=${r.dynatrace} ready=${readyAt === null ? 'NEVER' : readyAt + 'ms'} ` +
    `gen3=${r.gen3.length}/4 reportError=${r.reportError} appName=${r.appName} buffer=${r.buffer} ` +
    `beacons(classic=${beacons.classic},grail=${beacons.grail}) ${Date.now() - t0}ms`
  )
  if (sriErrors.length) console.log(`  !! SRI: ${sriErrors.join(' | ')}`)
  await ctx.close()
}
await browser.close()
