#!/usr/bin/env node
/**
 * Conditional Test Execution
 *
 * Runs a test command only if a specific folder has changes and excluded folders don't.
 * Useful for running E2E tests only when test directories change, skipping when src/ changes.
 *
 * Important: Exclusions are ignored for files within the target folder. This means if you
 * change test/package-lock.json, tests will run even though package-lock.json is normally
 * excluded. Only changes to excluded files OUTSIDE the target folder will skip tests.
 *
 * Conditional Test Flags:
 *   --folder <dir>              Target folder to watch for changes (required)
 *   --command <npm-script>      NPM script to run if changes detected (required)
 *   --exclude <dirs>            Comma-separated folders to exclude (optional, has defaults)
 *   --dry-run                   Show what would run without executing
 *   --verbose                   Show detailed change detection info
 *
 * Test Arguments (forwarded to the npm script):
 *   Arguments after -- are passed to the npm script being called
 *   npm run test:acceptance -- --maxWorkers=2       Forward Jest flags
 *   npm run test:acceptance -- src/features/        Run tests in specific directory
 *   npm run test:acceptance -- --testNamePattern="login"  Filter by test name
 *
 * Examples:
 *   "test:acceptance": "react-scripts conditional-test --folder test --command acceptance"
 *   "test:e2e": "react-scripts conditional-test --folder cypress --command cy:ci --exclude src,lib"
 *   "test:acceptance": "npm run test:acceptance -- --maxWorkers=2"  (forward args to npm script)
 */

'use strict';

const spawn = require('react-dev-utils/crossSpawn');
const chalk = require('chalk');
const { getChangedFiles } = require('./utils/detectChanges');

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  // Default exclusions - changes to these should not trigger acceptance tests
  // These are typically source code, config files, or build artifacts
  const defaultExclusions = [
    // Source directories
    'src',
    'lib',
    'components',
    'views',

    // Build/deployment files
    'package-lock.json',
    'index.js',
    'server.js',
    'heroku-prebuild',
    'Procfile',

    // Config files
    '.buildpacks',
    '.nvmrc',

    // Directories
    'public',
    'scripts',
    'dist',
    '.storybook'
  ];

  const parsed = {
    folder: null,
    command: null,
    exclude: defaultExclusions,
    dryRun: false,
    verbose: false,
    testArgs: [], // Arguments to forward to the test command
  };

  const recognizedFlags = ['--folder', '--command', '--exclude', '--dry-run', '--verbose'];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--folder' && i + 1 < args.length) {
      parsed.folder = args[++i];
    } else if (arg === '--command' && i + 1 < args.length) {
      parsed.command = args[++i];
    } else if (arg === '--exclude' && i + 1 < args.length) {
      // User-provided exclusions replace defaults
      parsed.exclude = args[++i].split(',').map(s => s.trim());
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--verbose') {
      parsed.verbose = true;
    } else if (arg === '--') {
      // Everything after -- is test arguments
      parsed.testArgs = args.slice(i + 1);
      break;
    } else {
      // Unrecognized arguments are collected as test arguments to forward
      parsed.testArgs.push(arg);
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
 * Check if any files match excluded patterns (directories or files)
 */
function hasExcludedFiles(files, excludePatterns) {
  return excludePatterns.some(pattern => {
    // Check if it's a specific file (has extension or no slash)
    if (pattern.includes('.') || !pattern.includes('/')) {
      // Match exact file or file in any directory
      return files.some(file =>
        file === pattern ||
        file.endsWith('/' + pattern) ||
        file.startsWith(pattern + '/')
      );
    }
    // It's a directory pattern
    const dirPattern = pattern.endsWith('/') ? pattern : pattern + '/';
    return files.some(file => file.startsWith(dirPattern));
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

  // Check if excluded folders have changes (but ignore exclusions in target folder)
  // This allows test/package-lock.json to trigger tests even though package-lock.json is excluded
  const filesOutsideTargetFolder = changedFiles.filter(file => !folderFiles.includes(file));
  const hasExclusions = hasExcludedFiles(filesOutsideTargetFolder, options.exclude);

  if (options.verbose || options.dryRun) {
    console.log(chalk.blue('=== Conditional Test Execution ==='));
    console.log(chalk.gray(`Watching folder: ${options.folder}/`));
    console.log(chalk.gray(`Excluding patterns: ${options.exclude.join(', ')}`));
    console.log(chalk.gray(`Total changed files: ${changedFiles.length}`));
    console.log(chalk.gray(`Changes in ${options.folder}/: ${folderFiles.length}`));
    console.log(chalk.gray(`Changes outside ${options.folder}/: ${filesOutsideTargetFolder.length}`));
    console.log(chalk.gray(`Excluded changes outside target folder: ${hasExclusions ? 'YES' : 'NO'}`));
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

  // Execute the command, forwarding any test arguments via --
  const npmArgs = ['run', options.command];
  if (options.testArgs.length > 0) {
    npmArgs.push('--');
    npmArgs.push(...options.testArgs);
  }

  const result = spawn.sync('npm', npmArgs, {
    stdio: 'inherit',
  });

  process.exit(result.status || 0);
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = main;
