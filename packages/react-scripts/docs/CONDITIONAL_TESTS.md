# Conditional Test Execution

Run acceptance tests when only test directories change, otherwise run unit tests.

## Quick Start

Add a `pr:acceptance` script to your `package.json`:

```json
{
  "scripts": {
    "test": "react-scripts fr-test",
    "acceptance": "npm run acceptance --prefix ./test",
    "pr:acceptance": "react-scripts conditional-test --folder test --command acceptance"
  }
}
```

That's it! Now when CI runs `npm test`:
- ✅ If `pr:acceptance` exists → Runs conditional test
  - Only `test/` changed → Runs `npm run acceptance`
  - `src/` also changed → Skips, continues with unit tests
- ✅ If `pr:acceptance` doesn't exist → Runs unit tests normally

## How It Works

In CI mode, `fr-test` automatically checks if a `pr:acceptance` script exists in package.json:
1. **If it exists**: Runs it (which runs `conditional-test`)
2. **If it doesn't**: Skips to normal unit/component tests

The `conditional-test` command:
- Checks which files changed using Git
- If only `test/` changed (no excluded files changed) → Runs acceptance tests
- Otherwise → Skips (exits 0)
- See "Default Exclusions" section below for complete list

## Usage

The `conditional-test` command syntax:

```bash
react-scripts conditional-test --folder <dir> --command <npm-script> [--exclude <dirs>]
```

### Arguments

- **`--folder`** (required): Directory to watch for changes
- **`--command`** (required): npm script to run if only this folder changed
- **`--exclude`** (optional): Comma-separated files/directories to exclude (replaces defaults)
  - **Default exclusions**: Source code, config files, and build artifacts
  - Directories: `src`, `lib`, `components`, `views`, `public`, `scripts`, `dist`, `.storybook`
  - Files: `package-lock.json`, `index.js`, `server.js`, `heroku-prebuild`, `Procfile`, `.buildpacks`, `.nvmrc`
- **`--dry-run`**: Show what would run without executing
- **`--verbose`**: Show detailed file information

## Examples

### Basic Setup

```json
{
  "scripts": {
    "pr:acceptance": "react-scripts conditional-test --folder test --command acceptance"
  }
}
```

### Multiple Exclusions

```json
{
  "scripts": {
    "pr:acceptance": "react-scripts conditional-test --folder test --command acceptance --exclude src,lib,components"
  }
}
```

### Different Test Directory

```json
{
  "scripts": {
    "pr:acceptance": "react-scripts conditional-test --folder e2e --command cy:ci"
  }
}
```

### Disable Conditional Testing

Simply remove or rename the `pr:acceptance` script.

## CI/CD Integration

### Blueprint YAML

No changes needed! Your existing test validation works automatically:

```yaml
validations:
  - name: validate-int
    type: gha-runner
    properties:
      validate_tool:
        type: npm
      environment_variables:
        GITHUB_BASE_REF: master
```

When this validation runs `npm test`:
1. `fr-test` runs in CI mode
2. Checks for `pr:acceptance` script
3. If found, runs it; otherwise runs unit tests

### Execution Flow

```
PR Created
  ↓
Blueprint runs: npm test
  ↓
fr-test (CI mode)
  ↓
pr:acceptance exists? ──Yes──→ Run pr:acceptance
  │                              ↓
  │                         conditional-test checks files
  │                              ↓
  │                         test/ only? ──Yes──→ Run acceptance tests
  │                              │
  │                              No (src/ changed too)
  │                              ↓
  │                         Skip, exit 0
  │                              ↓
  No                        [fr-test continues with unit tests]
  ↓
Run unit/component tests
```

## Testing Locally

```bash
# Run the script directly
npm run pr:acceptance

# Dry run to see what would happen
npm run pr:acceptance -- --dry-run

# Verbose output to see file matching
npm run pr:acceptance -- --verbose
```

## Use Cases

### Problem

You have acceptance tests in a `test/` directory that take 10 minutes. When you're iterating on test development (only changing test files), you don't need to run unit tests. But your CI runs everything, wasting time.

### Solution

Add the `pr:acceptance` script:

```json
{
  "scripts": {
    "pr:acceptance": "react-scripts conditional-test --folder test --command acceptance"
  }
}
```

### Results

| Scenario | Files Changed | What Runs | Time |
|----------|---------------|-----------|------|
| Test iteration | `test/foo.test.js` | Acceptance tests | 10 min |
| Bug fix | `src/Button.js` | Unit tests | 5 min |
| Feature | `src/` + `test/` | Unit tests | 5 min |

**Savings:** ~10 minutes per test-only PR (30-40% of PRs during test development)

## Advanced Usage

### Custom Script Name

By default, `fr-test` looks for a script named `pr:acceptance`. You can't change this name currently, but you can chain commands:

```json
{
  "scripts": {
    "pr:acceptance": "npm run my-custom-logic && react-scripts conditional-test --folder test --command acceptance"
  }
}
```

### Multiple Conditional Tests

You can only have one `pr:acceptance` script, but you can run multiple conditional checks:

```json
{
  "scripts": {
    "pr:acceptance": "npm run check:test && npm run check:e2e",
    "check:test": "react-scripts conditional-test --folder test --command acceptance",
    "check:e2e": "react-scripts conditional-test --folder e2e --command cy:ci"
  }
}
```

## Troubleshooting

### Tests not running when expected

Run with `--verbose` to see file matching:

```bash
npm run pr:acceptance -- --verbose
```

### Tests running when they shouldn't

Check if an excluded file was changed. By default, changes to source code, config files, and build artifacts will skip acceptance tests.

### Customize exclusions

If the defaults don't work for your project:

```bash
"pr:acceptance": "react-scripts conditional-test --folder test --command acceptance --exclude src,lib"
```

Note: This **replaces** all defaults, so list everything you want to exclude.

### No changes detected

Make sure you've committed changes and Git is initialized.

## Default Exclusions

By default, acceptance tests are skipped if any of these change:

**Source directories:**
- `src/`, `lib/`, `components/`, `views/`

**Build/deployment files:**
- `package-lock.json`, `index.js`, `server.js`, `heroku-prebuild`, `Procfile`

**Config files:**
- `.buildpacks`, `.nvmrc`, `cypress.config.js`, `nyc.config.js`

**Build output:**
- `public/`, `scripts/`, `dist/`, `.storybook/`

These defaults are chosen because changes to these files typically require full unit test runs.

## Related

- Standalone command: `react-scripts conditional-test`
- Integrated into: `react-scripts fr-test` (CI mode only)
- Git-based change detection (works in any Git repository)
- Blueprint CI/CD compatible (no Blueprint changes needed)
