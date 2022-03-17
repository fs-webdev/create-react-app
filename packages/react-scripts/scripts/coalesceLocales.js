'use strict';
const dependencyTree = require('dependency-tree');
const jsonfile = require('jsonfile');
const path = require('path');
const fs = require('fs');
const rimraf = require('rimraf');
const chokidar = require('chokidar');
const _ = require('lodash')

exports.coalesceLocales = paths => {
  console.time('per-locale coalesce');

  const builtLocalesDir = `${paths.appSrc}/locales/dist`;
  if (fs.existsSync(builtLocalesDir)) {
    rimraf.sync(builtLocalesDir);
  }
  fs.mkdirSync(builtLocalesDir);
  
  const index = fs.existsSync(`${paths.appSrc}/index.tsx`) ? `${paths.appSrc}/index.tsx` : `${paths.appSrc}/index.js`
  
  const list = dependencyTree.toList({
    filename: index,
    directory: paths.appPath,
    tsConfig: index.includes('.tsx') && `${paths.appPath}/tsconfig.json`,
    noTypeDefinitions: true, // optional
    detective: {
      es6: {
        mixedImports: true
      }
    },
    nodeModulesConfig: {
      entry: 'module',
    },
    filter: p => p.includes(paths.appSrc) || p.includes('@fs'),
  });
  const realList = list.filter(p => p.includes('locales/index.js'));
  const allLocales = {};
  const collisionReport = {
    collisions: [],
    potentialCollisions: [],
  }
  const statsReport = {
    namespaces: new Set(),
    locales: new Set(),
    keys: new Set(),
  }
  realList.forEach(p => {
    const dir = path.dirname(p);
    // console.log('dir', dir)
    const locales = fs.readdirSync(dir).filter(d => !d.includes('.') && d !== 'dist');
    locales.forEach(locale => {
      statsReport.locales.add(locale)
      const namespaces = fs
        .readdirSync(path.join(dir, locale))
        .map(d => d.split('.')[0]);
      allLocales[locale] = allLocales[locale] || {};
      namespaces.forEach(ns => {
        statsReport.namespaces.add(ns)
        const strings = jsonfile.readFileSync(
          `${path.join(dir, locale, ns)}.json`
        );
        allLocales[locale][ns] = allLocales[locale][ns] || {};
        // console.log('strings', Object.keys(strings))
        // console.log('allLocales', Object.keys(allLocales[locale][ns]||{}))
        Object.keys(strings).map(key => statsReport.keys.add(key))
        const collisions = _.intersection(Object.keys(allLocales[locale][ns]), Object.keys(strings))
        if (collisions && collisions.length>0) {
          collisions.forEach(collisionKey => {
            if (allLocales[locale][ns][collisionKey] !== strings[collisionKey]) {
              collisionReport.collisions.push({key:collisionKey,locale,ns,oldValue: allLocales[locale][ns][collisionKey], newValue: strings[collisionKey]})
              // console.error(`COLLISION: key=${collisionKey} locale=${locale} namespace=${ns} "${strings[collisionKey]}" overrides "${allLocales[locale][ns][collisionKey]}"`)
            } else {
              collisionReport.potentialCollisions.push({key:collisionKey,locale,ns,oldValue: allLocales[locale][ns][collisionKey], newValue: strings[collisionKey]})
            }
          })
        }
        allLocales[locale][ns] = { ...allLocales[locale][ns], ...strings };
      });
    });
  });
  if (collisionReport.potentialCollisions.length > 0) {
    console.warn(`WARNING: The following ${collisionReport.potentialCollisions.length} potential collisions were detected when coalescing locales, the values were the same, but could diverge in the future:`)
    collisionReport.potentialCollisions.forEach(({ key, locale, ns, newValue }) => console.warn(`\tkey=${key} namespace=${ns} locale=${locale} value="${newValue}"`))
  }
  if (collisionReport.collisions.length > 0) {
    console.error(`ERROR: The following ${collisionReport.collisions.length} collisions were detected when coalescing locales:`, collisionReport.collisions)
    collisionReport.collisions.forEach(({ key, locale, ns, newValue, oldValue }) => console.error(`\tkey=${key} namespace=${ns} locale=${locale} newValue="${newValue}" oldValue="${oldValue}"`))
  }
  Object.keys(allLocales).forEach(locale => {
    fs.mkdirSync(path.join(builtLocalesDir, locale));
    Object.keys(allLocales[locale]).forEach(namespace => {
      jsonfile.writeFileSync(
        `${path.join(builtLocalesDir, locale, namespace)}.json`,
        allLocales[locale][namespace]
      );
    });
  });

  console.timeEnd('per-locale coalesce');

  console.log(`Locales Stats`, {
    namespaces: statsReport.namespaces,
    locales: statsReport.locales,
    keys: statsReport.keys.size,
  })
  // console.dir(allLocales)
  // throw new Error('boom')
};

exports.watchCoalesce = paths => {
  const watcher = chokidar.watch(
    `${path.join(paths.appSrc, 'locales')}/!(dist)/*`,
    {
      ignored: 'dist',
    }
  );
  watcher.on('all', () => {
    console.log('Detected change to locales, recoalescing...');
    exports.coalesceLocales(paths);
  });
  ['SIGINT', 'SIGTERM'].forEach(function (sig) {
    process.on(sig, function () {
      watcher.close();
    });
  });

  exports.coalesceLocales(paths);
};
