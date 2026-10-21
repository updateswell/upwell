// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const root = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);

// Let Metro read the module's files in the parent folder. `experiments.autolinkingModuleResolution`
// in app.json then resolves react-native, expo and other packages that the module also installs
// in ../node_modules to the copies that autolinking uses for this app.
config.watchFolders = [root];

// Resolve `upwell` to its TypeScript sources so edits show up without rebuilding the package.
const sources = {
  upwell: 'src/index.ts',
  'upwell/react': 'src/react/index.tsx',
  'upwell/ui': 'src/ui/index.ts',
  'upwell/expo-updates': 'src/expo-updates/index.ts',
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const source = sources[moduleName];
  if (source) return { type: 'sourceFile', filePath: path.join(root, source) };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
