'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { sourceFingerprint } = require('./source-fingerprint.cjs');

const root = path.join(__dirname, '..');
const manifest = path.join(root, 'adapter', 'Cargo.toml');
const output = path.join(
  root,
  'adapter',
  'target',
  'wasm32-wasip2',
  'release',
  'color_highlight_for_zed.wasm',
);
const destination = path.join(root, 'extension.wasm');
const sourceFingerprintValue = sourceFingerprint(root);
const cargoHome = process.env.CARGO_HOME || path.join(os.homedir(), '.cargo');
const remapCargoHome = `--remap-path-prefix=${cargoHome}=/cargo`;
const encodedRustFlags = [process.env.CARGO_ENCODED_RUSTFLAGS, remapCargoHome]
  .filter(Boolean)
  .join('\x1f');

const build = spawnSync(
  'cargo',
  ['build', '--manifest-path', manifest, '--release', '--target', 'wasm32-wasip2'],
  {
    cwd: root,
    env: {
      ...process.env,
      CARGO_ENCODED_RUSTFLAGS: encodedRustFlags,
      COLOR_HIGHLIGHT_SOURCE_FINGERPRINT: sourceFingerprintValue,
    },
    stdio: 'inherit',
  },
);

if (build.error) {
  throw build.error;
}
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

fs.copyFileSync(output, destination);
process.stdout.write(
  `Updated ${path.relative(root, destination)} (${sourceFingerprintValue.slice(0, 12)})\n`,
);
