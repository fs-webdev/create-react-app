'use strict';
// This file is mostly copied from https://github.com/alienfast/i18next-loader/blob/develop/index.js
// and adjusted to our needs for per-lang Bundling

const path = require('path');
const fs = require('fs');
const globAll = require('glob-all');
const loaderUtils = require('loader-utils');

function enumerateLangs(dir) {
  return fs.readdirSync(dir).filter(function (file) {
    return fs.statSync(path.join(dir, file)).isDirectory();
  });
}

//https://github.com/jpillora/node-glob-all#usage
function findAll(globs, cwd) {
  const globArray = Array.isArray(globs) ? globs : [globs];
  return globAll.sync(globArray, { cwd, realpath: true });
}

const i18nextImport = `
import i18n from 'i18next'
import { addTranslations } from "@fs/zion-locale";

const handleError = (locale, namespace) => {
  console.error(\`failed to load translation - \${locale}" + "\${namespace}"\`)
}
const importLocale = (locale, namespace) => {
  import(/* webpackChunkName: "locales-[request]-[index]" */ \`../locales/dist/\${locale}/\${namespace}\`)
    .then(({ default: localeStrings }) => addTranslations({[locale]: {[namespace]: localeStrings}}))
    .catch(() => handleError(locale, namespace))
}

`;

// the mainExport is just for backwards compatability.
// Files call import translations from './locales'. Without
// a default export, that breaks.
const mainExport = 'export default {}';

const createDynamicImport = ns =>
  `
if(i18n.language){
  importLocale(i18n.language, '${ns}');
} else {
  i18n.on('languageChanged', locale => {
    importLocale(locale, '${ns}')
  });
}

// Always load english translations for backup.
importLocale('en', '${ns}');

`;
let first = false
module.exports = function () {
  this.cacheable && this.cacheable();

  const options = loaderUtils.getOptions(this) || {};

  if (!options.include) {
    options.include = ['**/*.json', '**/*.yml', '**/*.yaml'];
  }

  if (!options.overrides) {
    options.overrides = [];
  }
  const appLocalesDir = path.dirname(this.resource); // this is the absolute path to the index.js in the top level locales dir
  if (!fs.existsSync(appLocalesDir)) {
    throw new Error(
      'Directory does not exist: ' +
      appLocalesDir +
      ' for resource: ' +
      this.resource
    );
  }

  if (options.debug) {
    console.info(
      'Bundling locales from ' +
      appLocalesDir +
      ' (ordered least specific to most):'
    );
  }
  const namespaces = [];
  // needs to be ordered in least specialized to most e.g. lib locale -> app locale
  const moduleLocalesDirs = options.overrides.map(override => {
    if (path.isAbsolute(override)) {
      return override;
    } else {
      return path.join(appLocalesDir, override);
    }
  });
  moduleLocalesDirs.push(appLocalesDir);
  moduleLocalesDirs.forEach(localesDir => {
    // all subdirectories match language codes
    const langs = enumerateLangs(localesDir);
    for (let i = 0; i < langs.length; i++) {
      const lang = langs[i];
      const resBundle = {};
      resBundle[lang] = {};

      const fullLangPath = path.join(localesDir, lang);
      this.addContextDependency(fullLangPath);

      const langFiles = findAll(options.include, fullLangPath);
      for (let j = 0; j < langFiles.length; j++) {
        const fullPath = langFiles[j];
        this.addDependency(fullPath);
        if (options.debug) {
          console.info('\t' + fullPath);
        }

        const extname = path.extname(fullPath);

        if (options.basenameAsNamespace || options.relativePathAsNamespace) {
          let namespaceFilepath;
          if (options.relativePathAsNamespace) {
            namespaceFilepath = path.relative(
              path.join(localesDir, lang),
              fullPath
            );
          } else if (options.basenameAsNamespace) {
            namespaceFilepath = path.basename(fullPath);
          }
          namespaces.push(
            namespaceFilepath.replace(extname, '').split(path.sep)[0]
          );
        }
      }
    }
  });
  if (first) {
    return `export default {}`
  }
  first = true
  const returnSource = [...new Set(namespaces)].map(ns =>
    createDynamicImport(ns)
  );
  const dynamicImports = i18nextImport + returnSource.join('') + mainExport;
  if (options.debug) {
    console.info('\t' + dynamicImports);
  }
  return dynamicImports;
};
