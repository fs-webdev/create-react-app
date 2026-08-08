import { chromium } from 'playwright'
import fs from 'fs'

// Per-session Dynatrace upload volume, split by beacon channel.
//
// Session Replay is sampled (int: 10%), so rather than decoding an undocumented wire
// format we run many sessions and let replay ones separate by volume. Two independent
// signals per run: total upload bytes, and the _sr_/_nosr_ markers the Classic beacon
// carries inline.
//
// Channels:
//   classic (type=js3)      form-encoded RUM Classic beacon
//   grail   (ty=js&cy=event) JSON New RUM beacon
//   other                    anything else on the beacon host

const ENVS = {
  int: 'https://integration.familysearch.org/en/frontier/app-react/',
  beta: 'https://beta.familysearch.org/en/frontier/app-react/',
  prod: 'https://www.familysearch.org/en/frontier/app-react/',
}

const env = process.argv[2] || 'int'
const RUNS = Number(process.argv[3] || 10)
const DWELL_MS = Number(process.argv[4] || 20000)
const OUT = new URL(`./data/v2-${env}.jsonl`, import.meta.url)
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const browser = await chromium.launch()

for (let i = 0; i < RUNS; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: UA })
  const page = await ctx.newPage()

  const ch = { classic: 0, grail: 0, other: 0, agentGet: 0 }
  const n = { classic: 0, grail: 0, other: 0 }
  let srMarkers = 0
  let nosrMarkers = 0

  page.on('request', req => {
    const u = req.url()
    if (!/dynatrace\.com/.test(u)) return
    const parsed = new URL(u)
    let bytes = 0
    let body = ''
    try {
      const b = req.postDataBuffer()
      if (b) {
        bytes = b.byteLength
        body = b.toString('latin1')
      }
    } catch {}
    if (req.method() === 'GET') {
      ch.agentGet += 1
      return
    }
    const q = parsed.searchParams
    let kind = 'other'
    if (q.get('type') === 'js3') kind = 'classic'
    else if (q.get('cy') === 'event' || q.get('ty') === 'js') kind = 'grail'
    ch[kind] += bytes
    n[kind] += 1
    // _sr_ / _nosr_ appear URL-encoded as %7C_sr_%7C in the classic payload
    srMarkers += (body.match(/_sr_/g) || []).length
    nosrMarkers += (body.match(/_nosr_/g) || []).length
  })

  const t0 = Date.now()
  let ok = true
  try {
    await page.goto(ENVS[env], { waitUntil: 'domcontentloaded', timeout: 45000 })
    const deadline = Date.now() + DWELL_MS
    let tick = 0
    while (Date.now() < deadline) {
      tick++
      await page.mouse.move(200 + (tick % 400), 200 + ((tick * 7) % 300))
      await page.evaluate(y => window.scrollTo(0, y), (tick % 6) * 250).catch(() => {})
      await page.waitForTimeout(600)
    }
    await page.waitForTimeout(2000) // let the agent flush its final batch
  } catch {
    ok = false
  }
  await ctx.close()

  const rec = {
    env, run: i, ok,
    durationMs: Date.now() - t0,
    total: ch.classic + ch.grail + ch.other,
    classic: ch.classic, grail: ch.grail, other: ch.other,
    nClassic: n.classic, nGrail: n.grail, nOther: n.other,
    agentGet: ch.agentGet,
    srMarkers, nosrMarkers,
  }
  fs.appendFileSync(OUT, JSON.stringify(rec) + '\n')
  console.log(
    `${env} ${i + 1}/${RUNS} total=${rec.total} classic=${rec.classic} grail=${rec.grail} sr=${srMarkers} nosr=${nosrMarkers}`
  )
}

await browser.close()
