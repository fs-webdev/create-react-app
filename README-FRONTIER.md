## How to use on a new app

The plan is to incorporate this fork of create-react-app and how to use it within the frontier-cli.  
That being said, if you want to use our fork "manually", then here is how you do it.

1. Make sure you are authenticated with Artifactory

   See https://beta.familysearch.org/frontier/docs/getting-started/setup#setting-up-artifactory

2. Run the following command

   `npx create-react-app --use-npm --template @fs/cra-template --scripts-version @fs/react-scripts ${your-app-name}`

## How to test your local copy of react-scripts

If you have cloned this repo and made changes locally and want to test them before committing and publishing here is how.

1. Clone this repo and make any changes needed in `./packages/react-scripts/`
2. In the `react-scripts` directory run `npm install`.
3. Change directories to where you want a brand new app to be created in (don't run step 4 in an existing repo)
4. Run the following command  
   `npx create-react-app --use-npm --template @fs/cra-template --scripts-version file:${relativePathToYourClonedCreateReactAppRepo}/packages/react-scripts ${your-app-name} `

## Linking react-scripts to another app 

Before running `npm link`, run `npm publish --dry-run` to ensure modernizr.js is added in `./packages/react-scripts/layout`

## Test Commands - CLI Arguments

The `react-scripts fr-test` and `react-scripts conditional-test` commands support passing arguments to Jest and Cypress.

### fr-test - Flexible Jest/Cypress Test Runner

Basic setup in package.json:
```json
{
  "test": "react-scripts fr-test"
}
```

CLI usage examples:
```bash
# Control Jest parallelization
npm run test -- --maxWorkers=2

# Run tests in a specific directory
npm run test -- src/features/

# Run a single test file
npm run test -- Auth.test.js

# Filter tests by name pattern
npm run test -- --testNamePattern="login"

# Combine multiple arguments
npm run test -- src/features/ --maxWorkers=1 --testNamePattern="auth"

# Watch mode (dev only, not in CI)
npm run test -- --watch

# Run in CI mode (coverage, no watch)
CI=true npm run test
```

### conditional-test - Run Tests Only on Relevant Changes

Example setup:
```json
{
  "test:acceptance": "react-scripts conditional-test --folder test --command acceptance"
}
```

CLI usage with arguments:
```bash
# Run acceptance tests only if test/ folder changed
npm run test:acceptance

# With Jest arguments
npm run test:acceptance -- --maxWorkers=2

# Filter by test name
npm run test:acceptance -- --testNamePattern="api"

# Dry run to see what would execute
npm run test:acceptance -- --dry-run

# Verbose mode to see change detection details
npm run test:acceptance -- --verbose
```

## Development and Cutting a Release

- All development will be done from the frontierMaster branch
  - Branch off of frontierMaster for any feature/bug fixes
  - PRs will be made into the frontierMaster branch

## Merging Upstream changes from Facebook

When we are ready to pull in changes from Facebook, here are the steps

1. Make a PR from facebook's master (main) into our fork's master. This url SHOULD be what you want... please verify before blindly doing anything
   - https://github.com/fs-webdev/create-react-app/compare/master...facebook:main
   - DO NOT SQUASH THE COMMITS when merging the PR. We need to be able to checkout a specific commit later in our steps
2. Locally, check out the master branch and do a `git pull`
3. Find facebook's latest release https://github.com/facebook/create-react-app/releases
4. Find the commit hash corresponding to the release that you want incorporated into our fork.
5. Checkout our develop branch
6. Run `git merge ${HASH_OF_RELEASE_YOU_WANT}`
7. Fix any merge conflicts
8. Bump the 'upstreamVersion' in packages/react-scripts/package.json to match the release of facebook's react-scripts that you merged to
9. Cut a release (follow steps up above)