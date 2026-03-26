// Minimal protobuf encoder for Google Flights tfs URL parameter.
// Schema reverse-engineered from fast-flights (Python) and google-flights-api (Go).

function encodeVarint(value) {
  const bytes = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return bytes;
}

const textEncoder = new TextEncoder();

function encodeTag(fieldNumber, wireType) {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function encodeString(fieldNumber, str) {
  const strBytes = textEncoder.encode(str);
  return [...encodeTag(fieldNumber, 2), ...encodeVarint(strBytes.length), ...strBytes];
}

function encodeVarintField(fieldNumber, value) {
  if (value === 0) return [];
  return [...encodeTag(fieldNumber, 0), ...encodeVarint(value)];
}

function encodeNestedMessage(fieldNumber, messageBytes) {
  return [...encodeTag(fieldNumber, 2), ...encodeVarint(messageBytes.length), ...messageBytes];
}

/**
 * Build a Google Flights search URL with protobuf-encoded tfs parameter.
 *
 * @param {string} origin - IATA airport code (e.g., "HND")
 * @param {string} destination - IATA airport code (e.g., "JFK")
 * @param {string} date - "YYYY-MM-DD"
 * @param {number} seat - 1=economy, 2=premium_economy, 3=business, 4=first
 * @param {string[]} [airlines] - IATA airline codes (e.g., ["AA"])
 * @returns {string} Google Flights search URL
 */
function buildGoogleFlightsTfsUrl(origin, destination, date, seat, airlines) {
  // Airport messages: { string airport = 2; }
  const fromAirport = encodeString(2, origin);
  const toAirport = encodeString(2, destination);

  // FlightData: { date=2, airlines=6, from=13, to=14 }
  const flightData = [
    ...encodeString(2, date),
    ...(airlines || []).flatMap(a => encodeString(6, a)),
    ...encodeNestedMessage(13, fromAirport),
    ...encodeNestedMessage(14, toAirport),
  ];

  // Info: { data=3, passengers=8, seat=9, trip=19 }
  const info = [
    ...encodeNestedMessage(3, flightData),
    ...encodeVarintField(8, 1),      // 1 adult
    ...encodeVarintField(9, seat),   // cabin class
    ...encodeVarintField(19, 2),     // one-way
  ];

  const tfs = btoa(String.fromCharCode(...new Uint8Array(info)));
  return `https://www.google.com/travel/flights/search?tfs=${encodeURIComponent(tfs)}&hl=en&curr=USD`;
}
