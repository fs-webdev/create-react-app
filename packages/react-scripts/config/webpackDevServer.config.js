// @remove-on-eject-begin
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// @remove-on-eject-end
'use strict';

const fs = require('fs');
const express = require('express');
const evalSourceMapMiddleware = require('react-dev-utils/evalSourceMapMiddleware');
const noopServiceWorkerMiddleware = require('react-dev-utils/noopServiceWorkerMiddleware');
const ignoredFiles = require('react-dev-utils/ignoredFiles');
const redirectServedPath = require('react-dev-utils/redirectServedPathMiddleware');
const paths = require('./paths');
const getHttpsConfig = require('./getHttpsConfig');
const path = require('path');

const host = process.env.HOST || '0.0.0.0';
const sockHost = process.env.WDS_SOCKET_HOST;
const sockPath = process.env.WDS_SOCKET_PATH; // default: '/ws'
const sockPort = process.env.WDS_SOCKET_PORT;

const isSnow = fs.existsSync(path.join(paths.appNodeModules, 'snow', 'package.json')) || fs.existsSync(path.join(paths.appNodeModules, '@fs', 'snow', 'package.json'));

// webpack-dev-server 4 ran `onBeforeSetupMiddleware` after its host checks. Keep
// those checks first so `src/setupProxy.js` never sees a request they would reject.
const hostCheckMiddlewares = ['host-header-check', 'cross-origin-header-check'];

// http-proxy-middleware v4 (used by webpack-dev-server 6) ignores the v2-style
// `onProxyReq`, `onError` and `logLevel` keys that react-dev-utils' `prepareProxy`
// returns. Event handlers now go under `on`.
function toProxyEvents({ onProxyReq, onError, logLevel, ...options }) {
  return { ...options, on: { proxyReq: onProxyReq, error: onError } };
}

// webpack-dev-server 5 replaced the `https` option with `server`.
function getServerConfig() {
  const https = getHttpsConfig();
  if (!https) return 'http';
  return https === true ? 'https' : { type: 'https', options: https };
}

module.exports = function (proxy, allowedHost) {
  const disableFirewall =
    !proxy || process.env.DANGEROUSLY_DISABLE_HOST_CHECK === 'true';
  return {
    // WebpackDevServer 2.4.3 introduced a security fix that prevents remote
    // websites from potentially accessing local content through DNS rebinding:
    // https://github.com/webpack/webpack-dev-server/issues/887
    // https://medium.com/webpack/webpack-dev-server-middleware-security-issues-1489d950874a
    // However, it made several existing use cases such as development in cloud
    // environment or subdomains in development significantly more complicated:
    // https://github.com/facebook/create-react-app/issues/2271
    // https://github.com/facebook/create-react-app/issues/2233
    // While we're investigating better solutions, for now we will take a
    // compromise. Since our WDS configuration only serves files in the `public`
    // folder we won't consider accessing them a vulnerability. However, if you
    // use the `proxy` feature, it gets more dangerous because it can expose
    // remote code execution vulnerabilities in backends like Django and Rails.
    // So we will disable the host check normally, but enable it if you have
    // specified the `proxy` setting. Finally, we let you override it if you
    // really know what you're doing with a special environment variable.
    // Note: ["localhost", ".localhost"] will support subdomains - but we might
    // want to allow setting the allowedHosts manually for more complex setups
    allowedHosts: disableFirewall ? 'all' : [allowedHost],
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
    },
    // Enable gzip compression of generated files.
    compress: true,
    static: {
      // By default WebpackDevServer serves physical files from current directory
      // in addition to all the virtual build products that it serves from memory.
      // This is confusing because those files won’t automatically be available in
      // production build folder unless we copy them. However, copying the whole
      // project directory is dangerous because we may expose sensitive files.
      // Instead, we establish a convention that only files in `public` directory
      // get served. Our build script will copy `public` into the `build` folder.
      // In `index.html`, you can get URL of `public` folder with %PUBLIC_URL%:
      // <link rel="icon" href="%PUBLIC_URL%/favicon.ico">
      // In JavaScript code, you can access it with `process.env.PUBLIC_URL`.
      // Note that we only recommend to use `public` folder as an escape hatch
      // for files like `favicon.ico`, `manifest.json`, and libraries that are
      // for some reason broken when imported through webpack. If you just want to
      // use an image, put it in `src` and `import` it from JavaScript instead.
      directory: paths.appPublic,
      publicPath: [paths.publicUrlOrPath],
      // By default files from `contentBase` will not trigger a page reload.
      watch: {
        // Reportedly, this avoids CPU overload on some systems.
        // https://github.com/facebook/create-react-app/issues/293
        // src/node_modules is not ignored to support absolute imports
        // https://github.com/facebook/create-react-app/issues/1065
        ignored: ignoredFiles(paths.appSrc),
      },
    },
    client: {
      webSocketURL: {
        // Custom hostname, pathname and port for the hot reloading websocket.
        hostname: sockHost,
        pathname: sockPath,
        port: sockPort,
      },
      overlay: {
        errors: true,
        warnings: false,
        runtimeErrors: false,
      },
    },
    devMiddleware: {
      // It is important to tell WebpackDevServer to use the same "publicPath" path as
      // we specified in the webpack config. When homepage is '.', default to serving
      // from the root.
      // remove last slash so user can land on `/test` instead of `/test/`
      publicPath: paths.publicUrlOrPath.slice(0, -1),
      // FS - write to disk so that snow can serve assets
      // looking them up with the manifestMap provided by hf
      writeToDisk: isSnow,
    },

    server: getServerConfig(),
    host,
    historyApiFallback: {
      // Paths with dots should still use the history fallback.
      // See https://github.com/facebook/create-react-app/issues/387.
      disableDotRule: true,
      index: paths.publicUrlOrPath,
    },
    // `proxy` runs after `src/setupProxy.js` and before `redirectServedPath`
    // (it is one of the `middlewares` returned by `setupMiddlewares` below)
    proxy: proxy && proxy.map(toProxyEvents),
    setupMiddlewares(middlewares, devServer) {
      const isHostCheck = (m) => hostCheckMiddlewares.includes(m.name);
      middlewares.filter(isHostCheck).forEach((m) => devServer.app.use(m.middleware));

      // Keep `evalSourceMapMiddleware`
      // middlewares before `redirectServedPath` otherwise will not have any effect
      // This lets us fetch source contents from webpack for the error overlay
      devServer.app.use(evalSourceMapMiddleware(devServer));

      if (fs.existsSync(paths.proxySetup)) {
        // This registers user provided middleware for proxy reasons.
        // webpack-dev-server 6 runs on Express 5, whose router rejects Express 4
        // route patterns such as snow's `app.post('*')`. Give setupProxy.js its
        // own Express 4 app, mounted inside the dev server's.
        const setupProxyApp = express();
        require(paths.proxySetup)(setupProxyApp);
        devServer.app.use(setupProxyApp);
      }

      return [
        ...middlewares.filter((m) => !isHostCheck(m)),
        // Redirect to `PUBLIC_URL` or `homepage` from `package.json` if url not match
        redirectServedPath(paths.publicUrlOrPath),
        // This service worker file is effectively a 'no-op' that will reset any
        // previous service worker registered for the same host:port combination.
        // We do this in development to avoid hitting the production cache if
        // it used the same host and port.
        // https://github.com/facebook/create-react-app/issues/2272#issuecomment-302832432
        noopServiceWorkerMiddleware(paths.publicUrlOrPath),
      ];
    },
  };
};
