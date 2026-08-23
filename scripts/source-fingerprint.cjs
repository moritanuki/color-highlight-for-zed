'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE_FILES = [
  'adapter/Cargo.lock',
  'adapter/Cargo.toml',
  'adapter/src/lib.rs',
  'rust-toolchain.toml',
  'server/color-highlight-server.cjs',
];

function sourceFingerprint(root) {
  const hash = crypto.createHash('sha256');
  for (const file of SOURCE_FILES) {
    hash.update(file);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(root, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

module.exports = { SOURCE_FILES, sourceFingerprint };
