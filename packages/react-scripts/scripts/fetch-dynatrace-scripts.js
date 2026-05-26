#!/usr/bin/env node
/**
 * Dynatrace RUM Script Fetcher
 *
 * Fetches the latest RUM inline scripts and tags from Dynatrace using the API.
 * Automatically updates inline script files and displays CDN URLs for updating dynatrace.ejs.
 * Requires Dynatrace API token with RUM manual insertion tags read scope.
 *
 * IMPORTANT: This API may not be available on all Dynatrace instances or configurations.
 * If the API is not accessible, fetch scripts manually from:
 *   Dynatrace UI → Settings → Real User Monitoring → Managed JavaScript
 *   (copy the inline script and CDN URL for each environment)
 *
 * Usage:
 *   node fetch-dynatrace-scripts.js                        # reads token from macOS keychain
 *   DYNATRACE_API_TOKEN="xxx" node fetch-dynatrace-scripts.js  # override for one run
 *
 * Token setup (one-time):
 *   security add-generic-password -a dynatrace-rum-fetch -s dynatrace-api-token -w
 *
 * Configuration:
 *   - Token is auto-read from keychain; set DYNATRACE_API_TOKEN env var to override
 *   - Update DYNATRACE_ENVIRONMENT_URL and ENTITY_IDS below with your values
 *
 * API Documentation:
 *   https://docs.dynatrace.com/docs/dynatrace-api/environment-api/rum/rum-manual-insertion-tags
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KEYCHAIN_ACCOUNT = 'dynatrace-rum-fetch';
const KEYCHAIN_SERVICE = 'dynatrace-api-token';

function getTokenFromKeychain() {
  try {
    const token = execSync(
      `security find-generic-password -a "${KEYCHAIN_ACCOUNT}" -s "${KEYCHAIN_SERVICE}" -w`,
      { stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString().trim();
    return token || null;
  } catch {
    return null;
  }
}

function printKeychainSetupInstructions() {
  console.error(`
ERROR: No Dynatrace API token found.

To store your token in the macOS keychain (one-time setup):

  security add-generic-password \\
    -a "${KEYCHAIN_ACCOUNT}" \\
    -s "${KEYCHAIN_SERVICE}" \\
    -w

You'll be prompted to enter the token value (it won't appear in shell history).

To get a token:
  1. Log into https://bjm35087.live.dynatrace.com
  2. Go to Account → Access Tokens → Generate new token
  3. Add scope: "Read RUM manual insertion tags"

To update an existing token:
  security delete-generic-password -a "${KEYCHAIN_ACCOUNT}" -s "${KEYCHAIN_SERVICE}"
  security add-generic-password -a "${KEYCHAIN_ACCOUNT}" -s "${KEYCHAIN_SERVICE}" -w

Or override for a single run:
  DYNATRACE_API_TOKEN="dt0c01.xxx" node fetch-dynatrace-scripts.js
`);
}

// Configuration
const DYNATRACE_ENVIRONMENT_URL = process.env.DYNATRACE_ENV_URL || "https://bjm35087.live.dynatrace.com";
const DYNATRACE_API_TOKEN = process.env.DYNATRACE_API_TOKEN || getTokenFromKeychain();

// Entity IDs for your RUM applications in each environment
// Get from Dynatrace UI: Applications → select app → Settings → note the entity ID
const ENTITY_IDS = {
  int: process.env.INT_ENTITY_ID || "APPLICATION-3FAF90E849295814",
  beta: process.env.BETA_ENTITY_ID || "APPLICATION-C4242BB1EB216374",
  prod: process.env.PROD_ENTITY_ID || "APPLICATION-A8E5EDD77F861ACE",
};

function parseUrl(urlString) {
  const url = new URL(urlString);
  return {
    hostname: url.hostname,
    path: url.pathname.replace(/\/$/, ''),
  };
}

async function makeRequest(hostname, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: 'GET',
      headers: {
        'Authorization': `Api-Token ${DYNATRACE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };

    https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(`HTTP ${res.statusCode}: ${data}`);
        }
      });
    }).on('error', reject).end();
  });
}

function updateDynatraceEjs(results) {
  const ejsPath = path.join(__dirname, '../layout/views/partials/dynatrace.ejs');
  let content = fs.readFileSync(ejsPath, 'utf8');

  // Build replacement cdnUrlsNew block
  const urlLines = Object.entries(results).map(([env, data]) => {
    const src = data.completeTag.match(/src="([^"]+)"/)?.[1] || '';
    return `    ${env}: '${src}'`;
  }).join(',\n');
  content = content.replace(
    /const cdnUrlsNew = \{[^}]+\}/s,
    `const cdnUrlsNew = {\n${urlLines}\n  }`
  );

  // Build replacement cdnIntegrityNew block (per-env object)
  const integrityLines = Object.entries(results).map(([env, data]) => {
    const hash = data.completeTag.match(/integrity="([^"]+)"/)?.[1] || '';
    return `    ${env}: '${hash}'`;
  }).join(',\n');
  content = content.replace(
    /const cdnIntegrityNew = (\{[^}]+\}|'[^']+')/s,
    `const cdnIntegrityNew = {\n${integrityLines}\n  }`
  );

  fs.writeFileSync(ejsPath, content, 'utf8');
  console.log("   ✅ Updated dynatrace.ejs (cdnUrlsNew + cdnIntegrityNew)");
}

async function fetchScripts() {
  if (!DYNATRACE_API_TOKEN) {
    printKeychainSetupInstructions();
    process.exit(1);
  }

  const missingIds = Object.entries(ENTITY_IDS)
    .filter(([, id]) => !id)
    .map(([env]) => env);

  if (missingIds.length > 0) {
    console.error(`ERROR: Missing entity IDs for: ${missingIds.join(", ")}`);
    console.error("Set environment variables: INT_ENTITY_ID, BETA_ENTITY_ID, PROD_ENTITY_ID");
    process.exit(1);
  }

  try {
    const { hostname, path: basePath } = parseUrl(DYNATRACE_ENVIRONMENT_URL);
    console.log("Fetching Dynatrace RUM scripts...\n");

    const results = {};

    for (const [env, entityId] of Object.entries(ENTITY_IDS)) {
      console.log(`📥 Fetching ${env.toUpperCase()} environment (entity: ${entityId})...`);

      try {
        // Fetch OneAgent JavaScript tag with SRI (includes inline script and complete tag)
        const path = `${basePath}/api/v2/rum/oneAgentJavaScriptTagWithSri/${entityId}`;
        const response = await makeRequest(hostname, path);

        results[env] = {
          completeTag: response.trim(),
        };

        console.log(`   ✅ Complete tag fetched (${response.length} chars)`);

        // Extract CDN URL from complete tag
        const srcMatch = response.match(/src="([^"]+)"/);
        if (srcMatch) {
          console.log(`   📌 CDN URL: ${srcMatch[1]}`);
        }

        // Extract integrity hash if present
        const integrityMatch = response.match(/integrity="([^"]+)"/);
        if (integrityMatch) {
          console.log(`   🔒 Integrity: ${integrityMatch[1]}`);
        }

        console.log("");
      } catch (error) {
        console.error(`   ❌ Failed to fetch ${env}: ${error}\n`);
        throw error;
      }
    }

    // Write inline scripts to files
    console.log("\n📝 Writing inline scripts to files...\n");

    const inlineScriptDir = path.join(__dirname, '../layout/views/partials/dynatrace');

    for (const [env, data] of Object.entries(results)) {
      const inlineFilePath = path.join(inlineScriptDir, `_inline_${env}_new.ejs`);

      try {
        fs.writeFileSync(inlineFilePath, data.completeTag, 'utf8');
        console.log(`   ✅ Wrote ${path.basename(inlineFilePath)}`);
      } catch (error) {
        console.error(`   ❌ Failed to write ${env} inline script: ${error.message}`);
      }
    }

    // Update dynatrace.ejs with new CDN URLs and per-env integrity hashes
    updateDynatraceEjs(results);

    console.log("\n✨ Scripts fetched and all files updated successfully!");
    console.log("\nNext steps:");
    console.log("1. ✅ Inline scripts written to _inline_*_new.ejs files");
    console.log("2. ✅ dynatrace.ejs updated with new CDN URLs and integrity hashes");
    console.log("3. Test all three mechanisms (asyncCS-script, asyncCS-inline, global-cdn)");

    return results;
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  fetchScripts();
}

module.exports = { fetchScripts };
