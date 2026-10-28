// What does each flag arm actually render, per environment?
//
// Reads the SERVED HTML over plain HTTP rather than driving a browser. Two reasons:
//   1. The rendered tag is what we want. Reading the live DOM picks up the agent's own
//      dynamically-injected ruxitagent_D_ module instead, which looks identical across arms.
//   2. Incapsula 403s headless Chromium on beta and prod but lets a normal UA through, so this
//      works on all three environments where a Playwright-based check only works on int.
//
// Classification REPORTS what it finds instead of bucketing into an expected set. A matcher that
// only knows the current mechanisms prints "no agent" when it meets an unfamiliar one -- which is
// how a 2022 self-hosted agent serving live beta traffic nearly went unnoticed.

const ARMS = {
  'off':            'd7000000-0000-4000-8000-000000000000',
  'global-cdn':     'd7000000-0000-4000-8000-000000000001',
  'asyncCS-script': 'd7000000-0000-4000-8000-000000000002',
  'asyncCS-inline': 'd7000000-0000-4000-8000-000000000003',
}
const ENVS = {
  int:  'https://integration.familysearch.org/en/frontier/app-react/',
  beta: 'https://beta.familysearch.org/en/frontier/app-react/',
  prod: 'https://www.familysearch.org/en/frontier/app-react/',
}
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// Any script tag mentioning dynatrace or ruxit anywhere -- host, path or filename.
const TAG_RE = /<script\b[^>]*\b(?:src|data-src)\s*=\s*["'][^"']*(?:dynatrace|ruxit)[^"']*["'][^>]*>/gi
const SRC_RE = /\bsrc\s*=\s*["']([^"']+)["']/i

function classify(html) {
  const tags = html.match(TAG_RE) || []
  if (!tags.length) {
    // No external tag. An inlined agent still leaves the runtime in the response body.
    if (/\bruxit/i.test(html)) return { kind: 'LEGACY-inlined', detail: `${(html.length / 1024).toFixed(0)}KB response` }
    return { kind: 'none', detail: '' }
  }
  const tag = tags[0]
  const src = (tag.match(SRC_RE) || [])[1] || ''
  const attrs = {
    async: /\basync\b/i.test(tag),
    integrity: /\bintegrity\s*=/i.test(tag),
    dtconfig: /\bdata-dtconfig\s*=/i.test(tag),
  }
  let host = ''
  try { host = new URL(src).host } catch {}
  let kind
  if (host && host !== 'js-cdn.dynatrace.com') {
    // Self-hosted copy. These carry a build date in the filename and go stale silently.
    const stamp = (src.match(/dynatrace-(\d{8})/) || [])[1]
    kind = `LEGACY-self-hosted${stamp ? ` (${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6)})` : ''}`
  } else if (/\/sri\//.test(src)) {
    kind = attrs.async ? 'SRI async' : 'SRI sync'
  } else if (/_complete\.js/.test(src)) {
    kind = attrs.async ? 'global-cdn async' : 'global-cdn SYNC'
  } else {
    kind = 'UNRECOGNISED'
  }
  return { kind, detail: src.replace(/^https?:\/\//, '').replace(/\/jstag\/[^/]+\//, '/jstag/…/'), attrs, extra: tags.length }
}

const envArgs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ENVS)

for (const env of envArgs) {
  const url = ENVS[env]
  if (!url) { console.log(`unknown env "${env}"`); continue }
  console.log(`\n=== ${env} ===`)
  for (const [arm, uuid] of Object.entries(ARMS)) {
    let html, status
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Cookie: `fs_anid=${uuid}` }, redirect: 'follow' })
      status = r.status
      html = await r.text()
    } catch (e) {
      console.log(`  ${arm.padEnd(15)} FETCH ERROR ${String(e).slice(0, 50)}`)
      continue
    }
    if (status !== 200) { console.log(`  ${arm.padEnd(15)} http=${status}`); continue }
    const c = classify(html)
    // New-code markers: absent means the environment is running an older react-scripts.
    const vintage = /dtWhenReady/.test(html) ? 'new' : 'OLD'
    const a = c.attrs
    console.log(
      `  ${arm.padEnd(15)} ${c.kind.padEnd(26)} code=${vintage}` +
      (a ? ` async=${a.async} integrity=${a.integrity} dtconfig=${a.dtconfig}` : '') +
      (c.extra > 1 ? ` [${c.extra} tags]` : '')
    )
    if (c.detail) console.log(`  ${' '.repeat(15)} ${c.detail.slice(0, 100)}`)
  }
}
