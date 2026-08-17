# Dynatrace RUM beacon-volume harness

Measures how many bytes the Dynatrace RUM agent **uploads** per session, split by beacon
channel, against deployed environments. Complements the payload/download measurements, which
are just `curl` against the agent URLs and need no tooling.

Standalone — it hits deployed URLs and needs only Playwright. It is not part of the
`react-scripts` build, and its `package.json` is not picked up by the yarn workspace (the
workspace glob is `packages/*`, direct children only).

Full analysis and the numbers this produced:
**Dynatrace RUM: Loading Mechanisms & Agent Management (In-Depth Analysis)** (Confluence, FRDOCS).
Decision context: [../DYNATRACE_RUM_MECHANISMS.md](../DYNATRACE_RUM_MECHANISMS.md).

## Why this exists

The New RUM Experience runs *alongside* RUM Classic — Classic cannot be disabled — so enabling
New RUM **adds** a beacon channel rather than replacing one. This harness quantifies that, and
was what established:

- Enabling New RUM is roughly a **2.3× increase in per-session upload**
- The Grail channel appears to be **unsampled**, while Classic honours `costAndTrafficControl`

## Usage

```bash
npm install

# Capture sessions. Defaults: 10 runs, 20s dwell.
node measure-beacons.mjs int  40 20000
node measure-beacons.mjs beta 15 20000
node measure-beacons.mjs prod 15 20000

# Summarise (reads data/v2-<env>.jsonl)
node analyze.mjs
```

Each run takes `dwell + ~3s`, so 40 runs at 20s is about 16 minutes. Run it in the background.

`probe-channels.mjs` is a diagnostic: it dumps each beacon's query parameters and the first
180 bytes of its body. Use it if the wire format changes and the channel classification in
`measure-beacons.mjs` stops matching.

### chunk-failure.mjs — does a chunk-load failure reach RUM?

Blocks chunk requests with `page.route()` and looks for the resulting failure in the beacons.
Answers the `chunk-load` case from [../RUM_ERROR_PROBE_SPEC.md](../RUM_ERROR_PROBE_SPEC.md)
without deploying a probe to frontier-app-react.

```bash
node chunk-failure.mjs cache-check int     # run this first, see below
node chunk-failure.mjs one:12 int 5        # block ONE chunk — the real failure mode
node chunk-failure.mjs lazy   int 5        # block all chunks — app never boots
node chunk-failure.mjs early  int 5        # block main.js — races the agent
```

Result: `ChunkLoadError` reaches Grail complete with stack, but via **`error.source: console`**,
not `window.onerror`. Details and the two ways this test can silently lie to you (retry query
strings, blocking every chunk) are in the spec.

**Run `cache-check` before trusting any timing.** `page.route()` disables Chromium's HTTP cache,
and measurement confirms **a narrow pattern does not avoid this** — the agent's warm-load
`transferSize` was 175,256 with a route registered versus 0 without. The agent therefore
downloads cold on every intercepted run and agent-ready shifts later, so capture rates from this
harness are a conservative bound and its timings are not comparable to `blind-window.mjs`.

## What it measures

The agent multiplexes two channels onto `bf99293tkn.bf.dynatrace.com/bf`:

| Channel | Query signature | Encoding |
| --- | --- | --- |
| `classic` | `type=js3` | form-encoded (`$a=1%7C2%7C_event_%7C…`) |
| `grail` | `ty=js&cy=event` | JSON (`{"data_version":2,…}`), compressed |

Per session it records bytes and request counts per channel, plus `_sr_`/`_nosr_` marker counts.
`analyze.mjs` reports mean/median/min/max per channel, splits sessions by whether Classic sent a
full payload or a ~1KB stub, and prints sorted totals so bimodality is visible directly.

## Interpreting results

- **Compare within an environment, not across.** int/beta/prod run different app deployments with
  different DOM weight, so cross-environment magnitude comparisons are confounded. Presence/absence
  results (e.g. `prod grail == 0`) are not.
- **Sampling is not loss.** `costAndTrafficControl: 33` means about one session in three is
  monitored by design. Most Classic sessions legitimately send only a ~1KB stub.
- **These are lower bounds.** 20-second scripted sessions understate real patron sessions, which
  are longer and more interactive.
- Counts request **body** bytes only — headers and TLS overhead excluded.

## Retained data

`data/` holds the raw JSONL from the 2026-08-08 run (int n=40, beta n=15, prod n=15) that produced
the published figures. Tenant configuration at capture time:

| | int | beta | prod |
| --- | --- | --- | --- |
| New RUM (`enabledOnGrail`) | on | on | off |
| Session Replay | on | off (temporary) | on |
| Agent | 1.343 | 1.343 | 1.341 |

Re-running after prod enables New RUM is the natural next use — it would verify the predicted
~2.3× upload increase against reality.

## Not included

The earlier FCP/loading-mechanism harnesses were deliberately not kept: they were tied to
`fs_anid` cookie pins that are meaningless now the flag is 100% `global-cdn`, two of their three
approaches had already been superseded, and the one question they addressed — does `async` lose
early events — is better answered by `@dynatrace/rum-javascript-sdk-playwright`'s
`dynatraceTesting.expectToHaveSentEvent(...)`, which turns it into a deterministic assertion.
