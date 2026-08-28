'use strict'

const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const semver = require('semver')

const osUtils = require('./osUtils')

const { GITHUB_REPOSITORY, GITHUB_RUN_NUMBER } = process.env

module.exports = {
  setupFrontier,
  alterPackageJsonFile,
  getCiPrereleaseVersion,
  isFrontierCi,
  // Deprecated alias kept for one release. This module is a public export of
  // the published @fs/react-scripts package, so renaming it outright could
  // break an external caller. Remove after 8.17.
  getTravisPrereleaseVersion: getCiPrereleaseVersion,
}

/**
 * True only when running inside this repo's own CI, where any app we scaffold is
 * a throwaway smoke test rather than a real user's new project.
 */
function isFrontierCi() {
  return GITHUB_REPOSITORY === 'fs-webdev/create-react-app'
}

/**
 * Strip off any existing prerelease info and make a prerelease version based on the CI run number
 *
 */
function getCiPrereleaseVersion(originalVersion) {
  const major = semver.major(originalVersion)
  const minor = semver.minor(originalVersion)
  const patch = semver.patch(originalVersion)

  return `${major}.${minor}.${patch}-prerelease.${GITHUB_RUN_NUMBER}`
}

function setupFrontier(appPath, appName) {
  alterPackageJsonFile(appPath, appPackage => {
    const packageJson = { ...appPackage }
    delete packageJson.scripts.eject

    if (isFrontierCi()) {
      const reactScriptPackageJson = require(path.join(__dirname, '../../package.json'))
      const ciPrereleaseVersion = getCiPrereleaseVersion(reactScriptPackageJson.version)
      console.log(
        `Running in this repo's own CI, so setting @fs/react-scripts to prerelease version "${ciPrereleaseVersion}"`
      )
      packageJson.dependencies['@fs/react-scripts'] = ciPrereleaseVersion
    }
    return packageJson
  })

  replaceStringInFile(appPath, './README.md', /\{GITHUB_REPO\}/g, appName)
  replaceStringInFile(appPath, './blueprint.yml', /\{\{APP_NAME\}\}/g, appName)
  replaceStringInFile(appPath, './package.json', /cra-template-name-will-be-replaced/g, appName)

  createLocalEnvFile()
  // TODO: JOEY ask if they want it to be a pwa or not.
  // if not, remove the 2 serviceworker files, all the workbox dependencies, and the tweak in index.js and the
  // manifest.json and the 2 logo.png files
}

function alterPackageJsonFile(appPath, extendFunction) {
  let appPackage = JSON.parse(fs.readFileSync(path.join(appPath, 'package.json'), 'UTF8'))
  appPackage = extendFunction(appPackage)
  fs.writeFileSync(path.join(appPath, 'package.json'), JSON.stringify(appPackage, null, 2) + os.EOL)
}

function replaceStringInFile(appPath, fileToInjectIntoPath, stringToReplace, stringToInject) {
  const indexPath = path.join(appPath, fileToInjectIntoPath)
  let indexCode = fs.readFileSync(indexPath, 'UTF8')

  indexCode = indexCode.replace(stringToReplace, stringToInject)
  fs.writeFileSync(indexPath, indexCode)
}

function createLocalEnvFile() {
  osUtils.runExternalCommandSync('npx', ['@fs/fr-cli', 'env', 'local'])
}
