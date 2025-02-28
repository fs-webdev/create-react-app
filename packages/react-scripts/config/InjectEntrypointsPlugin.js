'use strict';
const { getCompilerHooks } = require('webpack-manifest-plugin');
const fs = require('fs');
const path = require('path');
const paths = require('./paths')

class InjectEntrypointsPlugin {
  constructor(options) {
    this.options = options;
  }

  apply(compiler) {
	const {afterEmit} = getCompilerHooks(compiler)

	afterEmit.tap('InjectEntrypointsPlugin', (manifest) => {
		const outputPath = path.join(
			compiler.options.context,
			this.options.outputFile
		);

		fs.writeFileSync(outputPath,
			JSON.stringify(
				manifest.entrypoints.map((entry) => paths.publicUrlOrPath + entry)),
				'utf8');
			})
  }
}

module.exports = InjectEntrypointsPlugin;
