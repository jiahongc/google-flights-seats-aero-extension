// Content script — injected into Google Flights pages.
// Detects search results, injects seats.aero buttons (global + per-flight),
// extracts flight parameters, and opens seats.aero in a new tab.

(() => {
  'use strict';

  const BUTTON_ID = 'seats-aero-btn';
  const FLIGHT_BTN_CLASS = 'seats-aero-flight-btn';
  const REVERSE_BTN_ID = 'seats-aero-reverse-btn';
  const SEARCH_PATH = '/travel/flights/search';

  // Cache page-level params — invalidated on navigation/DOM changes
  let cachedPageParams = null;

  // Default settings — synced with popup.js
  let settings = {
    globalButton: true,
    perFlightButtons: true,
    flexibleDaysNum: 0,
  };

  // Load settings from storage
  function loadSettings() {
    chrome.storage.sync.get(settings, (saved) => {
      settings = { ...settings, ...saved };
      applySettingsToPage();
    });
  }

  // Listen for settings changes from popup
  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in settings) settings[key] = newValue;
    }
    applySettingsToPage();
  });

  // Apply visibility classes based on settings
  function applySettingsToPage() {
    document.body.classList.toggle('seats-aero-hide-global', !settings.globalButton);
    document.body.classList.toggle('seats-aero-hide-per-flight', !settings.perFlightButtons);
  }

  // ─── Metro codes ─────────────────────────────────────────────────

  const METRO_CODES = {
    // ══════════════════════════════════════════════════════════════════════
    // ── North America: United States ──
    // ══════════════════════════════════════════════════════════════════════
  
    // Multi-airport metros (metro codes)
    'new york': 'NYC',
    'new york city': 'NYC',
    'nyc': 'NYC',
    'manhattan': 'NYC',
    'brooklyn': 'NYC',
    'queens': 'NYC',
    'bronx': 'NYC',
    'staten island': 'NYC',
    'newark': 'EWR',
    'jfk': 'JFK',
    'laguardia': 'LGA',
  
    'los angeles': 'LAX',
    'la': 'LAX',
    'hollywood': 'LAX',
    'beverly hills': 'LAX',
    'santa monica': 'LAX',
    'burbank': 'BUR',
    'long beach': 'LGB',
    'ontario': 'ONT',
    'john wayne': 'SNA',
    'orange county': 'SNA',
    'santa ana': 'SNA',
    'palmdale': 'PMD',
  
    'chicago': 'CHI',
    'ohare': 'ORD',
    "o'hare": 'ORD',
    'midway': 'MDW',
  
    'washington': 'WAS',
    'washington dc': 'WAS',
    'washington d.c.': 'WAS',
    'dc': 'WAS',
    'dulles': 'IAD',
    'reagan': 'DCA',
    'ronald reagan': 'DCA',
    'national': 'DCA',
    'bwi': 'BWI',
  
    'san francisco': 'SFO',
    'sf': 'SFO',
    'oakland': 'OAK',
    'san jose': 'SJC',
  
    'dallas': 'DFW',
    'dallas-fort worth': 'DFW',
    'fort worth': 'DFW',
    'dallas fort worth': 'DFW',
    'love field': 'DAL',
  
    'houston': 'IAH',
    'george bush intercontinental': 'IAH',
    'hobby': 'HOU',
  
    'miami': 'MIA',
    'fort lauderdale': 'FLL',
    'ft lauderdale': 'FLL',
    'west palm beach': 'PBI',
    'palm beach': 'PBI',
  
    'detroit': 'DTW',
    'detroit metro': 'DTW',
  
    // Single-airport US cities — Alabama
    'birmingham': 'BHM',
    'huntsville': 'HSV',
    'mobile': 'MOB',
    'montgomery': 'MGM',
  
    // Alaska
    'anchorage': 'ANC',
    'fairbanks': 'FAI',
    'juneau': 'JNU',
    'ketchikan': 'KTN',
    'sitka': 'SIT',
    'kodiak': 'ADQ',
    'nome': 'OME',
    'barrow': 'BRW',
    'utqiagvik': 'BRW',
    'bethel': 'BET',
    'adak': 'ADK',
  
    // Arizona
    'phoenix': 'PHX',
    'tucson': 'TUS',
    'mesa': 'AZA',
    'flagstaff': 'FLG',
    'yuma': 'YUM',
    'scottsdale': 'PHX',
  
    // Arkansas
    'little rock': 'LIT',
    'fayetteville': 'XNA',
    'fort smith': 'FSM',
  
    // California (beyond LA/SF metros)
    'sacramento': 'SMF',
    'san diego': 'SAN',
    'fresno': 'FAT',
    'palm springs': 'PSP',
    'santa barbara': 'SBA',
    'bakersfield': 'BFL',
    'redding': 'RDD',
    'monterey': 'MRY',
    'san luis obispo': 'SBP',
    'mammoth lakes': 'MMH',
    'arcata': 'ACV',
    'eureka': 'ACV',
    'modesto': 'MOD',
    'stockton': 'SCK',
    'carlsbad': 'CLD',
  
    // Colorado
    'denver': 'DEN',
    'colorado springs': 'COS',
    'grand junction': 'GJT',
    'aspen': 'ASE',
    'vail': 'EGE',
    'eagle': 'EGE',
    'durango': 'DRO',
    'hayden': 'HDN',
    'steamboat springs': 'HDN',
    'montrose': 'MTJ',
    'gunnison': 'GUC',
    'telluride': 'TEX',
  
    // Connecticut
    'hartford': 'BDL',
    'new haven': 'HVN',
  
    // Delaware
    'wilmington': 'ILG',
  
    // Florida
    'orlando': 'MCO',
    'tampa': 'TPA',
    'jacksonville': 'JAX',
    'tallahassee': 'TLH',
    'pensacola': 'PNS',
    'sarasota': 'SRQ',
    'fort myers': 'RSW',
    'ft myers': 'RSW',
    'southwest florida': 'RSW',
    'key west': 'EYW',
    'gainesville': 'GNV',
    'daytona beach': 'DAB',
    'melbourne': 'MLB',
    'panama city': 'ECP',
    'panama city beach': 'ECP',
    'punta gorda': 'PGD',
    'st augustine': 'UST',
    'destin': 'VPS',
    'fort walton beach': 'VPS',
    'naples': 'APF',
    'st petersburg': 'PIE',
    'clearwater': 'PIE',
    'sanford': 'SFB',
  
    // Georgia
    'atlanta': 'ATL',
    'savannah': 'SAV',
    'augusta': 'AGS',
    'athens': 'AHN',
    'albany': 'ABY',
    'brunswick': 'BQK',
    'valdosta': 'VLD',
  
    // Hawaii
    'honolulu': 'HNL',
    'maui': 'OGG',
    'kahului': 'OGG',
    'kona': 'KOA',
    'hilo': 'ITO',
    'lihue': 'LIH',
    'kauai': 'LIH',
    'molokai': 'MKK',
    'lanai': 'LNY',
    'kapalua': 'JHM',
  
    // Idaho
    'boise': 'BOI',
    'idaho falls': 'IDA',
    'sun valley': 'SUN',
    'lewiston': 'LWS',
    'twin falls': 'TWF',
    'pocatello': 'PIH',
  
    // Illinois (beyond Chicago)
    'springfield': 'SPI',
    'peoria': 'PIA',
    'champaign': 'CMI',
    'bloomington': 'BMI',
    'rockford': 'RFD',
    'moline': 'MLI',
    'quad cities': 'MLI',
    'marion': 'MWA',
    'decatur': 'DEC',
  
    // Indiana
    'indianapolis': 'IND',
    'fort wayne': 'FWA',
    'evansville': 'EVV',
    'south bend': 'SBN',
    'terre haute': 'HUF',
    'lafayette': 'LAF',
  
    // Iowa
    'des moines': 'DSM',
    'cedar rapids': 'CID',
    'dubuque': 'DBQ',
    'waterloo': 'ALO',
    'sioux city': 'SUX',
  
    // Kansas
    'wichita': 'ICT',
    'kansas city': 'MCI',
    'manhattan': 'MHK',
    'garden city': 'GCK',
    'liberal': 'LBL',
    'hays': 'HYS',
    'salina': 'SLN',
    'topeka': 'TOP',
  
    // Kentucky
    'louisville': 'SDF',
    'lexington': 'LEX',
    'owensboro': 'OWB',
    'paducah': 'PAH',
  
    // Louisiana
    'new orleans': 'MSY',
    'baton rouge': 'BTR',
    'shreveport': 'SHV',
    'lafayette': 'LFT',
    'lake charles': 'LCH',
    'monroe': 'MLU',
    'alexandria': 'AEX',
  
    // Maine
    'portland': 'PWM',
    'bangor': 'BGR',
    'bar harbor': 'BHB',
    'presque isle': 'PQI',
  
    // Maryland
    'baltimore': 'BWI',
  
    // Massachusetts
    'boston': 'BOS',
    'nantucket': 'ACK',
    'martha\'s vineyard': 'MVY',
    'hyannis': 'HYA',
    'worcester': 'ORH',
    'provincetown': 'PVC',
  
    // Michigan (beyond Detroit)
    'grand rapids': 'GRR',
    'flint': 'FNT',
    'traverse city': 'TVC',
    'kalamazoo': 'AZO',
    'lansing': 'LAN',
    'saginaw': 'MBS',
    'marquette': 'MQT',
    'muskegon': 'MKG',
    'iron mountain': 'IMT',
    'pellston': 'PLN',
    'escanaba': 'ESC',
    'alpena': 'APN',
  
    // Minnesota
    'minneapolis': 'MSP',
    'st paul': 'MSP',
    'minneapolis-st paul': 'MSP',
    'duluth': 'DLH',
    'rochester': 'RST',
    'brainerd': 'BRD',
    'bemidji': 'BJI',
    'hibbing': 'HIB',
    'international falls': 'INL',
  
    // Mississippi
    'jackson': 'JAN',
    'gulfport': 'GPT',
    'biloxi': 'GPT',
    'hattiesburg': 'PIB',
    'meridian': 'MEI',
    'tupelo': 'TUP',
  
    // Missouri
    'st louis': 'STL',
    'saint louis': 'STL',
    'springfield': 'SGF',
    'columbia': 'COU',
    'joplin': 'JLN',
    'cape girardeau': 'CGI',
  
    // Montana
    'billings': 'BIL',
    'missoula': 'MSO',
    'bozeman': 'BZN',
    'great falls': 'GTF',
    'kalispell': 'FCA',
    'glacier park': 'FCA',
    'helena': 'HLN',
    'butte': 'BTM',
    'west yellowstone': 'WYS',
    'sidney': 'SDY',
  
    // Nebraska
    'omaha': 'OMA',
    'lincoln': 'LNK',
    'grand island': 'GRI',
    'north platte': 'LBF',
    'scottsbluff': 'BFF',
    'kearney': 'EAR',
  
    // Nevada
    'las vegas': 'LAS',
    'reno': 'RNO',
    'elko': 'EKO',
  
    // New Hampshire
    'manchester': 'MHT',
    'lebanon': 'LEB',
  
    // New Jersey (beyond Newark)
    'atlantic city': 'ACY',
    'trenton': 'TTN',
  
    // New Mexico
    'albuquerque': 'ABQ',
    'santa fe': 'SAF',
    'las cruces': 'LRU',
    'roswell': 'ROW',
    'farmington': 'FMN',
    'carlsbad': 'CNM',
  
    // New York (beyond NYC)
    'buffalo': 'BUF',
    'rochester': 'ROC',
    'syracuse': 'SYR',
    'albany': 'ALB',
    'ithaca': 'ITH',
    'binghamton': 'BGM',
    'elmira': 'ELM',
    'white plains': 'HPN',
    'westchester': 'HPN',
    'islip': 'ISP',
    'plattsburgh': 'PBG',
    'watertown': 'ART',
    'ogdensburg': 'OGS',
    'saranac lake': 'SLK',
    'adirondack': 'SLK',
  
    // North Carolina
    'charlotte': 'CLT',
    'raleigh': 'RDU',
    'raleigh-durham': 'RDU',
    'durham': 'RDU',
    'greensboro': 'GSO',
    'asheville': 'AVL',
    'wilmington': 'ILM',
    'fayetteville': 'FAY',
    'new bern': 'EWN',
    'greenville': 'PGV',
  
    // North Dakota
    'fargo': 'FAR',
    'bismarck': 'BIS',
    'grand forks': 'GFK',
    'minot': 'MOT',
    'williston': 'XWA',
    'dickinson': 'DIK',
    'devils lake': 'DVL',
  
    // Ohio
    'cleveland': 'CLE',
    'columbus': 'CMH',
    'cincinnati': 'CVG',
    'dayton': 'DAY',
    'akron': 'CAK',
    'canton': 'CAK',
    'akron-canton': 'CAK',
    'toledo': 'TOL',
    'youngstown': 'YNG',
  
    // Oklahoma
    'oklahoma city': 'OKC',
    'tulsa': 'TUL',
    'lawton': 'LAW',
  
    // Oregon
    'portland': 'PDX',
    'eugene': 'EUG',
    'medford': 'MFR',
    'bend': 'RDM',
    'redmond': 'RDM',
    'coos bay': 'OTH',
    'north bend': 'OTH',
    'klamath falls': 'LMT',
  
    // Pennsylvania
    'philadelphia': 'PHL',
    'pittsburgh': 'PIT',
    'harrisburg': 'MDT',
    'allentown': 'ABE',
    'lehigh valley': 'ABE',
    'scranton': 'AVP',
    'wilkes-barre': 'AVP',
    'erie': 'ERI',
    'state college': 'SCE',
    'latrobe': 'LBE',
    'williamsport': 'IPT',
  
    // Rhode Island
    'providence': 'PVD',
  
    // South Carolina
    'charleston': 'CHS',
    'myrtle beach': 'MYR',
    'columbia': 'CAE',
    'greenville': 'GSP',
    'spartanburg': 'GSP',
    'hilton head': 'HHH',
  
    // South Dakota
    'sioux falls': 'FSD',
    'rapid city': 'RAP',
    'pierre': 'PIR',
    'aberdeen': 'ABR',
  
    // Tennessee
    'nashville': 'BNA',
    'memphis': 'MEM',
    'knoxville': 'TYS',
    'chattanooga': 'CHA',
    'tri-cities': 'TRI',
    'bristol': 'TRI',
    'johnson city': 'TRI',
  
    // Texas (beyond DFW/Houston)
    'san antonio': 'SAT',
    'austin': 'AUS',
    'el paso': 'ELP',
    'midland': 'MAF',
    'odessa': 'MAF',
    'lubbock': 'LBB',
    'amarillo': 'AMA',
    'corpus christi': 'CRP',
    'harlingen': 'HRL',
    'mcallen': 'MFE',
    'brownsville': 'BRO',
    'laredo': 'LRD',
    'waco': 'ACT',
    'college station': 'CLL',
    'beaumont': 'BPT',
    'tyler': 'TYR',
    'abilene': 'ABI',
    'killeen': 'GRK',
    'san angelo': 'SJT',
    'victoria': 'VCT',
    'texarkana': 'TXK',
    'wichita falls': 'SPS',
    'longview': 'GGG',
  
    // Utah
    'salt lake city': 'SLC',
    'st george': 'SGU',
    'saint george': 'SGU',
    'provo': 'PVU',
    'cedar city': 'CDC',
    'moab': 'CNY',
    'vernal': 'VEL',
  
    // Vermont
    'burlington': 'BTV',
  
    // Virginia (beyond DCA/IAD)
    'norfolk': 'ORF',
    'virginia beach': 'ORF',
    'richmond': 'RIC',
    'roanoke': 'ROA',
    'charlottesville': 'CHO',
    'lynchburg': 'LYH',
    'newport news': 'PHF',
    'shenandoah valley': 'SHD',
  
    // Washington
    'seattle': 'SEA',
    'tacoma': 'SEA',
    'seattle-tacoma': 'SEA',
    'spokane': 'GEG',
    'bellingham': 'BLI',
    'tri-cities': 'PSC',
    'pasco': 'PSC',
    'yakima': 'YKM',
    'walla walla': 'ALW',
    'wenatchee': 'EAT',
    'pullman': 'PUW',
    'friday harbor': 'FRD',
  
    // West Virginia
    'charleston': 'CRW',
    'huntington': 'HTS',
    'morgantown': 'MGW',
    'clarksburg': 'CKB',
    'lewisburg': 'LWB',
  
    // Wisconsin
    'milwaukee': 'MKE',
    'madison': 'MSN',
    'green bay': 'GRB',
    'appleton': 'ATW',
    'la crosse': 'LSE',
    'eau claire': 'EAU',
    'rhinelander': 'RHI',
    'central wisconsin': 'CWA',
    'wausau': 'CWA',
  
    // Wyoming
    'jackson hole': 'JAC',
    'jackson': 'JAC',
    'casper': 'CPR',
    'cheyenne': 'CYS',
    'cody': 'COD',
    'gillette': 'GCC',
    'laramie': 'LAR',
    'riverton': 'RIW',
    'rock springs': 'RKS',
    'sheridan': 'SHR',
  
    // US Territories
    'san juan': 'SJU',
    'puerto rico': 'SJU',
    'aguadilla': 'BQN',
    'ponce': 'PSE',
    'st thomas': 'STT',
    'saint thomas': 'STT',
    'st croix': 'STX',
    'saint croix': 'STX',
    'guam': 'GUM',
    'saipan': 'SPN',
    'pago pago': 'PPG',
    'american samoa': 'PPG',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── North America: Canada ──
    // ══════════════════════════════════════════════════════════════════════
  
    'toronto': 'YTO',
    'billy bishop': 'YTZ',
    'pearson': 'YYZ',
    'montreal': 'YMQ',
    'montréal': 'YMQ',
    'trudeau': 'YUL',
    'vancouver': 'YVR',
    'calgary': 'YYC',
    'edmonton': 'YEG',
    'ottawa': 'YOW',
    'winnipeg': 'YWG',
    'halifax': 'YHZ',
    'quebec city': 'YQB',
    'québec': 'YQB',
    'victoria': 'YYJ',
    'saskatoon': 'YXE',
    'regina': 'YQR',
    'st john\'s': 'YYT',
    'saint john\'s': 'YYT',
    'saint john': 'YSJ',
    'st john': 'YSJ',
    'fredericton': 'YFC',
    'moncton': 'YQM',
    'charlottetown': 'YYG',
    'thunder bay': 'YQT',
    'kelowna': 'YLW',
    'london': 'YXU',
    'kitchener': 'YKF',
    'waterloo': 'YKF',
    'sudbury': 'YSB',
    'sault ste marie': 'YAM',
    'windsor': 'YQG',
    'abbotsford': 'YXX',
    'nanaimo': 'YCD',
    'prince george': 'YXS',
    'kamloops': 'YKA',
    'comox': 'YQQ',
    'cranbrook': 'YXC',
    'penticton': 'YYF',
    'terrace': 'YXT',
    'prince rupert': 'YPR',
    'fort mcmurray': 'YMM',
    'lethbridge': 'YQL',
    'medicine hat': 'YXH',
    'red deer': 'YQF',
    'grande prairie': 'YQU',
    'yellowknife': 'YZF',
    'whitehorse': 'YXY',
    'iqaluit': 'YFB',
    'deer lake': 'YDF',
    'gander': 'YQX',
    'timmins': 'YTS',
    'north bay': 'YYB',
    'sault ste. marie': 'YAM',
    'hamilton': 'YHM',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── North America: Mexico ──
    // ══════════════════════════════════════════════════════════════════════
  
    'mexico city': 'MEX',
    'ciudad de mexico': 'MEX',
    'cancun': 'CUN',
    'cancún': 'CUN',
    'guadalajara': 'GDL',
    'monterrey': 'MTY',
    'tijuana': 'TIJ',
    'cabo san lucas': 'SJD',
    'los cabos': 'SJD',
    'san jose del cabo': 'SJD',
    'puerto vallarta': 'PVR',
    'merida': 'MID',
    'mérida': 'MID',
    'oaxaca': 'OAX',
    'acapulco': 'ACA',
    'leon': 'BJX',
    'león': 'BJX',
    'guanajuato': 'BJX',
    'queretaro': 'QRO',
    'querétaro': 'QRO',
    'chihuahua': 'CUU',
    'mazatlan': 'MZT',
    'mazatlán': 'MZT',
    'hermosillo': 'HMO',
    'puebla': 'PBC',
    'villahermosa': 'VSA',
    'tuxtla gutierrez': 'TGZ',
    'san luis potosi': 'SLP',
    'san luis potosí': 'SLP',
    'aguascalientes': 'AGU',
    'morelia': 'MLM',
    'veracruz': 'VER',
    'torreon': 'TRC',
    'torreón': 'TRC',
    'tampico': 'TAM',
    'zacatecas': 'ZCL',
    'durango': 'DGO',
    'ixtapa': 'ZIH',
    'zihuatanejo': 'ZIH',
    'cozumel': 'CZM',
    'huatulco': 'HUX',
    'la paz': 'LAP',
    'ciudad juarez': 'CJS',
    'ciudad juárez': 'CJS',
    'culiacan': 'CUL',
    'culiacán': 'CUL',
    'reynosa': 'REX',
    'saltillo': 'SLW',
    'colima': 'CLQ',
    'tepic': 'TPQ',
    'campeche': 'CPE',
    'ciudad obregon': 'CEN',
    'chetumal': 'CTM',
    'nuevo laredo': 'NLD',
    'matamoros': 'MAM',
    'nogales': 'NOG',
    'loreto': 'LTO',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Central America & Caribbean ──
    // ══════════════════════════════════════════════════════════════════════
  
    // Guatemala
    'guatemala city': 'GUA',
    'flores': 'FRS',
  
    // Belize
    'belize city': 'BZE',
    'san pedro': 'SPR',
  
    // El Salvador
    'san salvador': 'SAL',
  
    // Honduras
    'tegucigalpa': 'TGU',
    'san pedro sula': 'SAP',
    'roatan': 'RTB',
    'roatán': 'RTB',
    'la ceiba': 'LCE',
  
    // Nicaragua
    'managua': 'MGA',
  
    // Costa Rica
    'san jose': 'SJO',
    'san josé': 'SJO',
    'liberia': 'LIR',
  
    // Panama
    'panama city': 'PTY',
    'david': 'DAV',
    'bocas del toro': 'BOC',
  
    // Cuba
    'havana': 'HAV',
    'la habana': 'HAV',
    'varadero': 'VRA',
    'santiago de cuba': 'SCU',
    'santa clara': 'SNU',
    'holguin': 'HOG',
    'holguín': 'HOG',
    'camaguey': 'CMW',
    'camagüey': 'CMW',
    'cayo coco': 'CCC',
    'cayo largo': 'CYO',
  
    // Jamaica
    'kingston': 'KIN',
    'montego bay': 'MBJ',
  
    // Haiti
    'port-au-prince': 'PAP',
    'port au prince': 'PAP',
    'cap-haitien': 'CAP',
  
    // Dominican Republic
    'santo domingo': 'SDQ',
    'punta cana': 'PUJ',
    'santiago': 'STI',
    'puerto plata': 'POP',
    'la romana': 'LRM',
    'samana': 'AZS',
    'samaná': 'AZS',
  
    // Puerto Rico (also listed under US territories)
  
    // Bahamas
    'nassau': 'NAS',
    'freeport': 'FPO',
    'marsh harbour': 'MHH',
    'exuma': 'GGT',
    'eleuthera': 'ELH',
    'bimini': 'BIM',
  
    // Trinidad & Tobago
    'port of spain': 'POS',
    'tobago': 'TAB',
  
    // Barbados
    'bridgetown': 'BGI',
    'barbados': 'BGI',
  
    // Other Caribbean
    'aruba': 'AUA',
    'oranjestad': 'AUA',
    'curacao': 'CUR',
    'curaçao': 'CUR',
    'willemstad': 'CUR',
    'bonaire': 'BON',
    'st maarten': 'SXM',
    'sint maarten': 'SXM',
    'saint martin': 'SXM',
    'st martin': 'SXM',
    'st kitts': 'SKB',
    'saint kitts': 'SKB',
    'nevis': 'NEV',
    'antigua': 'ANU',
    'st lucia': 'UVF',
    'saint lucia': 'UVF',
    'grenada': 'GND',
    'st vincent': 'SVD',
    'saint vincent': 'SVD',
    'dominica': 'DOM',
    'martinique': 'FDF',
    'guadeloupe': 'PTP',
    'cayman islands': 'GCM',
    'grand cayman': 'GCM',
    'turks and caicos': 'PLS',
    'providenciales': 'PLS',
    'bermuda': 'BDA',
    'tortola': 'EIS',
    'virgin gorda': 'VIJ',
    'anguilla': 'AXA',
    'st barthelemy': 'SBH',
    'st barts': 'SBH',
    'saint barthelemy': 'SBH',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── South America ──
    // ══════════════════════════════════════════════════════════════════════
  
    // Brazil
    'sao paulo': 'SAO',
    'são paulo': 'SAO',
    'guarulhos': 'GRU',
    'congonhas': 'CGH',
    'rio de janeiro': 'RIO',
    'galeao': 'GIG',
    'galeão': 'GIG',
    'santos dumont': 'SDU',
    'brasilia': 'BSB',
    'brasília': 'BSB',
    'belo horizonte': 'BHZ',
    'confins': 'CNF',
    'salvador': 'SSA',
    'recife': 'REC',
    'fortaleza': 'FOR',
    'curitiba': 'CWB',
    'porto alegre': 'POA',
    'manaus': 'MAO',
    'belem': 'BEL',
    'belém': 'BEL',
    'florianopolis': 'FLN',
    'florianópolis': 'FLN',
    'natal': 'NAT',
    'goiania': 'GYN',
    'goiânia': 'GYN',
    'campinas': 'VCP',
    'vitoria': 'VIX',
    'vitória': 'VIX',
    'maceio': 'MCZ',
    'maceió': 'MCZ',
    'joao pessoa': 'JPA',
    'joão pessoa': 'JPA',
    'sao luis': 'SLZ',
    'são luis': 'SLZ',
    'campo grande': 'CGR',
    'cuiaba': 'CGB',
    'cuiabá': 'CGB',
    'teresina': 'THE',
    'aracaju': 'AJU',
    'porto velho': 'PVH',
    'rio branco': 'RBR',
    'macapa': 'MCP',
    'macapá': 'MCP',
    'boa vista': 'BVB',
    'palmas': 'PMW',
    'foz do iguacu': 'IGU',
    'foz do iguaçu': 'IGU',
    'fernando de noronha': 'FEN',
    'navegantes': 'NVT',
    'londrina': 'LDB',
    'maringa': 'MGF',
    'maringá': 'MGF',
    'uberlandia': 'UDI',
    'uberlândia': 'UDI',
    'petrolina': 'PNZ',
    'ilheus': 'IOS',
    'ilhéus': 'IOS',
    'porto seguro': 'BPS',
  
    // Argentina
    'buenos aires': 'BUE',
    'ezeiza': 'EZE',
    'aeroparque': 'AEP',
    'cordoba': 'COR',
    'córdoba': 'COR',
    'mendoza': 'MDZ',
    'bariloche': 'BRC',
    'san carlos de bariloche': 'BRC',
    'rosario': 'ROS',
    'salta': 'SLA',
    'tucuman': 'TUC',
    'tucumán': 'TUC',
    'ushuaia': 'USH',
    'el calafate': 'FTE',
    'iguazu': 'IGR',
    'iguazú': 'IGR',
    'mar del plata': 'MDQ',
    'neuquen': 'NQN',
    'neuquén': 'NQN',
    'comodoro rivadavia': 'CRD',
    'resistencia': 'RES',
    'posadas': 'PSS',
    'san juan': 'UAQ',
    'santiago del estero': 'SDE',
    'san luis': 'LUQ',
    'rio gallegos': 'RGL',
    'trelew': 'REL',
    'jujuy': 'JUJ',
    'catamarca': 'CTC',
    'corrientes': 'CNQ',
    'formosa': 'FMA',
    'la rioja': 'IRJ',
    'rio grande': 'RGA',
    'puerto madryn': 'PMY',
  
    // Chile
    'santiago': 'SCL',
    'valparaiso': 'SCL',
    'viña del mar': 'SCL',
    'concepcion': 'CCP',
    'concepción': 'CCP',
    'temuco': 'ZCO',
    'puerto montt': 'PMC',
    'punta arenas': 'PUQ',
    'antofagasta': 'ANF',
    'iquique': 'IQQ',
    'la serena': 'LSC',
    'calama': 'CJC',
    'arica': 'ARI',
    'copiapo': 'CPO',
    'copiapó': 'CPO',
    'valdivia': 'ZAL',
    'osorno': 'ZOS',
    'balmaceda': 'BBA',
    'easter island': 'IPC',
    'isla de pascua': 'IPC',
  
    // Colombia
    'bogota': 'BOG',
    'bogotá': 'BOG',
    'medellin': 'MDE',
    'medellín': 'MDE',
    'cali': 'CLO',
    'cartagena': 'CTG',
    'barranquilla': 'BAQ',
    'san andres': 'ADZ',
    'san andrés': 'ADZ',
    'bucaramanga': 'BGA',
    'pereira': 'PEI',
    'santa marta': 'SMR',
    'cucuta': 'CUC',
    'cúcuta': 'CUC',
    'armenia': 'AXM',
    'leticia': 'LET',
    'manizales': 'MZL',
    'neiva': 'NVA',
    'ibague': 'IBE',
    'ibagué': 'IBE',
    'pasto': 'PSO',
    'monteria': 'MTR',
    'montería': 'MTR',
    'valledupar': 'VUP',
    'villavicencio': 'VVC',
    'riohacha': 'RCH',
  
    // Peru
    'lima': 'LIM',
    'cusco': 'CUZ',
    'cuzco': 'CUZ',
    'arequipa': 'AQP',
    'trujillo': 'TRU',
    'iquitos': 'IQT',
    'piura': 'PIU',
    'chiclayo': 'CIX',
    'juliaca': 'JUL',
    'pucallpa': 'PCL',
    'tarapoto': 'TPP',
    'tacna': 'TCQ',
    'ayacucho': 'AYP',
    'cajamarca': 'CJA',
    'puerto maldonado': 'PEM',
    'huancayo': 'JAU',
    'tumbes': 'TBP',
  
    // Ecuador
    'quito': 'UIO',
    'guayaquil': 'GYE',
    'cuenca': 'CUE',
    'galapagos': 'GPS',
    'galápagos': 'GPS',
    'baltra': 'GPS',
    'san cristobal': 'SCY',
    'manta': 'MEC',
    'coca': 'OCC',
    'loja': 'LOH',
    'esmeraldas': 'ESM',
  
    // Venezuela
    'caracas': 'CCS',
    'maracaibo': 'MAR',
    'valencia': 'VLN',
    'barquisimeto': 'BRM',
    'porlamar': 'PMV',
    'margarita island': 'PMV',
    'puerto ordaz': 'PZO',
    'merida': 'MRD',
    'mérida': 'MRD',
    'barcelona': 'BLA',
    'san antonio del tachira': 'STD',
    'maturin': 'MUN',
    'maturín': 'MUN',
  
    // Bolivia
    'la paz': 'LPB',
    'santa cruz': 'VVI',
    'cochabamba': 'CBB',
    'sucre': 'SRE',
    'tarija': 'TJA',
    'trinidad': 'TDD',
    'uyuni': 'UYU',
  
    // Paraguay
    'asuncion': 'ASU',
    'asunción': 'ASU',
    'ciudad del este': 'AGT',
  
    // Uruguay
    'montevideo': 'MVD',
    'punta del este': 'PDP',
  
    // Guyana / Suriname / French Guiana
    'georgetown': 'GEO',
    'paramaribo': 'PBM',
    'cayenne': 'CAY',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Europe: United Kingdom & Ireland ──
    // ══════════════════════════════════════════════════════════════════════
  
    'london': 'LON',
    'heathrow': 'LHR',
    'gatwick': 'LGW',
    'stansted': 'STN',
    'luton': 'LTN',
    'london city': 'LCY',
    'southend': 'SEN',
    'manchester': 'MAN',
    'edinburgh': 'EDI',
    'glasgow': 'GLA',
    'birmingham': 'BHX',
    'bristol': 'BRS',
    'liverpool': 'LPL',
    'newcastle': 'NCL',
    'leeds': 'LBA',
    'belfast': 'BFS',
    'belfast city': 'BHD',
    'cardiff': 'CWL',
    'aberdeen': 'ABZ',
    'southampton': 'SOU',
    'east midlands': 'EMA',
    'nottingham': 'EMA',
    'exeter': 'EXT',
    'bournemouth': 'BOH',
    'inverness': 'INV',
    'isle of man': 'IOM',
    'jersey': 'JER',
    'guernsey': 'GCI',
    'newquay': 'NQY',
    'dundee': 'DND',
    'norwich': 'NWI',
    'doncaster': 'DSA',
  
    'dublin': 'DUB',
    'cork': 'ORK',
    'shannon': 'SNN',
    'knock': 'NOC',
    'kerry': 'KIR',
    'donegal': 'CFN',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Europe: Western Europe ──
    // ══════════════════════════════════════════════════════════════════════
  
    // France
    'paris': 'PAR',
    'charles de gaulle': 'CDG',
    'orly': 'ORY',
    'beauvais': 'BVA',
    'nice': 'NCE',
    'lyon': 'LYS',
    'marseille': 'MRS',
    'toulouse': 'TLS',
    'bordeaux': 'BOD',
    'nantes': 'NTE',
    'strasbourg': 'SXB',
    'lille': 'LIL',
    'montpellier': 'MPL',
    'rennes': 'RNS',
    'ajaccio': 'AJA',
    'bastia': 'BIA',
    'biarritz': 'BIQ',
    'calvi': 'CLY',
    'figari': 'FSC',
    'perpignan': 'PGF',
    'pau': 'PUF',
    'clermont-ferrand': 'CFE',
    'toulon': 'TLN',
    'grenoble': 'GNB',
    'brest': 'BES',
    'limoges': 'LIG',
    'poitiers': 'PIS',
    'la rochelle': 'LRH',
    'bergerac': 'EGC',
    'carcassonne': 'CCF',
    'dinard': 'DNR',
    'lourdes': 'LDE',
    'tarbes': 'LDE',
    'rodez': 'RDZ',
    'tours': 'TUF',
    'angers': 'ANE',
    'avignon': 'AVN',
    'beziers': 'BZR',
    'caen': 'CFR',
    'chambery': 'CMF',
    'deauville': 'DOL',
    'dole': 'DLE',
  
    // Germany
    'berlin': 'BER',
    'munich': 'MUC',
    'münchen': 'MUC',
    'frankfurt': 'FRA',
    'hamburg': 'HAM',
    'dusseldorf': 'DUS',
    'düsseldorf': 'DUS',
    'cologne': 'CGN',
    'köln': 'CGN',
    'stuttgart': 'STR',
    'hannover': 'HAJ',
    'nuremberg': 'NUE',
    'nürnberg': 'NUE',
    'leipzig': 'LEJ',
    'dresden': 'DRS',
    'bremen': 'BRE',
    'dortmund': 'DTM',
    'munster': 'FMO',
    'münster': 'FMO',
    'paderborn': 'PAD',
    'karlsruhe': 'FKB',
    'baden-baden': 'FKB',
    'friedrichshafen': 'FDH',
    'memmingen': 'FMM',
    'weeze': 'NRN',
    'rostock': 'RLG',
    'saarbrucken': 'SCN',
    'saarbrücken': 'SCN',
    'erfurt': 'ERF',
  
    // Netherlands
    'amsterdam': 'AMS',
    'eindhoven': 'EIN',
    'rotterdam': 'RTM',
    'the hague': 'RTM',
    'maastricht': 'MST',
    'groningen': 'GRQ',
  
    // Belgium
    'brussels': 'BRU',
    'bruxelles': 'BRU',
    'charleroi': 'CRL',
    'antwerp': 'ANR',
    'liege': 'LGG',
    'liège': 'LGG',
  
    // Luxembourg
    'luxembourg': 'LUX',
  
    // Switzerland
    'zurich': 'ZRH',
    'zürich': 'ZRH',
    'geneva': 'GVA',
    'geneve': 'GVA',
    'genève': 'GVA',
    'basel': 'BSL',
    'bern': 'BRN',
    'lugano': 'LUG',
    'sion': 'SIR',
    'st gallen': 'ACH',
  
    // Austria
    'vienna': 'VIE',
    'wien': 'VIE',
    'salzburg': 'SZG',
    'innsbruck': 'INN',
    'graz': 'GRZ',
    'linz': 'LNZ',
    'klagenfurt': 'KLU',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Europe: Southern Europe ──
    // ══════════════════════════════════════════════════════════════════════
  
    // Spain
    'madrid': 'MAD',
    'barcelona': 'BCN',
    'malaga': 'AGP',
    'málaga': 'AGP',
    'palma de mallorca': 'PMI',
    'palma': 'PMI',
    'mallorca': 'PMI',
    'majorca': 'PMI',
    'ibiza': 'IBZ',
    'menorca': 'MAH',
    'seville': 'SVQ',
    'sevilla': 'SVQ',
    'valencia': 'VLC',
    'alicante': 'ALC',
    'bilbao': 'BIO',
    'tenerife': 'TFS',
    'tenerife south': 'TFS',
    'tenerife north': 'TFN',
    'gran canaria': 'LPA',
    'las palmas': 'LPA',
    'lanzarote': 'ACE',
    'fuerteventura': 'FUE',
    'la palma': 'SPC',
    'granada': 'GRX',
    'santiago de compostela': 'SCQ',
    'asturias': 'OVD',
    'oviedo': 'OVD',
    'gijon': 'OVD',
    'gijón': 'OVD',
    'santander': 'SDR',
    'zaragoza': 'ZAZ',
    'murcia': 'RMU',
    'jerez': 'XRY',
    'almeria': 'LEI',
    'almería': 'LEI',
    'vigo': 'VGO',
    'a coruna': 'LCG',
    'la coruña': 'LCG',
    'pamplona': 'PNA',
    'san sebastian': 'EAS',
    'san sebastián': 'EAS',
    'reus': 'REU',
    'leon': 'LEN',
    'valladolid': 'VLL',
    'badajoz': 'BJZ',
    'logrono': 'RJL',
    'logroño': 'RJL',
    'girona': 'GRO',
    'salamanca': 'SLM',
  
    // Portugal
    'lisbon': 'LIS',
    'lisboa': 'LIS',
    'porto': 'OPO',
    'faro': 'FAO',
    'funchal': 'FNC',
    'madeira': 'FNC',
    'ponta delgada': 'PDL',
    'azores': 'PDL',
    'terceira': 'TER',
    'horta': 'HOR',
  
    // Italy
    'rome': 'ROM',
    'roma': 'ROM',
    'fiumicino': 'FCO',
    'ciampino': 'CIA',
    'milan': 'MIL',
    'milano': 'MIL',
    'malpensa': 'MXP',
    'linate': 'LIN',
    'bergamo': 'BGY',
    'venice': 'VCE',
    'venezia': 'VCE',
    'treviso': 'TSF',
    'florence': 'FLR',
    'firenze': 'FLR',
    'naples': 'NAP',
    'napoli': 'NAP',
    'turin': 'TRN',
    'torino': 'TRN',
    'bologna': 'BLQ',
    'catania': 'CTA',
    'palermo': 'PMO',
    'pisa': 'PSA',
    'bari': 'BRI',
    'cagliari': 'CAG',
    'genoa': 'GOA',
    'genova': 'GOA',
    'verona': 'VRN',
    'olbia': 'OLB',
    'alghero': 'AHO',
    'brindisi': 'BDS',
    'lamezia terme': 'SUF',
    'reggio calabria': 'REG',
    'pescara': 'PSR',
    'trapani': 'TPS',
    'perugia': 'PEG',
    'ancona': 'AOI',
    'trieste': 'TRS',
    'rimini': 'RMI',
    'comiso': 'CIY',
    'parma': 'PMF',
    'lampedusa': 'LMP',
    'pantelleria': 'PNL',
  
    // Greece
    'athens': 'ATH',
    'thessaloniki': 'SKG',
    'heraklion': 'HER',
    'crete': 'HER',
    'chania': 'CHQ',
    'mykonos': 'JMK',
    'santorini': 'JTR',
    'thira': 'JTR',
    'rhodes': 'RHO',
    'corfu': 'CFU',
    'kos': 'KGS',
    'zakynthos': 'ZTH',
    'zante': 'ZTH',
    'kalamata': 'KLX',
    'kefalonia': 'EFL',
    'lefkada': 'PVK',
    'preveza': 'PVK',
    'samos': 'SMI',
    'skiathos': 'JSI',
    'lesbos': 'MJT',
    'mytilene': 'MJT',
    'karpathos': 'AOK',
    'milos': 'MLO',
    'naxos': 'JNX',
    'paros': 'PAS',
    'ikaria': 'JIK',
    'leros': 'LRS',
    'limnos': 'LXS',
    'chios': 'JKH',
    'volos': 'VOL',
    'ioannina': 'IOA',
    'kavala': 'KVA',
    'alexandroupolis': 'AXD',
  
    // Turkey
    'istanbul': 'IST',
    'istanbul airport': 'IST',
    'sabiha gokcen': 'SAW',
    'ankara': 'ESB',
    'antalya': 'AYT',
    'izmir': 'ADB',
    'bodrum': 'BJV',
    'dalaman': 'DLM',
    'trabzon': 'TZX',
    'adana': 'ADA',
    'gaziantep': 'GZT',
    'kayseri': 'ASR',
    'cappadocia': 'ASR',
    'konya': 'KYA',
    'samsun': 'SZF',
    'diyarbakir': 'DIY',
    'diyarbakır': 'DIY',
    'van': 'VAN',
    'erzurum': 'ERZ',
    'hatay': 'HTY',
    'denizli': 'DNZ',
    'mugla': 'DLM',
    'nevsehir': 'NAV',
    'nevşehir': 'NAV',
    'malatya': 'MLX',
    'elazig': 'EZS',
    'elazığ': 'EZS',
    'mardin': 'MQM',
    'sanliurfa': 'SFQ',
    'şanlıurfa': 'SFQ',
    'batman': 'BAL',
    'bursa': 'YEI',
  
    // Croatia
    'zagreb': 'ZAG',
    'dubrovnik': 'DBV',
    'split': 'SPU',
    'zadar': 'ZAD',
    'pula': 'PUY',
    'rijeka': 'RJK',
    'osijek': 'OSI',
    'brac': 'BWK',
  
    // Malta
    'malta': 'MLA',
    'valletta': 'MLA',
  
    // Cyprus
    'larnaca': 'LCA',
    'paphos': 'PFO',
    'nicosia': 'LCA',
    'ercan': 'ECN',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Europe: Northern Europe ──
    // ══════════════════════════════════════════════════════════════════════
  
    // Scandinavia
    'stockholm': 'STO',
    'arlanda': 'ARN',
    'skavsta': 'NYO',
    'bromma': 'BMA',
    'gothenburg': 'GOT',
    'göteborg': 'GOT',
    'malmo': 'MMX',
    'malmö': 'MMX',
    'luleå': 'LLA',
    'lulea': 'LLA',
    'umea': 'UME',
    'umeå': 'UME',
    'kiruna': 'KRN',
    'visby': 'VBY',
    'linkoping': 'LPI',
    'linköping': 'LPI',
    'kalmar': 'KLR',
    'vaxjo': 'VXO',
    'växjö': 'VXO',
    'sundsvall': 'SDL',
    'ostersund': 'OSD',
    'östersund': 'OSD',
    'karlstad': 'KSD',
  
    'copenhagen': 'CPH',
    'kobenhavn': 'CPH',
    'københavn': 'CPH',
    'aarhus': 'AAR',
    'billund': 'BLL',
    'aalborg': 'AAL',
  
    'oslo': 'OSL',
    'gardermoen': 'OSL',
    'bergen': 'BGO',
    'trondheim': 'TRD',
    'stavanger': 'SVG',
    'tromso': 'TOS',
    'tromsø': 'TOS',
    'bodo': 'BOO',
    'bodø': 'BOO',
    'alesund': 'AES',
    'ålesund': 'AES',
    'kristiansand': 'KRS',
    'haugesund': 'HAU',
    'molde': 'MOL',
    'harstad': 'EVE',
    'narvik': 'EVE',
    'kirkenes': 'KKN',
    'hammerfest': 'HFT',
    'longyearbyen': 'LYR',
    'svalbard': 'LYR',
  
    'helsinki': 'HEL',
    'oulu': 'OUL',
    'tampere': 'TMP',
    'turku': 'TKU',
    'rovaniemi': 'RVN',
    'ivalo': 'IVL',
    'kittila': 'KTT',
    'kuopio': 'KUO',
    'vaasa': 'VAA',
    'joensuu': 'JOE',
    'jyvaskyla': 'JYV',
    'jyväskylä': 'JYV',
    'kajaani': 'KAJ',
    'mariehamn': 'MHQ',
    'enontekio': 'ENF',
  
    'reykjavik': 'REK',
    'reykjavík': 'REK',
    'keflavik': 'KEF',
    'keflavík': 'KEF',
    'akureyri': 'AEY',
    'egilsstadir': 'EGS',
    'egilsstaðir': 'EGS',
    'isafjordur': 'IFJ',
    'ísafjörður': 'IFJ',
  
    // Baltic States
    'tallinn': 'TLL',
    'tartu': 'TAY',
    'riga': 'RIX',
    'vilnius': 'VNO',
    'kaunas': 'KUN',
    'palanga': 'PLQ',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Europe: Eastern Europe ──
    // ══════════════════════════════════════════════════════════════════════
  
    // Poland
    'warsaw': 'WAW',
    'warszawa': 'WAW',
    'krakow': 'KRK',
    'kraków': 'KRK',
    'gdansk': 'GDN',
    'gdańsk': 'GDN',
    'wroclaw': 'WRO',
    'wrocław': 'WRO',
    'poznan': 'POZ',
    'poznań': 'POZ',
    'katowice': 'KTW',
    'lodz': 'LCJ',
    'łódź': 'LCJ',
    'rzeszow': 'RZE',
    'rzeszów': 'RZE',
    'szczecin': 'SZZ',
    'bydgoszcz': 'BZG',
    'lublin': 'LUZ',
    'olsztyn': 'SZY',
    'zielona gora': 'IEG',
  
    // Czech Republic
    'prague': 'PRG',
    'praha': 'PRG',
    'brno': 'BRQ',
    'ostrava': 'OSR',
    'karlovy vary': 'KLV',
    'pardubice': 'PED',
  
    // Slovakia
    'bratislava': 'BTS',
    'kosice': 'KSC',
    'košice': 'KSC',
  
    // Hungary
    'budapest': 'BUD',
    'debrecen': 'DEB',
  
    // Romania
    'bucharest': 'BUH',
    'bucuresti': 'BUH',
    'bucureşti': 'BUH',
    'otopeni': 'OTP',
    'cluj-napoca': 'CLJ',
    'cluj': 'CLJ',
    'timisoara': 'TSR',
    'timişoara': 'TSR',
    'iasi': 'IAS',
    'iaşi': 'IAS',
    'sibiu': 'SBZ',
    'craiova': 'CRA',
    'constanta': 'CND',
    'constanța': 'CND',
    'suceava': 'SCV',
    'bacau': 'BCM',
    'bacău': 'BCM',
    'oradea': 'OMR',
    'targu mures': 'TGM',
    'târgu mureş': 'TGM',
    'baia mare': 'BAY',
    'satu mare': 'SUJ',
  
    // Bulgaria
    'sofia': 'SOF',
    'varna': 'VAR',
    'burgas': 'BOJ',
    'plovdiv': 'PDV',
  
    // Serbia
    'belgrade': 'BEG',
    'beograd': 'BEG',
    'nis': 'INI',
    'niš': 'INI',
  
    // Montenegro
    'podgorica': 'TGD',
    'tivat': 'TIV',
  
    // Bosnia & Herzegovina
    'sarajevo': 'SJJ',
    'mostar': 'OMO',
    'banja luka': 'BNX',
    'tuzla': 'TZL',
  
    // North Macedonia
    'skopje': 'SKP',
    'ohrid': 'OHD',
  
    // Albania
    'tirana': 'TIA',
    'tiranë': 'TIA',
  
    // Kosovo
    'pristina': 'PRN',
    'prishtina': 'PRN',
    'prishtinë': 'PRN',
  
    // Slovenia
    'ljubljana': 'LJU',
  
    // Moldova
    'chisinau': 'KIV',
    'chişinău': 'KIV',
  
    // Ukraine
    'kyiv': 'IEV',
    'kiev': 'IEV',
    'boryspil': 'KBP',
    'lviv': 'LWO',
    'odessa': 'ODS',
    'odesa': 'ODS',
    'kharkiv': 'HRK',
    'dnipro': 'DNK',
    'zaporizhzhia': 'OZH',
  
    // Belarus
    'minsk': 'MSQ',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Asia: East Asia ──
    // ══════════════════════════════════════════════════════════════════════
  
    // Japan
    'tokyo': 'TYO',
    'narita': 'NRT',
    'haneda': 'HND',
    'osaka': 'OSA',
    'kansai': 'KIX',
    'itami': 'ITM',
    'nagoya': 'NGO',
    'chubu': 'NGO',
    'fukuoka': 'FUK',
    'sapporo': 'SPK',
    'new chitose': 'CTS',
    'chitose': 'CTS',
    'naha': 'OKA',
    'okinawa': 'OKA',
    'sendai': 'SDJ',
    'hiroshima': 'HIJ',
    'kobe': 'UKB',
    'kagoshima': 'KOJ',
    'kumamoto': 'KMJ',
    'matsuyama': 'MYJ',
    'nagasaki': 'NGS',
    'takamatsu': 'TAK',
    'oita': 'OIT',
    'niigata': 'KIJ',
    'okayama': 'OKJ',
    'miyazaki': 'KMI',
    'kochi': 'KCZ',
    'tokushima': 'TKS',
    'ishigaki': 'ISG',
    'miyako': 'MMY',
    'hakodate': 'HKD',
    'asahikawa': 'AKJ',
    'obihiro': 'OBO',
    'kushiro': 'KUH',
    'memanbetsu': 'MMB',
    'kitakyushu': 'KKJ',
    'shizuoka': 'FSZ',
    'matsumoto': 'MMJ',
    'toyama': 'TOY',
    'komatsu': 'KMQ',
    'kanazawa': 'KMQ',
    'akita': 'AXT',
    'aomori': 'AOJ',
    'yamagata': 'GAJ',
    'izumo': 'IZO',
    'tottori': 'TTJ',
  
    // South Korea
    'seoul': 'SEL',
    'incheon': 'ICN',
    'gimpo': 'GMP',
    'busan': 'PUS',
    'jeju': 'CJU',
    'daegu': 'TAE',
    'gwangju': 'KWJ',
    'cheongju': 'CJJ',
    'yangyang': 'YNY',
    'ulsan': 'USN',
    'yeosu': 'RSU',
    'muan': 'MWX',
    'wonju': 'WJU',
    'jinju': 'HIN',
    'sacheon': 'HIN',
    'gunsan': 'KUV',
    'pohang': 'KPO',
  
    // China
    'beijing': 'BJS',
    'capital airport': 'PEK',
    'daxing': 'PKX',
    'shanghai': 'SHA',
    'pudong': 'PVG',
    'hongqiao': 'SHA',
    'guangzhou': 'CAN',
    'shenzhen': 'SZX',
    'chengdu': 'CTU',
    'tianfu': 'TFU',
    'hangzhou': 'HGH',
    'chongqing': 'CKG',
    'wuhan': 'WUH',
    'xian': 'XIY',
    "xi'an": 'XIY',
    'nanjing': 'NKG',
    'kunming': 'KMG',
    'xiamen': 'XMN',
    'dalian': 'DLC',
    'qingdao': 'TAO',
    'shenyang': 'SHE',
    'tianjin': 'TSN',
    'changsha': 'CSX',
    'harbin': 'HRB',
    'zhengzhou': 'CGO',
    'urumqi': 'URC',
    'ürümqi': 'URC',
    'fuzhou': 'FOC',
    'haikou': 'HAK',
    'sanya': 'SYX',
    'guiyang': 'KWE',
    'nanning': 'NNG',
    'jinan': 'TNA',
    'hefei': 'HFE',
    'changchun': 'CGQ',
    'nanchang': 'KHN',
    'wenzhou': 'WNZ',
    'taiyuan': 'TYN',
    'lhasa': 'LXA',
    'lanzhou': 'LHW',
    'hohhot': 'HET',
    'yinchuan': 'INC',
    'xining': 'XNN',
    'guilin': 'KWL',
    'ningbo': 'NGB',
    'wuxi': 'WUX',
    'zhuhai': 'ZUH',
    'lijiang': 'LJG',
    'luoyang': 'LYA',
    'zhangjiajie': 'DYG',
    'dunhuang': 'DNH',
    'jiuzhaigou': 'JZH',
    'huangshan': 'TXN',
    'yichang': 'YIH',
    'dali': 'DLU',
    'lasa': 'LXA',
    'suzhou': 'SZV',
    'xuzhou': 'XUZ',
    'tangshan': 'TVS',
    'yantai': 'YNT',
    'changzhou': 'CZX',
    'shijiazhuang': 'SJW',
    'baotou': 'BAV',
  
    // Hong Kong
    'hong kong': 'HKG',
  
    // Macau
    'macau': 'MFM',
    'macao': 'MFM',
  
    // Taiwan
    'taipei': 'TPE',
    'taoyuan': 'TPE',
    'songshan': 'TSA',
    'kaohsiung': 'KHH',
    'taichung': 'RMQ',
    'tainan': 'TNN',
    'hualien': 'HUN',
    'taitung': 'TTT',
    'kinmen': 'KNH',
    'penghu': 'MZG',
    'magong': 'MZG',
  
    // Mongolia
    'ulaanbaatar': 'UBN',
    'ulan bator': 'UBN',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Asia: Southeast Asia ──
    // ══════════════════════════════════════════════════════════════════════
  
    // Thailand
    'bangkok': 'BKK',
    'suvarnabhumi': 'BKK',
    'don mueang': 'DMK',
    'don muang': 'DMK',
    'chiang mai': 'CNX',
    'phuket': 'HKT',
    'krabi': 'KBV',
    'koh samui': 'USM',
    'samui': 'USM',
    'hat yai': 'HDY',
    'chiang rai': 'CEI',
    'udon thani': 'UTH',
    'surat thani': 'URT',
    'ubon ratchathani': 'UBP',
    'khon kaen': 'KKC',
    'nakhon si thammarat': 'NST',
    'pattaya': 'UTP',
    'u-tapao': 'UTP',
    'sukhothai': 'THS',
    'lampang': 'LPT',
    'nakhon ratchasima': 'NAK',
    'trang': 'TST',
    'nan': 'NNT',
    'loei': 'LOE',
    'ranong': 'UNN',
  
    // Vietnam
    'hanoi': 'HAN',
    'ha noi': 'HAN',
    'ho chi minh city': 'SGN',
    'saigon': 'SGN',
    'da nang': 'DAD',
    'danang': 'DAD',
    'nha trang': 'CXR',
    'cam ranh': 'CXR',
    'phu quoc': 'PQC',
    'hue': 'HUI',
    'huế': 'HUI',
    'hai phong': 'HPH',
    'da lat': 'DLI',
    'dalat': 'DLI',
    'can tho': 'VCA',
    'quy nhon': 'UIH',
    'vinh': 'VII',
    'buon ma thuot': 'BMV',
    'con dao': 'VCS',
    'dong hoi': 'VDH',
    'pleiku': 'PXU',
    'rach gia': 'VKG',
    'thanh hoa': 'THD',
    'tuy hoa': 'TBB',
  
    // Singapore
    'singapore': 'SIN',
    'changi': 'SIN',
  
    // Malaysia
    'kuala lumpur': 'KUL',
    'kl': 'KUL',
    'penang': 'PEN',
    'george town': 'PEN',
    'langkawi': 'LGK',
    'kota kinabalu': 'BKI',
    'kuching': 'KCH',
    'johor bahru': 'JHB',
    'kota bharu': 'KBR',
    'kuantan': 'KUA',
    'malacca': 'MKZ',
    'melaka': 'MKZ',
    'ipoh': 'IPH',
    'alor setar': 'AOR',
    'miri': 'MYY',
    'sibu': 'SBW',
    'sandakan': 'SDK',
    'tawau': 'TWU',
    'bintulu': 'BTU',
    'labuan': 'LBU',
    'terengganu': 'TGG',
    'kuala terengganu': 'TGG',
    'subang': 'SZB',
  
    // Indonesia
    'jakarta': 'JKT',
    'soekarno-hatta': 'CGK',
    'halim': 'HLP',
    'bali': 'DPS',
    'denpasar': 'DPS',
    'surabaya': 'SUB',
    'yogyakarta': 'JOG',
    'jogjakarta': 'JOG',
    'medan': 'KNO',
    'makassar': 'UPG',
    'balikpapan': 'BPN',
    'manado': 'MDC',
    'semarang': 'SRG',
    'bandung': 'BDO',
    'lombok': 'LOP',
    'palembang': 'PLM',
    'padang': 'PDG',
    'pekanbaru': 'PKU',
    'pontianak': 'PNK',
    'banjarmasin': 'BDJ',
    'solo': 'SOC',
    'surakarta': 'SOC',
    'kupang': 'KOE',
    'ambon': 'AMQ',
    'jayapura': 'DJJ',
    'sorong': 'SOQ',
    'labuan bajo': 'LBJ',
    'komodo': 'LBJ',
    'pangkal pinang': 'PGK',
    'batam': 'BTH',
    'bintan': 'TNJ',
    'tanjung pinang': 'TNJ',
    'jambi': 'DJB',
    'bengkulu': 'BKS',
    'lampung': 'TKG',
    'kendari': 'KDI',
    'palu': 'PLW',
    'gorontalo': 'GTO',
    'ternate': 'TTE',
  
    // Philippines
    'manila': 'MNL',
    'cebu': 'CEB',
    'davao': 'DVO',
    'clark': 'CRK',
    'boracay': 'MPH',
    'caticlan': 'MPH',
    'kalibo': 'KLO',
    'iloilo': 'ILO',
    'puerto princesa': 'PPS',
    'palawan': 'PPS',
    'bacolod': 'BCD',
    'cagayan de oro': 'CGY',
    'zamboanga': 'ZAM',
    'tacloban': 'TAC',
    'general santos': 'GES',
    'siargao': 'IAO',
    'dumaguete': 'DGT',
    'butuan': 'BXU',
    'cotabato': 'CBO',
    'tagbilaran': 'TAG',
    'bohol': 'TAG',
    'laoag': 'LAO',
    'legazpi': 'LGP',
    'roxas': 'RXS',
    'busuanga': 'USU',
    'coron': 'USU',
    'el nido': 'ENI',
  
    // Myanmar
    'yangon': 'RGN',
    'rangoon': 'RGN',
    'mandalay': 'MDL',
    'bagan': 'NYU',
    'nyaung u': 'NYU',
    'nay pyi taw': 'NYT',
    'naypyidaw': 'NYT',
    'heho': 'HEH',
    'inle lake': 'HEH',
  
    // Cambodia
    'phnom penh': 'PNH',
    'siem reap': 'REP',
    'sihanoukville': 'KOS',
  
    // Laos
    'vientiane': 'VTE',
    'luang prabang': 'LPQ',
  
    // Brunei
    'bandar seri begawan': 'BWN',
    'brunei': 'BWN',
  
    // Timor-Leste
    'dili': 'DIL',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Asia: South Asia ──
    // ══════════════════════════════════════════════════════════════════════
  
    // India
    'delhi': 'DEL',
    'new delhi': 'DEL',
    'mumbai': 'BOM',
    'bombay': 'BOM',
    'bangalore': 'BLR',
    'bengaluru': 'BLR',
    'chennai': 'MAA',
    'madras': 'MAA',
    'kolkata': 'CCU',
    'calcutta': 'CCU',
    'hyderabad': 'HYD',
    'ahmedabad': 'AMD',
    'pune': 'PNQ',
    'kochi': 'COK',
    'cochin': 'COK',
    'goa': 'GOI',
    'dabolim': 'GOI',
    'mopa': 'GOX',
    'jaipur': 'JAI',
    'lucknow': 'LKO',
    'thiruvananthapuram': 'TRV',
    'trivandrum': 'TRV',
    'guwahati': 'GAU',
    'varanasi': 'VNS',
    'benares': 'VNS',
    'chandigarh': 'IXC',
    'amritsar': 'ATQ',
    'indore': 'IDR',
    'patna': 'PAT',
    'bhubaneswar': 'BBI',
    'nagpur': 'NAG',
    'coimbatore': 'CJB',
    'srinagar': 'SXR',
    'leh': 'IXL',
    'madurai': 'IXM',
    'mangalore': 'IXE',
    'mangaluru': 'IXE',
    'ranchi': 'IXR',
    'raipur': 'RPR',
    'visakhapatnam': 'VTZ',
    'vizag': 'VTZ',
    'udaipur': 'UDR',
    'jodhpur': 'JDH',
    'dehradun': 'DED',
    'imphal': 'IMF',
    'bagdogra': 'IXB',
    'siliguri': 'IXB',
    'darjeeling': 'IXB',
    'surat': 'STV',
    'vadodara': 'BDQ',
    'baroda': 'BDQ',
    'rajkot': 'RAJ',
    'bhopal': 'BHO',
    'jammu': 'IXJ',
    'port blair': 'IXZ',
    'andaman': 'IXZ',
    'agartala': 'IXA',
    'dibrugarh': 'DIB',
    'jorhat': 'JRH',
    'silchar': 'IXS',
    'allahabad': 'IXD',
    'prayagraj': 'IXD',
    'gorakhpur': 'GOP',
    'tirupati': 'TIR',
    'tiruchirappalli': 'TRZ',
    'trichy': 'TRZ',
    'calicut': 'CCJ',
    'kozhikode': 'CCJ',
    'aurangabad': 'IXU',
    'hubli': 'HBX',
    'belgaum': 'IXG',
    'belagavi': 'IXG',
    'dimapur': 'DMU',
    'tuticorin': 'TCR',
    'thoothukudi': 'TCR',
    'kannur': 'CNN',
    'bhuj': 'BHJ',
    'diu': 'DIU',
    'jamnagar': 'JGA',
    'porbandar': 'PBD',
    'jabalpur': 'JLR',
    'kolhapur': 'KLH',
    'dharamsala': 'DHM',
    'kangra': 'DHM',
    'kullu': 'KUU',
    'manali': 'KUU',
    'shimla': 'SLV',
  
    // Pakistan
    'karachi': 'KHI',
    'lahore': 'LHE',
    'islamabad': 'ISB',
    'peshawar': 'PEW',
    'quetta': 'UET',
    'faisalabad': 'LYP',
    'multan': 'MUX',
    'sialkot': 'SKT',
    'rawalpindi': 'ISB',
  
    // Bangladesh
    'dhaka': 'DAC',
    'chittagong': 'CGP',
    'chattogram': 'CGP',
    'sylhet': 'ZYL',
    "cox's bazar": 'CXB',
  
    // Sri Lanka
    'colombo': 'CMB',
    'mattala': 'HRI',
    'jaffna': 'JAF',
  
    // Nepal
    'kathmandu': 'KTM',
    'pokhara': 'PKR',
    'lumbini': 'BWA',
    'bhairahawa': 'BWA',
  
    // Maldives
    'male': 'MLE',
    'malé': 'MLE',
    'maldives': 'MLE',
  
    // Bhutan
    'paro': 'PBH',
    'thimphu': 'PBH',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Asia: Central Asia ──
    // ══════════════════════════════════════════════════════════════════════
  
    'almaty': 'ALA',
    'astana': 'NQZ',
    'nur-sultan': 'NQZ',
    'nur sultan': 'NQZ',
    'shymkent': 'CIT',
    'aktau': 'SCO',
    'atyrau': 'GUW',
    'karaganda': 'KGF',
    'tashkent': 'TAS',
    'samarkand': 'SKD',
    'bukhara': 'BHK',
    'urgench': 'UGC',
    'fergana': 'FEG',
    'namangan': 'NMA',
    'nukus': 'NCU',
    'navoi': 'NVI',
    'bishkek': 'FRU',
    'osh': 'OSS',
    'dushanbe': 'DYU',
    'khujand': 'LBD',
    'ashgabat': 'ASB',
    'turkmenabat': 'CRZ',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Middle East ──
    // ══════════════════════════════════════════════════════════════════════
  
    // UAE
    'dubai': 'DXB',
    'abu dhabi': 'AUH',
    'sharjah': 'SHJ',
    'ras al khaimah': 'RKT',
    'al ain': 'AAN',
  
    // Saudi Arabia
    'riyadh': 'RUH',
    'jeddah': 'JED',
    'jidda': 'JED',
    'dammam': 'DMM',
    'medina': 'MED',
    'madinah': 'MED',
    'mecca': 'JED',
    'makkah': 'JED',
    'abha': 'AHB',
    'tabuk': 'TUU',
    'taif': 'TIF',
    'ha\'il': 'HAS',
    'hail': 'HAS',
    'jazan': 'GIZ',
    'jizan': 'GIZ',
    'najran': 'EAM',
    'al baha': 'ABT',
    'yanbu': 'YNB',
    'al ula': 'ULH',
    'neom': 'NUM',
    'gassim': 'ELQ',
    'qassim': 'ELQ',
    'buraidah': 'ELQ',
    'al jouf': 'AJF',
    'arar': 'RAE',
  
    // Qatar
    'doha': 'DOH',
  
    // Bahrain
    'bahrain': 'BAH',
    'manama': 'BAH',
  
    // Kuwait
    'kuwait city': 'KWI',
    'kuwait': 'KWI',
  
    // Oman
    'muscat': 'MCT',
    'salalah': 'SLL',
    'duqm': 'DQM',
    'sohar': 'OHS',
  
    // Jordan
    'amman': 'AMM',
    'aqaba': 'AQJ',
  
    // Israel
    'tel aviv': 'TLV',
    'ben gurion': 'TLV',
    'eilat': 'ETM',
    'haifa': 'HFA',
    'ovda': 'VDA',
  
    // Lebanon
    'beirut': 'BEY',
    'beyrouth': 'BEY',
  
    // Iraq
    'baghdad': 'BGW',
    'erbil': 'EBL',
    'basra': 'BSR',
    'sulaymaniyah': 'ISU',
    'najaf': 'NJF',
  
    // Iran
    'tehran': 'THR',
    'isfahan': 'IFN',
    'esfahan': 'IFN',
    'shiraz': 'SYZ',
    'mashhad': 'MHD',
    'tabriz': 'TBZ',
    'ahvaz': 'AWZ',
    'kermanshah': 'KSH',
    'kish island': 'KIH',
    'bandar abbas': 'BND',
    'yazd': 'AZD',
    'kerman': 'KER',
    'rasht': 'RAS',
  
    // Yemen
    'sanaa': 'SAH',
    "sana'a": 'SAH',
    'aden': 'ADE',
  
    // Syria
    'damascus': 'DAM',
    'aleppo': 'ALP',
  
    // Palestine
    // (note: Ben Gurion serves this area)
  
    // Georgia (country)
    'tbilisi': 'TBS',
    'batumi': 'BUS',
    'kutaisi': 'KUT',
  
    // Armenia
    'yerevan': 'EVN',
    'gyumri': 'LWN',
  
    // Azerbaijan
    'baku': 'GYD',
    'ganja': 'KVD',
    'nakhchivan': 'NAJ',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Africa: North Africa ──
    // ══════════════════════════════════════════════════════════════════════
  
    // Egypt
    'cairo': 'CAI',
    'hurghada': 'HRG',
    'sharm el sheikh': 'SSH',
    'sharm el-sheikh': 'SSH',
    'luxor': 'LXR',
    'aswan': 'ASW',
    'alexandria': 'HBE',
    'borg el arab': 'HBE',
    'marsa alam': 'RMF',
    'taba': 'TCP',
  
    // Morocco
    'casablanca': 'CMN',
    'marrakech': 'RAK',
    'marrakesh': 'RAK',
    'fez': 'FEZ',
    'fès': 'FEZ',
    'tangier': 'TNG',
    'tanger': 'TNG',
    'agadir': 'AGA',
    'rabat': 'RBA',
    'oujda': 'OUD',
    'nador': 'NDR',
    'essaouira': 'ESU',
    'ouarzazate': 'OZZ',
    'errachidia': 'ERH',
    'al hoceima': 'AHU',
    'dakhla': 'VIL',
    'laayoune': 'EUN',
  
    // Tunisia
    'tunis': 'TUN',
    'monastir': 'MIR',
    'djerba': 'DJE',
    'enfidha': 'NBE',
    'sfax': 'SFA',
    'tozeur': 'TOE',
    'tabarka': 'TBJ',
  
    // Algeria
    'algiers': 'ALG',
    'alger': 'ALG',
    'oran': 'ORN',
    'constantine': 'CZL',
    'annaba': 'AAE',
    'tlemcen': 'TLM',
    'setif': 'QSF',
    'béjaïa': 'BJA',
    'bejaia': 'BJA',
    'batna': 'BLJ',
    'hassi messaoud': 'HME',
    'ghardaia': 'GHA',
    'biskra': 'BSK',
    'tamanrasset': 'TMR',
  
    // Libya
    'tripoli': 'TIP',
    'benghazi': 'BEN',
    'misrata': 'MRA',
    'sebha': 'SEB',
  
    // Sudan
    'khartoum': 'KRT',
    'port sudan': 'PZU',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Africa: West Africa ──
    // ══════════════════════════════════════════════════════════════════════
  
    'lagos': 'LOS',
    'abuja': 'ABV',
    'port harcourt': 'PHC',
    'kano': 'KAN',
    'enugu': 'ENU',
    'calabar': 'CBQ',
    'benin city': 'BNI',
    'kaduna': 'KAD',
    'owerri': 'QOW',
    'warri': 'QRW',
    'ilorin': 'ILR',
    'jos': 'JOS',
    'sokoto': 'SKO',
    'maiduguri': 'MIU',
    'yola': 'YOL',
    'uyo': 'QUO',
    'asaba': 'ABB',
  
    'accra': 'ACC',
    'kumasi': 'KMS',
    'tamale': 'TML',
  
    'dakar': 'DSS',
    'saint-louis': 'XLS',
    'ziguinchor': 'ZIG',
    'cap skirring': 'CSK',
  
    'abidjan': 'ABJ',
    'yamoussoukro': 'ASK',
  
    'bamako': 'BKO',
    'mopti': 'MZI',
    'timbuktu': 'TOM',
  
    'ouagadougou': 'OUA',
    'bobo-dioulasso': 'BOY',
  
    'niamey': 'NIM',
    'agadez': 'AJY',
  
    'conakry': 'CKY',
    'freetown': 'FNA',
    'monrovia': 'ROB',
    'banjul': 'BJL',
    'gambia': 'BJL',
    'bissau': 'OXB',
    'praia': 'RAI',
    'cape verde': 'RAI',
    'sal': 'SID',
    'boa vista': 'BVC',
    'sao vicente': 'VXE',
    'nouakchott': 'NKC',
    'lome': 'LFW',
    'lomé': 'LFW',
    'cotonou': 'COO',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Africa: East Africa ──
    // ══════════════════════════════════════════════════════════════════════
  
    'nairobi': 'NBO',
    'mombasa': 'MBA',
    'kisumu': 'KIS',
    'malindi': 'MYD',
    'lamu': 'LAU',
    'eldoret': 'EDL',
  
    'addis ababa': 'ADD',
    'dire dawa': 'DIR',
    'bahir dar': 'BJR',
    'lalibela': 'LLI',
  
    'dar es salaam': 'DAR',
    'kilimanjaro': 'JRO',
    'zanzibar': 'ZNZ',
    'arusha': 'JRO',
    'mwanza': 'MWZ',
    'dodoma': 'DOD',
  
    'entebbe': 'EBB',
    'kampala': 'EBB',
  
    'kigali': 'KGL',
  
    'bujumbura': 'BJM',
  
    'djibouti': 'JIB',
  
    'mogadishu': 'MGQ',
    'hargeisa': 'HGA',
  
    'asmara': 'ASM',
  
    'antananarivo': 'TNR',
    'nosy be': 'NOS',
    'toamasina': 'TMM',
  
    'port louis': 'MRU',
    'mauritius': 'MRU',
  
    'mahe': 'SEZ',
    'seychelles': 'SEZ',
  
    'moroni': 'HAH',
    'comoros': 'HAH',
  
    'reunion': 'RUN',
    'réunion': 'RUN',
    'saint-denis': 'RUN',
  
    'mayotte': 'DZA',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Africa: Central Africa ──
    // ══════════════════════════════════════════════════════════════════════
  
    'kinshasa': 'FIH',
    'lubumbashi': 'FBM',
    'goma': 'GOM',
    'kisangani': 'FKI',
    'mbuji-mayi': 'MJM',
  
    'douala': 'DLA',
    'yaounde': 'NSI',
    'yaoundé': 'NSI',
  
    'libreville': 'LBV',
    'port-gentil': 'POG',
  
    'brazzaville': 'BZV',
    'pointe-noire': 'PNR',
  
    'bangui': 'BGF',
    'ndjamena': 'NDJ',
    "n'djamena": 'NDJ',
    'malabo': 'SSG',
    'bata': 'BSG',
    'sao tome': 'TMS',
    'são tomé': 'TMS',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Africa: Southern Africa ──
    // ══════════════════════════════════════════════════════════════════════
  
    'johannesburg': 'JNB',
    'joburg': 'JNB',
    'or tambo': 'JNB',
    'cape town': 'CPT',
    'durban': 'DUR',
    'port elizabeth': 'PLZ',
    'gqeberha': 'PLZ',
    'east london': 'ELS',
    'bloemfontein': 'BFN',
    'george': 'GRJ',
    'nelspruit': 'MQP',
    'mpumalanga': 'MQP',
    'kruger': 'MQP',
    'pietermaritzburg': 'PZB',
    'polokwane': 'PTG',
    'kimberley': 'KIM',
    'upington': 'UTN',
    'lanseria': 'HLA',
    'skukuza': 'SZK',
    'richards bay': 'RCB',
    'hoedspruit': 'HDS',
  
    'windhoek': 'WDH',
    'walvis bay': 'WVB',
  
    'gaborone': 'GBE',
    'maun': 'MUB',
    'kasane': 'BBK',
  
    'harare': 'HRE',
    'bulawayo': 'BUQ',
    'victoria falls': 'VFA',
  
    'lusaka': 'LUN',
    'livingstone': 'LVI',
    'ndola': 'NLA',
  
    'lilongwe': 'LLW',
    'blantyre': 'BLZ',
  
    'maputo': 'MPM',
    'beira': 'BEW',
    'nampula': 'APL',
    'pemba': 'POL',
    'vilankulo': 'VNX',
    'inhambane': 'INH',
  
    'luanda': 'LAD',
    'lubango': 'SDD',
  
    'maseru': 'MSU',
    'mbabane': 'MTS',
    'manzini': 'MTS',
    'eswatini': 'MTS',
    'swaziland': 'MTS',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Oceania: Australia ──
    // ══════════════════════════════════════════════════════════════════════
  
    'sydney': 'SYD',
    'melbourne': 'MEL',
    'brisbane': 'BNE',
    'perth': 'PER',
    'adelaide': 'ADL',
    'gold coast': 'OOL',
    'coolangatta': 'OOL',
    'cairns': 'CNS',
    'canberra': 'CBR',
    'hobart': 'HBA',
    'darwin': 'DRW',
    'townsville': 'TSV',
    'launceston': 'LST',
    'alice springs': 'ASP',
    'ayers rock': 'AYQ',
    'uluru': 'AYQ',
    'mackay': 'MKY',
    'rockhampton': 'ROK',
    'sunshine coast': 'MCY',
    'maroochydore': 'MCY',
    'hamilton island': 'HTI',
    'whitsunday': 'HTI',
    'proserpine': 'PPP',
    'bundaberg': 'BDB',
    'hervey bay': 'HVB',
    'gladstone': 'GLT',
    'emerald': 'EMD',
    'longreach': 'LRE',
    'mount isa': 'ISA',
    'cloncurry': 'CNJ',
    'newman': 'ZNE',
    'karratha': 'KTA',
    'port hedland': 'PHE',
    'broome': 'BME',
    'kununurra': 'KNX',
    'geraldton': 'GET',
    'esperance': 'EPR',
    'kalgoorlie': 'KGI',
    'albany': 'ALH',
    'mildura': 'MQL',
    'dubbo': 'DBO',
    'tamworth': 'TMW',
    'armidale': 'ARM',
    'port macquarie': 'PQQ',
    'coffs harbour': 'CFS',
    'ballina': 'BNK',
    'byron bay': 'BNK',
    'lismore': 'LSY',
    'newcastle': 'NTL',
    'wagga wagga': 'WGA',
    'albury': 'ABX',
    'orange': 'OAG',
    'bathurst': 'BHS',
    'broken hill': 'BHQ',
    'devonport': 'DPO',
    'burnie': 'BWT',
    'avalon': 'AVV',
    'whyalla': 'WYA',
    'port lincoln': 'PLO',
    'ceduna': 'CED',
    'kangaroo island': 'KGC',
    'lord howe island': 'LDH',
    'norfolk island': 'NLK',
    'christmas island': 'XCH',
    'cocos island': 'CCK',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Oceania: New Zealand ──
    // ══════════════════════════════════════════════════════════════════════
  
    'auckland': 'AKL',
    'wellington': 'WLG',
    'christchurch': 'CHC',
    'queenstown': 'ZQN',
    'dunedin': 'DUD',
    'rotorua': 'ROT',
    'napier': 'NPE',
    'hawke\'s bay': 'NPE',
    'palmerston north': 'PMR',
    'hamilton': 'HLZ',
    'tauranga': 'TRG',
    'nelson': 'NSN',
    'new plymouth': 'NPL',
    'invercargill': 'IVC',
    'blenheim': 'BHE',
    'gisborne': 'GIS',
    'whangarei': 'WRE',
    'timaru': 'TIU',
    'hokitika': 'HKK',
    'kerikeri': 'KKE',
    'bay of islands': 'KKE',
    'wanaka': 'WKA',
    'kaikoura': 'KBZ',
    'westport': 'WSZ',
    'taupo': 'TUO',
    'chatham islands': 'CHT',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Oceania: Pacific Islands ──
    // ══════════════════════════════════════════════════════════════════════
  
    'fiji': 'NAN',
    'nadi': 'NAN',
    'suva': 'SUV',
  
    'noumea': 'NOU',
    'nouméa': 'NOU',
    'new caledonia': 'NOU',
  
    'tahiti': 'PPT',
    'papeete': 'PPT',
    'bora bora': 'BOB',
    'moorea': 'MOZ',
  
    'port vila': 'VLI',
    'vanuatu': 'VLI',
  
    'apia': 'APW',
    'samoa': 'APW',
  
    'tonga': 'TBU',
    'nukualofa': 'TBU',
    "nuku'alofa": 'TBU',
  
    'port moresby': 'POM',
    'papua new guinea': 'POM',
    'lae': 'LAE',
    'rabaul': 'RAB',
  
    'honiara': 'HIR',
    'solomon islands': 'HIR',
  
    'tarawa': 'TRW',
    'kiribati': 'TRW',
  
    'majuro': 'MAJ',
    'marshall islands': 'MAJ',
  
    'koror': 'ROR',
    'palau': 'ROR',
  
    'pohnpei': 'PNI',
    'chuuk': 'TKK',
    'yap': 'YAP',
  
    'funafuti': 'FUN',
    'tuvalu': 'FUN',
  
    'nauru': 'INU',
  
    'niue': 'IUE',
  
    'rarotonga': 'RAR',
    'cook islands': 'RAR',
  
    'wallis': 'WLS',
  
    // ══════════════════════════════════════════════════════════════════════
    // ── Russia & former Soviet ──
    // ══════════════════════════════════════════════════════════════════════
  
    'moscow': 'MOW',
    'sheremetyevo': 'SVO',
    'domodedovo': 'DME',
    'vnukovo': 'VKO',
    'st petersburg': 'LED',
    'saint petersburg': 'LED',
    'novosibirsk': 'OVB',
    'yekaterinburg': 'SVX',
    'ekaterinburg': 'SVX',
    'kazan': 'KZN',
    'nizhny novgorod': 'GOJ',
    'samara': 'KUF',
    'rostov-on-don': 'ROV',
    'krasnodar': 'KRR',
    'sochi': 'AER',
    'vladivostok': 'VVO',
    'krasnoyarsk': 'KJA',
    'irkutsk': 'IKT',
    'kaliningrad': 'KGD',
    'ufa': 'UFA',
    'chelyabinsk': 'CEK',
    'omsk': 'OMS',
    'perm': 'PEE',
    'volgograd': 'VOG',
    'voronezh': 'VOZ',
    'murmansk': 'MMK',
    'arkhangelsk': 'ARH',
    'petropavlovsk-kamchatsky': 'PKC',
    'kamchatka': 'PKC',
    'khabarovsk': 'KHV',
    'tomsk': 'TOF',
    'barnaul': 'BAX',
    'tyumen': 'TJM',
    'surgut': 'SGC',
    'mineralnye vody': 'MRV',
    'simferopol': 'SIP',
    'crimea': 'SIP',
    'yakutsk': 'YKS',
    'magadan': 'GDX',
    'yuzhno-sakhalinsk': 'UUS',
    'sakhalin': 'UUS',
    'syktyvkar': 'SCW',
    'izhevsk': 'IJK',
    'saratov': 'RTW',
    'orenburg': 'REN',
    'kemerovo': 'KEJ',
    'novokuznetsk': 'NOZ',
    'makhachkala': 'MCX',
    'astrakhan': 'ASF',
    'stavropol': 'STW',
    'nalchik': 'NAL',
    'grozny': 'GRV',
    'vladikavkaz': 'OGZ',
  };

  // ─── SVG icon helper (DOM-based, avoids innerHTML for Trusted Types) ──

  const PLANE_PATH_D = 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

  function createPlaneIcon(size = 16) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('fill', 'currentColor');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', PLANE_PATH_D);
    svg.appendChild(path);
    return svg;
  }

  // ─── Input extraction helpers ────────────────────────────────────

  function findInput(ariaLabelSubstring) {
    let input = document.querySelector(`input[aria-label="${ariaLabelSubstring}"]`);
    if (input) return input;
    input = document.querySelector(`input[aria-label*="${ariaLabelSubstring}"]`);
    if (input) return input;
    const allInputs = document.querySelectorAll('input[aria-label]');
    for (const el of allInputs) {
      const label = el.getAttribute('aria-label') || '';
      if (label.toLowerCase().includes(ariaLabelSubstring.toLowerCase())) return el;
    }
    return null;
  }

  function getFieldValue(ariaLabelSubstring) {
    const input = findInput(ariaLabelSubstring);
    if (input) {
      // Strategy 1: input.value (may be just city name like "Newark")
      const inputVal = (input.value || '').trim();

      // Strategy 2: Look for IATA codes near the input in the DOM
      // Google Flights shows "Newark EWR" visually, but input.value is just "Newark"
      // The "EWR" is in a separate child element nearby
      if (inputVal) {
        const iataContextRegex = new RegExp(
          inputVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+([A-Z]{3})', 'i'
        );
        let container = input.parentElement;
        for (let i = 0; i < 5 && container; i++) {
          // Search direct children for standalone IATA codes (3 uppercase letters)
          for (const child of container.children) {
            const childText = child.textContent.trim();
            if (/^[A-Z]{3}$/.test(childText)) {
              return inputVal + ' ' + childText;
            }
          }
          // Check container text for "CityName CODE" pattern
          const containerText = container.textContent.trim();
          if (containerText.length < 60) {
            const iataInContext = containerText.match(iataContextRegex);
            if (iataInContext) {
              return inputVal + ' ' + iataInContext[1].toUpperCase();
            }
          }
          container = container.parentElement;
        }
        // No IATA code found nearby — return just the city name
        return inputVal;
      }

      // Strategy 3: data-value attributes (for date fields etc.)
      let container = input.parentElement;
      for (let i = 0; i < 6 && container; i++) {
        const candidates = container.querySelectorAll('[data-value]');
        for (const el of candidates) {
          const dataVal = el.getAttribute('data-value');
          if (dataVal && dataVal.trim()) return dataVal.trim();
        }
        container = container.parentElement;
      }
    }
    return null;
  }

  function extractFromPageTitle() {
    const title = document.title || '';
    const match = title.match(/^(.+?)\s+to\s+(.+?)\s*[|\-–]/i);
    if (match) return { origin: match[1].trim(), destination: match[2].trim() };
    return null;
  }

  function resolveAirportCode(text, isOrigin) {
    if (!text) return null;

    // Check for explicit IATA code (uppercase 3 letters)
    const iataMatch = text.match(/\b([A-Z]{3})\b/);
    if (iataMatch) return iataMatch[1];

    // Case-insensitive trailing code (e.g., "Seattle Sea")
    const iataMatchCI = text.match(/\b([A-Za-z]{3})\s*$/);
    if (iataMatchCI) {
      const code = iataMatchCI[1].toUpperCase();
      const preceding = text.slice(0, iataMatchCI.index).trim();
      if (preceding.length > 0) return code;
    }

    // Metro code lookup
    const cleanText = text
      .replace(/\s*\(.*?\)/g, '')
      .replace(/\s*[A-Z]{3}\s*$/g, '')
      .replace(/\s*(All airports|Metropolitan Area|area|,.*$)/gi, '')
      .trim().toLowerCase();
    if (METRO_CODES[cleanText]) return METRO_CODES[cleanText];

    // Partial metro match
    for (const [city, code] of Object.entries(METRO_CODES)) {
      if (cleanText.includes(city) || city.includes(cleanText)) return code;
    }

    // Extract from flight result rows
    const codes = extractAirportCodesFromResults(isOrigin);
    if (codes.length > 0) return codes.join(',');

    // Last resort: extract from page title ("Newark to Dallas | Google Flights")
    const titleData = extractFromPageTitle();
    if (titleData) {
      const titleText = isOrigin ? titleData.origin : titleData.destination;
      if (titleText && titleText !== text) {
        const titleCode = resolveAirportCode(titleText, isOrigin);
        if (titleCode) return titleCode;
      }
    }

    return null;
  }

  function extractAirportCodesFromResults(isOrigin) {
    const codes = new Set();
    // Scope to flight result rows only, not the entire page
    const flightRows = document.querySelectorAll('li.pIav2d');
    for (const row of flightRows) {
      for (const span of row.querySelectorAll('span')) {
        const text = span.textContent.trim();
        if (/^[A-Z]{3}$/.test(text)) {
          codes.add(text);
        }
      }
    }
    // Return only origin or destination codes based on position in route pairs
    if (codes.size >= 2) {
      // If we have multiple codes, try to identify origin vs destination from route patterns
      const routeCodes = new Set();
      for (const row of flightRows) {
        const text = row.textContent || '';
        const match = text.match(/\b([A-Z]{3})\s*[–\-]\s*([A-Z]{3})\b/);
        if (match) routeCodes.add(isOrigin ? match[1] : match[2]);
      }
      if (routeCodes.size > 0) return [...routeCodes];
    }
    return [...codes];
  }

  function parseDate(dateText) {
    if (!dateText) return null;
    const months = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11,
      'january': 0, 'february': 1, 'march': 2, 'april': 3, 'june': 5,
      'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11,
    };
    const match = dateText.match(/([A-Za-z]+)\s+(\d{1,2})/);
    if (!match) return null;
    const monthIndex = months[match[1].toLowerCase()];
    if (monthIndex === undefined) return null;
    const day = parseInt(match[2], 10);
    const now = new Date();
    let year = now.getFullYear();
    if (new Date(year, monthIndex, day) < new Date(now.getFullYear(), now.getMonth(), now.getDate())) year++;
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function getTripType() {
    const el = document.querySelector('[aria-label*="ticket type"], [aria-label*="Trip type"]');
    if (el) {
      const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
      if (text.includes('round trip')) return 'round-trip';
      if (text.includes('multi-city') || text.includes('multi city')) return 'multi-city';
      if (text.includes('one way')) return 'one-way';
    }
    const returnInput = findInput('Return');
    return returnInput ? 'round-trip' : 'one-way';
  }

  function classifyCabin(text) {
    const t = text.toLowerCase();
    if (t.includes('first')) return 'first';
    if (t.includes('business')) return 'business';
    if (t.includes('premium')) return 'premium';
    if (t.includes('economy')) return 'economy';
    return null;
  }

  function getCabinClass() {
    const el = document.querySelector('[aria-label*="seating class"], [aria-label*="cabin"]');
    if (el) {
      const result = classifyCabin(el.textContent || el.getAttribute('aria-label') || '');
      if (result) return result;
    }
    const comboboxes = document.querySelectorAll('div[role="combobox"]');
    for (const cb of comboboxes) {
      const result = classifyCabin(cb.textContent || '');
      if (result) return result;
    }
    return 'economy';
  }

  function isNonstopFilterActive() {
    const btns = document.querySelectorAll('[aria-label*="Stops"], [aria-label*="stops"]');
    for (const btn of btns) {
      if ((btn.textContent || '').toLowerCase().includes('nonstop')) return true;
    }
    return false;
  }

  function getPassengerCount() {
    const btns = document.querySelectorAll('[aria-label*="passenger"]');
    for (const btn of btns) {
      const match = (btn.getAttribute('aria-label') || '').match(/(\d+)\s*passenger/i);
      if (match) return parseInt(match[1], 10);
    }
    return 1;
  }

  /**
   * Extract selected airlines from the Google Flights Airlines filter.
   *
   * Google Flights Airlines filter behavior:
   * - Default (no filter): button text is "Airlines" and aria-label is "Airlines, Not selected"
   * - With filter: aria-label changes to e.g. "Airlines, 1 of 16 selected" or similar
   *   and the dropdown shows checkboxes with airline names
   *
   * Strategy:
   * 1. Check if the Airlines filter is active (aria-label indicates selection)
   * 2. Open the dropdown programmatically is not feasible, so we look for
   *    airline names in the filter button's text or nearby elements
   * 3. Also check for airline chips/tags that appear when filtered
   */
  function getSelectedAirlines() {
    // Check if the Airlines filter is active
    const filterBar = document.querySelector('[aria-label*="All filters"]')?.parentElement?.parentElement;
    const btns = (filterBar || document).querySelectorAll('button, [role="button"]');

    let airlinesBtn = null;
    for (const btn of btns) {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const text = (btn.textContent || '').trim();
      if (!label.includes('airlines') && text !== 'Airlines') continue;
      if (label.includes('not selected') || text === 'Airlines') continue;
      airlinesBtn = btn;
      break;
    }

    if (!airlinesBtn) return [];

    // Airlines filter is active — extract IATA codes from URL.
    // Google Flights encodes airline selections in the `tfs` URL parameter as
    // protobuf field 6 (tag byte 0x32), each a 2-byte IATA code: \x32\x02XX.
    return extractAirlinesFromUrl();
  }

  function extractAirlinesFromUrl() {
    const codes = [];
    try {
      const url = new URL(location.href);
      const tfs = url.searchParams.get('tfs');
      if (!tfs) return codes;

      // Build a set of known IATA airline codes for validation
      const knownCodes = new Set(Object.values(AIRLINE_CODES));

      // Decode base64url (Google uses URL-safe base64)
      const b64 = tfs.replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(b64);

      // Google Flights encodes selected airlines in the `tfs` protobuf as field 6
      // (tag byte 0x32), wire type 2 (length-delimited), with 2-byte IATA codes.
      // Pattern: \x32\x02 followed by a 2-char IATA airline code.
      for (let i = 0; i < binary.length - 3; i++) {
        if (binary.charCodeAt(i) === 0x32 && binary.charCodeAt(i + 1) === 0x02) {
          const code = binary[i + 2] + binary[i + 3];
          if (knownCodes.has(code) && !codes.includes(code)) codes.push(code);
        }
      }
    } catch (e) {
      // Silently fail — airline filter just won't be passed to seats.aero
    }
    return codes;
  }

  // ─── URL construction ────────────────────────────────────────────

  function buildSeatsAeroUrl(params) {
    const url = new URL('https://seats.aero/search');
    url.searchParams.set('origins', params.origins);
    url.searchParams.set('destinations', params.destinations);
    url.searchParams.set('date', params.date);
    url.searchParams.set('applicable_cabin', params.cabin || 'economy');
    if (params.directOnly) url.searchParams.set('direct_only', 'true');
    if (params.airlines && params.airlines.length > 0) {
      url.searchParams.set('op_carriers', params.airlines.join(','));
    }
    if (params.passengers > 1) url.searchParams.set('min_seats', params.passengers.toString());
    if (params.flexibleDays) {
      url.searchParams.set('additional_days', 'true');
      url.searchParams.set('additional_days_num', String(params.flexibleDays));
    }
    // Per-flight searches show individual flights; global shows program summary
    if (params.showIndividual) {
      url.searchParams.set('show_individual', 'true');
    }
    return url.toString();
  }

  function openSeatsAero(urls) {
    chrome.runtime.sendMessage({ action: 'openSeatsAero', urls }, (response) => {
      if (chrome.runtime.lastError) {
        urls.forEach(url => window.open(url, '_blank'));
      }
    });
  }

  // ─── Global button (extract all page-level params) ───────────────

  function extractGlobalParams() {
    let originText = getFieldValue('Where from');
    let destText = getFieldValue('Where to');
    const departureDateText = getFieldValue('Departure');
    const returnDateText = getFieldValue('Return');

    if (!originText || !destText) {
      const titleData = extractFromPageTitle();
      if (titleData) {
        if (!originText) originText = titleData.origin;
        if (!destText) destText = titleData.destination;
      }
    }

    const origins = resolveAirportCode(originText, true);
    const destinations = resolveAirportCode(destText, false);
    const departureDate = parseDate(departureDateText);

    if (!origins) return { urls: [], error: 'Could not determine origin airport' };
    if (!destinations) return { urls: [], error: 'Could not determine destination airport' };
    if (!departureDate) return { urls: [], error: 'Could not determine departure date' };

    const tripType = getTripType();
    const cabin = getCabinClass();
    const directOnly = isNonstopFilterActive();
    const passengers = getPassengerCount();
    const flexDays = settings.flexibleDaysNum || 0;

    const airlines = getSelectedAirlines();
    const baseParams = { cabin, directOnly, airlines, passengers, flexibleDays: flexDays };
    const urls = [];

    urls.push(buildSeatsAeroUrl({ origins, destinations, date: departureDate, ...baseParams }));

    if (tripType === 'round-trip' && returnDateText) {
      const returnDate = parseDate(returnDateText);
      if (returnDate) {
        urls.push(buildSeatsAeroUrl({ origins: destinations, destinations: origins, date: returnDate, ...baseParams }));
      }
    }

    return { urls, error: null };
  }

  function handleGlobalButtonClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const btn = document.getElementById(BUTTON_ID);
    const { urls, error } = extractGlobalParams();
    if (error) {
      // Show visible error on the button
      btn.classList.add('seats-aero-error');
      while (btn.firstChild) btn.removeChild(btn.firstChild);
      btn.appendChild(document.createTextNode('⚠ ' + error));
      btn.title = error;
      setTimeout(() => {
        btn.classList.remove('seats-aero-error');
        while (btn.firstChild) btn.removeChild(btn.firstChild);
        btn.appendChild(createPlaneIcon(16));
        btn.appendChild(document.createTextNode(' Search on seats.aero'));
        btn.title = 'Search this route on seats.aero for award availability';
      }, 5000);
      return;
    }
    openSeatsAero(urls);
  }

  // ─── Per-flight buttons ──────────────────────────────────────────

  /**
   * Extract flight-specific data from a flight row (li.pIav2d).
   * Returns { origin, dest, airline, airlineCode } or null.
   */
  function extractFlightData(li) {
    const spans = li.querySelectorAll('span');
    const airportCodes = [];
    let airline = '', airlineCode = '', isNonstop = false;

    // Single pass over all spans: collect IATA codes, airline, nonstop status
    for (const span of spans) {
      const t = span.textContent.trim();
      if (/^[A-Z]{3}$/.test(t)) airportCodes.push(t);
      if (t === 'Nonstop') isNonstop = true;
      if (!airline && AIRLINE_CODES[t]) {
        airline = t;
        airlineCode = AIRLINE_CODES[t];
      } else if (!airline && t.includes('·')) {
        const firstAirline = t.split('·')[0].trim();
        if (AIRLINE_CODES[firstAirline]) {
          airline = firstAirline;
          airlineCode = AIRLINE_CODES[firstAirline];
        }
      }
    }

    // Need at least 2 unique airport codes (origin + destination)
    let origin = '', dest = '';
    if (airportCodes.length >= 2) {
      origin = airportCodes[0];
      for (let i = 1; i < airportCodes.length; i++) {
        if (airportCodes[i] !== origin) { dest = airportCodes[i]; break; }
      }
    }
    if (!origin || !dest) return null;

    // Fallback airline detection from full row text
    if (!airline) {
      const rowText = li.textContent || '';
      for (const [name, code] of Object.entries(AIRLINE_CODES)) {
        if (rowText.includes(name)) { airline = name; airlineCode = code; break; }
      }
    }

    return { origin, dest, airline, airlineCode, isNonstop };
  }

  /**
   * Create a per-flight seats.aero button for a specific flight row.
   */
  function createFlightButton(flightData) {
    const btn = document.createElement('button');
    btn.className = FLIGHT_BTN_CLASS;

    const airlineLabel = flightData.airline || '';
    const routeLabel = `${flightData.origin}→${flightData.dest}`;
    const nonstopLabel = flightData.isNonstop ? ' nonstop' : '';
    btn.title = `Search ${routeLabel}${airlineLabel ? ' (' + airlineLabel + ')' : ''}${nonstopLabel} on seats.aero`;
    btn.appendChild(createPlaneIcon(10));
    const label = document.createElement('span');
    label.textContent = 'Points';
    btn.appendChild(label);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleFlightButtonClick(flightData, btn);
    });

    return btn;
  }

  function getPageParams() {
    if (cachedPageParams) return cachedPageParams;
    const departureDateText = getFieldValue('Departure');
    const departureDate = parseDate(departureDateText);
    if (!departureDate) return null;
    cachedPageParams = {
      departureDate,
      cabin: getCabinClass(),
      passengers: getPassengerCount(),
      flexDays: settings.flexibleDaysNum || 0,
    };
    return cachedPageParams;
  }

  function handleFlightButtonClick(flightData, btn) {
    const pageParams = getPageParams();
    if (!pageParams) {
      btn.classList.add('seats-aero-error');
      setTimeout(() => btn.classList.remove('seats-aero-error'), 3000);
      return;
    }

    const { departureDate, cabin, passengers, flexDays } = pageParams;

    const params = {
      origins: flightData.origin,
      destinations: flightData.dest,
      date: departureDate,
      cabin,
      directOnly: flightData.isNonstop,
      airlines: flightData.airlineCode ? [flightData.airlineCode] : [],
      passengers,
      flexibleDays: flexDays,
      showIndividual: true,
    };

    const url = buildSeatsAeroUrl(params);
    openSeatsAero([url]);
  }

  /**
   * Inject per-flight buttons into all visible flight result rows.
   */
  function injectPerFlightButtons() {
    const flightRows = document.querySelectorAll('li.pIav2d');

    for (const li of flightRows) {
      // Skip if already has a button
      if (li.querySelector('.' + FLIGHT_BTN_CLASS)) continue;

      const flightData = extractFlightData(li);
      if (!flightData) continue;

      const btn = createFlightButton(flightData);

      // Inject inside the chevron/expand container (vJccne class)
      // This area sits at the far right of each flight row
      const expandBtn = li.querySelector('button[aria-label*="Flight details"]');
      if (expandBtn) {
        const chevronContainer = expandBtn.closest('.vJccne') || expandBtn.parentElement?.parentElement;
        if (chevronContainer) {
          chevronContainer.classList.add('seats-aero-chevron-layout');
          chevronContainer.insertBefore(btn, chevronContainer.firstChild);
          continue;
        }
      }

      // Fallback: append to the first div child
      const mainDiv = li.querySelector(':scope > div');
      if (mainDiv) {
        mainDiv.appendChild(btn);
      }
    }
  }

  // ─── Global button injection ─────────────────────────────────────

  function createGlobalButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.className = 'seats-aero-search-btn';
    btn.title = 'Search this route on seats.aero for award availability';
    btn.appendChild(createPlaneIcon(16));
    btn.appendChild(document.createTextNode(' Search on seats.aero'));
    btn.addEventListener('click', handleGlobalButtonClick);
    return btn;
  }

  function createReverseButton() {
    const btn = document.createElement('button');
    btn.id = REVERSE_BTN_ID;
    btn.className = 'seats-aero-reverse-btn';
    btn.title = 'Search the return direction on seats.aero';
    btn.textContent = '\u21A9 Return';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const { urls, error } = extractGlobalParams();
      if (error || urls.length === 0) return;
      // extractGlobalParams returns outbound URL; we need to swap origin/dest
      const outboundUrl = new URL(urls[0]);
      const origins = outboundUrl.searchParams.get('origins');
      const destinations = outboundUrl.searchParams.get('destinations');
      outboundUrl.searchParams.set('origins', destinations);
      outboundUrl.searchParams.set('destinations', origins);
      openSeatsAero([outboundUrl.toString()]);
    });
    return btn;
  }

  function updateReverseButtonVisibility() {
    const reverseBtn = document.getElementById(REVERSE_BTN_ID);
    if (!reverseBtn) return;
    const tripType = getTripType();
    reverseBtn.style.display = tripType === 'round-trip' ? 'none' : '';
  }

  function injectReverseButton() {
    if (document.getElementById(REVERSE_BTN_ID)) return;
    const globalBtn = document.getElementById(BUTTON_ID);
    if (!globalBtn) return;
    const reverseBtn = createReverseButton();
    globalBtn.insertAdjacentElement('afterend', reverseBtn);
    updateReverseButtonVisibility();
  }

  function injectGlobalButton() {
    if (document.getElementById(BUTTON_ID)) return;

    // Strategy 1: Next to "All filters" button
    const allFiltersBtn = document.querySelector('[aria-label*="All filters"]');
    if (allFiltersBtn) {
      const filterBar = allFiltersBtn.parentElement;
      if (filterBar) {
        filterBar.appendChild(createGlobalButton());
        updateGlobalButtonState();
        injectReverseButton();
        return;
      }
    }

    // Strategy 2: Near filter buttons (Stops, Airlines, etc.)
    const allButtons = document.querySelectorAll('button');
    for (const fb of allButtons) {
      const text = fb.textContent.trim();
      if (text === 'Stops' || text === 'Airlines' || text === 'Duration') {
        const container = fb.parentElement;
        if (container && !container.querySelector(`#${BUTTON_ID}`)) {
          container.parentElement.appendChild(createGlobalButton());
          updateGlobalButtonState();
          injectReverseButton();
          return;
        }
      }
    }

    // Strategy 3: Above results heading
    const headings = document.querySelectorAll('h3');
    for (const h of headings) {
      if ((h.textContent || '').includes('flights')) {
        const btn = createGlobalButton();
        btn.style.margin = '8px 24px';
        btn.style.display = 'flex';
        h.parentElement.insertBefore(btn, h);
        updateGlobalButtonState();
        injectReverseButton();
        return;
      }
    }
  }

  function updateGlobalButtonState() {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;
    const tripType = getTripType();
    if (tripType === 'multi-city') {
      btn.disabled = true;
      btn.title = 'Multi-city searches are not supported on seats.aero';
    }
  }

  // ─── Main injection orchestrator ─────────────────────────────────

  function injectAll() {
    if (!isResultsPage()) return;
    injectGlobalButton();
    injectPerFlightButtons();
    applySettingsToPage();
  }

  function removeAll() {
    const globalBtn = document.getElementById(BUTTON_ID);
    if (globalBtn) globalBtn.remove();
    const reverseBtn = document.getElementById(REVERSE_BTN_ID);
    if (reverseBtn) reverseBtn.remove();
    document.querySelectorAll('.' + FLIGHT_BTN_CLASS).forEach(el => el.remove());
  }

  // ─── Page detection & SPA navigation ─────────────────────────────

  function isResultsPage() {
    return location.href.includes(SEARCH_PATH);
  }

  let lastUrl = location.href;
  let observer = null;

  function checkForNavigation() {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      cachedPageParams = null;
      if (isResultsPage()) {
        setTimeout(() => injectAll(), 800);
      } else {
        removeAll();
      }
    }
  }

  function setupMutationObserver() {
    if (observer) observer.disconnect();
    let debounceTimer = null;
    observer = new MutationObserver(() => {
      if (!isResultsPage()) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        cachedPageParams = null;
        if (!document.getElementById(BUTTON_ID)) injectGlobalButton();
        if (!document.getElementById(REVERSE_BTN_ID)) injectReverseButton();
        updateReverseButtonVisibility();
        injectPerFlightButtons();
        applySettingsToPage();
      }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Initialize ──────────────────────────────────────────────────

  function init() {
    loadSettings();
    if (isResultsPage()) {
      setTimeout(() => injectAll(), 1500);
    }
    setInterval(checkForNavigation, 1000);
    setupMutationObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
