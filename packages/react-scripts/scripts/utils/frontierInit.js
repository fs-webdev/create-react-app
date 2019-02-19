'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const fsCli = require('fs-cli-goodies');
const osUtils = require('./osUtils');

module.exports = {
  installFrontierDependencies,
  packageJsonWritten,
  cleanupFrontierCode,
};

function packageJsonWritten() {}

function installFrontierDependencies(appPath, answers, useYarn, ownPath) {
  const { additionalFeatures } = answers;

  if (additionalFeatures.includes('polymer')) {
    configurePolymer(appPath, useYarn);
  }
  if (additionalFeatures.includes('electric-flow')) {
    configureEF(appPath, useYarn, ownPath);
  }
  injectPolymerCode(appPath);

  const defaultModules = [
    'http-proxy-middleware@0.19.0',
    'react-router-dom@4.3.1',
    'fs-webdev/exo',
  ];

  const defaultDevModules = [
    'eslint@5.6.0',
    'fs-webdev/eslint-config-frontier#settingUpRecommendedReactConfig',
    'react-styleguidist@9.0.0-beta4',
    'webpack@4.19.1',
  ];

  installModulesSync(defaultModules, useYarn);
  installModulesSync(defaultDevModules, useYarn, true);

  alterPackageJsonFile(appPath, appPackage => {
    const packageJson = { ...appPackage };
    const additionalScripts = {
      styleguide: 'styleguidist server --open',
      'styleguide:build': 'styleguidist build',
      lint: 'eslint src/',
      'lint:fix': 'eslint src/ --fix',
    };
    packageJson.scripts = { ...packageJson.scripts, ...additionalScripts };
    packageJson.eslintConfig = {
      extends: ['frontier/recommended'],
    };
    return packageJson;
  });
}
function alterPackageJsonFile(appPath, extendFunction) {
  let appPackage = JSON.parse(fs.readFileSync(path.join(appPath, 'package.json'), 'UTF8'));
  appPackage = extendFunction(appPackage);
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

function configurePolymer(appPath, useYarn) {
  alterPackageJsonFile(appPath, appPackage => {
    const packageJson = { ...appPackage };
    packageJson.vendorCopy = [
      {
        from: 'node_modules/@webcomponents/webcomponentsjs/custom-elements-es5-adapter.js',
        to: 'public/vendor/custom-elements-es5-adapter.js',
      },
      {
        from: 'node_modules/@webcomponents/webcomponentsjs/webcomponents-bundle.js',
        to: 'public/vendor/webcomponents-bundle.js',
      },
    ];
    packageJson.scripts.postinstall = 'vendor-copy';
    return packageJson;
  });

  const polymerModules = ['vendor-copy@2.0.0', '@webcomponents/webcomponentsjs@2.1.3'];
  installModulesSync(polymerModules, useYarn, true);
}

function injectPolymerCode(appPath) {
  const indexPath = path.join(appPath, 'public/index.html');
  let indexHtml = fs.readFileSync(indexPath, 'UTF8');

  const polymerCode = `
    <script src="%PUBLIC_URL%/vendor/webcomponents-bundle.js"></script>
    <script src="%PUBLIC_URL%/vendor/custom-elements-es5-adapter.js"></script>
 `;

  indexHtml = indexHtml.replace('<!--FRONTIER WEBCOMPONENT LOADER CODE FRONTIER -->', polymerCode);
  fs.writeFileSync(indexPath, indexHtml);
}

function configureEF(appPath, useYarn, ownPath) {
  // TODO - modify package.json to make sure name is correct for blueprint
  // TODO - use blueprint.yml as a template

  const templatePath = path.join(ownPath, 'template-ef');
  fs.copySync(templatePath, appPath, { overwrite: true });
}

function cleanupFrontierCode(appPath) {}

function installModulesSync(modules, useYarn, saveDev = false) {
  const { command, args } = buildInstallCommandAndArgs(useYarn, saveDev);
  osUtils.runExternalCommandSync(command, args.concat(modules));
}

function buildInstallCommandAndArgs(useYarn, saveDev = false) {
  let command;
  let args;
  if (useYarn) {
    command = 'yarnpkg';
    args = ['add'];
    if (saveDev) {
      args.push('--dev');
    }
  } else {
    command = 'npm';
    args = ['install', '--save'];
    if (saveDev) {
      args[1] = '--save-dev';
    }
  }
  return { command, args };
}
