// Airline display name → IATA code mapping.
// Used to convert Google Flights airline names to seats.aero op_carriers codes.
// If an airline isn't found here, the op_carriers param is simply omitted.

const AIRLINE_CODES = {
  // US Majors
  'United': 'UA', 'United Airlines': 'UA',
  'Delta': 'DL', 'Delta Air Lines': 'DL',
  'American': 'AA', 'American Airlines': 'AA',
  'Alaska': 'AS', 'Alaska Airlines': 'AS',
  'Southwest': 'WN', 'Southwest Airlines': 'WN',
  'JetBlue': 'B6', 'JetBlue Airways': 'B6',
  'Hawaiian': 'HA', 'Hawaiian Airlines': 'HA',
  'Spirit': 'NK', 'Spirit Airlines': 'NK',
  'Frontier': 'F9', 'Frontier Airlines': 'F9',
  'Sun Country': 'SY', 'Sun Country Airlines': 'SY',
  'Breeze': 'MX', 'Breeze Airways': 'MX',
  'Avelo': 'XP', 'Avelo Airlines': 'XP',

  // Canada
  'Air Canada': 'AC',
  'WestJet': 'WS',
  'Porter': 'PD', 'Porter Airlines': 'PD',

  // Europe
  'British Airways': 'BA',
  'Lufthansa': 'LH',
  'Air France': 'AF',
  'KLM': 'KL', 'KLM Royal Dutch Airlines': 'KL',
  'Iberia': 'IB',
  'Aer Lingus': 'EI',
  'Finnair': 'AY',
  'SAS': 'SK', 'Scandinavian Airlines': 'SK',
  'Swiss': 'LX', 'SWISS': 'LX',
  'Austrian': 'OS', 'Austrian Airlines': 'OS',
  'Brussels Airlines': 'SN',
  'TAP Portugal': 'TP', 'TAP Air Portugal': 'TP',
  'Virgin Atlantic': 'VS',
  'Norwegian': 'DY', 'Norwegian Air': 'DY',
  'Icelandair': 'FI',
  'LOT Polish Airlines': 'LO', 'LOT': 'LO',
  'Condor': 'DE',
  'Eurowings': 'EW',
  'Vueling': 'VY',
  'easyJet': 'U2',
  'Ryanair': 'FR',
  'Wizz Air': 'W6',
  'ITA Airways': 'AZ',
  'Aegean Airlines': 'A3', 'Aegean': 'A3',
  'PLAY': 'OG',

  // Middle East
  'Emirates': 'EK',
  'Qatar Airways': 'QR', 'Qatar': 'QR',
  'Etihad': 'EY', 'Etihad Airways': 'EY',
  'Saudia': 'SV',
  'Gulf Air': 'GF',
  'Oman Air': 'WY',
  'Royal Jordanian': 'RJ',
  'El Al': 'LY',

  // Asia
  'Singapore Airlines': 'SQ',
  'Cathay Pacific': 'CX',
  'ANA': 'NH', 'All Nippon Airways': 'NH',
  'JAL': 'JL', 'Japan Airlines': 'JL',
  'Korean Air': 'KE',
  'Asiana': 'OZ', 'Asiana Airlines': 'OZ',
  'Thai Airways': 'TG', 'Thai': 'TG',
  'Malaysia Airlines': 'MH',
  'Garuda Indonesia': 'GA',
  'Vietnam Airlines': 'VN',
  'Philippine Airlines': 'PR',
  'EVA Air': 'BR',
  'China Airlines': 'CI',
  'Air India': 'AI',
  'Hainan Airlines': 'HU',
  'Air China': 'CA',
  'China Eastern': 'MU', 'China Eastern Airlines': 'MU',
  'China Southern': 'CZ', 'China Southern Airlines': 'CZ',

  // Oceania
  'Qantas': 'QF',
  'Air New Zealand': 'NZ',
  'Virgin Australia': 'VA',
  'Fiji Airways': 'FJ',

  // Africa
  'Ethiopian Airlines': 'ET', 'Ethiopian': 'ET',
  'South African Airways': 'SA',
  'Royal Air Maroc': 'AT',
  'Kenya Airways': 'KQ',
  'EgyptAir': 'MS',

  // Latin America
  'LATAM': 'LA', 'LATAM Airlines': 'LA',
  'Avianca': 'AV',
  'Copa Airlines': 'CM', 'Copa': 'CM',
  'Aeromexico': 'AM',
  'Volaris': 'Y4',
  'GOL': 'G3',
  'Azul': 'AD', 'Azul Airlines': 'AD',
  'JetSMART': 'JA',

  // Turkey
  'Turkish Airlines': 'TK', 'Turkish': 'TK',
  'Pegasus Airlines': 'PC', 'Pegasus': 'PC',
};
