const { createProxyMiddleware } = require('http-proxy-middleware')

/* eslint-disable-next-line import/no-extraneous-dependencies */
require('dotenv').config()

const setProxies = (app, customProxies = []) => {

  // bring in auth middleware once required keys are set
  const cookieParser = require('cookie-parser')
  const base = require('connect-base')
  const metric = require('connect-metric')
  const bodyParser = require('body-parser')
  const auth = require('@fs/auth-middleware')
  const resolver = require('./resolver')
  const proxyList = require('./proxies')
  const getDataLocalizationRouter = require('./getDataLocalizationRouter')

  // middleware required for auth middleware
  // In the future consider mounting all at "/auth" to avoid any conflicts with proxy routes.
  // Also, snow mounts auth-middleware locally as well so we should probably only use auth-middleware for local storybook and not locally running the full app.
  app.use(metric())
  app.use(base())
  app.use(resolver())
  app.use(cookieParser())
  // body-parser can't handled streamed requests made through the proxy, so only mount it
  // at the /auth path to avoid interfering with the handling of requests.
  app.use('/auth', bodyParser.json())
  // In the future, consider matching snow's body-parser settings here:
  // https://github.com/fs-webdev/snow/blob/bb74a5e613772d146c68e95543af5d6ef28d98c7/index.js#L471

  // auth middleware
  auth('/auth', app)
  console.log('\n/auth local proxy set up!')

  const langRegex = '^\/[a-z]{2,3}(-[a-zA-Z0-9-]*)?' // Copied from DTM haproxy config MATCH_root_lang_path_with_slash acl

  // set default env target
  // prod auth keys don't exist in fs-config for security reasons, so only other alt-envs for now
  const target = process.env.BASE_URL

  const setProxy = proxyConfig => {
    const langPathRegex = new RegExp(langRegex + proxyConfig.route)
    const options = {
      target,
      pathFilter: (pathname) => pathname.startsWith(proxyConfig.route) || pathname.match(langPathRegex),
      changeOrigin: true,
      logLevel: 'debug',
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
