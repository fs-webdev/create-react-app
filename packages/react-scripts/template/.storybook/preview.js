/* eslint global-require: 0 */
import React, { Suspense } from 'react'
import { css } from '@emotion/core'
import { configure, addParameters, addDecorator } from '@storybook/react'
import '@storybook/addon-console'
import { withA11y } from '@storybook/addon-a11y'
import { withKnobs } from '@storybook/addon-knobs'
import { darkMode, lightMode } from './theme'
import { I18nProvider, i18n, addTranslations } from '@fs/zion-locale'
import { themes, Providers } from '@fs/zion-ui'
import withThemeSwitcher from '@fs/storybook-addons/dist/theme-switcher/withThemeSwitcher'
import translations from '../src/locales'

addTranslations(translations)

addDecorator(withKnobs)
addDecorator(withA11y)
addDecorator((StoryFn) => (
  <Suspense fallback={<div>Storybook Wrapper Loading...</div>}>
    <I18nProvider i18nInstance={i18n}>
      <Providers>
        <StoryFn />
      </Providers>
    </I18nProvider>
  </Suspense>
))
addDecorator(withThemeSwitcher({ themes }))

addParameters({
  options: {
    showPanel: true,
    theme: window.localStorage.getItem('themeId') === 'nightfall' ? darkMode : lightMode,
  },
})
