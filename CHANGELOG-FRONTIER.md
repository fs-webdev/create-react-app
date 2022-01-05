## 6.2.0

Added support for .gql files
Hard pin react-error-overlay to 6.0.9 to fix this issue: https://github.com/facebook/create-react-app/issues/11773

## 6.1.0

Added polyfills for IntersectionObserver and ResizeObserver

## 6.0.0-charlie.8

CodeCoverage ignore the service-worker and serviceWorkerRegistration files

## 6.0.0-charlie.7

Remove "offline.html" from the additionalManifestEntries since we figured out how to precache the
landing page in cra-template/service-worker.js

## 6.0.0-charlie.6

Updated InjectManifest to exclude _index.html in the injecting (like for precache part of service-worker)

## 6.0.0-charlie.5

Fixed the pathing to manifest.json so it doesn't just point to familysearch.org/manifest.json.
Prepend appPath to /manifest.json now.

## 6.0.0-charlie.4

Put manifest link in head in the layout.ejs file

## 6.0.0-charlie.2

Updated the proxies.js file to have "/service/" so the proxy won't intercept service-worker urls

## 6.0.0-charlie.1

Merged upstream master to get cra v4 changes.

### Divergences from upstream master
- we put resetMocks back to false in createJestConfig
- we hard code eslint failOnError to false in webpack.config.js

## 1.4.4

#### :rocket: New Feature

- eslint-config-frontier is setup and being used in the template for new react apps

## 1.4.3

#### :bug: Bug Fix

- Explicitly stating the version of webpack to use cause create-react-app expects a certain version

## 1.4.1

- Fixed the scoped name for react-scripts to @fs/react-scripts

## 1.4.0

#### :rocket: New Feature

- Incorporated Styleguidist by default into the app template

#### :bug: Bug Fix

- Fixed a bug in the frontierInit.js file dealing with package.json not having the correct dependencies after an npm install

## 1.1.0

#### :rocket: New Feature

- published to `@familysearch/react-scripts`

#### :star2: Enhancement

- Update to create-react-app@2.1.2

## 1.0.0

Forked Create React App@2.1.0

#### :rocket: New Feature

- webpack-wci18n support
- Got travis to automatically make the tar file and upload it to the github release when a new tag is made (and pushed)
- Added a way to get User Input if they want their react app to have support for Polymer or Redux
- Added new jest configuration option `transformIgnorePatterns`

#### :star2: Enhancement

- Changed the React Template to say "Frontier" instead of "React" in the App.js template

#### :memo: Documentation

- Added a README-FRONTIER.md and a CHANGELOG-FRONTIER.md
