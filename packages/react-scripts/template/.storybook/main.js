module.exports = {
  stories: ['../src/**/*.stories.js'],
  addons: [
    '@storybook/preset-create-react-app',
    '@storybook/addon-docs',

    '@storybook/addon-knobs',
    '@storybook/addon-actions',
    '@storybook/addon-a11y',
    '@storybook/addon-viewport',
    '@fs/storybook-addons/dist/grid/register',
    '@fs/storybook-addons/dist/locale-switcher/register',
    '@fs/storybook-addons/dist/sign-in/register',
    '@fs/storybook-addons/dist/env/register',
    '@fs/storybook-addons/dist/theme-switcher/register',
  ],
}
