import Module from 'node:module';

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(id)) {
    return 'mock-image.png';
  }
  return originalRequire.apply(this, arguments);
};
