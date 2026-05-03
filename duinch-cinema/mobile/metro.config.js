const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../shared');

const config = getDefaultConfig(projectRoot);

// 1. Watch the shared directory
config.watchFolders = [
  projectRoot,
  sharedRoot,
];

// 2. Let Metro know where to look for node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(sharedRoot, 'node_modules'),
];

// 3. Add alias for @shared
config.resolver.extraNodeModules = {
  '@shared': path.resolve(sharedRoot, 'src'),
};

module.exports = config;
