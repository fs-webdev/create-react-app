'use strict';
const debug = require('debug')('coalesceLocales');
const dependencyTree = require('dependency-tree');
const jsonfile = require('jsonfile');
const path = require('path');
const fs = require('fs');
const rimraf = require('rimraf');
const chokidar = require('chokidar');
const _ = require('lodash');
const glob = require('fast-glob')

exports.coalesceLocales = paths => {
  console.time('per-locale coalesce');

  const builtLocalesDir = `${paths.appSrc}/locales/dist`;
  if (fs.existsSync(builtLocalesDir)) {
    rimraf.sync(builtLocalesDir);
  }
  fs.mkdirSync(builtLocalesDir);

  const index = fs.existsSync(`${paths.appSrc}/index.tsx`)
    ? `${paths.appSrc}/index.tsx`
    : `${paths.appSrc}/index.js`;

  const nonExistents = []
  const list = dependencyTree.toList({
    filename: index,
    directory: paths.appPath,
    tsConfig: fs.existsSync(paths.appTsConfig) && paths.appTsConfig,
    noTypeDefinitions: true, // optional
    detective: { es6: { mixedImports: true }},
    nodeModulesConfig: { entry: 'module' },
    nonExistent: nonExistents,
    filter: filePath => filePath.includes(paths.appSrc) || filePath.includes('@fs'),
  }).sort();

  /*
    REMINDER: when comparing paths, make sure to take into account Windows/WSL2 paths that will look like: 'C:\\Users\\MyUser\\my-project\\node_modules\\@fs\\flags-js\\src\\index.js'
    Constructing paths with forward slashes works, but not comparing the file path string, which needs to use `path.join()` or `path.sep`
  */

  // the nonExistents array is populated with any file that dependencyTree was unable to locate on the filesystem.
  // Currently we have an issue if npm didn't flatten a dependency to node_modules/@fs/ then dependencyTree says that
  // dependency is nonExistent. Specifically chinese-discovery-surname got into an issue once where zion-header wasn't
  // flattened, and so they didn't get zion-header translations coalesced. We are adding this globbing logic to go 
  // find the least nested path to the "nonExistent" module.
  const hiddenNestedZionDeps = nonExistents.filter(filePath => filePath.startsWith(path.join('@fs','zion-')))
  const hiddenNestedLocaleFiles = hiddenNestedZionDeps.map(filePath => {
    const hiddenLocaleFiles = glob.sync([`node_modules/@fs/**/${filePath}/**/locales/index.js`], { absolute: true })
      .filter(filePath => !filePath.includes(`${path.sep}cjs${path.sep}`))
    return _.sortBy(hiddenLocaleFiles, filePath => filePath.split(path.sep).length)[0]
  })

  // adding this filter logic up in dependencyTree doesn't work as expected
  const realList = [...list.filter(filePath => filePath.includes(path.join('locales','index.js'))), ...hiddenNestedLocaleFiles]

  const allLocales = {};
  const collisionReport = {
    collisions: [],
    potentialCollisions: [],
  };
  const statsReport = {
    namespaces: new Set(),
    locales: new Set(),
    keys: new Set(),
  };
  realList.forEach(p => {
    if (!p) {return}
    
    const dir = path.dirname(p);
    // console.log('dir', dir)
    const locales = fs
      .readdirSync(dir)
      .filter(d => !d.includes('.') && d !== 'dist');
    locales.forEach(locale => {
      statsReport.locales.add(locale);
      const namespaces = fs
        .readdirSync(path.join(dir, locale))
        .map(d => d.split('.')[0]);
      allLocales[locale] = allLocales[locale] || {};
      namespaces.forEach(ns => {
        statsReport.namespaces.add(ns);
        const strings = jsonfile.readFileSync(
          `${path.join(dir, locale, ns)}.json`
        );
        allLocales[locale][ns] = allLocales[locale][ns] || {};
        // console.log('strings', Object.keys(strings))
        // console.log('allLocales', Object.keys(allLocales[locale][ns]||{}))
        Object.keys(strings).map(key => statsReport.keys.add(key));
        const collisions = _.intersection(
          Object.keys(allLocales[locale][ns]),
          Object.keys(strings)
        );
        if (collisions && collisions.length > 0) {
          collisions.forEach(collisionKey => {
            if (
              allLocales[locale][ns][collisionKey] !== strings[collisionKey]
            ) {
              collisionReport.collisions.push({
                key: collisionKey,
                locale,
                ns,
                oldValue: allLocales[locale][ns][collisionKey],
                newValue: strings[collisionKey],
              });
              // console.error(`COLLISION: key=${collisionKey} locale=${locale} namespace=${ns} "${strings[collisionKey]}" overrides "${allLocales[locale][ns][collisionKey]}"`)
            } else {
              collisionReport.potentialCollisions.push({
                key: collisionKey,
                locale,
                ns,
                oldValue: allLocales[locale][ns][collisionKey],
                newValue: strings[collisionKey],
              });
            }
          });
        }
        allLocales[locale][ns] = { ...allLocales[locale][ns], ...strings };
      });
    });
  });
  if (collisionReport.potentialCollisions.length > 0) {
    console.warn(`WARNING: There were ${collisionReport.potentialCollisions.length} potential collisions detected when coalescing locales, the values were the same, but could diverge in the future:
      To see a list of all potential collisions, turn on debugging with "DEBUG=coalesceLocales" before the command you just ran `);
    collisionReport.potentialCollisions.forEach(
      ({ key, locale, ns, newValue }) =>
        debug(
          `\tkey=${key} namespace=${ns} locale=${locale} value="${newValue}"`
        )
    );
  }
  if (collisionReport.collisions.length > 0) {
    console.error(
      `ERROR: There were ${collisionReport.collisions.length} collisions were detected when coalescing locales.`
    );
    collisionReport.collisions.forEach(
      ({ key, locale, ns, newValue, oldValue }) =>
        console.error(
          `\tkey=${key} namespace=${ns} locale=${locale} newValue="${newValue}" oldValue="${oldValue}"`
        )
    );
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
  });
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

  watcher.on(
    'all',
    _.debounce(() => {
      console.log('Detected change to locales, recoalescing...');
      exports.coalesceLocales(paths);
    }, 250)
  );

  ['SIGINT', 'SIGTERM'].forEach(function (sig) {
    process.on(sig, function () {
      watcher.close();
      process.exit();
    });
  });

  exports.coalesceLocales(paths);
};
