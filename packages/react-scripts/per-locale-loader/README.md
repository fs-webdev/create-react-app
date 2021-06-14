# Language-specific loading

Looking at third party plugins for i18next, there wasn't an option for per-locale bundling so we built our own.

## Dev Mode

In dev mode, we use [alienfast/i18next-loader](https://www.npmjs.com/package/@alienfast/i18next-loader) which coalesces all locales and namespaces into a single file. (This is what we were using in prod before we wrote our own.)

## Prod Mode

When you run `npm run build`, we coalesce all translation strings per locale and namespace. So if your app supports 30 locales and there's a `translation` namespace and a `common-ui` namespace, you'll have a directory for each locale with a `translation.json` and `common-ui.json` file in each.

1. Coalesce locales before webpack compiles
2. use `per-locale-loader` inside `react-scripts` which creates a dynamic import for each namespace based on the current locale

Note: This breaking change also requires a change in `zion-locale` which binds i18nextStore's `added` event to rerender all components using the `t` function.
