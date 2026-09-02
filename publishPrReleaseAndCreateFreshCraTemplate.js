'use strict'

const fs = require('fs')
const path = require('path')

const reactScriptPath = path.join(__dirname, 'packages/react-scripts')

const { alterPackageJsonFile, getCiPrereleaseVersion } = require(path.join(
  reactScriptPath,
  'scripts/utils/frontierInit'
))
const { runExternalCommandSync } = require(path.join(reactScriptPath, 'scripts/utils/osUtils'))

let originalVersion
let newVersion

alterPackageJsonFile(reactScriptPath, packageJson => {
  originalVersion = packageJson.version
  newVersion = getCiPrereleaseVersion(packageJson.version)
  console.log(`setting @fs/react-scripts version to "${newVersion}" temporarily to get published`)
  packageJson.version = newVersion
  return packageJson
})

runExternalCommandSync('npm', ['run', 'fs-publish', '--', '--allow-earlier-version'], { cwd: reactScriptPath })

alterPackageJsonFile(reactScriptPath, packageJson => {
  packageJson.version = originalVersion
  console.log(`setting @fs/react-scripts version back to "${originalVersion}"`)
  return packageJson
})

const tmpDir = `${process.env.HOME}/tmp`

const appDir = path.join(tmpDir, 'fresh-cra-template')

runExternalCommandSync('mkdir', ['-p', tmpDir])
runExternalCommandSync(
  'npx',
  [
    'create-react-app',
    'fresh-cra-template',
    '--use-npm',
    '--scripts-version',
    `@fs/react-scripts@${newVersion}`,
    '--template',
    '@fs/cra-template',
  ],
  { cwd: tmpDir }
)

// create-react-app does not fail when the template's dependency install fails: init.js logs
// "`npm install ...` failed" and returns, so the process still exits 0. That is deliberate
// upstream behavior — exiting non-zero makes create-react-app delete the app's package.json and
// node_modules — so assert here instead. Without this, the real failure surfaces two steps later
// as `react-scripts: not found`, which reads like a react-scripts packaging bug.
const scriptsBin = path.join(appDir, 'node_modules', '.bin', 'react-scripts')

if (!fs.existsSync(scriptsBin)) {
  console.error(`\nTemplate dependency install did not complete: ${scriptsBin} is missing.`)
  console.error(
    'Check the npm output above. A tarball blocked by jfrog curation shows up as `npm error code E403`,'
  )
  console.error('and is usually a transitive dependency of the template rather than of react-scripts.')
  process.exit(1)
}

// TEMPORARY (Sept 2026): webpack 5.110.2 breaks builds with "export 'css' (imported as 'css')
// was not found in '@linaria/core'". Frontier Core's announced workaround is pinning webpack
// 5.110.1 via overrides until the fix ships in Zion packages; remove this block once it does.
// https://familysearch.slack.com/archives/C04NU7BJ8/p1788365473434469
alterPackageJsonFile(appDir, packageJson => {
  packageJson.overrides = { ...packageJson.overrides, webpack: '5.110.1' }
  console.log('TEMPORARY: pinning webpack to 5.110.1 in the scaffolded app (see comment above)')
  return packageJson
})
runExternalCommandSync('npm', ['install'], { cwd: appDir })
