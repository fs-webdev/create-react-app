# Dynatrace RUM: how the agent is loaded, and why

Implementation reference for [dynatrace.ejs](../../layout/views/partials/dynatrace.ejs): the rules
a maintainer must keep when changing it, what is known broken, and the error-capture limits that
come from this package's own configuration.

* **Full analysis** — the option matrix, payload and beacon measurements, the rejected
  candidates, the maintenance model — is the system of record in Confluence:
  [Dynatrace RUM: Loading Mechanisms & Agent Management (In-Depth Analysis)](https://icseng.atlassian.net/wiki/spaces/FRDOCS/pages/2496266249/Dynatrace+RUM+Loading+Mechanisms+Agent+Management+In-Depth+Analysis).
* **How to refresh the agent and test each flag state:** [DYNATRACE_RUM_UPDATE.md](./DYNATRACE_RUM_UPDATE.md).
* **The measurement harnesses, raw data and research notes** are at tag
  `rum-research-archive-2026-10-27`.

**Current decision:** serve the combined `_complete.js` tag from the Dynatrace global CDN,
loaded `async`. Provisional — see [Revisit triggers](#revisit-triggers).

---

## What is implemented

One flag, `frontier_snow_dynatraceRUM`, with four states: `off`, two SRI arms
(`asyncCS-inline` sync, `asyncCS-script` async) and a fallthrough default of `_complete.js`
loaded `async`. The table, and the cookies that force each state, are in
[DYNATRACE_RUM_UPDATE.md, Step 3](./DYNATRACE_RUM_UPDATE.md#step-3-verify-what-renders).

Rules that must survive any refactoring:

1. **The default is a fallthrough, not an equality check.** Retired treatment names, a renamed
   flag, and a Split outage returning `control` must all still load RUM. Failing closed produces a
   silent monitoring gap — the one failure mode invisible in the data itself.
2. **`async`, never `defer`.** `defer` holds execution until parsing finishes, which strictly
   widens the window in which early errors are lost, for a negligible page-speed gain.
3. **Never inline the agent.** EJS compiles included files as templates, and the minified agent
   contains the EJS open-delimiter sequence inside a string, so it fails with "Could not find
   matching close tag" — this caused a production 500. It would also re-ship 300–460 KB in every
   HTML response.
4. **`off` emits zero bytes.** The early-error buffer sits inside the `!rumDisabled` branch so a
   kill switch thrown because RUM is causing trouble leaves nothing of ours installed either.
5. **New RUM is not a code concern.** Whether it is active is the tenant's `enabledOnGrail`
   setting. The former `frontier_snow_dynatraceNewRUM` flag never controlled it; it only toggled
   `async`, and was removed in 8.17.0.
6. **The SRI arms render baked values.** `locals.dynatrace` would supply fresh ones, but no
   released Snow populates it yet (pending in fs-webdev/snow#446). The default arm is unaffected:
   its URL is stable and Dynatrace updates the file behind it.

### Why this choice, in brief

* **Only `_complete.js` stays current without a release.** The alternatives couple the agent to
  the react-scripts release pipeline, and that coupling demonstrably failed: two of the three
  previous loading treatments were serving an agent built on **2022-11-04** to production.
* **Payload, not mechanism, is the performance lever.** An agent's FCP cost is essentially its
  download time; mechanism choice moved FCP by tens of milliseconds, payload by hundreds.
* **`async` removes a render-path dependency** on `js-cdn.dynatrace.com` — a ~181 KB gzipped
  download with New RUM and Session Replay enabled.
* **What we gave up:** Subresource Integrity, and immutable caching. `_complete.js` is
  `max-age=86400` with no `ETag` or `Last-Modified`, so a daily visitor re-downloads it in full
  every day. A request for a cache validator was filed with Dynatrace on 2026-08-25; if they add
  one, this trade disappears.

---

## Known broken: the SRI arms send no data to Grail

**Measured on int on 2026-08-27 and again on 2026-10-27 (alpha.20, 1.347 config).
Unexplained. Both SRI arms are unusable for New RUM until this is triaged.**

With `asyncCS-inline` or `asyncCS-script` selected, the agent loads and runs, but no New RUM
beacon ever reaches Grail:

| | runs with Grail data | beacons when present |
|---|---|---|
| `global-cdn` | **4 of 6** (3/3 in August, 1/3 in October) | 2–8, 14–42 KB |
| SRI arms, both | **0 of 12** (6 in each round) | — |

Read this against sampling. Int records 33% of sessions, and a session that is not recorded
sends nothing to Grail on *any* arm, so an empty run on its own proves nothing — `global-cdn`
itself came back empty in 2 of its 6 runs. The evidence is the comparison: if the SRI arms were
recorded at even int's configured 33%, twelve empty runs in a row would happen by chance about
0.8% of the time (0.67¹²). Each run is a fresh browser context with a 20-second dwell.

Grail's sampling appears to have changed between the rounds. In August `global-cdn` sent Grail
data on every run, even alongside a ~1 KB Classic stub; in October it did so only in the run that
also sent a full Classic payload. So a session's Classic payload size does not reliably say whether
it was recorded on the Grail side. The August half of the SRI evidence is the stronger half: an
unsampled channel should have reported on every run.

Classic RUM keeps working on the SRI arms. That is what makes this dangerous rather than merely
broken: the page loads, the agent reports, Classic dashboards keep moving, and only the Grail
side is silent. There is no symptom visible from the application.

Ruled out:

* **Not the agent code.** The SRI-served file contains all four Gen3 API methods.
* **Not the `ruxitagent_D_` runtime module.** Byte-identical and HTTP 200 on both paths.
* **Not SRI or CORS.** The script executes; no console errors; no integrity failures.

The one observable difference: `window.dynatrace` exposes nine methods on `global-cdn` and two
(`sendBizEvent`, `sendEvent`) on the SRI arms. Diffing the two configurations, four keys appear
in `_complete.js` and are absent from the baked `data-dtconfig` — `auto`, `domain`, `rid`,
`rpid`. **`auto=1` is the leading hypothesis** for why the Grail channel never initialises, but
it has not been tested; the mechanism is genuinely unknown.

**This likely extends to a self-hosted versioned agent.** That design also serves a baked
`data-dtconfig` rather than `_complete.js`, so it probably inherits the same failure. Mirroring
`_complete.js` itself onto our CDN is a different variant — its configuration is built in — see
[If we revive SRI or self-hosting](#if-we-revive-sri-or-self-hosting).

Next step is to intercept the response and inject the missing keys one at a time to find which
one restores the Grail channel. Until then, keep both SRI treatments limited to their test keys.

---

## Early-error buffer

A ~20-line inline listener in `dynatrace.ejs`, directly above `dtWhenReady`, that catches errors
thrown before the async agent exists and replays them once it arrives.

**Why.** Requests are never lost in the async window — the agent recovers them retroactively from
Resource Timing. Exceptions are: there is no buffered API for an error thrown with no listener
attached. Before the buffer, errors thrown before ~250 ms were never captured. Sentry does not fill
the gap; it installs from the app bundle, later than the agent.

**How.** `error` and `unhandledrejection` listeners in the capture phase push to
`window.__dtEarlyErrors` (bounded at 50). When the agent appears, the `dtWhenReady('classic', …)`
callback removes the listeners and replays each entry through `dtrum.reportError`, prefixed
`[dt-early +<ms>ms]`.

**Constraints for anyone editing the layout:**

* It must stay **first** in its script block, and the partial must stay early in `<head>` —
  anything thrown before it runs is unrecoverable.
* It currently renders *after* a render-blocking stylesheet in `layout.ejs`, which delays it.
  Moving it above that link should widen its coverage. Suggestive measurements only; test before
  changing the layout.
* It reports through RUM Classic because `dynatrace.reportError` does not exist. Whether a
  Classic-reported error also reaches Grail is **unconfirmed**. To check, run a known early error
  and query:

  ```
  fetch user.events, from:-2h
  | filter characteristics.has_error == true
  | filter contains(exception.message, "dt-early")
  | fields timestamp, exception.message, exception.type, error.source, dt.rum.session.id
  ```

**What it covers, measured on int (alpha.18, 2026-08-24):** a band from roughly **350 ms to
550 ms** — after the inline script parses, before the agent installs its own handlers. Capture at
250 ms rose from 2/10 to 6/10, at 400 ms from 5/10 to 9/10. It cannot reach t=0.

**Accepted imprecisions:** an error in the ~100 ms between the agent installing its handlers and
`window.dtrum` appearing can be reported twice; replayed errors are timestamped when the agent
arrives (the original offset is in the prefix); and where only a message exists the replay builds
a new `Error`, so the stack points at the replay site.

---

## Error-capture limits rooted in this package

These come from react-scripts' own build configuration, not from Dynatrace, so they belong here.
The measurements behind them are in the archive tag.

* **Application errors are opaque.** Chunk `<script>` tags carry no `crossorigin` attribute
  (`output.crossOriginLoading` is unset in `config/webpack.config.js`) and every chunk is served
  cross-origin from `edge.fscdn.org`. So errors thrown in app code reach RUM as a bare
  `"Script error."`, and unhandled rejections are **not dispatched to listeners at all** — no
  buffer can recover what never fires. The fix is one line, `crossOriginLoading: 'anonymous'`.
  **Deliberately deferred (2026-08-17):** it makes the CDN's `Access-Control-Allow-Origin` header
  load-bearing, so a misconfiguration or a proxy stripping it becomes a white screen instead of a
  missing log line. Before shipping it, confirm the header on every asset host in every
  environment and roll it to int first.
* **Chunk-load failures bypass the buffer.** `RetryChunkLoadPlugin` catches the rejection and
  reports the exhausted retry through `console.error`, which the agent picks up as
  `ChunkLoadError` with `error.source: "console"`. A chunk failure inside the async window is lost.
* **The retries are too fast to help.** `retryDelay` defaults to 0, so all five retries fire within
  ~23 ms of the first failure — no use against a CDN blip or a slow network. A separate, real
  finding.
* **Recovered failures leave no error.** A patron whose chunk loads on the fourth attempt produces
  failed requests in RUM but no error. Size flaky-network impact from failed requests, not errors.
* **An app that never starts is invisible.** If `main.js` never arrives, nothing reaches RUM —
  anything we shipped to detect it would travel in the bundle that failed. If `main.js` arrives
  and throws, it is detectable (when the session is recorded) but never legible. An inline boot
  watchdog beside the buffer could report "app failed to mount"; not built.
* **Pages rendered outside `layout.ejs`** — custom error pages, 500s — get no RUM at all.

---

## Revisit triggers

| Trigger | Response |
|---|---|
| Dynatrace declines the `ETag` request **and** the daily re-download proves material for low-bandwidth patrons | Mirror `_complete.js` onto our CDN with validators (see below), or fix the SRI arms first. **Do not** move traffic to an SRI arm as it stands: it sends nothing to Grail |
| `async` loses too many early events — a sustained >~10% drop in recorded sessions across the flip | Drop the `async` attribute (one word, same URL) — at the cost of putting the ~181 KB download back on the render path |
| A security review requires integrity verification | The SRI arms, once their Grail failure is fixed |
| Third-party blocking of `dynatrace.com` proves material | A first-party beacon endpoint (`builtin:rum.web.beacon-endpoint`). Self-hosting the agent alone does not help: beacons still go to Dynatrace |
| Payload becomes the binding constraint | Turn off Session Replay, which is worth roughly twice any mechanism difference |
| RUM is actively harmful | `off` |

**Measuring the `async` trigger:** sampling means only a fraction of sessions is recorded by
design (read the current `costAndTrafficControl` with the queries below). Watch for a *step
change* across the flip, not an absolute level.

---

## If we revive SRI or self-hosting

Any arm that serves baked values rots unless refresh is taken out of the release pipeline:

* **Values must come from `locals.dynatrace.*` at render time** — which needs fs-webdev/snow#446
  merged and deployed — with the baked fallbacks removed or made to fail loudly. The baked
  fallback is the rot vector: it is what served 1.341 to browsers while S3 already held 1.343.
* **Refresh must be scheduled**, daily or on settings change, because tenant configuration
  changes desync the baked `data-dtconfig` far more often than agent releases do.
* **The arm needs a small live allocation**, so it is exercised continuously. An arm at 0% is not
  a fallback; it is untested code that will be stale when you need it.
* **Fix the Grail failure first** (above).

**Mirroring `_complete.js` onto our CDN** — the way to get cache validators without depending on
Dynatrace — is a different design, and probably avoids the Grail failure because the file carries
its own configuration. One hard requirement found in the agent's code: **the mirrored file's name
must not contain `_complete.js`.** When it does, the agent derives its module URLs from its own
`src` by splitting at `/jstag/`; on our CDN there is no `/jstag/`, so it requests a relative path
that 404s. Under any other name it falls back to the absolute `agentUri` on `js-cdn`, which
works. Validate Grail beacons against a `global-cdn` control before building a sync job — the
analysis is in the Confluence page.

---

## Checking the current tenant state

These settings change in the Dynatrace UI with no deploy, so a snapshot here goes stale within
weeks. Read them from the tenant instead. All of the following are read-only.

| | int | beta | prod |
|---|---|---|---|
| Application | `APPLICATION-3FAF90E849295814` | `APPLICATION-C4242BB1EB216374` | `APPLICATION-A8E5EDD77F861ACE` |

**Inheritance trap.** An application with no object of its own for a schema inherits the
`environment`-scoped object. Querying one application with `--scope` then returns an empty
list, which looks like "not configured" but means "inherits". List the whole schema and read the
application's object if it has one, otherwise the `environment` object.

```bash
# New RUM and Session Replay: enabled, enabledOnGrail, and sampling (costAndTrafficControl, %)
dtctl get settings --schema builtin:rum.web.enablement -o json --plain \
  --jq '.[] | {scope, rum: .value.rum, sessionReplay: .value.sessionReplay}'

# Agent version channel: LATEST_STABLE or PREVIOUS_STABLE
dtctl get settings --schema builtin:rum.web.rum-javascript-updates -o json --plain \
  --jq '.[] | {scope, version: .value.JavascriptVersion}'

# Hard version pins. Expect 0
dtctl get settings --schema builtin:rum.web.custom-rum-javascript-version -o json --plain --jq 'length'

# Session Replay masking (MASK_ALL / MASK_USER_INPUT / ...), recording and playback separately
dtctl get settings --schema builtin:sessionreplay.web.privacy-preferences -o json --plain \
  --jq '.[] | {scope, recording: .value.maskingPresets.recordingMaskingPreset, playback: .value.maskingPresets.playbackMaskingPreset}'
```

What browsers actually receive — the agent version and enabled-module set baked into each
environment's `_complete.js`:

```bash
for e in int:3faf90e849295814 beta:c4242bb1eb216374 prod:a8e5edd77f861ace; do
  f=$(curl -s --compressed "https://js-cdn.dynatrace.com/jstag/15c157a40ab/bf99293tkn/${e#*:}_complete.js")
  printf '%-5s %s  %s\n' "${e%%:*}" \
    "$(grep -o 'running with version: [0-9.-]*' <<<"$f" | head -1 | cut -d' ' -f4)" \
    "$(grep -oE 'featureHash=[A-Za-z0-9]{8,}' <<<"$f" | head -1)"
done
```

Reading the results:

* **An application-scoped object overrides the environment for that application only.** When
  the intent is the same settings everywhere, an application-scoped object on any of the three
  applications above is drift, and deleting it restores inheritance.
* **Objects for application IDs that no longer resolve** are leftovers from deleted
  applications. They affect nothing.
* **The `featureHash` encodes which modules are enabled.** If it differs from the values in
  `dynatrace-rum-config.json` and the fallbacks in `dynatrace.ejs`, re-run
  `fetch-dynatrace-scripts.js`. Only the SRI arms read those values; the default arm loads
  `_complete.js` and always matches the tenant.
* **`PREVIOUS_STABLE` has a known hazard.** 1.341 was missing three of the four Gen3 API methods
  the RUM JavaScript SDK requires, so an environment left a version behind silently drops
  API-reported session properties until it catches up.
* **Discovering other schemas:** `dtctl get settings-schemas` returns only the first 50 by
  default. Use `--limit 500`.
