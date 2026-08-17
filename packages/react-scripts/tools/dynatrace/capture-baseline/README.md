# Pre-async RUM capture baselines

Captured before the sync -> async loading change, so a regression is detectable afterwards.
Re-run the same query post-deploy and compare.

| File | Scope |
| --- | --- |
| `baseline.dql` | Per Dynatrace application (int/beta/prod). Session-level metrics: actions, errors, bounce |
| `baseline-per-app.dql` | Per environment **and** Frontier app. Use this one for the async comparison |

## Reading the results

**Only beta is usable as a field baseline.** int/app-react runs 0-2 organic sessions/day; the
larger numbers on some days are harness runs from this repo, not real traffic. Prod has no
Grail data at all until `enabledOnGrail` is turned on there.

Beta at capture time (still sync): app-react ~110-130 sessions/day, labs ~14-33.

**int was already async** from 2026-08-09, so it is not a valid "before" for anything.

At beta's volume a few-percent capture shift needs weeks to separate from noise. The lab
measurement in `../beacon-harness/blind-window.mjs` is the primary evidence; this is
confirmation at scale.

## The metric that matters

Share of sessions with at least one user action, not session count -- a session that loads but
captures nothing still counts as a session. Baseline from `baseline.dql` is 91-98%.

Expect sessions-per-render near **~33%**, not 100%: `costAndTrafficControl: 33` means one
session in three is monitored by design.
