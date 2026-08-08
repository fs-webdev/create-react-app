import fs from 'fs'

const load = env => {
  try {
    return fs
      .readFileSync(new URL(`./data/v2-${env}.jsonl`, import.meta.url), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
      .filter(r => r.ok)
  } catch {
    return []
  }
}

const q = (xs, p) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const i = (s.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo))
}
const stat = xs => ({ n: xs.length, p25: q(xs, 0.25), p50: q(xs, 0.5), p75: q(xs, 0.75), max: Math.max(0, ...xs) })
const fmt = s => `${String(s.p50).padStart(7)}  [${s.p25}–${s.p75}]  max=${s.max}`

const envs = ['int', 'beta', 'prod']
const data = Object.fromEntries(envs.map(e => [e, load(e)]))

console.log('\n===== per-session Dynatrace upload bytes (median [p25–p75]) =====\n')
console.log('env    n   channel      bytes')
for (const e of envs) {
  const d = data[e]
  if (!d.length) { console.log(`${e.padEnd(6)} 0   (no data)`); continue }
  for (const k of ['total', 'classic', 'grail']) {
    console.log(`${e.padEnd(6)} ${String(d.length).padEnd(3)} ${k.padEnd(11)} ${fmt(stat(d.map(r => r[k])))}`)
  }
  const sr = d.filter(r => r.srMarkers > 0).length
  console.log(`       ${' '.repeat(3)} sessions w/ _sr_ marker: ${sr}/${d.length}`)
  console.log('')
}

// Bimodality: if Session Replay records in a sampled subset, those sessions should
// sit well above the rest. Print the sorted totals so any gap is visible directly.
for (const e of envs) {
  const d = data[e]
  if (d.length < 5) continue
  const totals = d.map(r => r.total).sort((a, b) => a - b)
  console.log(`${e} sorted totals: ${totals.join(' ')}`)
  const gaps = totals.slice(1).map((v, i) => ({ at: i + 1, gap: v - totals[i], v }))
  const biggest = gaps.sort((a, b) => b.gap - a.gap)[0]
  if (biggest) {
    const above = totals.length - biggest.at
    console.log(
      `  largest gap: ${biggest.gap} bytes at rank ${biggest.at}/${totals.length} ` +
        `(${above} session(s) above, ${((above / totals.length) * 100).toFixed(0)}%)`
    )
  }
  console.log('')
}

// New RUM channel cost: prod has enabledOnGrail=false, so it is the natural control.
const p = data.prod, i = data.int
if (p.length && i.length) {
  const pc = stat(p.map(r => r.classic)).p50
  const pg = stat(p.map(r => r.grail)).p50
  const ic = stat(i.map(r => r.classic)).p50
  const ig = stat(i.map(r => r.grail)).p50
  console.log('===== New RUM (Grail) channel overhead =====')
  console.log(`  prod  classic=${pc}  grail=${pg}   (New RUM off)`)
  console.log(`  int   classic=${ic}  grail=${ig}   (New RUM on)`)
  console.log(`  Grail channel adds ~${ig} bytes/session on int`)
  if (pg === 0) console.log('  prod grail == 0 confirms the channel is New-RUM-gated')
}
