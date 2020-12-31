'use strict';
const HtmlWebpackPlugin = require('html-webpack-plugin');
const md5 = require('md5');

class PerLangPlugin {
  apply(compiler) {
    const allLocales = {};
    const manifest = {};
    // inject a function to loaderContext so loaders can pass back info
    compiler.hooks.compilation.tap('PerLangPlugin', compilation =>
      compilation.hooks.normalModuleLoader.tap(
        'PerLangPlugin',
        loaderContext => {
          loaderContext.addLocales = ({ lang, content, namespace }) => {
            try {
              allLocales[lang] = allLocales[lang] || {};
              allLocales[lang][namespace] = allLocales[lang][namespace] || {};
              allLocales[lang][namespace] = {
                ...allLocales[lang][namespace],
                ...content,
              };
            } catch (e) {
              console.log('errorrrr');
            }
          };
        }
      )
    );
    // at the end, generate an asset using the data
    compiler.hooks.emit.tapAsync('PerLangPlugin', (compilation, callback) => {
      const langs = Object.keys(allLocales);
      langs.forEach(lang => {
        const namespaces = Object.keys(allLocales[lang]);
        namespaces.forEach(namespace => {
          const content = JSON.stringify(allLocales[lang][namespace]);
          const hash = md5(content);
          const pathnameAndFilename = `static/locales/${lang}/${namespace}`;
          const pathnameAndFilenameWithHash = `${pathnameAndFilename}-${hash}.json`;
          manifest[`${lang}-${namespace}`] = `${process.env.PUBLIC_URL ||
            '/'}${pathnameAndFilenameWithHash}`;
          compilation.assets[pathnameAndFilenameWithHash] = {
            source: () => content,
            size: () => content.length,
          };
        });
      });

      HtmlWebpackPlugin.getHooks(compilation).beforeEmit.tapAsync(
        'PerLangPlugin', // <-- Set a meaningful name here for stacktraces
        (data, cb) => {
          const script = `<script>window.localeManifest = ${JSON.stringify(
            manifest
          )}</script>`;
          // Manipulate the content
          data.html = `${script}${data.html}`;
          // Tell webpack to move on
          cb(null, data);
        }
      );
      callback();
    });
  }
}

module.exports = PerLangPlugin;
