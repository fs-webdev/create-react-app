import { chromium } from 'playwright'

// Which error reporter installs its handlers first -- Dynatrace (async external script) or
// Sentry (initialised from the app bundle)? Determines whether Sentry covers the RUM blind
// window or shares it.

const ENVS = {
  int: 'https://integration.familysearch.org/en/frontier/app-react/',
  beta: 'https://beta.familysearch.org/en/frontier/app-react/',
  prod: 'https://www.familysearch.org/en/frontier/app-react/',
}
const env = process.argv[2] || 'int'
const RUNS = Number(process.argv[3] || 5)

const browser = await chromium.launch()
const rows = []
for (let i = 0; i < RUNS; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' })
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    window.__t = {}
    const mark = k => { if (window.__t[k] === undefined) window.__t[k] = Math.round(performance.now()) }
    const iv = setInterval(() => {
      if (window.dtrum) mark('dtrum')
      if (window.dynatrace) mark('dynatrace')
      if (window.Sentry) mark('Sentry')
      if (window.__SENTRY__) mark('__SENTRY__')
    }, 10)
    setTimeout(() => clearInterval(iv), 20000)
  })
  await page.goto(ENVS[env], { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(12000)
  const r = await page.evaluate(() => ({
    t: window.__t,
    sentryType: typeof window.Sentry,
    hub: !!window.__SENTRY__,
    dsn: (window.SERVER_DATA || {}).sentryDSN ? 'set' : 'unset',
    disabled: (window.SERVER_DATA || {}).sentryDisabled,
  }))
  rows.push(r)
  console.log(`${i + 1}/${RUNS} dtrum=${r.t.dtrum ?? '-'} dynatrace=${r.t.dynatrace ?? '-'} Sentry=${r.t.Sentry ?? '-'} __SENTRY__=${r.t.__SENTRY__ ?? '-'}  dsn=${r.dsn} disabled=${r.disabled}`)
  await ctx.close()
}
await browser.close()

const med = k => {
  const v = rows.map(r => r.t[k]).filter(x => x != null).sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : null
}
console.log(`\nmedian install time (${env}, n=${rows.length}):`)
for (const k of ['dtrum', 'dynatrace', 'Sentry', '__SENTRY__']) {
  const m = med(k)
  console.log(`  ${k.padEnd(12)} ${m == null ? 'never appeared' : m + 'ms'}`)
}
