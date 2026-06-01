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

function extractEnvValues(results) {
  const envs = Object.keys(results);
  return {
    cdnUrlsNew: Object.fromEntries(envs.map(env => [
      env, results[env].completeTag.match(/src="([^"]+)"/)?.[1] || ''
    ])),
    cdnIntegrityNew: Object.fromEntries(envs.map(env => [
      env, results[env].completeTag.match(/integrity="([^"]+)"/)?.[1] || ''
    ])),
    cdnConfigNew: Object.fromEntries(envs.map(env => [
      env, results[env].completeTag.match(/data-dtconfig="([^"]+)"/)?.[1] || ''
    ])),
    inlineScriptNew: Object.fromEntries(envs.map(env => [
      env, results[env].completeTag.trim()
    ])),
  };
}

function updateDynatraceEjs(results) {
  const ejsPath = path.join(__dirname, '../layout/views/partials/dynatrace.ejs');
  let content = fs.readFileSync(ejsPath, 'utf8');
  const values = extractEnvValues(results);

  const urlLines = Object.entries(values.cdnUrlsNew).map(([env, url]) =>
    `    ${env}: '${url}'`).join(',\n');
  content = content.replace(
    /const cdnUrlsNew = locals\.dynatrace\?\.cdnUrlsNew \|\| \{[^}]+\}/s,
    `const cdnUrlsNew = locals.dynatrace?.cdnUrlsNew || {\n${urlLines}\n  }`
  );

  const integrityLines = Object.entries(values.cdnIntegrityNew).map(([env, hash]) =>
    `    ${env}: '${hash}'`).join(',\n');
  content = content.replace(
    /const cdnIntegrityNew = locals\.dynatrace\?\.cdnIntegrityNew \|\| \{[^}]+\}/s,
    `const cdnIntegrityNew = locals.dynatrace?.cdnIntegrityNew || {\n${integrityLines}\n  }`
  );

  const configLines = Object.entries(values.cdnConfigNew).map(([env, cfg]) =>
    `    ${env}: '${cfg}'`).join(',\n');
  content = content.replace(
    /const cdnConfigNew = locals\.dynatrace\?\.cdnConfigNew \|\| \{[^}]+\}/s,
    `const cdnConfigNew = locals.dynatrace?.cdnConfigNew || {\n${configLines}\n  }`
  );

  fs.writeFileSync(ejsPath, content, 'utf8');
  console.log("   ✅ Updated dynatrace.ejs fallback values");
}

function writeCdnConfigJson(results) {
  const values = extractEnvValues(results);
  const config = {
    generated: new Date().toISOString(),
    ...values,
  };
  const configPath = path.join(__dirname, 'dynatrace-rum-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  console.log("   ✅ Wrote dynatrace-rum-config.json (publish this to CDN for Snow)");
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
        // Fetch simple JavaScript tag (basic, no SRI)
        const simplePath = `${basePath}/api/v2/rum/javaScriptTag/${entityId}`;
        const simpleResponse = await makeRequest(hostname, simplePath);

        // Fetch OneAgent JavaScript tag with SRI (for CDN URL, config, integrity hash)
        const tagPath = `${basePath}/api/v2/rum/oneAgentJavaScriptTagWithSri/${entityId}`;
        const tagResponse = await makeRequest(hostname, tagPath);

        // Fetch inline code (actual JavaScript to embed)
        const inlinePath = `${basePath}/api/v2/rum/inlineCode/${entityId}`;
        const inlineResponse = await makeRequest(hostname, inlinePath);

        results[env] = {
          simpleTag: simpleResponse.trim(),
          completeTag: tagResponse.trim(),
          inlineCode: inlineResponse.trim(),
        };

        console.log(`   ✅ Simple tag fetched (${simpleResponse.length} chars)`);
        console.log(`   ✅ Complete tag fetched (${tagResponse.length} chars)`);
        console.log(`   ✅ Inline code fetched (${inlineResponse.length} chars)`);

        // Extract CDN URL from both simple and complete tags
        const simpleSrcMatch = simpleResponse.match(/src="([^"]+)"/);
        if (simpleSrcMatch) {
          console.log(`   📌 Simple CDN URL: ${simpleSrcMatch[1]}`);
        }

        const sriBenchMatch = tagResponse.match(/src="([^"]+)"/);
        if (sriBenchMatch) {
          console.log(`   📌 SRI CDN URL: ${sriBenchMatch[1]}`);
        }

        // Extract integrity hash if present
        const integrityMatch = tagResponse.match(/integrity="([^"]+)"/);
        if (integrityMatch) {
          console.log(`   🔒 Integrity: ${integrityMatch[1]}`);
        }

        // Extract data-dtconfig if present
        const configMatch = tagResponse.match(/data-dtconfig="([^"]+)"/);
        if (configMatch) {
          console.log(`   ⚙️  Config includes reportUrl for direct beacon delivery`);
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
        fs.writeFileSync(inlineFilePath, data.inlineCode, 'utf8');
        console.log(`   ✅ Wrote ${path.basename(inlineFilePath)}`);
      } catch (error) {
        console.error(`   ❌ Failed to write ${env} inline script: ${error.message}`);
      }
    }

    // Update dynatrace.ejs fallback values and write CDN config JSON
    console.log("\n📝 Updating files...\n");
    updateDynatraceEjs(results);
    writeCdnConfigJson(results);

    console.log("\n✨ Done!");
    console.log("\nNext steps:");
    console.log("1. ✅ _inline_*_new.ejs files written");
    console.log("2. ✅ dynatrace.ejs fallback values updated");
    console.log("3. ✅ dynatrace-rum-config.json written — publish to CDN for Snow to consume");
    console.log("4. Commit and deploy react-scripts to update the fallback values");
    console.log("5. Test all three mechanisms (asyncCS-script, asyncCS-inline, global-cdn)");

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
