const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./_sandbox');

const FILES = ['protobuf.js', 'seats-content.js'];

function helpers(locationHref = 'https://seats.aero/search?origins=JFK&destinations=LHR&date=2026-08-15') {
  return loadScripts(FILES, { locationHref }).exports;
}

// ─── parseDepartureDate ────────────────────────────────────────────

test('parseDepartureDate takes year from the fallback date', () => {
  const { parseDepartureDate } = helpers();
  assert.equal(parseDepartureDate('07/04 1:00PM', '2026-07-01'), '2026-07-04');
  assert.equal(parseDepartureDate('11/06 10:55PM', '2026-11-05'), '2026-11-06');
});

test('parseDepartureDate rolls year forward across Dec→Jan boundary', () => {
  const { parseDepartureDate } = helpers();
  // Searching Dec 30 with flexible days shows January departures — next year
  assert.equal(parseDepartureDate('01/02 10:55PM', '2026-12-30'), '2027-01-02');
});

test('parseDepartureDate rolls year backward across Jan→Dec boundary', () => {
  const { parseDepartureDate } = helpers();
  assert.equal(parseDepartureDate('12/28 6:43PM', '2027-01-02'), '2026-12-28');
});

test('parseDepartureDate falls back when unparseable', () => {
  const { parseDepartureDate } = helpers();
  assert.equal(parseDepartureDate(null, '2026-05-05'), '2026-05-05');
  assert.equal(parseDepartureDate('garbage', '2026-05-05'), '2026-05-05');
});

// ─── parseFlightInfo ───────────────────────────────────────────────

test('parseFlightInfo extracts airline code and flight number', () => {
  const { parseFlightInfo } = helpers();
  const info = parseFlightInfo('OZ223');
  assert.equal(info.airlineCode, 'OZ');
  assert.equal(info.flightNumber, 'OZ223');
  assert.equal(info.isConnection, false);
  // Spread: vm-context arrays fail cross-realm deepStrictEqual
  assert.deepEqual([...info.allFlightNumbers], ['OZ223']);
});

test('parseFlightInfo detects connections', () => {
  const { parseFlightInfo } = helpers();
  const info = parseFlightInfo('OZ223, OZ713');
  assert.equal(info.isConnection, true);
  assert.deepEqual([...info.allFlightNumbers], ['OZ223', 'OZ713']);
});

test('parseFlightInfo handles empty input', () => {
  const { parseFlightInfo } = helpers();
  const info = parseFlightInfo('');
  assert.equal(info.airlineCode, null);
  assert.equal(info.isConnection, false);
});

// ─── parsePointsCost ───────────────────────────────────────────────

test('parsePointsCost extracts points from cell text', () => {
  const { parsePointsCost } = helpers();
  assert.equal(parsePointsCost('64,700 pts'), 64700);
  assert.equal(parsePointsCost('279,000 pts + $92.75'), 279000);
  assert.equal(parsePointsCost('Not Available'), 0);
});

test('parsePointsCost parses compact k/M notation (newer views)', () => {
  const { parsePointsCost } = helpers();
  assert.equal(parsePointsCost('Direct30k'), 30000);
  assert.equal(parsePointsCost('Direct51.7k'), 51700);
  assert.equal(parsePointsCost('222k'), 222000);
  assert.equal(parsePointsCost('272.5k'), 272500);
  assert.equal(parsePointsCost('1.2M'), 1200000);
});

// ─── extractAirportCode ────────────────────────────────────────────

test('extractAirportCode pulls trailing IATA from city+code text', () => {
  const { extractAirportCode } = helpers();
  assert.equal(extractAirportCode('NewarkEWR', 'X'), 'EWR');
  assert.equal(extractAirportCode('LimaLIM', 'X'), 'LIM');
  assert.equal(extractAirportCode('EWR', 'X'), 'EWR');
  assert.equal(extractAirportCode('New York JFK', 'X'), 'JFK');
  assert.equal(extractAirportCode(null, 'FALLBACK'), 'FALLBACK');
});

// ─── parseFees / feeAmountUSD ──────────────────────────────────────
// Default (offline) rates: EUR 1.08, GBP 1.27, CAD 0.74, AUD 0.66, JPY 0.0067

test('parseFees parses symbol-prefixed fees', () => {
  const { parseFees } = helpers();
  const usd = parseFees('64,700 pts + $92.75');
  assert.equal(usd.amountUSD, 92.75);
  const eur = parseFees('100,000 pts + €100.00');
  assert.equal(eur.iso ?? 'EUR', 'EUR');
  assert.ok(Math.abs(eur.amountUSD - 108) < 0.01);
});

test('parseFees parses ISO-before-amount fees', () => {
  const { parseFees } = helpers();
  const fee = parseFees('+ CAD 50.00');
  assert.equal(fee.iso, 'CAD');
  assert.ok(Math.abs(fee.amountUSD - 37) < 0.01);
});

test('parseFees parses amount-before-ISO fees', () => {
  const { parseFees } = helpers();
  const fee = parseFees('+ 92.75 USD');
  assert.equal(fee.amountUSD, 92.75);
});

test('unknown currency fees do not get a bogus 1:1 USD conversion', () => {
  const { parseFees } = helpers();
  // KRW has no offline rate — the fee must be skipped (0), not treated as $50,000
  const fee = parseFees('+ KRW 50,000');
  assert.equal(fee.amount, 50000);
  assert.equal(fee.amountUSD, 0);
});

test('feeAmountUSD converts known currencies and skips unknown ones', () => {
  const { feeAmountUSD } = helpers();
  assert.equal(feeAmountUSD(100, '$', undefined), 100);
  assert.ok(Math.abs(feeAmountUSD(100, '€', undefined) - 108) < 0.01);
  assert.ok(Math.abs(feeAmountUSD(10000, '¥', undefined) - 67) < 0.01);
  assert.equal(feeAmountUSD(50000, '₩', undefined), 0); // KRW: no offline rate
  assert.equal(feeAmountUSD(100, '??', undefined), 0);  // unknown symbol
});

test('parseFees returns zero fees when nothing matches', () => {
  const { parseFees } = helpers();
  const fee = parseFees('64,700 pts');
  assert.equal(fee.amount, 0);
  assert.equal(fee.amountUSD, 0);
});

// ─── programBaseline ───────────────────────────────────────────────

test('programBaseline recognizes seats.aero program names', () => {
  const { programBaseline } = helpers();
  assert.equal(programBaseline('Air Canada (Aeroplan)').cpp, 1.5);
  assert.equal(programBaseline('United MileagePlus').cpp, 1.3);
  assert.equal(programBaseline('Delta SkyMiles').cpp, 1.2);
  assert.equal(programBaseline('American AAdvantage').cpp, 1.6);
  assert.equal(programBaseline('Avianca LifeMiles').cpp, 1.5);
});

test('programBaseline returns null for unknown programs', () => {
  const { programBaseline } = helpers();
  assert.equal(programBaseline('Mystery Rewards'), null);
  assert.equal(programBaseline(''), null);
  assert.equal(programBaseline(null), null);
});

// ─── formatFeeAmount ───────────────────────────────────────────────

test('formatFeeAmount formats symbol and ISO currencies', () => {
  const { formatFeeAmount } = helpers();
  assert.equal(formatFeeAmount({ amount: 92.75, currency: '$' }), '$92.75');
  assert.equal(formatFeeAmount({ amount: 50, currency: 'CAD' }), 'CAD 50');
});
