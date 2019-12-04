const config = {
  devKey: process.env.FEATURE_DEVKEY_SHARED,
  dir: __dirname,
  experiments: [
    // REPLACE THIS EXPERIMENT WHEN ADDING THE FIRST ONE. IT BREAKS IF NONE EXIST
    {
      name: 'fallbackExperiment',
      default: true,
      description: `If you see this, then the call to get shared experiments failed somewhere. Please see the docs
      here for some potential fixes. https://www.familysearch.org/frontier/docs/misc/issues`,
    },
  ],
}

module.exports = config
