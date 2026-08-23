'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { sourceFingerprint } = require('../scripts/source-fingerprint.cjs');

const root = path.join(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function capture(contents, expression, label) {
  const value = contents.match(expression)?.[1];
  assert.ok(value, `could not find ${label}`);
  return value;
}

test('keeps extension identity and version synchronized', () => {
  const manifest = read('extension.toml');
  const cargo = read('adapter/Cargo.toml');
  const packageJson = JSON.parse(read('package.json'));
  const adapter = read('adapter/src/lib.rs');
  const server = read('server/color-highlight-server.cjs');

  const manifestId = capture(manifest, /^id = "([^"]+)"/m, 'manifest id');
  const manifestVersion = capture(manifest, /^version = "([^"]+)"/m, 'manifest version');
  const cargoVersion = capture(cargo, /^version = "([^"]+)"/m, 'Cargo version');
  const adapterId = capture(adapter, /LANGUAGE_SERVER_ID: &str = "([^"]+)"/, 'adapter id');
  const serverName = capture(server, /SERVER_NAME = '([^']+)'/, 'server name');
  const serverVersion = capture(server, /SERVER_VERSION = '([^']+)'/, 'server version');

  assert.equal(packageJson.name, manifestId);
  assert.equal(adapterId, manifestId);
  assert.equal(serverName, manifestId);
  assert.deepEqual(
    new Set([manifestVersion, cargoVersion, packageJson.version, serverVersion]),
    new Set([manifestVersion]),
  );
});

test('ships a current prebuilt adapter for Rust-free installation', () => {
  assert.equal(fs.existsSync(path.join(root, 'Cargo.toml')), false);

  const wasm = fs.readFileSync(path.join(root, 'extension.wasm'));
  const server = fs.readFileSync(path.join(root, 'server/color-highlight-server.cjs'));
  const fingerprint = sourceFingerprint(root);

  assert.deepEqual(wasm.subarray(0, 4), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  assert.ok(wasm.includes(server), 'extension.wasm does not contain the current language server');
  assert.ok(wasm.includes(Buffer.from(fingerprint)), 'extension.wasm is stale');
});

test('uses current Zed language names', () => {
  const manifest = read('extension.toml');
  assert.match(manifest, /"CSharp"/);
  assert.doesNotMatch(manifest, /"C#"/);
  assert.doesNotMatch(manifest, /"JSX"/);
  assert.match(manifest, /"JavaScript"/);
});
