# RUM error-capture probe — spec for frontier-app-react

A set of deliberately-thrown errors on dedicated URLs, used to measure **which error types the
RUM agent captures, and from what point in page load**. Complements
[beacon-harness/blind-window.mjs](./beacon-harness/blind-window.mjs), which answers the same
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
| `chunk-load` | `import()` a deliberately-missing chunk | `onerror` **and** Resource Timing | **Unknown, most interesting** — may be recovered retroactively like XHR |
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

The new information this probe adds is: **chunk-load and resource failures**, **module-eval
timing**, and whether any of it changes on a real device or from another region.
