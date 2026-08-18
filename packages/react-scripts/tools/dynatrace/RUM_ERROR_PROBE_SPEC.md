# RUM error-capture probe — spec for frontier-app-react

A set of deliberately-thrown errors on dedicated URLs, used to measure **which error types the
RUM agent captures, and from what point in page load**. Complements
[beacon-harness/blind-window.mjs](https://github.com/fs-webdev/create-react-app/blob/rum-harness-archive-2026-08-17/packages/react-scripts/tools/dynatrace/beacon-harness/blind-window.mjs), which answers the same
question with injected probes; this one exercises the real bundle, real timing and real error
shapes, and can be driven from a real device or a VPN region.

## The question

Loading the agent `async` creates a window between navigation start and the agent installing its
listeners. Measured on int with injected probes:

| Signal | Result |
| --- | --- |
| XHR / fetch | **Never lost** — recovered retroactively from Resource Timing |
| Thrown exceptions | **Lost below ~250 ms**, half-captured at 400 ms, complete by 550 ms |

What that leaves open is whether the same split holds for the error types a real app actually
produces — particularly chunk-load failures, which sit on the boundary between the two capture
mechanisms and are a genuine production failure mode here (`retry-chunk-load-plugin` is a
dependency).

---

## Three design constraints

These are the difference between a useful result and an uninterpretable one.

### 1. Errors thrown from React code cannot test the blind window

React mounts after the bundle loads, which is well past the ~550 ms mark. A probe that throws in
a component will be captured every time and proves nothing.

To probe the window, errors must fire **early**: inline in the HTML before the bundle, or during
the main bundle's module-eval phase. The module-eval case is the genuinely unknown one — the
bundle and the agent are both async scripts racing each other, and which wins has not been
measured.

### 2. Each probe must self-report its firing time out of band

If a probe error does not appear in RUM, three explanations are indistinguishable: it fell in the
blind window, it never fired, or it fired and was filtered. Each case must record
`performance.now()` at throw time through a channel **independent of RUM**.

*(This is a mistake worth not repeating: the first version of the injected harness used one
marker for both the XHR and the exception, so a hit could not be attributed to either.)*

### 3. The probe must be distinctly greppable

Beta's current error stream is **30 of 31 events from a single `zion-flags` console warning**
(`"Attempted to getFeatureFlag shared_addLa…"`). Anything without a distinctive prefix will be
lost in that. Worth noting separately: silencing that warning would clean up beta's error data
considerably.

---

## Probe cases

Route: `/en/frontier/app-react/rum-probe`

| Param | Meaning |
| --- | --- |
| `case` | which probe to run (below) |
| `at` | milliseconds after navigation start to fire; ignored where the case defines its own timing |
| `run` | unique id per page load, for correlation |

Suggested sweep for `at`: `0, 100, 250, 400, 550, 700, 1000` — brackets the measured transition.

| `case` | What it does | Capture path | Prediction |
| --- | --- | --- | --- |
| `throw` | `throw new Error(marker)` from an inline `<script>` at `at` ms | `window.onerror` | Lost below ~550 ms |
| `reject` | `Promise.reject(new Error(marker))`, unhandled | `unhandledrejection` listener | Likely same as `throw` — separate listener, same install timing |
| `console` | `console.error(marker)` | console patching | Likely same. **Confirmed capturable** — `error.source: "console"` accounts for 30 of 31 beta errors |
| `module-eval` | `throw` at the top of the main bundle, before React | `window.onerror` | **Unknown** — bundle vs agent race |
| `chunk-load` | `import()` a deliberately-missing chunk | **console** and Resource Timing | **ANSWERED** — see below; no longer needs a FAR probe |
| `resource-404` | inject `<img src="/rum-probe/missing.png">` | element `error` event + Resource Timing | Likely recovered |
| `xhr-500` | `fetch()` a route returning 500 | monkey-patch + Resource Timing | Recovered — already confirmed |
| `react-render` | throw during initial component render | `window.onerror` | Always captured — **control case**, proves the probe works |

`react-render` earns its place as the control: if it fails to appear, the problem is the probe or
the query, not the blind window.

---

## Marker format

Every probe emits a message of exactly this shape:

```
RUMPROBE|<run>|<case>|<scheduledMs>|<firedMs>
```

`firedMs` is `Math.round(performance.now())` at throw time. Embedding it in the message means a
*captured* probe carries its own timing; the out-of-band channel below covers the *uncaptured*
ones, which is where the interesting data is.

## Out-of-band timing channel

Two mechanisms, both cheap:

**Always** — push to a global for automated readers:

```js
;(window.__rumProbe ||= []).push({ run, case: c, scheduledMs, firedMs, agentPresent: !!window.dtrum })
```

`agentPresent` is valuable on its own: it records whether `window.dtrum` existed at throw time,
which lets you correlate capture against agent readiness directly rather than inferring it.

**For field runs** (real devices, VPN regions) — a beacon to a route that logs server-side:

```js
navigator.sendBeacon('/rum-probe/log', JSON.stringify(entry))
```

Without this, a probe run from a phone or another region produces no ground truth.

---

## Verification

Probes that **were** captured — schema confirmed against live beta data:

```
fetch user.events, from:-2h
| filter characteristics.has_error == true
| filter contains(exception.message, "RUMPROBE")
| fields timestamp, exception.message, exception.type, error.source,
         page.url.full, dt.rum.session.id, dt.rum.application.id
| sort timestamp asc
```

Parse `exception.message` client-side rather than in DQL — the format is fixed and the volume is
tiny.

Relevant fields on an error event:

| Field | Notes |
| --- | --- |
| `characteristics.has_error`, `characteristics.has_exception` | both true on error events |
| `exception.message` | carries the marker |
| `exception.type` | e.g. `Error` |
| `exception.stack_trace`, `exception.is_stack_trace_generated` | stack is often synthesised |
| `error.source` | **`console` vs `exception`** — distinguishes `console.error` from a real throw |
| `error.name`, `error.display_name` | first line of the message |

**The result is the join, not the query.** Capture rate per case is:

```
captured (from RUM)  ÷  fired (from window.__rumProbe or the server log)
```

grouped by `case` and `scheduledMs`. A case that never appears in RUM *and* never appears in the
out-of-band log is a broken probe, not a finding.

---

## Safety

**These are real errors in real RUM data.** They will appear in error dashboards and count toward
error-rate metrics. Before running at any volume:

- Confirm nothing alerts on error-rate deltas for the affected applications.
- Keep the probe behind the dedicated path so it is filterable and, ideally, behind a flag so it
  cannot be reached accidentally.

**Tag the traffic so it does not corrupt the capture baseline.** The probe path is itself a
filter — exclude `contains(page.url.full, "rum-probe")` from
[capture-baseline/baseline-per-app.dql](./capture-baseline/baseline-per-app.dql). Playwright and
acceptance-test traffic reports as `dt.rum.user_type: real_user`, indistinguishable from patrons,
so untagged probe runs land directly in the numbers being compared.

**Run on int or beta, not prod.** Prod has no Grail data until `enabledOnGrail` is enabled there.
Note int/app-react has 0–2 organic sessions/day, so probe traffic will dominate it entirely — which
is fine for this purpose and actively good for keeping beta clean.

---

## What is already answered — do not re-test

| Question | Answer | Source |
| --- | --- | --- |
| Are XHR/fetch requests lost in the blind window? | No — recovered from Resource Timing | `blind-window.mjs`, n=10 |
| Are thrown exceptions lost? | Yes, below ~250 ms; complete by 550 ms | same |
| When is the agent ready? | median 689 ms, range 472–808 ms (fast connection) | same |
| Does the error handler install before `window.dtrum` appears? | Yes — errors captured at 550 ms while `dtrum` appeared at ~689 ms | same |
| Is `console.error` captured? | Yes, as `error.source: "console"` | live beta data |
| Are chunk-load failures captured? | Yes — as `exception.type: ChunkLoadError` via **`error.source: console`** | `chunk-failure.mjs`, n=5 |
| Does the failed chunk URL reach RUM? | Yes, 5/5, recovered from Resource Timing | same |

The new information this probe adds is: **module-eval timing**, real-device and cross-region
behaviour, and error shapes the harness cannot synthesise. The `chunk-load` case below is done.

---

## Answered: `chunk-load`

[beacon-harness/chunk-failure.mjs](https://github.com/fs-webdev/create-react-app/blob/rum-harness-archive-2026-08-17/packages/react-scripts/tools/dynatrace/beacon-harness/chunk-failure.mjs) answers this against int
without any change to frontier-app-react — Playwright aborts the request and the app produces a
genuine failure. Measured n=5, agent live at throw time in 5/5:

| Signal | Result |
| --- | --- |
| `exception.type: ChunkLoadError` in beacon | **5/5** |
| Failed chunk URL in beacon | 5/5 (Resource Timing) |
| `error.source` | **`console`**, not `exception` |

The event is complete — message, type, and a real stack trace:

```json
"exception.message": "Loading chunk 6285 failed after 5 retries.\n(static/js/6285.6f792c54f5f8f880.chunk.js)",
"exception.type": "ChunkLoadError",
"error.source": "console",
"exception.stack_trace": "ChunkLoadError\n at o.f.j (…/main.833f3be69ff336a0.js:1:190173)…"
```

**It arrives via console patching**, which matters more than it sounds — see
[EARLY_ERROR_BUFFER.md](./EARLY_ERROR_BUFFER.md#chunk-load-failures-are-not-covered).
A `window`-level `error`/`unhandledrejection` listener never sees it: `RetryChunkLoadPlugin`
catches the rejection itself and reports the exhausted retry through `console.error`.

Timing on int: the chunk is requested ~850–1200 ms and the error lands ~1150 ms, i.e. **after**
the agent (~500–930 ms). Real chunk failures therefore sit outside the blind window in normal
conditions, though the two ranges overlap enough that a slow connection could invert it.

The URL recovery is genuine and separable from the error text — the beacon carries standalone
resource entries, one per attempt including all five retries:

```json
"performance.initiator_type":"script","characteristics.has_request":true,
"url.full":"https://edge.fscdn.org/assets/static/js/7502.e0cb07ce009ca5b5.chunk.js"
```

---

## Answered: errors that survive the build — and why prod cannot debug them

A syntax error or a statically-resolvable missing import **fails the webpack build**, so it never
ships. Simulating those measures a case that cannot happen. What actually reaches production is
code that compiles cleanly and goes wrong at runtime.
[beacon-harness/runtime-errors.mjs](https://github.com/fs-webdev/create-react-app/blob/rum-harness-archive-2026-08-17/packages/react-scripts/tools/dynatrace/beacon-harness/runtime-errors.mjs) injects each such case
inside a real cross-origin chunk. Measured on int, n=2 per case, injection execution confirmed
via a receipt global in every row:

| Case | What ships | Reaches RUM as |
| --- | --- | --- |
| `typeerror` | `o.enabled.value` where `o` is undefined | **`"Script error."`** — no message, no file, no line |
| `handler` | TypeError in a timer 6 s after load | **`"Script error."`** — agent fully live, still opaque |
| `promise` | unhandled rejection from an async path | **nothing at all** |
| `missing-module` | `import()` of a bad runtime value | **nothing at all** |
| `string-typo` | wrong key/flag/URL literal | nothing — no error is thrown (expected) |
| `logic` | off-by-one, wrong condition | nothing — no error is thrown (**control**) |

The last two rows are the honest baseline: they are invisible to *any* error monitor because
nothing throws. Only better instrumentation or tests catch those. The first four are the problem.

### The cause is one missing attribute

Chunk `<script>` tags carry **no `crossorigin` attribute** — webpack's `crossOriginLoading`
defaults to `false` and is not set in
[config/webpack.config.js](../../config/webpack.config.js). Every app chunk is served from
`edge.fscdn.org`, so every error thrown inside application code is a cross-origin error and the
browser redacts it. `edge.fscdn.org` **already sends `Access-Control-Allow-Origin: *`**, so the
CDN side is done; the tag simply never opts in.

[beacon-harness/crossorigin-check.mjs](https://github.com/fs-webdev/create-react-app/blob/rum-harness-archive-2026-08-17/packages/react-scripts/tools/dynatrace/beacon-harness/crossorigin-check.mjs) isolates it by
serving identical throwing JS from that CDN twice, differing only in the attribute:

| | Sync error | Unhandled rejection |
| --- | --- | --- |
| No attribute (**today**) | `"Script error."`, filename `""`, lineno `0` | **not dispatched at all** |
| `crossorigin="anonymous"` | `Uncaught TypeError: Cannot read properties of null (reading 'boom')`, `xotest-co.js:4` | dispatched, with message |

That async rejections are not merely redacted but **never dispatched** is the sharper half: no
listener can see them, so this is not something RUM configuration or the early-error buffer can
work around. See [EARLY_ERROR_BUFFER.md](./EARLY_ERROR_BUFFER.md#chunk-load-failures-are-not-covered).

### The available fix — DEFERRED, deliberately

`output.crossOriginLoading: 'anonymous'` in the webpack config is one line and turns every
application error from `"Script error."` into a real message, file and line.

**Decision (2026-08-17): not doing it now.** Better error text is a nice-to-have; a CORS
misconfiguration is a white screen. The trade is real but the upside does not justify taking on a
new class of load-time failure while a RUM rollout is in flight. Revisit when there is time to
confirm CORS behaviour properly across every environment and asset host.

Precise about what the change does, because "cross-origin" and "CORS" are not the same thing and
the distinction is the whole argument:

Today the chunk `<script>` is a **no-cors** request. Script tags are grandfathered — they may
load and execute cross-origin scripts without permission, so the browser sends no `Origin` and
never checks `Access-Control-Allow-Origin`. The header is currently **inert**; nothing reads it.
The redaction is the consequence: the browser never verified we may read the resource, so it will
not let us read its error text either.

The attribute opts into the CORS protocol. It does not add CORS where there was none — it makes a
**currently-decorative header load-bearing**. If it is ever missing or wrong, the script does not
execute at all.

Measured headers say the CDN side is in good shape:

```
access-control-allow-origin: *          # literal, not origin-reflected
vary: Origin,Access-Control-Request-Headers,Access-Control-Request-Method
server: AmazonS3   via: …cloudfront.net # static config, not per-request logic
```

`*` means one cached representation is valid for every origin, and `Vary: Origin` is already set,
which closes the usual failure where a proxy caches a no-cors response without CORS headers and
then serves it to a CORS request. There is also precedent in this very codebase:
[dynatrace.ejs](../../layout/views/partials/dynatrace.ejs) already sets `crossorigin="anonymous"`
on both agent tags, so we already depend on `js-cdn.dynatrace.com` CORS headers for RUM to load.

**So the risk is blast radius, not probability.** An intermediary that strips `ACAO` — a corporate
MITM proxy, some ISP appliance — breaks a CORS-mode load. That is the same mechanism and the same
likelihood as today; the difference is that today such a proxy costs us the Dynatrace agent
(telemetry), and afterwards it costs the patron the application (white screen).

Two notes for whoever picks this up:

- **SRI is not a conflict.** SRI on a cross-origin script *requires* `crossorigin`; it is a
  prerequisite, not friction. An earlier version of this document had that backwards.
- Chrome partitions its HTTP cache by request mode, so the first load after the change refetches
  chunks rather than reusing the no-cors cached copies. One-time, but visible in any before/after
  timing comparison.

Before shipping it: confirm every asset host in every environment sends `ACAO`, not just
`edge.fscdn.org` on int, and roll it to int alone first.

### Unresolved: blocking `main.js` produces nothing at all

Mode `early` blocks the main bundle instead of a lazy chunk. Result (n=4): **no error, no failed
URL, nothing** — including in the 2 of 4 runs where the agent was already live when the request
failed. That is not what the chunk result predicts.

Not yet explained, and the sample is too small to lean on. Candidates: the session was a
`costAndTrafficControl` stub (~1 in 3 are monitored, so 0/4 is unremarkable); or a page whose
bundle never loads generates too little activity for the agent to flush a full beacon — it sent
only 2. Worth an n=15 run before drawing anything from it. **If it holds, it matters**: it would
mean the hardest failure to detect is the one where the app does not start at all.

### Flaky networks: recovered failures are invisible as errors

Mode `flaky:3` fails the first three attempts and lets the fourth succeed — what a bad mobile
connection actually does, and the case `RetryChunkLoadPlugin` exists for. Measured n=3:

| Signal | Result |
| --- | --- |
| `ChunkLoadError` in beacon | **0/3** — the retry succeeded, so no error is ever produced |
| Failed chunk URLs in beacon | 3/3, one resource entry per failed attempt |

So a patron on a flaky network who eventually loads the page **generates no RUM error at all**.
The only trace is failed requests. Any attempt to size flaky-network impact from error counts
will therefore read zero; it has to be measured from failed resource requests instead.

### Two mistakes worth not repeating

**Match the retry query string.** `RetryChunkLoadPlugin` is configured with `maxRetries: 5` and a
`?cache-bust=<ts>` query ([config/webpack.config.js:827](../../config/webpack.config.js#L827)),
so a Playwright pattern ending at `.chunk.js` blocks the first attempt and lets all five retries
through. They succeed, the app recovers, and the run reads as "no error was ever produced". The
pattern must end `*.chunk.js*` and the per-chunk lock must compare query-stripped URLs.

Also worth knowing on its own: the five retries fire **within ~23 ms** of the first failure
(`retryDelay` defaults to 0), so they do nothing for a CDN outage or a genuinely slow network —
the case the plugin was added for. Raising `retryDelay` is a separate, real finding.

**Do not block every chunk.** Blocking all 19 stops the app booting, so no `import()` rejection
handler ever runs: measured 19 resource errors, **zero** `ChunkLoadError`, zero retries. Only a
single-chunk block reproduces the real failure.
