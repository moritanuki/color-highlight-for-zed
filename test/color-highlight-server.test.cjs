'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');

const {
  colorPresentations,
  documentColors,
  encodeMessage,
  extractColorLiterals,
  parseHex,
  parseHsl,
  parseHwb,
  parseRgb,
} = require('../server/color-highlight-server.cjs');

function approximately(actual, expected, epsilon = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

test('parses short, long, and alpha hex colors', () => {
  assert.deepEqual(parseHex('#f80'), { red: 1, green: 136 / 255, blue: 0, alpha: 1 });
  assert.deepEqual(parseHex('#112233'), { red: 17 / 255, green: 34 / 255, blue: 51 / 255, alpha: 1 });

  const transparent = parseHex('#33669980');
  assert.ok(transparent);
  approximately(transparent.alpha, 128 / 255);
});

test('parses legacy and modern rgb syntax', () => {
  assert.deepEqual(parseRgb('rgb(255, 0, 127)'), {
    red: 1,
    green: 0,
    blue: 127 / 255,
    alpha: 1,
  });

  assert.deepEqual(parseRgb('rgb(100% 0% 50% / 25%)'), {
    red: 1,
    green: 0,
    blue: 0.5,
    alpha: 0.25,
  });

  assert.deepEqual(parseRgb('rgba(300, -10, 0, 2)'), {
    red: 1,
    green: 0,
    blue: 0,
    alpha: 1,
  });
});

test('parses hsl hue units and hwb colors', () => {
  const cyan = parseHsl('hsl(0.5turn 100% 50% / 40%)');
  assert.ok(cyan);
  approximately(cyan.red, 0);
  approximately(cyan.green, 1);
  approximately(cyan.blue, 1);
  approximately(cyan.alpha, 0.4);

  const red = parseHwb('hwb(0 0% 0%)');
  assert.ok(red);
  approximately(red.red, 1);
  approximately(red.green, 0);
  approximately(red.blue, 0);
});

test('rejects malformed colors and identifier fragments', () => {
  const text = '#12 #12345 #123456789 foo#fff ##fff #ggg rgb(1 2) rgb(1. 2. 3.) hsl(0 1 2)';
  assert.deepEqual(extractColorLiterals(text), []);
});

test('returns sorted color literals without overlapping matches', () => {
  const colors = extractColorLiterals('a: hsl(120 100% 25%); b: #ABC; c: rgb(0 0 255 / .5);');
  assert.deepEqual(colors.map(({ literal }) => literal), [
    'hsl(120 100% 25%)',
    '#ABC',
    'rgb(0 0 255 / .5)',
  ]);
});

test('uses UTF-16 LSP ranges after emoji and handles CRLF', () => {
  const text = '😀 theme: #1a2B3c80\r\naccent: rgb(255 0 0)';
  const colors = documentColors(text);

  assert.equal(colors.length, 2);
  assert.deepEqual(colors[0].range, {
    start: { line: 0, character: 10 },
    end: { line: 0, character: 19 },
  });
  assert.deepEqual(colors[1].range, {
    start: { line: 1, character: 8 },
    end: { line: 1, character: 20 },
  });
});

test('detects CSS color functions split across lines', () => {
  const text = [
    'a: rgb(',
    ' 255 0 0',
    '); b: hsl(',
    ' 120 100% 50%',
    '); c: hwb(',
    ' 240 0% 0%',
    ');',
  ].join('\n');
  const colors = documentColors(text);

  assert.equal(colors.length, 3);
  assert.deepEqual(colors.map(({ range }) => range), [
    { start: { line: 0, character: 3 }, end: { line: 2, character: 1 } },
    { start: { line: 2, character: 6 }, end: { line: 4, character: 1 } },
    { start: { line: 4, character: 6 }, end: { line: 6, character: 1 } },
  ]);
});

test('offers a presentation matching the original color family first', () => {
  const text = 'accent = "#FF000080"';
  const range = {
    start: { line: 0, character: 10 },
    end: { line: 0, character: 19 },
  };
  const presentations = colorPresentations(text, {
    range,
    color: { red: 0, green: 1, blue: 0, alpha: 0.5 },
  });

  assert.equal(presentations[0].label, '#00FF0080');
  assert.deepEqual(presentations[0].textEdit, { range, newText: '#00FF0080' });
});

test('serves initialize, documentColor, changes, and shutdown over LSP', async (context) => {
  const serverPath = path.join(__dirname, '..', 'server', 'color-highlight-server.cjs');
  const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  context.after(() => child.kill());
  const exited = new Promise((resolve) => child.once('exit', resolve));

  let stdout = Buffer.alloc(0);
  let stderr = '';
  const pending = new Map();

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });

  child.stdout.on('data', (chunk) => {
    stdout = Buffer.concat([stdout, chunk]);
    while (true) {
      const headerEnd = stdout.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = stdout.subarray(0, headerEnd).toString('ascii');
      const length = Number(header.match(/Content-Length:\s*(\d+)/i)?.[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (!Number.isFinite(length) || stdout.length < bodyEnd) return;
      const message = JSON.parse(stdout.subarray(bodyStart, bodyEnd).toString('utf8'));
      stdout = stdout.subarray(bodyEnd);
      const resolver = pending.get(message.id);
      if (resolver) {
        pending.delete(message.id);
        resolver.resolve(message);
      }
    }
  });

  function notify(method, params = {}) {
    child.stdin.write(encodeMessage({ jsonrpc: '2.0', method, params }));
  }

  function request(id, method, params = {}) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timed out waiting for ${method}; stderr: ${stderr}`));
      }, 2_000);
      pending.set(id, {
        resolve(message) {
          clearTimeout(timeout);
          resolve(message);
        },
      });
      child.stdin.write(encodeMessage({ jsonrpc: '2.0', id, method, params }));
    });
  }

  const initialized = await request(1, 'initialize');
  assert.equal(initialized.result.capabilities.colorProvider, true);
  assert.equal(initialized.result.capabilities.positionEncoding, 'utf-16');

  const uri = 'file:///workspace/theme.json';
  notify('initialized');
  notify('textDocument/didOpen', {
    textDocument: { uri, languageId: 'json', version: 1, text: '{"accent":"#123456"}' },
  });

  const firstColors = await request(2, 'textDocument/documentColor', {
    textDocument: { uri },
  });
  assert.equal(firstColors.result.length, 1);
  assert.deepEqual(firstColors.result[0].range, {
    start: { line: 0, character: 11 },
    end: { line: 0, character: 18 },
  });

  notify('textDocument/didChange', {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text: '{"accent":"hsl(240 100% 50%)"}' }],
  });
  const changedColors = await request(3, 'textDocument/documentColor', {
    textDocument: { uri },
  });
  assert.equal(changedColors.result.length, 1);
  approximately(changedColors.result[0].color.blue, 1);

  const shutdown = await request(4, 'shutdown');
  assert.equal(shutdown.result, null);
  notify('exit');
  assert.equal(await exited, 0);
});
