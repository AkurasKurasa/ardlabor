const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The diagnosis and gap-measurement code lives in ../core and is shared with the Spectacles Lens.
config.watchFolders = [path.resolve(__dirname, "../core")];
config.resolver.extraNodeModules = { "@core": path.resolve(__dirname, "../core") };

module.exports = config;
