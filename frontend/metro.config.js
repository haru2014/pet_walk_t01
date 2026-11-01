// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude ppt and pptx from asset extensions
config.resolver.assetExts = config.resolver.assetExts.filter(
  (ext) => ext !== 'ppt' && ext !== 'pptx'
);

// Block ppt and pptx files from being bundled by Metro
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  /.*\.pptx?$/,
];

module.exports = config;
