const Module = require('module');
const path = require('path');

const threeEsm = path.join(__dirname, '..', 'node_modules', 'three', 'build', 'three.module.js');
const original = Module.prototype.require;

// drei, fiber and maath still call require("three"). Node can load the
// ESM build directly, which is the path three asks for.
Module.prototype.require = function (id) {
  if (id === 'three') return original.call(this, threeEsm);
  return original.apply(this, arguments);
};
