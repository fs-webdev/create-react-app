'use strict'

const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const osUtils = require('./osUtils')

module.exports = {
  installFrontierDependencies,
}

const depsToInstall = []
const devDepsToInstall = []

function installFrontierDependencies(appPath, appName, ownPath) {
  configureEF(appPath, ownPath, appName)
  configureHF(appPath, ownPath)

  depsToInstall.push(
    ...[
      '@emotion/core@10',
      '@fs/zion-axios@2',
      '@fs/zion-config@1',
      '@fs/zion-debug@1',
      '@fs/zion-error-boundary@4',
      '@fs/zion-icon@5',
      '@fs/zion-locale@3',
      '@fs/zion-root@6',
      '@fs/zion-router@6',
      '@fs/zion-ui@9',
      '@fs/zion-user@3',
      '@sentry/browser@5',
      'i18next@19',
      'react-i18next@11',
      'prop-types@15',
      'yup@0.28',
    ]
  )
  devDepsToInstall.push(
    ...[
      '@storybook/addon-actions@5',
      '@storybook/addon-a11y@5',
      '@storybook/addon-console@1',
      '@storybook/addon-docs@5',
      '@storybook/addon-knobs@5',
      '@storybook/addon-viewport@5',
      '@storybook/addons@5',
      "@storybook/preset-create-react-app@1",
      '@storybook/react@5',
      '@storybook/theming@5',
      '@fs/eslint-config-frontier-react@4',
      '@fs/storybook-addons@3',
      '@fs/zion-testing-library@4',
      'eslint@6',
      '@alienfast/i18next-loader@1',
      'dotenv@8',
      '@testing-library/jest-dom@5',
      'http-proxy-middleware@0.20',
      'husky@4',
      'lint-staged@10',
      'suppress-exit-code@0.1',
      'source-map-explorer@2',
      'gzip-cli@1',
    ]
  )

  alterPackageJsonFile(appPath, appPackage => {
    const packageJson = { ...appPackage }
    const additionalScripts = {
      storybook: 'start-storybook --port 5009',
      'storybook:build': 'NODE_ENV=development build-storybook -c .storybook -o build',
      lint: 'eslint src/',
      'lint:fix': 'eslint src/ --fix',
    }

    packageJson.scripts = sortScripts({ ...packageJson.scripts, ...additionalScripts })
    delete packageJson.scripts.eject
    packageJson.eslintConfig = { extends: ['@fs/eslint-config-frontier-react'] }
    packageJson.husky = {
      hooks: { 'pre-commit': 'lint-staged', 'pre-push': 'npm run lint && CI=true npm test' },
    }
    packageJson['lint-staged'] = { '*.js': ['suppress-exit-code eslint --fix', 'git add'] }
    packageJson.engines = { node: '12' }
    return packageJson
  })
  installModulesSync(depsToInstall)
  installModulesSync(devDepsToInstall, true)

  // put this back in once we have it fixed and working well
  // syncLocales()

  replaceStringInFile(appPath, './README.md', /\{GITHUB_REPO\}/g, appName)

  fs.unlinkSync(path.join(appPath, 'package-lock.json'));
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

function configureEF(appPath, ownPath, appName) {
  // TODO - modify package.json to make sure name is correct for blueprint
  // TODO - use blueprint.yml as a template

  const templatePath = path.join(ownPath, 'template-ef')
  fs.copySync(templatePath, appPath, { overwrite: true })

  depsToInstall.push(...['express@4'])
  replaceStringInFile(appPath, './blueprint.yml', /\{\{APP_NAME\}\}/g, appName)
}

function configureHF(appPath, ownPath) {
  const templatePath = path.join(ownPath, 'template-hf')
  fs.copySync(templatePath, appPath, { overwrite: true })

  alterPackageJsonFile(appPath, appPackage => {
    const packageJson = { ...appPackage }
    const additionalScripts = {
      'build:gzip': 'npm run build && gzip build/static/**/*.js',
      'build:prod': 'PUBLIC_URL=https://edge.fscdn.org/assets/ react-scripts build',
      'heroku-postbuild': 'npm run build:prod',
      'heroku-prebuild': './heroku-prebuild.sh',
      start: 'react-scripts start',
      'test:ci': 'CI=true react-scripts test --coverage',
      analyzeBundle: "npm run build && source-map-explorer 'build/static/js/*.js' --gzip",
    }
    packageJson.scripts = sortScripts({
      ...packageJson.scripts,
      ...additionalScripts,
    })
    packageJson.main = './index.js'

    return packageJson
  })

  createLocalEnvFile()
  depsToInstall.push(...['github:fs-webdev/snow#cra', 'github:fs-webdev/startup'])
}

function installModulesSync(modules, saveDev = false) {
  const command = 'npm'
  const args = ['install', `--save${saveDev ? '-dev' : ''}`].concat(modules)
  osUtils.runExternalCommandSync(command, args)
}

function createLocalEnvFile() {
  osUtils.runExternalCommandSync('npx', ['@fs/fr-cli', 'env', 'local'])
}

// function syncLocales() {
//   osUtils.runExternalCommandSync('npm', ['run', 'locales:sync'])
// }

function sortScripts(scripts) {
  const sortedScripts = {}
  Object.keys(scripts)
    .sort()
    .forEach(function(key) {
      sortedScripts[key] = scripts[key]
    })
  return sortedScripts
}
