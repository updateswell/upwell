// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packages = path.join(root, 'packages');
const config = getDefaultConfig(__dirname);

// Let Metro read the SDK's files in the repo. `experiments.autolinkingModuleResolution` in
// app.json then resolves react-native, expo and other packages that the workspace also installs
// in ../node_modules to the copies that autolinking uses for this app.
config.watchFolders = [root];

// Resolve `upwell` and `@upwell/core` to their TypeScript sources so edits show up without
// rebuilding the packages.
const sources = {
  upwell: 'upwell/src/index.ts',
  'upwell/react': 'upwell/src/react/index.tsx',
  'upwell/ui': 'upwell/src/ui/index.ts',
  'upwell/expo-updates': 'upwell/src/expo-updates/index.ts',
  '@upwell/core': 'core/src/index.ts',
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const source = sources[moduleName];
  if (source) return { type: 'sourceFile', filePath: path.join(packages, source) };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
