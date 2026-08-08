# Dynatrace RUM: loading mechanisms, trade-offs, and why we chose what we chose

Reference for how the Dynatrace RUM agent gets onto the page, what the alternatives are, and
the reasoning behind the current choice. Companion to
[DYNATRACE_RUM_UPDATE.md](./DYNATRACE_RUM_UPDATE.md) (how to refresh the agent),
[dynatrace.ejs](../../layout/views/partials/dynatrace.ejs) (the implementation), and
[beacon-harness/](./beacon-harness/) (the beacon-volume harness and its retained raw data).

**Current decision:** serve the combined `_complete.js` tag from the Dynatrace global CDN,
loaded `async`. Provisional — see [Revisit triggers](#revisit-triggers).

**Scope:** the New RUM Experience with agent 1.343 as the committed baseline. All old-RUM code
paths were removed in 8.17.0.

---

## What is actually implemented

`frontier_snow_dynatraceRUM` is the only flag. Three meaningful states:

| Treatment | Renders | Role |
|---|---|---|
| `off` | nothing | Kill switch. Defined in int, beta and prod |
| `asyncCS-inline` | versioned OneAgent JS tag + SRI, **sync** | Fallback arm — option 4 below |
| anything else | `_complete.js`, **async** | Default — option 1 below |

Two deliberate properties:

**The default is a fallthrough, not an equality check.** Retired treatment names, a renamed
flag, and a Split outage returning `control` all still load RUM. Failing closed would produce a
silent monitoring gap, which is the one failure mode invisible in the data itself.

**The sync SRI arm covers both revisit triggers at once** — it is immutably cached (so it
survives Dynatrace never adding an `ETag`) and synchronous (so it has no blind window if `async`
proves to lose early interactions or errors). That is why one arm suffices rather than two.

Whether the New RUM Experience is active is **not** a code concern — it is the tenant's
`enabledOnGrail` setting. The former `frontier_snow_dynatraceNewRUM` flag never controlled it;
it only toggled `async`, and was removed in 8.17.0.

---

## Candidates evaluated and rejected

All three mechanisms below were **real candidates**, deployed behind the feature flag, carrying
live traffic across int, beta and prod, and measured. Each was rejected on final consideration
for the reasons recorded here. They are part of the analysis, not leftovers — and two of them
produced findings that drove the final decision even though they lost.

### The evaluation

Before the New RUM migration, `frontier_snow_dynatraceRUM` selected between three **RUM Classic**
loading mechanisms. The intent was to compare page-speed cost against maintenance cost and keep
the winner.

| Treatment | RUM Classic behaviour |
|---|---|
| `asyncCS-script` | Self-hosted agent from `edge.fscdn.org`, `async` |
| `asyncCS-inline` | Small bootstrap inlined into the HTML response (`_inline_*.ejs`, ~35 KB), `sync` |
| `global-cdn` | `_complete.js` from the Dynatrace CDN, `sync` |
| `off` | No agent |

That experiment is what produced the measurements in this document. Its conclusion was that
mechanism choice moves FCP by tens of milliseconds while agent payload moves it by hundreds — so
the decision fell to maintenance, not performance.

### Candidate: inline bootstrap — rejected

**The case for it.** The old-RUM Inline Code format was a **small synchronous bootstrap**: it
began capture immediately, then async-loaded the full library. On paper the best of both worlds —
no blind window, no third-party request before capture started, and no render-blocking download.
Of the three candidates this had the strongest theoretical position, and it is why the option was
built and tested rather than dismissed.

**Why it was rejected.** Four independent reasons, any one of which would be sufficient:

1. **New RUM has no small-bootstrap snippet format.** The available formats are JavaScript Tag
   (`_complete.js`), OneAgent JS Tag, OneAgent JS Tag + SRI, and Inline Code — but New RUM's
   inline variant inlines the *entire* agent, not a bootstrap. The property that made it
   attractive does not exist in New RUM.
2. **EJS cannot include the agent, and this caused a production 500.** `include()` compiles the
   included file as a template, and the minified agent contains the EJS open-delimiter sequence
   (a `<` immediately followed by a `%`) inside a character-class string. EJS reads it as an
   unterminated scriptlet and fails with `Could not find matching close tag for "<%"`.
3. **No caching at all.** Inlining re-ships 300–460 KB in *every* HTML response, versus one
   cached download per agent version. For repeat visitors this is strictly worse than any
   `<script>` tag.
4. **It froze.** The blob was baked into the package at release time, so it went stale exactly
   like the self-hosted arm did — see below.

The treatment *name* `asyncCS-inline` was kept and remapped to the versioned SRI tag loaded
synchronously, because renaming it would have required a coordinated Split-plus-deploy change.
That is why the name today describes neither its load mode nor its format. The sync SRI tag is
the closest available analog to what inline offered: full early capture, with the parse-block
paid only on the first uncached load.

### Candidate: self-hosted agent — rejected

**The case for it.** Serving the agent from `edge.fscdn.org` gave first-party hosting, cache
headers under our own control (including the `ETag` Dynatrace does not provide on `_complete.js`),
and the only real defence against clients that block `dynatrace.com`.

**Why it was rejected.** Three reasons:

1. **It silently failed for years.** Two of the three treatments were serving a RUM agent
   artifact dated **2022-11-04** to production, because refreshing required a fetch-script run,
   a `@fs/react-scripts` release, and a redeploy of every consuming app. This was discovered
   *during* the evaluation and became the decisive finding — it converted maintainability from a
   theoretical concern into a measured failure.
2. **The New RUM remap removed most of its advantage.** All New RUM snippet formats load from
   `js-cdn.dynatrace.com`, so the SRI arm provides no host diversity over `_complete.js`. Only
   genuine self-hosting does, and only partially — the agent still fetches a supplementary module
   from Dynatrace and beacons there regardless, so a client blocking `dynatrace.com` cannot report
   either way.
3. **It is not a supported code source.** Dynatrace's documented options for SaaS tenants are
   OneAgent-served, Dynatrace CDN (auto-injected), and Dynatrace CDN (agentless). Hosting the
   agent ourselves is none of these — it worked, but with no vendor support and no guarantee of
   surviving agent changes.

### What the rejected candidates contributed

Both losing candidates produced findings that shaped the outcome:

- The **self-hosted** arm surfaced the 2022 artifact, which is the single strongest argument for
  the mechanism that won.
- The **inline** arm established the EJS constraint, which rules out inlining permanently rather
  than just for now.
- The mechanism comparison established that **payload, not mechanism, is the performance lever** —
  which is why the decision was settled on maintenance grounds at all.

### Retained: versioned SRI, loaded sync

One candidate was kept rather than removed: the versioned OneAgent tag + SRI loaded `sync`, under
the `asyncCS-inline` treatment name. It is the hedge for both documented revisit triggers, and the
only non-default mechanism that is both supported by Dynatrace and materially different from the
default.

---

## The option space

Two independent axes, plus a "not applicable" case. The treatment names in the feature flag are
historical and **do not** describe these axes — they were fixed before the New RUM migration and
remapped rather than renamed. `asyncCS-inline` is neither async nor inline; it is retained only
to avoid a coordinated Split-plus-deploy rename. `asyncCS-script` and `global-cdn` are retired
and now fall through to the default.

### Axis 1 — where the agent comes from

| | **A. Dynatrace CDN, combined** | **B. Dynatrace CDN, versioned + SRI** | **C. Our CDN (self-hosted)** | **D. Inlined in HTML** |
|---|---|---|---|---|
| URL | `{appId}_complete.js` | `sri/ruxitagent_<hash>_<ver>.js` | `edge.fscdn.org/...` | none |
| URL versioned | no | yes | yes | n/a |
| Cache-Control | `max-age=86400, s-maxage=3600` | `max-age=31536000, immutable` | ours to set | none |
| Cache validator | **none — no `ETag`/`Last-Modified`** | n/a (immutable) | **`ETag` + `Last-Modified` by default** | n/a |
| Steady-state transfer | **full file every 24 h** | once per agent version | once per agent version | **every page response** |
| Config delivery | baked into the file | `data-dtconfig` attribute | `data-dtconfig` attribute | baked in |
| Tracks tenant config automatically | **yes** | no | no | no |
| Subresource Integrity | no | yes | yes (we compute the hash) | n/a |
| Host diversity vs `dynatrace.com` blocking | no | no | partial — see caveat | partial |
| Supported by New RUM | yes | yes | yes | **no** |
| Maintenance | **none** | fetch script + S3 publish | fetch script + S3 publish + agent upload | fetch script + release |

**Caveat on C's host diversity:** self-hosting the main agent does not fully remove the
Dynatrace dependency. The agent fetches a supplementary module (`ruxitagent_D_<ver>.js`) from
`js-cdn.dynatrace.com` at runtime, and beacons go to `bf99293tkn.bf.dynatrace.com` regardless.
A client that blocks `dynatrace.com` outright still cannot report. Genuinely defeating blocking
requires a first-party beacon endpoint as well
(`builtin:rum.web.beacon-endpoint`, `builtin:rum.web.beacon-domain-origins`) — a separate
project, not a side effect of self-hosting.

**Why D is unavailable for New RUM.** Two reasons: EJS compiles included files as templates and
the minified agent contains the EJS open-delimiter sequence inside a string (fails with
"Could not find matching close tag"), and it re-ships 300–460 KB in every page response.

### Axis 2 — how it loads

| | `sync` | `async` | `defer` |
|---|---|---|---|
| Blocks HTML parsing | yes | no | no |
| Blind window (early clicks/XHR/errors missed) | none | yes | yes, larger |
| Render-path dependency on the host | **yes** | no | no |

`defer` is not used: for a monitoring agent it strictly enlarges the un-instrumented early
window in exchange for a negligible page-speed gain over `async`.

### How the axes interact — the key point

**`sync` is only defensible where caching is immutable.**

* `sync` + option A → blocks render on a full 115–175 KB download **every 24 hours**, because
  the file has no cache validator and cannot be revalidated.
* `sync` + option B or C → blocks render only on the **first load per agent version**; every
  subsequent page is a cache hit and effectively free.

So `global-cdn` + `sync` is dominated by `global-cdn` + `async`, while `SRI` + `sync` is a
reasonable configuration. This is the single most confusing part of the matrix and the reason
the treatment names mislead.

---

## What the measurements said

Full detail in the Confluence page *Perf Learnings: Dynatrace RUM Agent Payload, Caching &
Beacon Volume (react-scripts / PR #425)* (FRDOCS). Summary:

* **Loading mechanism is not the performance lever.** An agent's FCP cost is essentially equal
  to its download time (178 KB @ 205 KB/s → 869 ms predicted, 852 ms measured), and that held
  across a 50× bandwidth range. Mechanism choice moved FCP by tens of ms — inside run-to-run
  variance. `async` does not avoid the cost; the bytes still have to arrive.
* **Payload is the lever.** Session Replay is 29,362 bytes gzipped (~+140 ms FCP). Enabling
  New RUM on prod adds ~59,302 bytes (~+290 ms). Both are tenant settings, available to every
  mechanism.
* **New RUM adds an unsampled upload channel.** It runs alongside RUM Classic (which cannot be
  disabled), roughly 2.3× per-session upload. Classic honours `costAndTrafficControl: 33`
  client-side; the Grail channel showed no such sampling.
* **Self-hosting silently rotted.** Two of three treatments were serving a RUM agent artifact
  dated **2022-11-04** to production, because refreshing required a `react-scripts` release and
  a redeploy of every consuming app.

---

## Why we chose A + `async`

Performance was a tie, so it did not decide the question. The decision was made on freshness,
resilience and maintenance.

1. **Only option A stays current without a release.** This is the decisive point, and it is
   empirical rather than theoretical — see the 2022 artifact above. Options B, C and D all
   couple the agent version to our release pipeline, and that coupling demonstrably failed for
   four years without anyone noticing.
2. **It decouples agent management from code.** Version channel, New RUM enablement and Session
   Replay all become tenant settings (`builtin:rum.web.enablement`,
   `builtin:rum.web.rum-javascript-updates`), which is what makes controlled rollout possible.
3. **`async` removes a render-path dependency.** The tag sits in `<head>`; loaded `sync`, every
   page render blocks on `js-cdn.dynatrace.com`, and that grows to ~175 KB once New RUM is on.
   `async` removes it at no measured FCP cost.
4. **The self-hosting advantage was smaller than it looked.** Under the New RUM mapping all the
   Dynatrace-hosted formats share one host, so B provides no host diversity over A. Only C does,
   and only partially (see caveat).

### What we gave up

**Subresource Integrity**, and **1-year immutable caching**. The caching loss is real and
quantified: roughly 175 KB per browser per day for a daily visitor, versus once per agent
release — about 5 MB/month for that cohort. For weekly-or-less visitors, and for FamilySearch
centres that clear state nightly, the two are equivalent because the 24 h cache expires between
visits anyway.

A support ticket has been filed with Dynatrace requesting an `ETag` on `_complete.js`. **If
they add one, this trade disappears entirely** and option A becomes strictly better than B.

---

## Revisit triggers

This decision should be reopened if any of these occur.

| Trigger | Response |
|---|---|
| Dynatrace declines the `ETag` request **and** the daily re-download proves material for our low-bandwidth cohort | Move to option B or C (versioned, immutable) |
| `async` loses too many early events — sustained >~10% drop in monitored sessions across the flip | Drop the `async` attribute. One-word change; same URL, same config |
| Third-party blocking of `dynatrace.com` proves material | Option C **plus** a first-party beacon endpoint. Self-hosting the agent alone is insufficient |
| Payload becomes the binding constraint | Turn off Session Replay (29.4 KB) — worth roughly twice any mechanism difference |

**Measuring the `async` trigger correctly:** do **not** expect a sessions-per-render ratio near
100%. `costAndTrafficControl: 33` means about one session in three is monitored by design, so
the healthy baseline is ~33%. Watch for a *step change* across the flip, not an absolute level.

---

## If we need to revive self-hosting

The recipe exists in git history at **`7468a685`** — `fetch-dynatrace-scripts.js`, the
per-environment fallback objects in `dynatrace.ejs`, and the branch structure. Do **not** deploy
that commit's baked values: they pin a specific agent version, and with SRI a stale
`integrity` hash means the browser *blocks* the script — a silent hard failure. Re-run the fetch
script to get a matching URL + hash + config triple.

**The rot must be designed out, or it will recur.** The 2022 failure was not caused by
self-hosting; it was caused by refresh requiring a `react-scripts` release and a redeploy of
every app. Any revival must satisfy:

* Agent URL, integrity hash and `data-dtconfig` are read at render time from the published
  config (`locals.dynatrace.*`), **not** from values baked into the template. The baked fallback
  is the rot vector — it is what served 1.341 to browsers while S3 already had 1.343.
* Refresh is *run the fetch script → publish to S3*, with no release in the loop.
* The arm carries a small live traffic allocation so it is continuously exercised. An arm sitting
  at 0% is not a fallback; it is untested code that will be stale when you need it.

The publish path is already built and verified working:

```
s3://fs-cdn2-origin/assets/dynatrace/dynatrace-rum-config.json
→ https://edge.fscdn.org/assets/dynatrace/dynatrace-rum-config.json
  cache-control: max-age=300 · etag + last-modified present
```

Note that our own CDN serves the cache validators Dynatrace does not — so option C would solve
the caching problem outright, without depending on Dynatrace changing anything.

**Open dependency:** it has not been confirmed that Snow actually reads `locals.dynatrace.*` in
production (it was implemented on the `feat/dynatrace-rum-config-injection` branch). Until that
is verified, every value comes from the baked fallback and the rot vector is still live. This is
the gating question for keeping any self-hosted or SRI arm.

---

## Current state

| | int | beta | prod |
|---|---|---|---|
| New RUM (`enabledOnGrail`) | on | on | off |
| RUM sampling | 33% | 33% | 33% |
| Session Replay | on | off (temporary, payload measurement) | on |
| JS version channel | LATEST_STABLE | LATEST_STABLE | PREVIOUS_STABLE |
| Agent served | 1.343 | 1.343 | 1.341 |

**Agent version dependency:** 1.341 is missing three of the four Gen3 API methods the RUM
JavaScript SDK requires; 1.343 has all four. An environment pinned to `PREVIOUS_STABLE` will
silently drop API-reported session properties until it catches up.
