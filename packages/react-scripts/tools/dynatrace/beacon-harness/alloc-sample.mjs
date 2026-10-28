// What do REAL visitors get? Random fs_anid UUIDs, so no individually-targeted test keys.
import { randomUUID } from 'crypto'
const ENVS = { int: 'https://integration.familysearch.org/en/frontier/app-react/', beta: 'https://beta.familysearch.org/en/frontier/app-react/', prod: 'https://www.familysearch.org/en/frontier/app-react/' }
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const N = Number(process.argv[2] || 40)
const kind = h => {
  const tag = (h.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*(?:dynatrace|ruxit)[^"']*["'][^>]*>/i) || [])[0]
  if (!tag) return /ruxit/i.test(h) ? 'inlined' : 'none'
  if (/edge\.fscdn\.org/.test(tag)) return 'self-hosted-2022'
  if (/\/sri\//.test(tag)) return /\basync\b/.test(tag) ? 'SRI async' : 'SRI sync'
  return /\basync\b/.test(tag) ? 'global-cdn async' : 'global-cdn sync'
}
for (const [env, url] of Object.entries(ENVS)) {
  const counts = {}
  await Promise.all(Array.from({ length: N }, async () => {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Cookie: `fs_anid=${randomUUID()}` } })
    const k = r.status === 200 ? kind(await r.text()) : `http ${r.status}`
    counts[k] = (counts[k] || 0) + 1
  }))
  console.log(env.padEnd(5), JSON.stringify(counts))
}
