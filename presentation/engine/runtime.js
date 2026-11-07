/**
 * Runtime module loader helper.
 * Ensures pptxgenjs and other peer dependencies can be resolved across environments.
 */
const path = require('path');
const fs = require('fs');

function setupRuntime() {
  try {
    require.resolve('pptxgenjs');
  } catch (err) {
    const candidatePaths = [
      'C:/Users/true9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules',
      path.join(process.cwd(), 'node_modules'),
      path.join(__dirname, '../node_modules')
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        module.paths.unshift(p);
      }
    }
  }

  try {
    return require('pptxgenjs');
  } catch (err) {
    throw new Error('PptxGenJS could not be loaded. Please ensure pptxgenjs is available in node_modules or NODE_PATH.');
  }
}

const PptxGenJS = setupRuntime();

module.exports = {
  PptxGenJS
};

