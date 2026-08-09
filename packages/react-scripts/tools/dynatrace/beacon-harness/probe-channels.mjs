import { chromium } from 'playwright'

const ENVS = {
  int: 'https://integration.familysearch.org/en/frontier/app-react/',
  beta: 'https://beta.familysearch.org/en/frontier/app-react/',
}
const env = process.argv[2] || 'int'
const DWELL_MS = Number(process.argv[3] || 15000)

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
})
const page = await ctx.newPage()

const rows = []
page.on('request', req => {
  const u = req.url()
  if (!/dynatrace\.com/.test(u)) return
  const parsed = new URL(u)
  if (!/\/bf\b/.test(parsed.pathname)) return
  let body = ''
  let bytes = 0
  try {
    const b = req.postDataBuffer()
    if (b) {
      bytes = b.byteLength
      body = b.toString('utf8')
    }
  } catch {}
  rows.push({
    params: Object.fromEntries(parsed.searchParams.entries()),
    bytes,
    head: body.slice(0, 180).replace(/\s+/g, ' '),
  })
})

await page.goto(ENVS[env], { waitUntil: 'domcontentloaded', timeout: 45000 })
const deadline = Date.now() + DWELL_MS
let tick = 0
while (Date.now() < deadline) {
  tick++
  await page.mouse.move(200 + (tick % 400), 200 + ((tick * 7) % 300))
  await page.evaluate(y => window.scrollTo(0, y), (tick % 6) * 250).catch(() => {})
  await page.waitForTimeout(600)
}
await page.waitForTimeout(1500)
await browser.close()

console.log(`\n===== ${env}: ${rows.length} beacon POSTs =====`)
for (const [i, r] of rows.entries()) {
  const keys = Object.keys(r.params).sort().join(',')
  console.log(`\n[${i}] bytes=${r.bytes}`)
  console.log(`    paramKeys: ${keys}`)
  console.log(`    type=${r.params.type} ty=${r.params.ty} cy=${r.params.cy} sc=${r.params.sc}`)
  console.log(`    body: ${r.head}`)
}
