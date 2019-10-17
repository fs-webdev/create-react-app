require('dotenv').config()

module.exports = async ({ config }) => {
  config.module.rules = config.module.rules.filter(isNotStorybookBabelLoader)

  const localesLoader = {
    test: /locales/,
    loader: '@alienfast/i18next-loader',
    options: {
      debug: false,
      basenameAsNamespace: true,
    },
  }

  config.module.rules.push(localesLoader)

  // https://github.com/storybooks/storybook/issues/457#issuecomment-459772340
  if (config.mode === 'development' && process.env.SOURCE_MAPS !== 'false') {
    config.devtool = 'inline-source-map'
  }

  //ability to turn off HMR with an envar
  if (process.env.DISABLE_HMR === 'true') {
    config.entry = config.entry.filter(
      singleEntry => !singleEntry.includes('/webpack-hot-middleware/')
    )
  }

  return config
}

function isNotStorybookBabelLoader(rule) {
  let babelLoader
  if (rule.use && rule.use.length) {
    babelLoader = rule.use.find(({ loader }) => loader === 'babel-loader')
  }
  // the storybook babel-loader for js files has both an include and an exclude on the rule
  return !babelLoader || !(rule.include && rule.exclude)
}

function printRules(config) {
  config.module.rules.forEach(rule => {
    console.log('rule.test: ', rule.test)
    console.log('rule.include: ', rule.include)
    console.log('rule.exclude: ', rule.exclude)
    console.log('JSON.stringify(rule, null, 2): ', JSON.stringify(rule, null, 2))
    console.log('\n')
  })
}
