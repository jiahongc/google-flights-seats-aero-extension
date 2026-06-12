const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./_sandbox');

const FILES = ['airlines.js', 'metros.js', 'content.js'];

function helpers(locationHref = 'https://www.google.com/travel/flights') {
  return loadScripts(FILES, { locationHref }).exports;
}

// ─── parseDate ─────────────────────────────────────────────────────

// Mirrors the documented year-inference contract: a month/day that already
// passed (with a 1-day buffer) is assumed to be next year.
function expectedYear(monthIndex, day) {
  const now = new Date();
  let year = now.getFullYear();
  if (monthIndex < now.getMonth() || (monthIndex === now.getMonth() && day < now.getDate() - 1)) {
    year++;
  }
  return year;
}

test('parseDate parses month names and abbreviations', () => {
  const { parseDate } = helpers();
  const year = expectedYear(11, 25);
  assert.equal(parseDate('Dec 25'), `${year}-12-25`);
  assert.equal(parseDate('December 25'), `${year}-12-25`);
  assert.equal(parseDate('Thu, Dec 25'), `${year}-12-25`);
});

test('parseDate pads single-digit days', () => {
  const { parseDate } = helpers();
  const year = expectedYear(2, 5);
  assert.equal(parseDate('Mar 5'), `${year}-03-05`);
});

test('parseDate rolls past dates into next year', () => {
  const { parseDate } = helpers();
  const now = new Date();
  // A date ~2 months ago must resolve to next year
  const past = new Date(now.getFullYear(), now.getMonth() - 2, 15);
  const monthName = past.toLocaleString('en-US', { month: 'long' });
  const expected = expectedYear(past.getMonth(), 15);
  const result = parseDate(`${monthName} 15`);
  assert.equal(result, `${expected}-${String(past.getMonth() + 1).padStart(2, '0')}-15`);
  if (now.getMonth() >= 2) {
    assert.equal(expected, now.getFullYear() + 1);
  }
});

test('parseDate returns null for unparseable input', () => {
  const { parseDate } = helpers();
  assert.equal(parseDate(''), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate('no date here'), null);
  assert.equal(parseDate('Foober 12'), null);
});

// ─── resolveAirportCode ────────────────────────────────────────────

test('resolveAirportCode extracts explicit IATA codes', () => {
  const { resolveAirportCode } = helpers();
  assert.equal(resolveAirportCode('Newark EWR', true), 'EWR');
  assert.equal(resolveAirportCode('Tokyo HND', false), 'HND');
});

test('resolveAirportCode ignores airline names that look like IATA codes', () => {
  const { resolveAirportCode } = helpers();
  // JAL/ANA/KLM are airline names, not airport codes
  assert.notEqual(resolveAirportCode('JAL', true), 'JAL');
  assert.notEqual(resolveAirportCode('ANA', true), 'ANA');
});

test('resolveAirportCode resolves metro names', () => {
  const { resolveAirportCode } = helpers();
  assert.equal(resolveAirportCode('New York', true), 'NYC');
  assert.equal(resolveAirportCode('London', true), 'LON');
  assert.equal(resolveAirportCode('Tokyo', false), 'TYO');
});

test('resolveAirportCode handles case-insensitive trailing codes', () => {
  const { resolveAirportCode } = helpers();
  assert.equal(resolveAirportCode('Seattle Sea', true), 'SEA');
});

test('resolveAirportCode returns null when nothing matches', () => {
  const { resolveAirportCode } = helpers();
  assert.equal(resolveAirportCode('Zzyzx Springs', true), null);
  assert.equal(resolveAirportCode('', true), null);
  assert.equal(resolveAirportCode(null, true), null);
});

// ─── classifyCabin ─────────────────────────────────────────────────

test('classifyCabin maps Google Flights labels to seats.aero cabins', () => {
  const { classifyCabin } = helpers();
  assert.equal(classifyCabin('Economy'), 'economy');
  assert.equal(classifyCabin('Premium economy'), 'premium');
  assert.equal(classifyCabin('Business class'), 'business');
  assert.equal(classifyCabin('First class'), 'first');
  assert.equal(classifyCabin('Unknown'), null);
});

// ─── buildSeatsAeroUrl ─────────────────────────────────────────────

test('buildSeatsAeroUrl sets required and optional params', () => {
  const { buildSeatsAeroUrl } = helpers();
  const url = new URL(buildSeatsAeroUrl({
    origins: 'NYC',
    destinations: 'TYO',
    date: '2026-09-01',
    cabin: 'business',
    directOnly: true,
    airlines: ['NH', 'JL'],
    passengers: 2,
    flexibleDays: 3,
    showIndividual: true,
  }));
  assert.equal(url.origin + url.pathname, 'https://seats.aero/search');
  assert.equal(url.searchParams.get('origins'), 'NYC');
  assert.equal(url.searchParams.get('destinations'), 'TYO');
  assert.equal(url.searchParams.get('date'), '2026-09-01');
  assert.equal(url.searchParams.get('applicable_cabin'), 'business');
  assert.equal(url.searchParams.get('direct_only'), 'true');
  assert.equal(url.searchParams.get('op_carriers'), 'NH,JL');
  assert.equal(url.searchParams.get('min_seats'), '2');
  assert.equal(url.searchParams.get('additional_days'), 'true');
  assert.equal(url.searchParams.get('additional_days_num'), '3');
  assert.equal(url.searchParams.get('show_individual'), 'true');
});

test('buildSeatsAeroUrl omits optional params when not set', () => {
  const { buildSeatsAeroUrl } = helpers();
  const url = new URL(buildSeatsAeroUrl({
    origins: 'EWR', destinations: 'LAX', date: '2026-09-01', cabin: 'economy',
    directOnly: false, airlines: [], passengers: 1, flexibleDays: 0,
  }));
  assert.equal(url.searchParams.get('direct_only'), null);
  assert.equal(url.searchParams.get('op_carriers'), null);
  assert.equal(url.searchParams.get('min_seats'), null);
  assert.equal(url.searchParams.get('additional_days'), null);
  assert.equal(url.searchParams.get('show_individual'), null);
});

// ─── extractAirlinesFromUrl ────────────────────────────────────────

test('extractAirlinesFromUrl decodes airline codes from the tfs param', () => {
  // \x32\x02UA \x32\x02DL encoded as base64url
  const tfs = Buffer.from('\x32\x02UA\x32\x02DL', 'binary').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_');
  const { extractAirlinesFromUrl } = helpers(
    `https://www.google.com/travel/flights/search?tfs=${tfs}`
  );
  // Spread: vm-context arrays fail cross-realm deepStrictEqual
  assert.deepEqual([...extractAirlinesFromUrl()], ['UA', 'DL']);
});

test('extractAirlinesFromUrl returns empty array without tfs', () => {
  const { extractAirlinesFromUrl } = helpers('https://www.google.com/travel/flights');
  assert.deepEqual([...extractAirlinesFromUrl()], []);
});
