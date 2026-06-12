const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./_sandbox');

function build(...args) {
  const { sandbox } = loadScripts(['protobuf.js']);
  return sandbox.buildGoogleFlightsTfsUrl(...args);
}

function decodeTfs(url) {
  const tfs = new URL(url).searchParams.get('tfs');
  return Buffer.from(decodeURIComponent(tfs), 'base64');
}

function countBytePairs(buf, a, b) {
  let count = 0;
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === a && buf[i + 1] === b) count++;
  }
  return count;
}

test('encodes origin, destination, and date', () => {
  const url = build('JFK', 'LHR', '2026-08-15', 3, [], false);
  const bytes = decodeTfs(url);
  const text = bytes.toString('latin1');
  assert.ok(text.includes('JFK'));
  assert.ok(text.includes('LHR'));
  assert.ok(text.includes('2026-08-15'));
});

test('defaults to USD currency and 1 adult', () => {
  const url = build('JFK', 'LHR', '2026-08-15', 1, [], false);
  assert.ok(url.includes('curr=USD'));
  // Passenger field: tag 0x40 (field 8, varint), value 0x01 (adult)
  assert.equal(countBytePairs(decodeTfs(url), 0x40, 0x01), 1);
});

test('encodes one passenger field per adult', () => {
  const url = build('JFK', 'LHR', '2026-08-15', 1, [], false, 3);
  assert.equal(countBytePairs(decodeTfs(url), 0x40, 0x01), 3);
});

test('clamps passenger count to 1-9', () => {
  assert.equal(countBytePairs(decodeTfs(build('A', 'B', 'd', 1, [], false, 0)), 0x40, 0x01), 1);
  assert.equal(countBytePairs(decodeTfs(build('A', 'B', 'd', 1, [], false, 99)), 0x40, 0x01), 9);
});

test('encodes nonstop as max_stops=0', () => {
  // Field 5 varint tag = 0x28, explicit value 0
  const nonstop = decodeTfs(build('JFK', 'LHR', '2026-08-15', 1, [], true));
  const anyStops = decodeTfs(build('JFK', 'LHR', '2026-08-15', 1, [], false));
  assert.equal(countBytePairs(nonstop, 0x28, 0x00), 1);
  assert.equal(countBytePairs(anyStops, 0x28, 0x00), 0);
});

test('encodes airline filter as field 6 strings', () => {
  const bytes = decodeTfs(build('JFK', 'LHR', '2026-08-15', 1, ['AA', 'BA'], false));
  const text = bytes.toString('latin1');
  // Field 6 length-delimited tag = 0x32, length 2, then the IATA code
  assert.ok(text.includes('\x32\x02AA'));
  assert.ok(text.includes('\x32\x02BA'));
});

test('uses requested currency, rejects invalid currency', () => {
  assert.ok(build('A', 'B', 'd', 1, [], false, 1, 'EUR').includes('curr=EUR'));
  assert.ok(build('A', 'B', 'd', 1, [], false, 1, 'nope').includes('curr=USD'));
  assert.ok(build('A', 'B', 'd', 1, [], false, 1, undefined).includes('curr=USD'));
});
