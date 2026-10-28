# Updating Dynatrace RUM Scripts

This guide explains how to update the Dynatrace RUM agent to a new version using the automated fetch script.

> **When this matters.** The default arm loads `_complete.js` from a stable URL that Dynatrace
> updates itself, so it always serves the tenant's current agent and configuration — no refresh
> needed. This procedure only refreshes the values baked into `dynatrace.ejs` for the two SRI
> arms, which no real traffic uses today. Run it when you need those arms current, or as routine
> hygiene alongside a release.

## Quick Start

```bash
export DYNATRACE_API_TOKEN="your-api-token"
node packages/react-scripts/tools/dynatrace/fetch-dynatrace-scripts.js
```

The script will fetch the latest RUM scripts and CDN URLs for all three environments (int, beta, prod).

## Prerequisites

### 1. Get a Dynatrace API Token

1. Log into your Dynatrace environment: https://bjm35087.live.dynatrace.com
2. Go to Account → Access Tokens
3. Create a new API token with these scopes:
   - **Read RUM manual insertion tags** (API v2) - for fetching scripts
   - **Real user monitoring JavaScript tag management** (API v1) - optional, for additional RUM data

### 2. Know Your Entity IDs

The script uses these default entity IDs:
- **Int**: `APPLICATION-3FAF90E849295814`
- **Beta**: `APPLICATION-C4242BB1EB216374`
- **Prod**: `APPLICATION-A8E5EDD77F861ACE`

To find entity IDs yourself:
1. Log into Dynatrace
2. Go to Applications → select your app → Settings
3. The entity ID is shown in the URL or settings page

## How to Use

### Step 1: Fetch the Latest Scripts

```bash
export DYNATRACE_API_TOKEN="your-token-here"
node packages/react-scripts/tools/dynatrace/fetch-dynatrace-scripts.js
```

The script will:
1. ✅ **Update the new-RUM fallback values** in `dynatrace.ejs` (`cdnUrlsNew`, `cdnIntegrityNew`, `cdnConfigNew`, `cdnCompleteUrlsNew`)
2. ✅ **Write & publish** `dynatrace-rum-config.json` to S3. Snow would read it into `locals.dynatrace.*` and supply fresh values without a react-scripts release, but no released Snow does that yet (pending in fs-webdev/snow#446) — so today the baked fallbacks are what render
3. 🔒 **Capture the SRI integrity hashes** and `data-dtconfig` for each environment

> **The agent is never inlined.** The script does not fetch `/inlineCode` or write `_inline_*.ejs` files — those were deleted along with the old-RUM code paths. Reason: EJS `include()` compiles the included file as a template, and the minified agent contains the two-character EJS open-delimiter sequence (a `<` immediately followed by a `%`) inside a string, which EJS misreads as an unterminated scriptlet ("Could not find matching close tag"). It also re-ships 300–460 KB on every page view. The agent loads exclusively via `<script>` tags.

### Step 2: Verify the updated values in dynatrace.ejs

The script updates `dynatrace.ejs` **automatically** (see Step 1) — there is nothing to copy by hand. It rewrites four per-environment fallback objects, and the values differ per environment: `int` uses a different feature hash than `beta`/`prod`, so its integrity hash and `data-dtconfig` differ too (there is **no** single integrity hash shared across environments).

```javascript
const cdnUrlsNew         = (locals && locals.dynatrace && locals.dynatrace.cdnUrls)         || { int: '…', beta: '…', prod: '…' }
const cdnIntegrityNew    = (locals && locals.dynatrace && locals.dynatrace.cdnIntegrity)    || { int: 'sha256-…', beta: 'sha256-…', prod: 'sha256-…' }
const cdnConfigNew       = (locals && locals.dynatrace && locals.dynatrace.cdnConfig)       || { int: '…', beta: '…', prod: '…' }
const cdnCompleteUrlsNew = (locals && locals.dynatrace && locals.dynatrace.cdnCompleteUrls) || { int: '…', beta: '…', prod: '…' }
```

To confirm, run `git diff` on `dynatrace.ejs` and check that all three environments show the new agent version. The script also prints the downloaded agent version and each environment's CDN URL / integrity / config to stdout for reference.

### Step 3: Verify what renders

One flag drives everything: **`frontier_snow_dynatraceRUM`** (see [dynatrace.ejs](../../layout/views/partials/dynatrace.ejs)). It has four meaningful states. Decision rationale is in [DYNATRACE_RUM_MECHANISMS.md](./DYNATRACE_RUM_MECHANISMS.md).

| Treatment | Renders | Purpose |
|---|---|---|
| `off` | nothing | Kill switch. Defined in int, beta and prod |
| `asyncCS-inline` | versioned OneAgent JS tag + SRI, **sync** | SRI arm. Immutably cached for a year, and no blind window. **Sends no data to Grail** — see the mechanisms doc |
| `asyncCS-script` | the same versioned tag + SRI, **async** | SRI arm. **Sends no data to Grail** |
| anything else | `_complete.js` from the global CDN, **async** | Default. Essentially all real traffic: the flag is 100% `global-cdn` apart from four test keys (below) |

The default is the **fallthrough**, not an explicit `global-cdn` match. A retired treatment name, a renamed flag, or a Split outage returning `control` all still load RUM. Failing closed would create a silent monitoring gap — the one failure mode invisible in the data itself. Do not "tidy" this into an equality check.

The `asyncCS-*` names are historical and read backwards — `-inline` is the **sync** arm, `-script` the **async** one. They are retained to avoid a coordinated Split-plus-deploy rename.

What to verify (DevTools → Network / Elements):

```text
off             → no Dynatrace script tag at all
asyncCS-inline  → <script src=".../sri/ruxitagent_…js" data-dtconfig integrity …>   (no async)
asyncCS-script  → the same tag with async
default         → <script src=".../{appId}_complete.js" async>   (no integrity/data-dtconfig; config baked in)
```

#### Forcing a specific state

The flag is 100% `global-cdn`, plus four individually targeted Split keys — one per state — so
each can be tested on demand. Snow derives the key (`SERVER_DATA.flagAttributes.anonId`)
deterministically from the `fs_anid` cookie, so setting the cookie selects the state:

| Treatment | Split key | `fs_anid` cookie |
|---|---|---|
| `off` | `A_6452` | `d7000000-0000-4000-8000-000000000000` |
| `global-cdn` | `A_1118` | `d7000000-0000-4000-8000-000000000001` |
| `asyncCS-script` | `A_9904` | `d7000000-0000-4000-8000-000000000002` |
| `asyncCS-inline` | `A_2603` | `d7000000-0000-4000-8000-000000000003` |

The same cookie resolves to the same key in int, beta and prod (verified 2026-10-27). To use it,
set `fs_anid` on `.familysearch.org` in DevTools and reload; confirm with
`SERVER_DATA.flagAttributes.anonId` in the console. The test harnesses archived at tag
`rum-research-archive-2026-10-27` use these cookie values. With no `fs_anid`, or any other value, you get the default.

These keys are buckets, not users. There are about 10,000, so each targeted key also catches the
~0.01% of real visitors whose cookie happens to hash into it. In practice ~0.03% of visitors sit
on `off` or an SRI arm — and while the SRI arms send nothing to Grail, that slice is invisible to
New RUM. Remove a target once it is no longer needed.

`defer` is intentionally unused: for a monitoring agent it strictly enlarges the un-instrumented early window for a negligible page-speed gain over `async`.

**Whether the New RUM Experience is active is not a code concern.** It is the tenant's `enabledOnGrail` setting, toggled per application in the Dynatrace UI with no deploy:

Read it with the queries in [DYNATRACE_RUM_MECHANISMS.md, "Checking the current tenant state"](./DYNATRACE_RUM_MECHANISMS.md#checking-the-current-tenant-state). Do not query a single application with `--scope`: an application that inherits from the environment returns an empty list.

### Step 4: Commit and Release

Commit the two files the script changed, then release as usual:

```bash
git add packages/react-scripts/layout/views/partials/dynatrace.ejs \
        packages/react-scripts/tools/dynatrace/dynatrace-rum-config.json
git commit -m "chore(rum): refresh Dynatrace fallbacks to agent <version>"
```

Bump the version in `packages/react-scripts/package.json` and add a `CHANGELOG-FRONTIER.md`
entry. Consuming apps pick up the new fallbacks only when they upgrade and redeploy.

## Understanding the Output

The API returns complete script tags like:

```html
<script type="text/javascript" 
  src="https://js-cdn.dynatrace.com/jstag/15c157a40ab/sri/ruxitagent_ICA7NQVfghqrux_10337260504112723.js" 
  data-dtconfig="app=3faf90e849295814|..." 
  integrity="sha256-6PrnNTp1/05LJTqnB9OOhKEVMId1XHk4Xa1x3cPF2Ec=" 
  crossorigin="anonymous">
</script>
```

Key parts:
- **`src`**: The CDN URL for the external script
- **`data-dtconfig`**: Configuration string (includes app ID, parameters, etc.)
- **`integrity`**: SRI hash for script verification
- **app ID**: The environment-specific application identifier (e.g., `app=3faf90e849295814`)

## Files Modified During Update

```
packages/react-scripts/layout/views/partials/dynatrace.ejs   (fallback values auto-updated)
packages/react-scripts/tools/dynatrace/dynatrace-rum-config.json     (regenerated; also published to S3)
packages/react-scripts/package.json (version bump)
CHANGELOG-FRONTIER.md (add entry)
```

> Note: the script never generates inline agent files. The old-RUM `_inline_*.ejs` bootstrap files were deleted when the old-RUM code paths were removed.

## Troubleshooting

**API returns 401 Unauthorized**
- Check that `DYNATRACE_API_TOKEN` environment variable is set
- Verify the token has the correct scopes (RUM manual insertion tags read)

**API returns 400 Bad Request**
- Ensure entity IDs include the `APPLICATION-` prefix
- Entity IDs must be uppercase

**API returns 404 Not Found**
- Verify the API endpoint URL is correct: `/api/v2/rum/oneAgentJavaScriptTagWithSri/{entityId}`
- Check that you're using the `.live.dynatrace.com` domain, not `.apps.dynatrace.com`

## Related Documentation

- [DYNATRACE_RUM_MECHANISMS.md](./DYNATRACE_RUM_MECHANISMS.md) — why the template is built this way, what is known broken, and how to read the current tenant state
- [Dynatrace RUM: Loading Mechanisms & Agent Management (In-Depth Analysis)](https://icseng.atlassian.net/wiki/spaces/FRDOCS/pages/2496266249/Dynatrace+RUM+Loading+Mechanisms+Agent+Management+In-Depth+Analysis) — the full analysis and measurements (Confluence)
- Tag `rum-research-archive-2026-10-27` — the measurement harnesses, raw data and research notes, recoverable with `git show`
- [Dynatrace RUM API Documentation](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/rum/rum-manual-insertion-tags)
- [dynatrace.ejs](../../layout/views/partials/dynatrace.ejs) - Main RUM configuration file
- [fetch-dynatrace-scripts.js](./fetch-dynatrace-scripts.js) - The fetch script itself

Release history is in `CHANGELOG-FRONTIER.md` at the repository root.
