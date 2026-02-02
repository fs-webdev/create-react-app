#!/usr/bin/env node
/**
 * Conditional Test Execution
 *
 * Runs a test command only if a specific folder has changes and excluded folders don't.
 * Useful for running E2E tests only when test directories change, skipping when src/ changes.
 *
 * Usage:
 *   react-scripts conditional-test --folder test --command acceptance --exclude src
 *
 * Examples:
 *   "test:acceptance": "react-scripts conditional-test --folder test --command acceptance"
 *   "test:e2e": "react-scripts conditional-test --folder cypress --command cy:ci --exclude src,lib"
 */

'use strict';

const spawn = require('react-dev-utils/crossSpawn');
const chalk = require('chalk');
const { getChangedFiles } = require('./utils/detectChanges');

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const parsed = {
    folder: null,
    command: null,
    exclude: ['src'],  // Default exclude src/
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--folder' && i + 1 < args.length) {
      parsed.folder = args[++i];
    } else if (arg === '--command' && i + 1 < args.length) {
      parsed.command = args[++i];
    } else if (arg === '--exclude' && i + 1 < args.length) {
      parsed.exclude = args[++i].split(',').map(s => s.trim());
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--verbose') {
      parsed.verbose = true;
    }
  }

  return parsed;
}

/**
 * Check if files match a directory pattern
 */
function filesInFolder(files, folder) {
  const pattern = folder.endsWith('/') ? folder : folder + '/';
  return files.filter(file => file.startsWith(pattern));
}

/**
 * Check if any files match excluded directories
 */
function hasExcludedFiles(files, excludeFolders) {
  return excludeFolders.some(folder => {
    const pattern = folder.endsWith('/') ? folder : folder + '/';
    return files.some(file => file.startsWith(pattern));
  });
}

function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Validate required arguments
  if (!options.folder || !options.command) {
    console.error(chalk.red('Error: --folder and --command are required'));
    console.log('');
    console.log('Usage:');
    console.log('  react-scripts conditional-test --folder <dir> --command <npm-script> [--exclude <dirs>]');
    console.log('');
    console.log('Example:');
    console.log('  react-scripts conditional-test --folder test --command acceptance --exclude src');
    process.exit(1);
  }

  // Get changed files
  const changedFiles = getChangedFiles();

  if (changedFiles.length === 0) {
    console.log(chalk.yellow('No changes detected - skipping acceptance tests'));
    process.exit(0);
  }

  // Check if folder has changes
  const folderFiles = filesInFolder(changedFiles, options.folder);
  const hasChanges = folderFiles.length > 0;

  // Check if excluded folders have changes
  const hasExclusions = hasExcludedFiles(changedFiles, options.exclude);

  if (options.verbose || options.dryRun) {
    console.log(chalk.blue('=== Conditional Test Execution ==='));
    console.log(chalk.gray(`Watching folder: ${options.folder}/`));
    console.log(chalk.gray(`Excluding folders: ${options.exclude.join(', ')}`));
    console.log(chalk.gray(`Total changed files: ${changedFiles.length}`));
    console.log(chalk.gray(`Changes in ${options.folder}/: ${folderFiles.length}`));
    console.log(chalk.gray(`Changes in excluded folders: ${hasExclusions ? 'YES' : 'NO'}`));
    console.log('');
  }

  // Decide whether to run the command
  const shouldRun = hasChanges && !hasExclusions;

  if (!shouldRun) {
    if (!hasChanges) {
      console.log(chalk.yellow(`No changes in ${options.folder}/ - skipping ${options.command}`));
    } else if (hasExclusions) {
      console.log(chalk.yellow(`Changes detected in excluded folders - skipping ${options.command}`));
    }
    process.exit(0);
  }

  // Run the command
  console.log(chalk.green(`✓ Only ${options.folder}/ changed (no excluded folders)`));
  console.log(chalk.yellow(`Running: npm run ${options.command}`));
  console.log('');

  if (options.dryRun) {
    console.log(chalk.blue('Dry run mode - not executing'));
    process.exit(0);
  }

  // Execute the command
  const child = spawn('npm', ['run', options.command], {
    stdio: 'inherit',
  });

  child.on('exit', code => {
    process.exit(code || 0);
  });

  child.on('error', error => {
    console.error(chalk.red('Failed to execute command:'), error);
    process.exit(1);
  });
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = main;
