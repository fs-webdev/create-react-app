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
1. ✅ **Automatically write inline scripts** to `_inline_*_new.ejs` files
2. 📌 **Display CDN URLs** in copy-paste format
3. 🔒 **Display integrity hashes** for SRI verification

### Step 2: Update CDN URLs in dynatrace.ejs

The script output will display CDN URLs in this format:

```
CDN URLs for dynatrace.ejs (cdnUrlsNew object):

  int: 'https://js-cdn.dynatrace.com/...',
  beta: 'https://js-cdn.dynatrace.com/...',
  prod: 'https://js-cdn.dynatrace.com/...',

Integrity hash for all environments:
  cdnIntegrityNew = 'sha256-...'
```

Update these values in `packages/react-scripts/layout/views/partials/dynatrace.ejs`:

```javascript
const cdnUrlsNew = {
  int: '...',    // Copy from script output
  beta: '...',   // Copy from script output
  prod: '...'    // Copy from script output
}

const cdnIntegrityNew = '...' // Copy from script output
```

### Step 3: Test All Mechanisms

The existing feature flag logic supports gradual rollout (see [dynatrace.ejs](./partials/dynatrace.ejs)):

- **`frontier_snow_dynatraceRUM`**: Selects the loading mechanism (asyncCS-script, asyncCS-inline, or global-cdn)
- **`frontier_snow_dynatraceNewRUM`**: Selects the RUM version (old or new)

Test each mechanism:

```bash
# For asyncCS-script (uses Edge CDN)
# - Set frontier_snow_dynatraceRUM to "asyncCS-script"
# - Verify script loads from edge.fscdn.org or Dynatrace CDN

# For asyncCS-inline (embedded inline)
# - Set frontier_snow_dynatraceRUM to "asyncCS-inline"
# - Verify script is embedded in HTML

# For global-cdn (external from Dynatrace CDN)
# - Set frontier_snow_dynatraceRUM to "global-cdn"
# - Verify script loads from js-cdn.dynatrace.com
```

### Step 4: Commit and Release

```bash
# Stage all changes
git add packages/react-scripts/layout/views/partials/dynatrace.ejs
git add packages/react-scripts/layout/views/partials/dynatrace/_inline_*_new.ejs

# Commit with descriptive message
git commit -m "Update Dynatrace RUM to latest version

- Update inline scripts for int, beta, prod environments (via fetch-dynatrace-scripts.js)
- Update CDN URLs with latest SRI integrity hashes
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
packages/react-scripts/layout/views/partials/dynatrace.ejs
packages/react-scripts/layout/views/partials/dynatrace/_inline_int_new.ejs
packages/react-scripts/layout/views/partials/dynatrace/_inline_beta_new.ejs
packages/react-scripts/layout/views/partials/dynatrace/_inline_prod_new.ejs
packages/react-scripts/package.json (version bump)
CHANGELOG-FRONTIER.md (add entry)
```

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
