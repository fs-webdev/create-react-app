// This is a magic file. This is not required or imported from anywhere else.
// CRA runs this file when running npm start.
// This file is only run in development mode.

// sets local proxies using http-proxy-middleware configs
// docs here: https://www.familysearch.org/frontier/docs/app-development/proxies
const setProxies = require('@fs/react-scripts/proxy/setupProxy')
const waitForWebpack = require('@fs/snow/lib/utils/waitForWebpack.js')
const setupServer = require('../server')

// put any custom proxies here, see https://www.familysearch.org/frontier/docs/app-development/proxies
const customProxies = []

module.exports = (app) => {
  // Sets up local proxies for XHR calls.
  //      e.g. /service/tree/tf => https://beta.familysearch.org/service/tree/tf
  //      beta above comes from your .env file
  setProxies(app, customProxies)
  // Wait for Webpack to finish writing to the /dist folder
  // before starting up the app
  waitForWebpack(app, false)
  // Start up the Snow app
  setupServer(app, 'dist')
}

module.exports.customProxies = customProxies
