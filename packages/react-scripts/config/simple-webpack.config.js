/*
 * This file is used specifically for cypress setup/configuration.
 */
'use strict'
const path = require('path')
const webpack = require('webpack')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const babelConfig = require.resolve('@fs/babel-preset-frontier')
const { RetryChunkLoadPlugin } = require('webpack-retry-chunk-load-plugin')

const d3DagRegex = /[\\/]node_modules[\\/]d3-dag/

module.exports = {
  mode: 'development',
  devtool: false,
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      // just get the dirname here because @react-google-maps/api is importing "react/jsx-runtime", so we can't just use require.resolve
      react: path.dirname(require.resolve('react')),
      'react-dom': require.resolve('react-dom'),
      i18next: require.resolve('i18next'),
      'react-i18next': require.resolve('react-i18next'),
      'react-router': require.resolve('react-router'),
      // '@material-ui/styles': require.resolve('@material-ui/styles'),
      '/coalesced-locales': path.resolve(path.join(process.cwd(), 'dist/locales/')),
    },
    extensions: ['.ts', '.tsx', '.jsx', '.js', '.json'],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              plugins: babelConfig.plugins,
            },
          },
        ],
        include: (input) => input.match(d3DagRegex),
      },
      {
        test: /\.(mjs|tsx?|jsx?)$/,
        exclude: /(node_modules|dist)/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              plugins: [
                [
                  'istanbul',
                  {
                    exclude: ['cypress/**/*.*', 'src/locales/**/*.*', 'src/**/fixtures/*.js'],
                  },
                ],
                '@babel/plugin-proposal-optional-chaining',
                '@babel/plugin-proposal-nullish-coalescing-operator',
                'babel-plugin-macros',
                [
                  '@babel/plugin-proposal-class-properties',
                  {
                    loose: true,
                  },
                ],
                [
                  '@babel/plugin-proposal-private-methods',
                  {
                    loose: true,
                  },
                ],
                [
                  '@babel/plugin-proposal-private-property-in-object',
                  {
                    loose: true,
                  },
                ],
              ],
              presets: ['@babel/preset-react'],
              ignore: ['**/dist/*'],
              babelrc: false,
            },
          },
        ],
      },
      {
        test: /\.mdx?$/,
        loader: 'ignore-loader',
      },
      {
        test: /\.(svg|ico|jpg|jpeg|png|apng|gif|eot|otf|webp|ttf|woff|woff2|cur|ani|pdf)(\?.*)?$/,
        loader: require.resolve('file-loader'),
        options: {
          esModule: false,
          name: 'static/media/[path][name].[ext]',
        },
      },
      {
        test: /\.(mp4|webm|wav|mp3|m4a|aac|oga)(\?.*)?$/,
        loader: require.resolve('url-loader'),
        options: {
          limit: 10000,
          name: 'static/media/[path][name].[ext]',
        },
      },
      {
        test: /\.css$/,
        use: [
          'css-hot-loader',
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: { sourceMap: true },
          },
        ],
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({ filename: 'styles.css', ignoreOrder: true }),
    new webpack.ProvidePlugin({
      React: 'react',
    }),
    new RetryChunkLoadPlugin({
      // optional stringified function to get the cache busting query string appended to the script src
      // if not set will default to appending the string `?cache-bust=true`
      cacheBust: `function() { return Date.now() }`,
      // optional value to set the maximum number of retries to load the chunk. Default is 1
      maxRetries: 5,
      // optional code to be executed in the browser context if after all retries chunk is not loaded.
      // if not set - nothing will happen and error will be returned to the chunk loader.
      // lastResortScript: "window.location.href='/500.html'"
    }),
  ],
}
