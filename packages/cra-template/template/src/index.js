import React from 'react'
import ReactDOM from 'react-dom'
import '@fs/react-scripts/polyfills'
import * as Sentry from '@sentry/browser'
import { addTranslations } from '@fs/zion-locale'
import Root from '@fs/zion-root'
import { Router } from '@fs/zion-router'
import { appPath, sentryDSN, mergeSentryConfig } from '@fs/zion-config'

<<<<<<< HEAD:packages/react-scripts/template/src/index.js
import App from './App'
import * as serviceWorker from './serviceWorker'
import translations from './locales'

// initialize Sentry for the app
if (sentryDSN) {
  // pass Sentry overrides to mergeSentryConfig
  Sentry.init(
    mergeSentryConfig({
      dsn: sentryDSN,
    })
  )
}

// For details about loading translations: https://www.familysearch.org/frontier/docs/develop/i18n
addTranslations(translations)

// This is where you pass data from the server to the client using the SERVER_DATA global.
// Here we pass the mounted app path from the server to the client.
const base = appPath ? new URL(appPath).pathname : ''

const FrontierRoot = () => (
  <React.StrictMode>
    <Router basename={base}>
      <Root fullWidth>
        <App />
      </Root>
    </Router>
  </React.StrictMode>
)

ReactDOM.render(<FrontierRoot />, document.getElementById('root'))
=======
ReactDOM.render(
  <React.StrictMode>
    <Router basename={base}>
      <Root fullWidth>
        <App />
      </Root>
    </Router>
  </React.StrictMode>,
  document.getElementById('root')
);
>>>>>>> d2f813f8897ffcd2f0b0d2da75d0c44924c92f4d:packages/cra-template/template/src/index.js

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister()
