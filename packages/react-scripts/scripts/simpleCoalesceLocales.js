/**
 * This file is used specifically for cypress setup/configuration.
 */

'use strict'
const jsonfile = require('jsonfile')
const path = require('path')
const fs = require('fs-extra')
const glob = require('fast-glob')
const debug = require('debug')('locales:coalesce')

module.exports = () => {
  console.time('per-locale coalesce')
  const cwd = process.cwd()
  const builtLocalesDir = `${cwd}/dist/locales/dist`
  fs.ensureDirSync(builtLocalesDir, { recursive: true })

  const files = glob.sync([
    `${cwd}/src/locales/index.js`,
    'node_modules/@fs/zion-*/dist/es/locales/index.js',
    'node_modules/@fs/tree-*/dist/es/locales/index.js',
  ])

  const allLocales = {}
  files.forEach((p) => {
    const dir = path.dirname(p)
    const locales = fs.readdirSync(dir).filter((d) => !d.includes('.') && !d.includes('dist'))
    debug('files foreach', p, dir, locales)
    locales.forEach((locale) => {
      const namespaces = fs.readdirSync(path.join(dir, locale)).map((d) => d.split('.')[0])
      allLocales[locale] = allLocales[locale] || {}
      namespaces.forEach((ns) => {
        const strings = jsonfile.readFileSync(`${path.join(dir, locale, ns)}.json`)
        allLocales[locale][ns] = allLocales[locale][ns] || {}
        allLocales[locale][ns] = { ...allLocales[locale][ns], ...strings }
      })
    })
  })

  Object.keys(allLocales).forEach((locale) => {
    fs.ensureDirSync(path.join(builtLocalesDir, locale))
    Object.keys(allLocales[locale]).forEach((namespace) => {
      debug('write json', `${path.join(builtLocalesDir, locale, namespace)}.json`)
      jsonfile.writeFileSync(`${path.join(builtLocalesDir, locale, namespace)}.json`, allLocales[locale][namespace])
    })
  })

  console.timeEnd('per-locale coalesce')
  debug('allLocales', allLocales)
}
