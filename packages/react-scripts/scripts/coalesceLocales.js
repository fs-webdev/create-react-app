'use strict';
const dependencyTree = require('dependency-tree');
const jsonfile = require('jsonfile');
const path = require('path');
const fs = require('fs');
const rimraf = require('rimraf');

module.exports = function coalesceLocales(appDir) {
  const builtLocalesDir = `${appDir}/src/locales/dist`;
  if (fs.existsSync(builtLocalesDir)) {
    rimraf.sync(builtLocalesDir);
  }
  fs.mkdirSync(builtLocalesDir);
  const list = dependencyTree.toList({
    filename: `${process.cwd()}/src/index.js`,
    directory: process.cwd(),
    nodeModulesConfig: {
      entry: 'module',
    },
    filter: p => p.includes('src') || p.includes('@fs'),
  });
  const realList = list.filter(p => p.includes('locales/index.js'));
  const allLocales = {};
  realList.forEach(p => {
    const dir = path.dirname(p);
    const locales = fs.readdirSync(dir).filter(d => !d.includes('.'));
    locales.forEach(locale => {
      const namespaces = fs
        .readdirSync(path.join(dir, locale))
        .map(d => d.split('.')[0]);
      allLocales[locale] = allLocales[locale] || {};
      namespaces.forEach(ns => {
        const strings = jsonfile.readFileSync(
          `${path.join(dir, locale, ns)}.json`
        );
        allLocales[locale][ns] = allLocales[locale][ns] || {};
        allLocales[locale][ns] = { ...allLocales[locale][ns], ...strings };
      });
    });
  });
  Object.keys(allLocales).forEach(locale => {
    fs.mkdirSync(path.join(builtLocalesDir, locale));
    Object.keys(allLocales[locale]).forEach(namespace => {
      jsonfile.writeFileSync(
        `${path.join(builtLocalesDir, locale, namespace)}.json`,
        allLocales[locale][namespace]
      );
    });
  });
};
