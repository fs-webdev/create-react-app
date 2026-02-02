#!/usr/bin/env node
/**
 * Detects which files have changed in a PR or local working directory
 * Used for conditional test execution
 */

'use strict';

const { execSync } = require('child_process');

/**
 * Execute a shell command and return the output
 * @param {string} command - Shell command to execute
 * @returns {string} - Command output
 */
function exec(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch (error) {
    return '';
  }
}

/**
 * Get the base branch for comparison
 * Tries GITHUB_BASE_REF first (PR context), falls back to master
 * @returns {string} - Base branch name
 */
function getBaseBranch() {
  return process.env.GITHUB_BASE_REF || process.env.CI_BASE_BRANCH || 'master';
}

/**
 * Get all files that have changed compared to the base branch
 * Includes both staged/unstaged local changes and PR changes
 * @param {string} baseBranch - Base branch to compare against
 * @returns {string[]} - Array of changed file paths
 */
function getChangedFiles(baseBranch = getBaseBranch()) {
  const files = new Set();

  // Get locally changed files (staged + unstaged)
  const localChanges = exec('git diff --name-only HEAD');
  if (localChanges) {
    localChanges.split('\n').forEach(file => files.add(file.trim()));
  }

  // Get changes compared to base branch (for PR context)
  try {
    const mergeBase = exec(`git merge-base HEAD origin/${baseBranch}`);
    if (mergeBase) {
      const branchChanges = exec(`git diff --name-only HEAD ${mergeBase}`);
      if (branchChanges) {
        branchChanges.split('\n').forEach(file => files.add(file.trim()));
      }
    }
  } catch (error) {
    // Fallback if origin/baseBranch doesn't exist
    const branchChanges = exec(`git diff --name-only ${baseBranch}...HEAD`);
    if (branchChanges) {
      branchChanges.split('\n').forEach(file => files.add(file.trim()));
    }
  }

  return Array.from(files).filter(Boolean);
}

module.exports = {
  getChangedFiles,
  getBaseBranch,
};
