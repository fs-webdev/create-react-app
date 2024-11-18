// @remove-file-on-eject
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('react-dev-utils/chalk');
const paths = require('../../config/paths');
const modules = require('../../config/modules');

module.exports = (resolve, rootDir, isEjecting) => {
  // Use this instead of `paths.testsSetup` to avoid putting
  // an absolute filename into configuration after ejecting.
  const setupTestsMatches = paths.testsSetup.match(/src[/\\]setupTests\.(.+)/);
  const setupTestsFileExtension =
    (setupTestsMatches && setupTestsMatches[1]) || 'js';
  const setupTestsFile = fs.existsSync(paths.testsSetup)
    ? `<rootDir>/src/setupTests.${setupTestsFileExtension}`
    : undefined;

  const config = {
    roots: ['<rootDir>/src'],
    resolver: `${__dirname}/jestResolver.js`,

    collectCoverageFrom:[
      "src/**/*.{js,jsx,ts,tsx}",
      "!src/**/*.d.ts",
      "!src/**/*.stories.{js,jsx,ts,tsx}",
      "!src/serviceWorker.js",
      "!src/service-worker.js",
      "!src/serviceWorkerRegistration.js",
      "!src/setupProxy.js",
      "!src/index.js",
      "!src/locales/*"
    ],

    setupFiles: [
      isEjecting
        ? 'react-app-polyfill/jsdom'
        : require.resolve('react-app-polyfill/jsdom'),
    ],

    setupFilesAfterEnv: setupTestsFile ? [setupTestsFile] : [],
    testMatch: [
      '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
      '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}',
    ],
    testEnvironment: 'jsdom',
    transform: {
      "\\.(gql|graphql)$": "jest-transform-graphql",
      '^.+\\.(js|jsx|mjs|cjs|ts|tsx)$': resolve(
        'config/jest/babelTransform.js'
      ),
      '^.+\\.css$': resolve('config/jest/cssTransform.js'),
      '^(?!.*\\.(js|jsx|mjs|cjs|ts|tsx|css|json)$)': resolve(
        'config/jest/fileTransform.js'
      ),
    },
    transformIgnorePatterns: [
      'node_modules/(\\?!(lodash-es|@popper))',
      '^.+\\.module\\.(css|sass|scss)$',
    ],
    modulePaths: modules.additionalModulePaths || [],
    moduleNameMapper: {
      '^react-native$': 'react-native-web',
      '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
      '/coalesced-locales': path.resolve(path.join(__dirname, 'jest.RawLoaderStub.js')), // frontier
      ...(modules.jestAliases || {}),
    },
    moduleFileExtensions: [...paths.moduleFileExtensions, 'node'].filter(
      ext => !ext.includes('mjs')
    ),
    watchPlugins: [
      'jest-watch-typeahead/filename',
      'jest-watch-typeahead/testname',
    ],
    resetMocks: false,
  };
  if (rootDir) {
    config.rootDir = rootDir;
  }
  const overrides = Object.assign({}, require(paths.appPackageJson).jest);
  const supportedKeys = [
    'clearMocks',
    'collectCoverageFrom',
    'coveragePathIgnorePatterns',
    'coverageReporters',
    'coverageThreshold',
    'displayName',
    'extraGlobals',
    'globalSetup',
    'globalTeardown',
    'moduleNameMapper',
    'resetMocks',
    'resetModules',
    'restoreMocks',
    'roots',
    'snapshotSerializers',
    'testMatch',
    'transform',
    'transformIgnorePatterns',
    'watchPathIgnorePatterns',
  ];
  if (overrides) {
    supportedKeys.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        if (Array.isArray(config[key]) || typeof config[key] !== 'object') {
          // for arrays or primitive types, directly override the config key
          config[key] = overrides[key];
        } else {
          // for object types, extend gracefully
          config[key] = Object.assign({}, config[key], overrides[key]);
        }

        delete overrides[key];
      }
    });
    const unsupportedKeys = Object.keys(overrides);
    if (unsupportedKeys.length) {
      const isOverridingSetupFile =
        unsupportedKeys.indexOf('setupFilesAfterEnv') > -1;

      if (isOverridingSetupFile) {
        console.error(
          chalk.red(
            'We detected ' +
              chalk.bold('setupFilesAfterEnv') +
              ' in your package.json.\n\n' +
              'Remove it from Jest configuration, and put the initialization code in ' +
              chalk.bold('src/setupTests.js') +
              '.\nThis file will be loaded automatically.\n'
          )
        );
      } else {
        console.error(
          chalk.red(
            '\nOut of the box, Create React App only supports overriding ' +
              'these Jest options:\n\n' +
              supportedKeys
                .map(key => chalk.bold('  \u2022 ' + key))
                .join('\n') +
              '.\n\n' +
              'These options in your package.json Jest configuration ' +
              'are not currently supported by Create React App:\n\n' +
              unsupportedKeys
                .map(key => chalk.bold('  \u2022 ' + key))
                .join('\n') +
              '\n\nIf you wish to override other Jest options, you need to ' +
              'contact the Frontier Core team to discuss adding that override\n'
          )
        );
      }

      process.exit(1);
    }
  }
  return config;
};
