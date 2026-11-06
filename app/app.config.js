// app.json holds the real config. This only lets CI serve the web build from a sub-folder
// (GitHub Pages puts it at /<repo>/) without moving the local dev server off "/".
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL || config.experiments?.baseUrl },
});
