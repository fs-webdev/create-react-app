const { createProxyMiddleware } = require('http-proxy-middleware')
const debug = require('debug')('fs:cra:proxy')

/* eslint-disable-next-line import/no-extraneous-dependencies */
require('dotenv').config()

const setProxies = (app, customProxies = []) => {
  // detect env
  const env = process.env.TARGET_ENV || 'local'

  // bring in auth middleware once required keys are set
  const cookieParser = require('cookie-parser')
  const base = require('connect-base')
  const metric = require('connect-metric')
  const auth = require('@fs/auth-middleware')
  const resolver = require('./resolver')
  const proxyList = require('./proxies')
  const getDataLocalizationRouter = require('./getDataLocalizationRouter')

  // middleware required for auth middleware
  app.use(metric())
  app.use(base())
  app.use(resolver())
  app.use(cookieParser())

  // auth middleware
  auth('/auth', app)
  console.log('\n/auth local proxy set up!')

  const langRegex = '^\/[a-z]{2,3}(-[a-zA-Z0-9-]*)?' // Copied from DTM haproxy config MATCH_root_lang_path_with_slash acl

  // set default env target
  // prod auth keys don't exist in fs-config for security reasons, so only other alt-envs for now
  const target = process.env.BASE_URL

  const setProxy = proxyConfig => {
    const langPathRegex = new RegExp(langRegex + proxyConfig.route)
    debug('langPathRegex', langPathRegex)
    const options = {
      target,
      pathFilter: (pathname) => pathname.startsWith(proxyConfig.route) || pathname.match(langPathRegex),
      changeOrigin: true,
      logger: console,
      timeout: 5000,
      router: getDataLocalizationRouter({ proxyConfig, target }),
      ...proxyConfig.options,
    }

    if (proxyConfig.accept) {
      app.use((req, res, next) => {
        // proxy only if accept type starts with the same string
        // (e.g., type 'application/' works for 'application/x-gedcomx-v1+json' and 'application/json')
        if (req.headers.accept && req.headers.accept.indexOf(proxyConfig.accept) === 0) {
          // set up proxy middleware and use immediately
          createProxyMiddleware(options)(req, res, next)
        } else {
          // wrong accept type: don't proxy request
          next();
        }
      })
    }
    else {
      app.use(createProxyMiddleware(options))
    }
  }

  // set up all custom proxies first so they can override the defaults if needed
  customProxies.forEach(config => setProxy(config))
  // set up all default proxies
  proxyList.forEach(proxyConfig => setProxy(proxyConfig))
}

module.exports = setProxies
