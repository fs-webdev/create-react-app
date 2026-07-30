# Updating Dynatrace RUM Scripts

This guide explains how to update the Dynatrace RUM agent to a new version using the automated fetch script.

## Quick Start

```bash
export DYNATRACE_API_TOKEN="your-api-token"
node packages/react-scripts/scripts/fetch-dynatrace-scripts.js
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
node packages/react-scripts/scripts/fetch-dynatrace-scripts.js
```

The script will:
1. ✅ **Update the new-RUM fallback values** in `dynatrace.ejs` (`cdnUrlsNew`, `cdnIntegrityNew`, `cdnConfigNew`, `cdnCompleteUrlsNew`)
2. ✅ **Write & publish** `dynatrace-rum-config.json` to S3 so Snow can supply fresh values via `locals.dynatrace.*` without a react-scripts redeploy
3. 🔒 **Capture the SRI integrity hashes** and `data-dtconfig` for each environment

> **The new RUM agent is never inlined.** The script no longer fetches `/inlineCode` or writes `_inline_*_new.ejs` files. Reason: EJS `include()` compiles the included file as a template, and the new agent's minified JS contains the two-character EJS open-delimiter sequence (a `<` immediately followed by a `%`) inside a string, which EJS misreads as an unterminated scriptlet ("Could not find matching close tag"). It also re-ships 300–460 KB on every page view. The new RUM loads exclusively via `<script>` tags. The old-RUM `_inline_*.ejs` bootstrap files are unaffected.

### Step 2: Verify the updated values in dynatrace.ejs

The script updates `dynatrace.ejs` **automatically** (see Step 1) — there is nothing to copy by hand. It rewrites four per-environment fallback objects, and the values differ per environment: `int` uses a different feature hash than `beta`/`prod`, so its integrity hash and `data-dtconfig` differ too (there is **no** single integrity hash shared across environments).

```javascript
const cdnUrlsNew         = (locals && locals.dynatrace && locals.dynatrace.cdnUrls)         || { int: '…', beta: '…', prod: '…' }
const cdnIntegrityNew    = (locals && locals.dynatrace && locals.dynatrace.cdnIntegrity)    || { int: 'sha256-…', beta: 'sha256-…', prod: 'sha256-…' }
const cdnConfigNew       = (locals && locals.dynatrace && locals.dynatrace.cdnConfig)       || { int: '…', beta: '…', prod: '…' }
const cdnCompleteUrlsNew = (locals && locals.dynatrace && locals.dynatrace.cdnCompleteUrls) || { int: '…', beta: '…', prod: '…' }
```

To confirm, run `git diff` on `dynatrace.ejs` and check that all three environments show the new agent version. The script also prints the downloaded agent version and each environment's CDN URL / integrity / config to stdout for reference.

### Step 3: Test All Mechanisms

Two flags drive the experiment (see [dynatrace.ejs](./partials/dynatrace.ejs)):

- **`frontier_snow_dynatraceRUM`**: Selects the loading mechanism (`asyncCS-script`, `asyncCS-inline`, or `global-cdn`)
- **`frontier_snow_dynatraceNewRUM`**: Selects the RUM version (old or new)

#### Treatment → snippet-format mapping

The three treatment names are **fixed** (apps still on old RUM depend on them), so for the new RUM we remap each treatment to a Dynatrace snippet format. This is intentional and documented here.

| Treatment | Old RUM (unchanged) | New RUM | Why |
|---|---|---|---|
| `asyncCS-script` | Edge CDN `<script async>` | **OneAgent JS tag + SRI, `async`** | Non-blocking; 1-year cached, integrity-verified. Measures the early-capture "blind window." |
| `asyncCS-inline` | small inline bootstrap (`_inline_*.ejs`) | **OneAgent JS tag + SRI, `sync`** | New RUM has **no small-bootstrap format**; the sync SRI tag is the closest analog (full early capture; parse-blocks only on first uncached load, free on warm cache). **No longer inlines.** |
| `global-cdn` | `_complete.js` (sync) | **JavaScript tag (`_complete.js`), `async`** | Combined code+config, single request, ~1-hour cache. The caching-strategy comparison point. |

`defer` is intentionally not tested: for a monitoring agent it strictly enlarges the un-instrumented early window for a negligible page-speed gain over `async`.

What to verify per treatment (DevTools → Network / Elements):

```text
asyncCS-script (new) → <script src=".../sri/ruxitagent_…js" data-dtconfig integrity … async>
asyncCS-inline (new) → same SRI tag but WITHOUT async (synchronous)
global-cdn     (new) → <script src=".../{appId}_complete.js" async>   (no integrity/data-dtconfig; config is baked in)
```

To gauge data loss between sync/async, compare RUM aggregates across treatments (user actions per session, captured XHR/fetch actions, JS error capture rate, and CWV) — or run a synthetic page that fires an early click + XHR + error and confirm each is captured under sync vs async.

### Step 4: Commit and Release

```bash
# Stage changes (dynatrace.ejs fallback values are auto-updated by the fetch script)
git add packages/react-scripts/layout/views/partials/dynatrace.ejs

# Commit with descriptive message
git commit -m "Update Dynatrace RUM to latest version

- Update new-RUM fallback values (cdnUrls/cdnIntegrity/cdnConfig/cdnCompleteUrls) via fetch-dynatrace-scripts.js
- Republish dynatrace-rum-config.json to S3
- New RUM version includes enhanced data collection (owasp=1, uxrgce=1)"

# Bump version in package.json (usually minor bump)
# Example: 8.16.0 → 8.17.0
sed -i '' 's/"version": "8\.16\.0"/"version": "8.17.0"/' packages/react-scripts/package.json

# Update CHANGELOG-FRONTIER.md
# Add entry at the top with the new version and upgrade details

# Commit version and changelog
git add packages/react-scripts/package.json CHANGELOG-FRONTIER.md
git commit -m "Bump react-scripts to 8.17.0 with Dynatrace RUM upgrade"

# Push when ready
git push origin dynatrace-rum-upgrade
```

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
packages/react-scripts/scripts/dynatrace-rum-config.json     (regenerated; also published to S3)
packages/react-scripts/package.json (version bump)
CHANGELOG-FRONTIER.md (add entry)
```

> Note: the new RUM does **not** generate `_inline_*_new.ejs` files (the agent is loaded via `<script>` tags, never inlined). The old-RUM `_inline_*.ejs` bootstrap files remain and are not touched by this script.

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

- [Dynatrace RUM API Documentation](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/rum/rum-manual-insertion-tags)
- [dynatrace.ejs](./partials/dynatrace.ejs) - Main RUM configuration file
- [fetch-dynatrace-scripts.js](./fetch-dynatrace-scripts.js) - The fetch script itself

## Version History

- **8.17.0**: First release with dual-flag support (old vs new RUM version)
  - Introduced `frontier_snow_dynatraceNewRUM` feature flag for gradual rollout
  - Updated to RUM 1.329+ with enhanced data collection (owasp=1, uxrgce=1)
  - Added SRI integrity hash support
