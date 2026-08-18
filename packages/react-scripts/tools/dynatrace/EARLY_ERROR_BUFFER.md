# Early-error buffer

A ~20-line inline listener in `<head>` that catches errors thrown before the RUM agent exists and
replays them once it arrives. Lives in
[dynatrace.ejs](../../layout/views/partials/dynatrace.ejs), directly above `dtWhenReady`.

## Why it exists

Loading the agent `async` means its error handlers are not installed at navigation start. Measured
on int with [beacon-harness/blind-window.mjs](https://github.com/fs-webdev/create-react-app/blob/rum-harness-archive-2026-08-17/packages/react-scripts/tools/dynatrace/beacon-harness/blind-window.mjs), n=10:

| offset | XHR captured | Error captured |
| --- | --- | --- |
| 0 ms | 10/10 | **0/10** |
| 100 ms | 10/10 | **0/10** |
| 250 ms | 10/10 | 2/10 |
| 400 ms | 10/10 | 5/10 |
| 550 ms | 10/10 | 10/10 |
| 700 ms + | 10/10 | 10/10 |

Requests are never lost — the agent recovers them retroactively from Resource Timing. **Exceptions
are the only thing the async load actually loses**, because there is no buffered API for an error
thrown with no listener attached. Once it is gone, it is gone.

That is a narrow loss, but a badly-placed one: errors in the first half-second are
page-load errors, which are the ones you most want to see.

## Sentry does not cover this

The obvious question is whether Sentry catches what Dynatrace misses. It does not. Measured on int,
median of 4 runs:

| | Installed at |
| --- | --- |
| `window.dtrum` / `window.dynatrace` | **660 ms** |
| `window.__SENTRY__` | **1016 ms** |

Sentry initialises from the app bundle, which is larger and later than the 115 KB agent, so it
shares the blind window and extends it by ~356 ms. Anything Dynatrace misses, Sentry misses too.

Also worth knowing: `SERVER_DATA.sentryDSN` is **empty on int and beta** — set only in prod. The SDK
loads and costs bundle weight in the lower environments but transports nothing, so Sentry error
coverage cannot be validated there at all.

The gap is a property of installing a handler late, not of any particular vendor. The only fix is a
listener that already exists at t=0.

## How it works

1. An inline IIFE registers `error` and `unhandledrejection` listeners in the **capture phase**, so
   a `stopPropagation()` elsewhere cannot hide errors from it. Entries are pushed to
   `window.__dtEarlyErrors` with a `performance.now()` stamp. Bounded at 50 — a page erroring in a
   loop must not grow it without limit.
2. When the agent appears, the existing `dtWhenReady('classic', …)` callback stops the listeners
   and replays the buffer through `dtrum.reportError`.

It must stay **first** in that script block, and the partial must stay early in `<head>` — anything
that throws before it runs is unrecoverable. It currently renders at `layout.ejs` line 42, ahead of
`SERVER_DATA` (52) and Sentry (65).

The block is inside the `!rumDisabled` branch, so the `off` treatment emits **zero bytes**. If RUM
is kill-switched because it is causing a problem, our listeners should not still be installed.

## Why it reports through RUM Classic

Verified against the live agent on int:

| API | |
| --- | --- |
| `dtrum.reportError` | **function** |
| `dtrum.reportCustomError` | function |
| `dynatrace.reportError` | **undefined** |

New RUM has no direct error-reporting method — it exposes `sendEvent`, whose error event shape we
have not verified. Classic runs alongside New RUM and cannot be disabled, so `dtrum.reportError` is
always available.

**Open question:** whether an error reported through Classic also surfaces in Grail (`user.events`).
Classic and Grail are separate ingest channels. `characteristics.is_api_reported` does appear on
Grail events, so API-reported data reaches it in general, but that has not been confirmed for
`reportError` specifically. If it does not cross over, the replay is visible in Classic dashboards
only, and reaching Grail would need `dynatrace.sendEvent` with a hand-built error event.

## Chunk-load failures are not covered

The buffer listens for `error` and `unhandledrejection`. A chunk-load failure reaches RUM through
neither: `RetryChunkLoadPlugin` catches the rejection itself and reports the exhausted retry with
`console.error`, which the agent picks up by patching the console. Measured with
[beacon-harness/chunk-failure.mjs](https://github.com/fs-webdev/create-react-app/blob/rum-harness-archive-2026-08-17/packages/react-scripts/tools/dynatrace/beacon-harness/chunk-failure.mjs), the event arrives as
`exception.type: ChunkLoadError` with `error.source: "console"` — see
[RUM_ERROR_PROBE_SPEC.md](./RUM_ERROR_PROBE_SPEC.md#answered-chunk-load).

So a chunk failure inside the blind window would be lost, and this buffer would not save it.

The same measurement found a harder limit that no buffer can fix. Application chunks are served
cross-origin from `edge.fscdn.org` and their `<script>` tags carry no `crossorigin` attribute, so
errors thrown inside application code arrive as a bare `"Script error."` — and unhandled
rejections are **not dispatched to listeners at all**. Buffering earlier does not help when the
event never fires.

The only fix is `output.crossOriginLoading: 'anonymous'`, which has been **deliberately deferred**
— it trades opaque errors for a new class of load-time failure, and a CORS misconfiguration is a
white screen rather than a missing log line. See
[RUM_ERROR_PROBE_SPEC.md](./RUM_ERROR_PROBE_SPEC.md#the-available-fix--deferred-deliberately).

The practical consequence, until then: **this buffer is worth less than the measurements
suggest.** It reliably recovers early errors from same-origin inline code, which is what
[blind-window.mjs](https://github.com/fs-webdev/create-react-app/blob/rum-harness-archive-2026-08-17/packages/react-scripts/tools/dynatrace/beacon-harness/blind-window.mjs) injects and measures. Errors thrown from
application code in a chunk are opaque or absent whether or not they land in the blind window,
so no amount of buffering makes them legible. Keep that in mind when reading the 10/10 rows —
they measure the buffer, not the coverage of real application errors.

In practice that is currently fine: on int, chunks are requested ~850–1200 ms and the error lands
~1150 ms, while the agent is ready at ~500–930 ms. The failure sits outside the window. But the
ranges overlap, so a slow enough connection inverts the order.

Closing it would mean also buffering `console.error`, which is a bigger change than it looks —
the console is patched by the agent too, so the buffer would have to hand back cleanly to avoid
double-reporting every console error on the page, not just those in the first half-second. That
is why it was not done here. **Open, deliberately deferred**; revisit if chunk errors turn out to
be under-counted in the field relative to the failed-request count, which is the signal that
would show it (the failed chunk URL always reaches RUM via Resource Timing, 5/5, even when the
error itself does not).

## Known imprecisions, accepted deliberately

**Double-reporting in a ~100 ms sliver.** The agent installs its handlers slightly *before*
`window.dtrum` becomes visible — measured, errors were captured from 550 ms while `dtrum` appeared
at ~660 ms. An error thrown in that gap can be caught by both the agent and the buffer. Duplicating
a handful of errors is the better failure than dropping them; replayed entries carry a
`[dt-early +<ms>ms]` prefix so they can be excluded if it ever matters.

**Timing attribution shifts.** A replayed error is reported when the agent arrives, not when it was
thrown. The original offset is preserved in the message prefix.

**Stack fidelity.** The replay passes the original `Error` object where one exists, so the real
stack survives. Where only a message is available it constructs a new `Error`, and the agent
synthesises a stack pointing at the replay site rather than the throw. `exception.is_stack_trace_generated`
in `user.events` distinguishes the two.

## Verifying it works

The same harness that measured the gap proves the fix. After deploying, re-run:

```bash
cd packages/react-scripts/tools/dynatrace/beacon-harness
node blind-window.mjs int 10 "0,100,250,400,550,700,850,1000,1500"
```

The **Error captured** column should go from `0/10` at t=0 to `10/10` at every offset. Anything less
means the buffer is installing too late, the replay is not firing, or `reportError` is not reaching
the beacon.

To find replayed errors in Grail:

```
fetch user.events, from:-2h
| filter characteristics.has_error == true
| filter contains(exception.message, "dt-early")
| fields timestamp, exception.message, exception.type, error.source, dt.rum.session.id
| sort timestamp asc
```

An empty result with a passing harness run would answer the open question above — reported to
Classic, not crossing to Grail.

## What this changes about the mechanism decision

The sync SRI arm was retained partly as the hedge against async losing early errors. If the buffer
works, that half of its justification goes away and only the caching argument remains — which is
itself contingent on Dynatrace declining the `ETag` request. See
[DYNATRACE_RUM_MECHANISMS.md](./DYNATRACE_RUM_MECHANISMS.md).
