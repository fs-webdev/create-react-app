# react-scripts

This package includes scripts and configuration used by [Create React App](https://github.com/facebook/create-react-app).<br>
Please refer to its documentation:

- [Getting Started](https://facebook.github.io/create-react-app/docs/getting-started) – How to create a new app.
- [User Guide](https://facebook.github.io/create-react-app/) – How to develop apps bootstrapped with Create React App.

## FamilySearch Extensions

This fork includes additional features for FamilySearch development:

### Conditional Test Execution

Run acceptance tests only when test directories change, skipping when source code also changes. This speeds up CI/CD pipelines by running only relevant tests.

**Quick setup:**

```json
{
  "scripts": {
    "pr:acceptance": "react-scripts conditional-test --folder test --command acceptance"
  }
}
```

When `fr-test` runs in CI mode, it automatically detects the `pr:acceptance` script and runs it. The script checks which files changed and either runs acceptance tests or skips them.

**Documentation:** See [CONDITIONAL_TESTS.md](./docs/CONDITIONAL_TESTS.md) for full usage guide.

**Commands:**
- `react-scripts conditional-test` - Standalone conditional test execution
- `react-scripts fr-test` - Test runner with conditional test integration (CI mode only)

## Modernizr

The modernizr config (in `modernizr-config.json`) is based on `packages/react-scripts/polyfills.js` and usage of the items in the config across apps.
The `modernizr.js` file is generated from the config in the `prepare` script when installed and published.
