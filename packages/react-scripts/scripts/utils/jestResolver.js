'use strict'
const browserResolve = require('browser-resolve')

module.exports = (path, options) => {
  if (options.basedir.includes('@splitsoftware/splitio')) {
    return browserResolve.sync(path, options)
  }
  return options.defaultResolver(path, options)
}
