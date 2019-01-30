## How to use on a new app

Make sure you are authenticated with Artifactory

```bash
npx create-react-app {app-name} --scripts-version @fs/react-scripts
```

## How to test your local copy of react-scripts

- We found that creating a new react-app through this command could utilize your local react-scripts
  - You'll just need to change the path (after the string "file:") to your react-scripts version.
  - `npx create-react-app cra-test --scripts-version file:create-react-app/packages/react-scripts`

## How to make a Release

- When the "develop" branch is ready to merge into frontierMaster for a release
  1. run `npm version (patch|minor|major)` on the develop branch
     - This will bump the version in the package.json file, and also make a git tag for the commit
  2. make a PR to the `frontierMaster` branch and be sure to squash all the commits into a single commit.
