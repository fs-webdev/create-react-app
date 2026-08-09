# Updating Dynatrace RUM Scripts

This guide explains how to update the Dynatrace RUM agent to a new version using the automated fetch script.

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
2. ✅ **Write & publish** `dynatrace-rum-config.json` to S3 so Snow can supply fresh values via `locals.dynatrace.*` without a react-scripts redeploy
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

One flag drives everything: **`frontier_snow_dynatraceRUM`** (see [dynatrace.ejs](../../layout/views/partials/dynatrace.ejs)). It has three meaningful states. Decision rationale is in [DYNATRACE_RUM_MECHANISMS.md](./DYNATRACE_RUM_MECHANISMS.md).

| Treatment | Renders | Purpose |
|---|---|---|
| `off` | nothing | Kill switch. Defined in int, beta and prod |
| `asyncCS-inline` | versioned OneAgent JS tag + SRI, **sync** | Fallback arm. Immutably cached for a year, and no blind window |
| anything else | `_complete.js` from the global CDN, **async** | Default |

The default is the **fallthrough**, not an explicit `global-cdn` match. A retired treatment name, a renamed flag, or a Split outage returning `control` all still load RUM. Failing closed would create a silent monitoring gap — the one failure mode invisible in the data itself. Do not "tidy" this into an equality check.

The treatment name `asyncCS-inline` is historical and describes neither its load mode nor its format; it is retained to avoid a coordinated Split-plus-deploy rename.

What to verify (DevTools → Network / Elements):

```text
off             → no Dynatrace script tag at all
asyncCS-inline  → <script src=".../sri/ruxitagent_…js" data-dtconfig integrity …>   (no async)
default         → <script src=".../{appId}_complete.js" async>   (no integrity/data-dtconfig; config baked in)
```

`defer` is intentionally unused: for a monitoring agent it strictly enlarges the un-instrumented early window for a negligible page-speed gain over `async`.

**Whether the New RUM Experience is active is not a code concern.** It is the tenant's `enabledOnGrail` setting, toggled per application in the Dynatrace UI with no deploy:

```bash
dtctl get settings --schema builtin:rum.web.enablement --scope APPLICATION-<id>
```

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

- [Dynatrace RUM API Documentation](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/rum/rum-manual-insertion-tags)
- [dynatrace.ejs](../../layout/views/partials/dynatrace.ejs) - Main RUM configuration file
- [fetch-dynatrace-scripts.js](./fetch-dynatrace-scripts.js) - The fetch script itself

## Version History

- **8.17.0**: New RUM Experience baseline; single-flag loading
  - Removed the `frontier_snow_dynatraceNewRUM` flag — New RUM enablement is the tenant's
    `enabledOnGrail` setting, not a code concern
  - Removed all old-RUM code paths: `edgeUrls`, the old `cdnUrls`, and the three
    `_inline_*.ejs` bootstrap files (~105 KB out of the published package)
  - `frontier_snow_dynatraceRUM` reduced to three states: `off`, `asyncCS-inline`
    (SRI, sync), and a fail-open default of `_complete.js` loaded `async`
  - Maintainer tooling and docs moved to `tools/dynatrace/`, excluded from the published package
