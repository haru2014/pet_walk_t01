import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const maplibrePackageJson = require.resolve('maplibre-gl/package.json');
const maplibreDist = path.join(path.dirname(maplibrePackageJson), 'dist');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDirectory = path.join(projectRoot, 'public');

mkdirSync(publicDirectory, { recursive: true });
copyFileSync(
  path.join(maplibreDist, 'maplibre-gl-worker.mjs'),
  path.join(publicDirectory, 'maplibre-gl-worker.mjs'),
);
copyFileSync(
  path.join(maplibreDist, 'maplibre-gl.css'),
  path.join(publicDirectory, 'maplibre-gl.css'),
);
