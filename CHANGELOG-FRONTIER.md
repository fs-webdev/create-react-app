## 8.1.2
- add `window.dtinfo` with `appName` for Dynatrace integration

## 8.1.1
- disable new `runtimeErrors` property in webpack-dev-server
  - this causes constant errors with ResizeObserver
  - requires webpack-dev-server 4.13.0

## 8.1.0
- adding `dir` property to html element in layout.ejs
  - `dir` is set with `languageDir` defined in snow's res-locals.js middleware

## 8.0.2
- allow fullySpecified: false for mjs files
  - Brought about because of this issue we had with @react-spring.
  - https://github.com/pmndrs/react-spring/issues/2097
  - https://github.com/pmndrs/react-spring/issues/2097#issuecomment-1443347565
  - It looks like @react-spring may be attempting to change their usage to not necesitate the fullySpecified: false
  - we should look at removing this in the near-ish future

## 8.0.1
- Sync with v7 latest commits, restoring/updating Dynatrace RUM

## 8.0.0
- Bumping deps and releasing 8.0.0

## 7.0.9
- Update dynatrace RUM snippets to support multiple environments

## 7.0.8
- Add dynatrace RUM snippet behind feature flag

## 8.0.0-rc.3
- CRA 5 changed the default behavior so both prod and dev builds go to the `build` dir, which breaks our Snow middleware, so restoring the CRA 4 behavior that prod goes to `build` and dev goes to `dist`. We may revisit this later

## 8.0.0-rc.2
- splitChunks was messing with output filename on development environment. Changing to use [file] instead of hardcoded filename

## 8.0.0-rc.1
- Removing console.logs

## 8.0.0-alpha.6
- Tweaking/removing/adding a few deps

## 8.0.0-alpha.0
- Merged upstream master from facebook 5.0.1
- Making dependencies npm 8 compatible

## 7.0.4-alpha.0
- Bumped eslint-config-frontier-react dependency

## 7.0.4
- Don't run the IndexRevisionReplace webpack plugin if we are running storybook

## 7.0.3
- Add debounce of 250 to the coalesce-locales watch function (same as zion does it)

## 7.0.2
- Tweaked coalesce-locale watch to use process.exit() on SIGINT to actually kill the process. Otherwise Ctrl-c left zombie processes of storybook

## 7.0.1
- Fixed the jest config moduleNameMapper to resolve /coalesced-locales correctly

## 7.0.0
- Add the coalesce-locales functionality

## 6.4.0-beta.0
- Utilize a different intersection-observer polyfill

## 6.3.0
- The changes from 6.3.0-alpha.0
- Telling the mini-css-extract-plugin to remove order warnings
  - https://webpack.js.org/plugins/mini-css-extract-plugin/#remove-order-warnings

## 6.3.0-alpha.0

- Adding an envvar to read maxSize for chunks in webpack
- 16 bit hashes in names to decrease chance of collision 

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
