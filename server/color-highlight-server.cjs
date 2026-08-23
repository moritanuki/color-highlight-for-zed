'use strict';

const SERVER_NAME = 'color-highlight-for-zed';
const SERVER_VERSION = '0.1.0';

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseNumber(token) {
  const value = token.trim();
  if (!/^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parsePercentage(token) {
  const value = token.trim();
  if (!value.endsWith('%')) {
    return null;
  }

  const number = parseNumber(value.slice(0, -1));
  return number === null ? null : clamp(number / 100);
}

function parseAlpha(token) {
  const value = token.trim();
  if (value.endsWith('%')) {
    return parsePercentage(value);
  }

  const number = parseNumber(value);
  return number === null ? null : clamp(number);
}

function parseRgbChannel(token) {
  const value = token.trim();
  if (value.endsWith('%')) {
    return parsePercentage(value);
  }

  const number = parseNumber(value);
  return number === null ? null : clamp(number / 255);
}

function parseHue(token) {
  const match = token
    .trim()
    .match(/^([+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?)(deg|grad|rad|turn)?$/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }

  let degrees;
  switch ((match[2] || 'deg').toLowerCase()) {
    case 'grad':
      degrees = value * 0.9;
      break;
    case 'rad':
      degrees = (value * 180) / Math.PI;
      break;
    case 'turn':
      degrees = value * 360;
      break;
    default:
      degrees = value;
  }

  return ((degrees % 360) + 360) % 360;
}

function splitFunctionalChannels(body, allowCommas = true) {
  if (body.includes(',')) {
    if (!allowCommas || body.includes('/')) {
      return null;
    }

    const values = body.split(',').map((value) => value.trim());
    if ((values.length !== 3 && values.length !== 4) || values.some((value) => !value)) {
      return null;
    }

    return { channels: values.slice(0, 3), alpha: values[3] ?? null, legacy: true };
  }

  const slashParts = body.split('/');
  if (slashParts.length > 2) {
    return null;
  }

  const channels = slashParts[0].trim().split(/\s+/).filter(Boolean);
  if (channels.length !== 3) {
    return null;
  }

  let alpha = null;
  if (slashParts.length === 2) {
    const alphaParts = slashParts[1].trim().split(/\s+/).filter(Boolean);
    if (alphaParts.length !== 1) {
      return null;
    }
    [alpha] = alphaParts;
  }

  return { channels, alpha, legacy: false };
}

function parseHex(literal) {
  const hex = literal.slice(1);
  if (![3, 4, 6, 8].includes(hex.length)) {
    return null;
  }

  const expanded = hex.length <= 4
    ? [...hex].map((character) => character + character).join('')
    : hex;

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  const alpha = expanded.length === 8
    ? Number.parseInt(expanded.slice(6, 8), 16)
    : 255;

  if ([red, green, blue, alpha].some((value) => Number.isNaN(value))) {
    return null;
  }

  return {
    red: red / 255,
    green: green / 255,
    blue: blue / 255,
    alpha: alpha / 255,
  };
}

function parseRgb(literal) {
  const match = literal.match(/^rgba?\(([\s\S]*)\)$/i);
  if (!match) {
    return null;
  }

  const parts = splitFunctionalChannels(match[1]);
  if (!parts) {
    return null;
  }

  const channels = parts.channels.map(parseRgbChannel);
  const alpha = parts.alpha === null ? 1 : parseAlpha(parts.alpha);
  if (channels.some((value) => value === null) || alpha === null) {
    return null;
  }

  return {
    red: channels[0],
    green: channels[1],
    blue: channels[2],
    alpha,
  };
}

function hslToRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs((2 * lightness) - 1)) * saturation;
  const section = hue / 60;
  const intermediate = chroma * (1 - Math.abs((section % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (section < 1) {
    red = chroma;
    green = intermediate;
  } else if (section < 2) {
    red = intermediate;
    green = chroma;
  } else if (section < 3) {
    green = chroma;
    blue = intermediate;
  } else if (section < 4) {
    green = intermediate;
    blue = chroma;
  } else if (section < 5) {
    red = intermediate;
    blue = chroma;
  } else {
    red = chroma;
    blue = intermediate;
  }

  const offset = lightness - (chroma / 2);
  return { red: red + offset, green: green + offset, blue: blue + offset };
}

function parseHsl(literal) {
  const match = literal.match(/^hsla?\(([\s\S]*)\)$/i);
  if (!match) {
    return null;
  }

  const parts = splitFunctionalChannels(match[1]);
  if (!parts) {
    return null;
  }

  const hue = parseHue(parts.channels[0]);
  const saturation = parsePercentage(parts.channels[1]);
  const lightness = parsePercentage(parts.channels[2]);
  const alpha = parts.alpha === null ? 1 : parseAlpha(parts.alpha);
  if (hue === null || saturation === null || lightness === null || alpha === null) {
    return null;
  }

  return { ...hslToRgb(hue, saturation, lightness), alpha };
}

function parseHwb(literal) {
  const match = literal.match(/^hwb\(([\s\S]*)\)$/i);
  if (!match) {
    return null;
  }

  const parts = splitFunctionalChannels(match[1], false);
  if (!parts) {
    return null;
  }

  const hue = parseHue(parts.channels[0]);
  let whiteness = parsePercentage(parts.channels[1]);
  let blackness = parsePercentage(parts.channels[2]);
  const alpha = parts.alpha === null ? 1 : parseAlpha(parts.alpha);
  if (hue === null || whiteness === null || blackness === null || alpha === null) {
    return null;
  }

  const total = whiteness + blackness;
  if (total >= 1) {
    const gray = total === 0 ? 0 : whiteness / total;
    return { red: gray, green: gray, blue: gray, alpha };
  }

  const pure = hslToRgb(hue, 1, 0.5);
  const factor = 1 - whiteness - blackness;
  return {
    red: (pure.red * factor) + whiteness,
    green: (pure.green * factor) + whiteness,
    blue: (pure.blue * factor) + whiteness,
    alpha,
  };
}

const COLOR_PATTERNS = [
  {
    kind: 'hex',
    expression: /(^|[^#0-9A-Za-z_-])(#[0-9A-Fa-f]{8}|#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{4}|#[0-9A-Fa-f]{3})(?![0-9A-Za-z_-])/g,
    parse: parseHex,
  },
  {
    kind: 'rgb',
    expression: /(^|[^0-9A-Za-z_-])((?:rgb|rgba)\([^()]*\))(?![0-9A-Za-z_-])/gi,
    parse: parseRgb,
  },
  {
    kind: 'hsl',
    expression: /(^|[^0-9A-Za-z_-])((?:hsl|hsla)\([^()]*\))(?![0-9A-Za-z_-])/gi,
    parse: parseHsl,
  },
  {
    kind: 'hwb',
    expression: /(^|[^0-9A-Za-z_-])(hwb\([^()]*\))(?![0-9A-Za-z_-])/gi,
    parse: parseHwb,
  },
];

function extractColorLiterals(text) {
  const colors = [];

  for (const pattern of COLOR_PATTERNS) {
    const expression = new RegExp(pattern.expression.source, pattern.expression.flags);
    let match;
    while ((match = expression.exec(text)) !== null) {
      const literal = match[2];
      const color = pattern.parse(literal);
      if (color) {
        const start = match.index + match[1].length;
        colors.push({
          start,
          end: start + literal.length,
          literal,
          kind: pattern.kind,
          color,
        });
      }
    }
  }

  colors.sort((left, right) => left.start - right.start || right.end - left.end);

  const nonOverlapping = [];
  let occupiedUntil = -1;
  for (const color of colors) {
    if (color.start >= occupiedUntil) {
      nonOverlapping.push(color);
      occupiedUntil = color.end;
    }
  }

  return nonOverlapping;
}

function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function offsetToPosition(starts, offset) {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= offset) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return { line: low, character: offset - starts[low] };
}

function positionToOffset(text, position) {
  const starts = lineStarts(text);
  if (position.line < 0 || position.line >= starts.length) {
    return text.length;
  }

  const start = starts[position.line];
  let end = position.line + 1 < starts.length ? starts[position.line + 1] - 1 : text.length;
  if (end > start && text.charCodeAt(end - 1) === 13) {
    end -= 1;
  }
  return Math.min(end, start + Math.max(0, position.character));
}

function documentColors(text) {
  const starts = lineStarts(text);
  return extractColorLiterals(text).map((entry) => ({
    range: {
      start: offsetToPosition(starts, entry.start),
      end: offsetToPosition(starts, entry.end),
    },
    color: entry.color,
  }));
}

function byteFromChannel(channel) {
  return Math.round(clamp(channel) * 255);
}

function byteToHex(byte, uppercase = false) {
  const value = byte.toString(16).padStart(2, '0');
  return uppercase ? value.toUpperCase() : value;
}

function formatHex(color, { includeAlpha = color.alpha < 0.9995, preferShort = false, uppercase = false } = {}) {
  const bytes = [color.red, color.green, color.blue].map(byteFromChannel);
  if (includeAlpha) {
    bytes.push(byteFromChannel(color.alpha));
  }

  if (preferShort && bytes.every((byte) => (byte >> 4) === (byte & 0x0f))) {
    const value = bytes.map((byte) => (byte & 0x0f).toString(16)).join('');
    return `#${uppercase ? value.toUpperCase() : value}`;
  }

  return `#${bytes.map((byte) => byteToHex(byte, uppercase)).join('')}`;
}

function trimDecimal(value, precision = 3) {
  return Number(value.toFixed(precision)).toString();
}

function rgbToHsl(color) {
  const maximum = Math.max(color.red, color.green, color.blue);
  const minimum = Math.min(color.red, color.green, color.blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;

  if (delta === 0) {
    return { hue: 0, saturation: 0, lightness };
  }

  const saturation = delta / (1 - Math.abs((2 * lightness) - 1));
  let hue;
  if (maximum === color.red) {
    hue = 60 * (((color.green - color.blue) / delta) % 6);
  } else if (maximum === color.green) {
    hue = 60 * (((color.blue - color.red) / delta) + 2);
  } else {
    hue = 60 * (((color.red - color.green) / delta) + 4);
  }

  return { hue: (hue + 360) % 360, saturation, lightness };
}

function formatRgb(color, legacy = false) {
  const channels = [color.red, color.green, color.blue].map(byteFromChannel);
  if (color.alpha < 0.9995) {
    if (legacy) {
      return `rgba(${channels.join(', ')}, ${trimDecimal(color.alpha)})`;
    }
    return `rgb(${channels.join(' ')} / ${trimDecimal(color.alpha * 100)}%)`;
  }
  return legacy ? `rgb(${channels.join(', ')})` : `rgb(${channels.join(' ')})`;
}

function formatHsl(color, legacy = false) {
  const hsl = rgbToHsl(color);
  const channels = [
    trimDecimal(hsl.hue, 1),
    `${trimDecimal(hsl.saturation * 100, 1)}%`,
    `${trimDecimal(hsl.lightness * 100, 1)}%`,
  ];

  if (color.alpha < 0.9995) {
    if (legacy) {
      return `hsla(${channels.join(', ')}, ${trimDecimal(color.alpha)})`;
    }
    return `hsl(${channels.join(' ')} / ${trimDecimal(color.alpha * 100)}%)`;
  }
  return legacy ? `hsl(${channels.join(', ')})` : `hsl(${channels.join(' ')})`;
}

function colorPresentations(text, params) {
  const start = positionToOffset(text, params.range.start);
  const end = positionToOffset(text, params.range.end);
  const original = text.slice(start, end);
  const lower = original.toLowerCase();
  const hasAlpha = params.color.alpha < 0.9995;

  let primary;
  if (lower.startsWith('#')) {
    primary = formatHex(params.color, {
      includeAlpha: hasAlpha || [5, 9].includes(original.length),
      preferShort: [4, 5].includes(original.length),
      uppercase: /[A-F]/.test(original) && !/[a-f]/.test(original),
    });
  } else if (lower.startsWith('rgb')) {
    primary = formatRgb(params.color, original.includes(','));
  } else if (lower.startsWith('hsl')) {
    primary = formatHsl(params.color, original.includes(','));
  } else {
    primary = formatHex(params.color);
  }

  const labels = [primary, formatHex(params.color), formatRgb(params.color), formatHsl(params.color)];
  return [...new Set(labels)].map((label) => ({
    label,
    textEdit: { range: params.range, newText: label },
  }));
}

function encodeMessage(message) {
  const json = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
}

function startLanguageServer(input = process.stdin, output = process.stdout) {
  const documents = new Map();
  let pending = Buffer.alloc(0);
  let shutdownRequested = false;

  function send(message) {
    output.write(encodeMessage(message));
  }

  function respond(id, result) {
    send({ jsonrpc: '2.0', id, result });
  }

  function respondError(id, code, message) {
    send({ jsonrpc: '2.0', id, error: { code, message } });
  }

  function handleMessage(message) {
    const { id, method, params = {} } = message;
    try {
      switch (method) {
        case 'initialize':
          respond(id, {
            capabilities: {
              positionEncoding: 'utf-16',
              textDocumentSync: { openClose: true, change: 1 },
              colorProvider: true,
            },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          });
          return;
        case 'initialized':
        case '$/cancelRequest':
        case 'workspace/didChangeConfiguration':
          return;
        case 'textDocument/didOpen':
          documents.set(params.textDocument.uri, {
            text: params.textDocument.text,
            version: params.textDocument.version,
            languageId: params.textDocument.languageId,
          });
          return;
        case 'textDocument/didChange': {
          const document = documents.get(params.textDocument.uri);
          const latest = params.contentChanges?.at(-1);
          if (document && latest && typeof latest.text === 'string') {
            documents.set(params.textDocument.uri, {
              ...document,
              text: latest.text,
              version: params.textDocument.version,
            });
          }
          return;
        }
        case 'textDocument/didClose':
          documents.delete(params.textDocument.uri);
          return;
        case 'textDocument/documentColor': {
          const document = documents.get(params.textDocument.uri);
          respond(id, document ? documentColors(document.text) : []);
          return;
        }
        case 'textDocument/colorPresentation': {
          const document = documents.get(params.textDocument.uri);
          respond(id, document ? colorPresentations(document.text, params) : []);
          return;
        }
        case 'shutdown':
          shutdownRequested = true;
          respond(id, null);
          return;
        case 'exit':
          process.exitCode = shutdownRequested ? 0 : 1;
          input.pause();
          setImmediate(() => process.exit(process.exitCode));
          return;
        default:
          if (id !== undefined) {
            respondError(id, -32601, `method not found: ${method}`);
          }
      }
    } catch (error) {
      if (id !== undefined) {
        respondError(id, -32603, error instanceof Error ? error.message : String(error));
      } else {
        process.stderr.write(`${SERVER_NAME}: ${error}\n`);
      }
    }
  }

  input.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);

    while (true) {
      const headerEnd = pending.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }

      const header = pending.subarray(0, headerEnd).toString('ascii');
      const lengthMatch = header.match(/(?:^|\r\n)Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        pending = pending.subarray(headerEnd + 4);
        continue;
      }

      const contentLength = Number(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;
      if (pending.length < bodyEnd) {
        return;
      }

      const body = pending.subarray(bodyStart, bodyEnd).toString('utf8');
      pending = pending.subarray(bodyEnd);

      try {
        handleMessage(JSON.parse(body));
      } catch (error) {
        process.stderr.write(`${SERVER_NAME}: invalid JSON-RPC payload: ${error}\n`);
      }
    }
  });

  input.resume();
}

if (require.main === module) {
  startLanguageServer();
}

module.exports = {
  SERVER_NAME,
  SERVER_VERSION,
  colorPresentations,
  documentColors,
  encodeMessage,
  extractColorLiterals,
  formatHex,
  parseHex,
  parseHsl,
  parseHwb,
  parseRgb,
  startLanguageServer,
};
