const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The diagnosis and gap-measurement code lives in ../core and is shared with the Spectacles Lens.
config.watchFolders = [path.resolve(__dirname, "../core")];
config.resolver.extraNodeModules = { "@core": path.resolve(__dirname, "../core") };

// Expo Router bundles every route file on every platform, so index.tsx still pulls in Viro on web even though
// index.web.tsx is what renders there. Viro's web build needs a renderer we don't ship, so stub it out on web only.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName.startsWith("@reactvision/react-viro")) return { type: "empty" };
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
