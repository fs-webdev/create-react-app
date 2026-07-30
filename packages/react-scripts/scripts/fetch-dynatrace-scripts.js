#!/usr/bin/env node
/**
 * Dynatrace RUM Script Fetcher
 *
 * Fetches the latest RUM inline scripts and tags from Dynatrace using the API.
 * Automatically updates inline script files, dynatrace.ejs fallbacks, and publishes
 * dynatrace-rum-config.json to S3 for Snow to consume.
 *
 * Requires:
 *   - Dynatrace API token with "Read RUM manual insertion tags" scope
 *   - AWS CLI configured with S3 write access to the CDN bucket
 *
 * IMPORTANT: Dynatrace API may not be available on all instances.
 * If unavailable, fetch scripts manually from:
 *   Dynatrace UI → Settings → Real User Monitoring → Managed JavaScript
 *
 * Usage:
 *   node fetch-dynatrace-scripts.js                        # reads token from keychain
 *   DYNATRACE_API_TOKEN="xxx" node fetch-dynatrace-scripts.js  # override for one run
 *
 * Setup (one-time):
 *   1. Store Dynatrace API token in keychain:
 *      security add-generic-password -a dynatrace-rum-fetch -s dynatrace-rum-fetch -w
 *
 *   2. Configure AWS CLI (uses standard AWS credential chain):
 *      aws configure          # or set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY env vars
 *      aws s3 ls              # verify you have S3 access
 *
 * Configuration:
 *   - Dynatrace token: auto-read from keychain; override with DYNATRACE_API_TOKEN
 *   - AWS credentials: read via AWS CLI (no keychain needed; uses ~/.aws/credentials or env vars)
 *   - S3 bucket/region: set via S3_PUBLISH_BUCKET and S3_PUBLISH_REGION env vars
 *   - Dynatrace/Entity IDs: set via DYNATRACE_ENV_URL and *_ENTITY_ID env vars
 *
 * API Documentation:
 *   https://docs.dynatrace.com/docs/dynatrace-api/environment-api/rum/rum-manual-insertion-tags
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KEYCHAIN_ACCOUNT = 'dynatrace-rum-fetch';
const KEYCHAIN_SERVICE_DYNATRACE = 'dynatrace-rum-fetch';
const KEYCHAIN_SERVICE_S3 = 's3-publish-key';

function getKeychainSecret(service) {
  try {
    const secret = execSync(
      `security find-generic-password -a "${KEYCHAIN_ACCOUNT}" -s "${service}" -w`,
      { stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString().trim();
    return secret || null;
  } catch (error) {
    return null;
  }
}

function printKeychainSetupInstructions() {
  console.error(`
ERROR: No Dynatrace API token found in keychain.

To store your Dynatrace token (one-time setup):

  security add-generic-password \\
    -a "${KEYCHAIN_ACCOUNT}" \\
    -s "${KEYCHAIN_SERVICE_DYNATRACE}" \\
    -w

You'll be prompted to enter the token (won't appear in shell history).

To get a Dynatrace token:
  1. Log into https://bjm35087.live.dynatrace.com
  2. Go to Account → Access Tokens → Generate new token
  3. Add scope: "Read RUM manual insertion tags"
  4. Paste the token when prompted above

To update an existing token:
  security delete-generic-password -a "${KEYCHAIN_ACCOUNT}" -s "${KEYCHAIN_SERVICE_DYNATRACE}"
  security add-generic-password -a "${KEYCHAIN_ACCOUNT}" -s "${KEYCHAIN_SERVICE_DYNATRACE}" -w

For AWS S3 access (used for publishing config):
  Ensure AWS CLI is configured with credentials:
    aws configure
  Or set environment variables:
    export AWS_ACCESS_KEY_ID="your-key"
    export AWS_SECRET_ACCESS_KEY="your-secret"

Or override Dynatrace token for a single run:
  DYNATRACE_API_TOKEN="dt0c01.xxx" node fetch-dynatrace-scripts.js
`);
}

// Configuration
const DYNATRACE_ENVIRONMENT_URL = process.env.DYNATRACE_ENV_URL || "https://bjm35087.live.dynatrace.com";
const DYNATRACE_API_TOKEN = process.env.DYNATRACE_API_TOKEN || getKeychainSecret(KEYCHAIN_SERVICE_DYNATRACE);

// S3 CDN configuration (for publishing dynatrace-rum-config.json via AWS CLI)
const S3_PUBLISH_BUCKET = process.env.S3_PUBLISH_BUCKET || "fs-cdn2-origin/assets/dynatrace";
const S3_PUBLISH_REGION = process.env.S3_PUBLISH_REGION || "us-east-1";
// AWS auth uses the standard credential chain. The `aws` child processes below inherit this
// process's env, so select a profile the normal AWS way — no script-specific env var needed:
//   aws sso login --profile frontier-admin
//   export AWS_PROFILE=frontier-admin     (or run inline: AWS_PROFILE=frontier-admin node ...)

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
    cdnUrls: Object.fromEntries(envs.map(env => [
      env, results[env].completeTag.match(/src="([^"]+)"/)?.[1] || ''
    ])),
    cdnIntegrity: Object.fromEntries(envs.map(env => [
      env, results[env].completeTag.match(/integrity="([^"]+)"/)?.[1] || ''
    ])),
    cdnConfig: Object.fromEntries(envs.map(env => [
      env, results[env].completeTag.match(/data-dtconfig="([^"]+)"/)?.[1] || ''
    ])),
    // Combined code+config file (the "JavaScript tag" _complete.js) used by the global-cdn treatment.
    cdnCompleteUrls: Object.fromEntries(envs.map(env => [
      env, results[env].simpleTag.match(/src="([^"]+)"/)?.[1] || ''
    ])),
  };
}

// Parse the Dynatrace agent version — the trailing number in ruxitagent_<hash>_<version>.js —
// from each environment's tag, e.g. ...ruxitagent_ICA7NQVfghqrux_10341260622154106.js → 10341260622154106.
function extractAgentVersions(results) {
  return Object.fromEntries(Object.keys(results).map(env => {
    const src = results[env].completeTag.match(/src="([^"]+)"/)?.[1] || '';
    const version = src.match(/ruxitagent_[A-Za-z0-9]+_(\d+)\.js/)?.[1] || 'unknown';
    return [env, version];
  }));
}

function updateDynatraceEjs(results) {
  const ejsPath = path.join(__dirname, '../layout/views/partials/dynatrace.ejs');
  let content = fs.readFileSync(ejsPath, 'utf8');
  const values = extractEnvValues(results);

  // Rewrite the hardcoded fallback object inside a
  //   const <name> = (locals && locals.dynatrace && locals.dynatrace.<localsKey>) || { ... }
  // block, preserving the locals-first progressive-enhancement guard.
  const replaceFallback = (name, localsKey, map) => {
    const lines = Object.entries(map).map(([env, v]) => `    ${env}: '${v}'`).join(',\n');
    const re = new RegExp(
      `const ${name} = \\(locals && locals\\.dynatrace && locals\\.dynatrace\\.${localsKey}\\) \\|\\| \\{[^}]+\\}`,
      's'
    );
    if (!re.test(content)) {
      console.warn(`   ⚠️  Could not find ${name} fallback block in dynatrace.ejs — skipped`);
      return;
    }
    const replacement = `const ${name} = (locals && locals.dynatrace && locals.dynatrace.${localsKey}) || {\n${lines}\n  }`;
    // Use a function replacement so '$' in values is not treated as a substitution token.
    content = content.replace(re, () => replacement);
  };

  replaceFallback('cdnUrlsNew', 'cdnUrls', values.cdnUrls);
  replaceFallback('cdnIntegrityNew', 'cdnIntegrity', values.cdnIntegrity);
  replaceFallback('cdnConfigNew', 'cdnConfig', values.cdnConfig);
  replaceFallback('cdnCompleteUrlsNew', 'cdnCompleteUrls', values.cdnCompleteUrls);

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
  console.log("   ✅ Wrote dynatrace-rum-config.json");
  return config;
}

function printAwsSetupInstructions() {
  const active = process.env.AWS_PROFILE || "";
  console.error(`
AWS credentials are missing or expired${active ? ` for profile "${active}"` : " (no profile set — using the default credential chain)"}.

This script publishes dynatrace-rum-config.json to s3://${S3_PUBLISH_BUCKET} and needs S3 write access.

If your org uses AWS SSO (FamilySearch does), run:
  export AWS_PROFILE=frontier-admin      # so this script's aws calls use that profile
  aws sso login                          # refresh the SSO session (opens a browser)
  # ...then re-run this script

Or pin the profile for a single run without exporting it:
  AWS_PROFILE=frontier-admin node packages/react-scripts/scripts/fetch-dynatrace-scripts.js

Verify your identity any time:
  aws sts get-caller-identity${active ? ` --profile ${active}` : " --profile frontier-admin"}

(For static keys instead of SSO: run 'aws configure', or set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.)
`);
}

// Preflight: confirm AWS credentials resolve before doing any Dynatrace work, so we fail
// fast with actionable guidance instead of after fetching everything (publish is the last step).
function checkAwsCredentials() {
  if (!process.env.AWS_PROFILE) {
    console.warn(
      "   ⚠️  AWS_PROFILE is not set — falling back to the default credential chain.\n" +
      "       In this setup the default profile has no credentials, so the S3 publish will\n" +
      "       likely fail. Set it first:  export AWS_PROFILE=frontier-admin\n" +
      "       (after: aws sso login --profile frontier-admin)"
    );
  }
  try {
    const out = execSync(`aws sts get-caller-identity --output json`, {
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
    const id = JSON.parse(out);
    const profileNote = process.env.AWS_PROFILE || "";
    console.log(`   ✅ AWS credentials OK — account ${id.Account}${profileNote ? `, profile ${profileNote}` : ""}`);
    return true;
  } catch (error) {
    printAwsSetupInstructions();
    return false;
  }
}

async function publishToS3(config) {
  const tempFile = path.join(__dirname, '.dynatrace-rum-config-temp.json');
  try {
    fs.writeFileSync(tempFile, JSON.stringify(config), 'utf8');

    // Use AWS CLI for S3 upload (inherits this process's env → honors AWS_PROFILE / default chain)
    const awsCmd = `aws s3 cp "${tempFile}" s3://${S3_PUBLISH_BUCKET}/dynatrace-rum-config.json --region ${S3_PUBLISH_REGION} --metadata "generated=$(date +%s)" --cache-control "max-age=300" --acl public-read`;

    execSync(awsCmd, { stdio: 'inherit' });

    console.log(`   ✅ Published dynatrace-rum-config.json to S3 (s3://${S3_PUBLISH_BUCKET}/dynatrace-rum-config.json)`);
  } catch (error) {
    console.error(`   ❌ Failed to publish to S3: ${error.message}`);
    printAwsSetupInstructions();
    throw error;
  } finally {
    // Always remove the temp file, even if the upload failed.
    try { fs.unlinkSync(tempFile); } catch (_) { /* already gone */ }
  }
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

  // Preflight AWS creds up front — publishing to S3 is the last step, and the Dynatrace
  // fetch is wasted work if we can't publish. Fail fast with setup guidance instead.
  console.log("Checking AWS credentials...");
  if (!checkAwsCredentials()) {
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

        // NOTE: we intentionally no longer fetch /inlineCode. The new RUM agent is loaded via
        // <script> tags (SRI tag or _complete.js), never inlined: EJS include() compiles the agent
        // JS as a template and chokes on the literal "<%" inside it. See dynatrace.ejs.
        results[env] = {
          simpleTag: simpleResponse.trim(),
          completeTag: tagResponse.trim(),
        };

        console.log(`   ✅ Simple tag fetched (${simpleResponse.length} chars)`);
        console.log(`   ✅ Complete tag fetched (${tagResponse.length} chars)`);

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

    // Update dynatrace.ejs fallback values and write CDN config JSON
    console.log("\n📝 Updating files...\n");
    updateDynatraceEjs(results);
    const cdnConfig = writeCdnConfigJson(results);

    // Publish to S3
    console.log("\n📤 Publishing to S3...\n");
    await publishToS3(cdnConfig);

    // Report the agent version that was actually downloaded (from the tag URLs).
    const agentVersions = extractAgentVersions(results);
    const uniqueVersions = [...new Set(Object.values(agentVersions))];
    console.log("\n📦 Downloaded Dynatrace RUM agent version:");
    if (uniqueVersions.length === 1) {
      console.log(`     ${uniqueVersions[0]}  (int, beta, prod)`);
    } else {
      for (const [env, v] of Object.entries(agentVersions)) {
        console.log(`     ${env.padEnd(5)} ${v}`);
      }
    }

    console.log("\n✨ Done!");
    console.log("\nNext steps:");
    console.log("1. ✅ dynatrace.ejs fallback values updated (cdnUrls/cdnIntegrity/cdnConfig/cdnCompleteUrls)");
    console.log("2. ✅ dynatrace-rum-config.json published to S3");
    console.log("3. Commit and deploy react-scripts to update the fallback values");
    console.log("4. Test all three mechanisms for new RUM:");
    console.log("     - asyncCS-script → OneAgent JS tag + SRI, async");
    console.log("     - asyncCS-inline → OneAgent JS tag + SRI, sync (no longer inlines)");
    console.log("     - global-cdn    → JavaScript tag (_complete.js), async");

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
