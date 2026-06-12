const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./_sandbox');

function load(extraSandbox = {}) {
  const loaded = loadScripts(['background.js']);
  Object.assign(loaded.sandbox, extraSandbox);
  return loaded.sandbox;
}

// Synthetic Google Flights HTML with embedded price data
function gfHtml(entries) {
  // entries: [{ airline, number, price }]
  const parts = entries.map(({ airline, number, price }) =>
    `["${airline}","${number}",null,"X"] some padding [[null,${price}],"Cj"`
  );
  return `<html><script class="ds:1" nonce="x">AF_initDataCallback(${parts.join(' ')})</script></html>`;
}

// ─── extractPrices ─────────────────────────────────────────────────

test('extractPrices maps flight numbers to prices', () => {
  const sandbox = load();
  const html = gfHtml([
    { airline: 'UA', number: '100', price: 452 },
    { airline: 'DL', number: '8', price: 1200 },
  ]);
  const result = sandbox.extractPrices(html);
  assert.equal(result.flightPrices['UA100'], 452);
  assert.equal(result.flightPrices['DL8'], 1200);
  assert.equal(result.price, 452); // first price = Google's "best" ranking
});

test('extractPrices respects the maxPrice cap', () => {
  const sandbox = load();
  const html = gfHtml([{ airline: 'NH', number: '7', price: 320246 }]); // JPY-scale price
  assert.equal(sandbox.extractPrices(html, 50000).price, null);
  assert.equal(sandbox.extractPrices(html, 8000000).price, 320246);
});

test('extractPrices falls back to any ds:N script tag', () => {
  const sandbox = load();
  const html = '<script class="ds:7" nonce="y">["AA","22",null,"X"] [[null,999],"Cj"</script>';
  const result = sandbox.extractPrices(html);
  assert.equal(result.flightPrices['AA22'], 999);
});

test('extractPrices returns null when no price data exists', () => {
  const sandbox = load();
  assert.equal(load().extractPrices('<html><body>consent page</body></html>'), null);
  assert.equal(sandbox.extractPrices(''), null);
});

// ─── LRU price cache ───────────────────────────────────────────────

test('cache stores and retrieves values', () => {
  const sandbox = load();
  sandbox.setCache('key1', { price: 100 });
  assert.deepEqual(sandbox.getCached('key1'), { price: 100 });
  assert.equal(sandbox.getCached('missing'), undefined);
});

test('cache evicts the least recently used entry at capacity', () => {
  const sandbox = load();
  for (let i = 0; i < 500; i++) sandbox.setCache(`key${i}`, { price: i });
  // Touch key0 so it becomes most recently used
  sandbox.getCached('key0');
  sandbox.setCache('overflow', { price: -1 });
  assert.deepEqual(sandbox.getCached('key0'), { price: 0 }); // survived (recently used)
  assert.equal(sandbox.getCached('key1'), undefined); // evicted (least recently used)
  assert.deepEqual(sandbox.getCached('overflow'), { price: -1 });
});

// ─── Exchange rates ────────────────────────────────────────────────

test('getExchangeRates inverts frankfurter rates to USD-per-unit', async () => {
  const sandbox = load({
    fetch: async () => ({
      ok: true,
      json: async () => ({ rates: { EUR: 0.92, JPY: 150 } }),
    }),
  });
  const rates = await sandbox.getExchangeRates();
  assert.ok(Math.abs(rates.EUR - 1 / 0.92) < 1e-9);
  assert.ok(Math.abs(rates.JPY - 1 / 150) < 1e-9);
});

test('getExchangeRates falls back to offline rates when the API fails', async () => {
  const sandbox = load({
    fetch: async () => { throw new Error('network down'); },
  });
  const rates = await sandbox.getExchangeRates();
  assert.equal(rates.EUR, 1.08); // FALLBACK_RATES
  assert.equal(rates.JPY, 0.0067);
});

// ─── maxPriceForCurrency ───────────────────────────────────────────

test('maxPriceForCurrency scales the cap by currency', async () => {
  const sandbox = load({
    fetch: async () => ({
      ok: true,
      json: async () => ({ rates: { JPY: 150, EUR: 0.92 } }),
    }),
  });
  assert.equal(await sandbox.maxPriceForCurrency('USD'), 50000);
  assert.equal(await sandbox.maxPriceForCurrency(undefined), 50000);
  assert.equal(await sandbox.maxPriceForCurrency('JPY'), 7500000); // 50k USD in JPY
  assert.equal(await sandbox.maxPriceForCurrency('XXX'), 50000); // unknown → USD cap
});
