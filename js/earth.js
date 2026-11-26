// Real Earth mode. Country borders, populations and income groups come from Natural Earth
// (js/earth-data.js); satellite imagery from NASA (js/earth-tex.js). This file adds cities,
// governments and real-world alliances/rivalries so public opinion is politically plausible.
'use strict';

// [name, country ISO-3 code, lon, lat, population in millions]
const CITIES = [
  ['New York', 'USA', -74, 40.7, 8.3], ['Los Angeles', 'USA', -118.2, 34, 3.9], ['Chicago', 'USA', -87.6, 41.9, 2.7], ['Houston', 'USA', -95.4, 29.8, 2.3],
  ['Toronto', 'CAN', -79.4, 43.7, 2.8], ['Vancouver', 'CAN', -123.1, 49.3, 0.7], ['Mexico City', 'MEX', -99.1, 19.4, 9.2], ['Havana', 'CUB', -82.4, 23.1, 2.1],
  ['Bogotá', 'COL', -74.1, 4.7, 7.9], ['Caracas', 'VEN', -66.9, 10.5, 2.2], ['Lima', 'PER', -77, -12, 10], ['Santiago', 'CHL', -70.7, -33.45, 6.2],
  ['Buenos Aires', 'ARG', -58.4, -34.6, 3.1], ['São Paulo', 'BRA', -46.6, -23.5, 12.3], ['Rio de Janeiro', 'BRA', -43.2, -22.9, 6.7], ['Brasília', 'BRA', -47.9, -15.8, 3],
  ['London', 'GBR', -0.1, 51.5, 8.9], ['Dublin', 'IRL', -6.26, 53.35, 1.2], ['Madrid', 'ESP', -3.7, 40.4, 3.3], ['Barcelona', 'ESP', 2.2, 41.4, 1.6],
  ['Paris', 'FRA', 2.35, 48.86, 2.1], ['Berlin', 'DEU', 13.4, 52.5, 3.7], ['Munich', 'DEU', 11.6, 48.1, 1.5], ['Rome', 'ITA', 12.5, 41.9, 2.8], ['Milan', 'ITA', 9.2, 45.5, 1.4],
  ['Warsaw', 'POL', 21, 52.2, 1.8], ['Kyiv', 'UKR', 30.5, 50.45, 2.9], ['Oslo', 'NOR', 10.75, 59.9, 0.7], ['Stockholm', 'SWE', 18, 59.3, 1], ['Helsinki', 'FIN', 25, 60.2, 0.66],
  ['Reykjavík', 'ISL', -21.9, 64.1, 0.13], ['Nuuk', 'GRL', -51.7, 64.2, 0.02], ['Istanbul', 'TUR', 29, 41, 15.5], ['Ankara', 'TUR', 32.9, 39.9, 5.7],
  ['Moscow', 'RUS', 37.6, 55.75, 12.6], ['St Petersburg', 'RUS', 30.3, 59.9, 5.4], ['Novosibirsk', 'RUS', 82.9, 55, 1.6], ['Vladivostok', 'RUS', 131.9, 43.1, 0.6],
  ['Almaty', 'KAZ', 76.9, 43.2, 2], ['Ulaanbaatar', 'MNG', 106.9, 47.9, 1.6], ['Riyadh', 'SAU', 46.7, 24.7, 7.6], ['Jeddah', 'SAU', 39.2, 21.5, 4.7], ['Mecca', 'SAU', 39.8, 21.4, 2],
  ['Baghdad', 'IRQ', 44.4, 33.3, 7.5], ['Tehran', 'IRN', 51.4, 35.7, 9], ['Kabul', 'AFG', 69.2, 34.5, 4.6], ['Karachi', 'PAK', 67, 24.9, 16], ['Lahore', 'PAK', 74.3, 31.5, 13],
  ['Delhi', 'IND', 77.2, 28.6, 32], ['Mumbai', 'IND', 72.9, 19.1, 21], ['Bangalore', 'IND', 77.6, 12.97, 13], ['Chennai', 'IND', 80.3, 13.1, 11.5], ['Kolkata', 'IND', 88.4, 22.6, 15], ['Hyderabad', 'IND', 78.5, 17.4, 10.5],
  ['Colombo', 'LKA', 79.9, 6.9, 0.75], ['Beijing', 'CHN', 116.4, 39.9, 21.5], ['Shanghai', 'CHN', 121.5, 31.2, 24.9], ['Shenzhen', 'CHN', 114.1, 22.5, 17.5], ['Chengdu', 'CHN', 104.1, 30.7, 21],
  ['Taipei', 'TWN', 121.5, 25, 2.6], ['Pyongyang', 'PRK', 125.75, 39, 3.1], ['Seoul', 'KOR', 127, 37.6, 9.7], ['Tokyo', 'JPN', 139.7, 35.7, 14], ['Osaka', 'JPN', 135.5, 34.7, 2.7],
  ['Hanoi', 'VNM', 105.8, 21, 8.4], ['Ho Chi Minh City', 'VNM', 106.7, 10.8, 9.4], ['Bangkok', 'THA', 100.5, 13.75, 10.7], ['Manila', 'PHL', 121, 14.6, 14],
  ['Jakarta', 'IDN', 106.8, -6.2, 10.6], ['Sydney', 'AUS', 151.2, -33.9, 5.3], ['Melbourne', 'AUS', 145, -37.8, 5.1], ['Perth', 'AUS', 115.9, -31.95, 2.1], ['Auckland', 'NZL', 174.8, -36.8, 1.7],
  ['Cairo', 'EGY', 31.2, 30, 22], ['Tripoli', 'LBY', 13.2, 32.9, 1.2], ['Algiers', 'DZA', 3, 36.8, 3.4], ['Casablanca', 'MAR', -7.6, 33.6, 3.7], ['Lagos', 'NGA', 3.4, 6.5, 15.4],
  ['Abuja', 'NGA', 7.5, 9.1, 3.6], ['Addis Ababa', 'ETH', 38.7, 9, 5.2], ['Nairobi', 'KEN', 36.8, -1.3, 4.4], ['Kinshasa', 'COD', 15.3, -4.3, 17], ['Johannesburg', 'ZAF', 28, -26.2, 6],
  ['Cape Town', 'ZAF', 18.4, -33.9, 4.8], ['Antananarivo', 'MDG', 47.5, -18.9, 3.4],
  ['Amsterdam', 'NLD', 4.9, 52.37, 0.9], ['Brussels', 'BEL', 4.35, 50.85, 1.2], ['Vienna', 'AUT', 16.37, 48.21, 1.9], ['Zurich', 'CHE', 8.54, 47.37, 0.4], ['Lisbon', 'PRT', -9.14, 38.72, 0.5],
  ['Athens', 'GRC', 23.73, 37.98, 3.2], ['Prague', 'CZE', 14.42, 50.09, 1.3], ['Budapest', 'HUN', 19.04, 47.5, 1.7], ['Bucharest', 'ROU', 26.1, 44.43, 1.8], ['Copenhagen', 'DNK', 12.57, 55.68, 0.8],
  ['Minsk', 'BLR', 27.56, 53.9, 2], ['Tel Aviv', 'ISR', 34.78, 32.08, 0.5], ['Jerusalem', 'ISR', 35.21, 31.77, 1], ['Damascus', 'SYR', 36.29, 33.51, 2.5], ['Dubai', 'ARE', 55.27, 25.2, 3.6],
  ['Doha', 'QAT', 51.53, 25.29, 1.2], ['Dhaka', 'BGD', 90.41, 23.81, 23], ['Kathmandu', 'NPL', 85.32, 27.72, 1.5], ['Yangon', 'MMR', 96.2, 16.87, 5.6], ['Kuala Lumpur', 'MYS', 101.69, 3.14, 8.4],
  ['Tashkent', 'UZB', 69.24, 41.3, 2.9], ['Baku', 'AZE', 49.87, 40.41, 2.3], ['Yerevan', 'ARM', 44.51, 40.18, 1.1], ['Tbilisi', 'GEO', 44.79, 41.72, 1.2],
  ['Khartoum', 'SDN', 32.56, 15.5, 6], ['Accra', 'GHA', -0.19, 5.6, 2.5], ['Dakar', 'SEN', -17.45, 14.69, 3.1], ['Luanda', 'AGO', 13.23, -8.84, 9], ['Dar es Salaam', 'TZA', 39.28, -6.79, 7.4],
  ['Kampala', 'UGA', 32.58, 0.35, 3.6], ['Quito', 'ECU', -78.47, -0.18, 2.8], ['La Paz', 'BOL', -68.15, -16.5, 1.9], ['Montevideo', 'URY', -56.16, -34.9, 1.4], ['Panama City', 'PAN', -79.52, 8.98, 1.9],
];


// Form of government for major countries (simplified; omitted where we'd only be guessing).
const GOV_BY_A3 = {
  USA: 'Federal presidential republic', CAN: 'Federal parliamentary democracy', MEX: 'Federal presidential republic', CUB: 'Communist one-party state',
  BRA: 'Federal presidential republic', ARG: 'Federal presidential republic', CHL: 'Presidential republic', COL: 'Presidential republic', PER: 'Presidential republic',
  VEN: 'Presidential republic (authoritarian)', ECU: 'Presidential republic', BOL: 'Presidential republic', URY: 'Presidential republic', PRY: 'Presidential republic', NIC: 'Presidential republic (authoritarian)',
  GBR: 'Constitutional monarchy', IRL: 'Parliamentary republic', FRA: 'Semi-presidential republic', DEU: 'Federal parliamentary republic', ITA: 'Parliamentary republic',
  ESP: 'Constitutional monarchy', PRT: 'Semi-presidential republic', NLD: 'Constitutional monarchy', BEL: 'Federal constitutional monarchy', CHE: 'Federal directorial republic',
  AUT: 'Federal parliamentary republic', POL: 'Parliamentary republic', CZE: 'Parliamentary republic', HUN: 'Parliamentary republic', ROU: 'Semi-presidential republic',
  GRC: 'Parliamentary republic', SWE: 'Constitutional monarchy', NOR: 'Constitutional monarchy', DNK: 'Constitutional monarchy', FIN: 'Parliamentary republic', ISL: 'Parliamentary republic',
  UKR: 'Semi-presidential republic', BLR: 'Presidential republic (authoritarian)', RUS: 'Federal semi-presidential republic', TUR: 'Presidential republic',
  SRB: 'Parliamentary republic', GEO: 'Parliamentary republic', ARM: 'Parliamentary republic', AZE: 'Presidential republic',
  KAZ: 'Presidential republic', UZB: 'Presidential republic', MNG: 'Semi-presidential republic', CHN: 'Communist one-party state', TWN: 'Semi-presidential republic',
  PRK: 'Totalitarian one-party state', KOR: 'Presidential republic', JPN: 'Constitutional monarchy', VNM: 'Communist one-party state', LAO: 'Communist one-party state',
  THA: 'Constitutional monarchy', KHM: 'Constitutional monarchy', MMR: 'Military junta', MYS: 'Federal constitutional monarchy', IDN: 'Presidential republic', PHL: 'Presidential republic',
  IND: 'Federal parliamentary republic', PAK: 'Federal parliamentary republic', BGD: 'Parliamentary republic', NPL: 'Federal parliamentary republic', LKA: 'Presidential republic',
  AFG: 'Taliban-led emirate (not widely recognised)', IRN: 'Islamic republic (theocratic)', IRQ: 'Federal parliamentary republic', SYR: 'Transitional government',
  SAU: 'Absolute monarchy', ARE: 'Federal absolute monarchy', QAT: 'Absolute monarchy', OMN: 'Absolute monarchy', KWT: 'Constitutional emirate', JOR: 'Constitutional monarchy',
  ISR: 'Parliamentary republic', EGY: 'Presidential republic', LBY: 'Divided (rival governments)', TUN: 'Presidential republic', DZA: 'Presidential republic', MAR: 'Constitutional monarchy',
  NGA: 'Federal presidential republic', GHA: 'Presidential republic', ETH: 'Federal parliamentary republic', ERI: 'One-party state', KEN: 'Presidential republic', TZA: 'Presidential republic',
  COD: 'Semi-presidential republic', ZAF: 'Parliamentary republic', SDN: 'Military-led transitional government', AUS: 'Federal constitutional monarchy', NZL: 'Constitutional monarchy',
  GRL: 'Autonomous territory of Denmark', ATA: 'Antarctic Treaty area',
};
const DISPUTED = { TWN: 'Status disputed (claimed by China)', KOS: 'Status disputed (not recognised by Serbia)', PSX: 'Partially recognised state', SAH: 'Status disputed (claimed by Morocco)', CYN: 'Recognised only by Turkey', SOL: 'Self-declared, not internationally recognised' };

// Real-world groupings and relationships (simplified, as of the mid-2020s).
const ALLIANCES = {
  NATO: ['USA', 'CAN', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'PRT', 'NLD', 'BEL', 'LUX', 'DNK', 'NOR', 'ISL', 'POL', 'CZE', 'SVK', 'HUN', 'ROU', 'BGR', 'GRC', 'TUR', 'HRV', 'SVN', 'ALB', 'MNE', 'MKD', 'EST', 'LVA', 'LTU', 'FIN', 'SWE'],
  EU: ['AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'NLD', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE'],
  CSTO: ['RUS', 'BLR', 'KAZ', 'KGZ', 'TJK', 'ARM'],
  US_PARTNERS: ['JPN', 'KOR', 'AUS', 'NZL', 'ISR', 'TWN', 'PHL'],
  AXIS: ['RUS', 'CHN', 'PRK', 'IRN', 'BLR'],
  GULF: ['SAU', 'ARE', 'KWT', 'QAT', 'OMN'],
  NORDIC: ['NOR', 'SWE', 'FIN', 'DNK', 'ISL'],
  FIVE_EYES: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
};
const BLOC_WEST = new Set([...ALLIANCES.NATO, ...ALLIANCES.US_PARTNERS, 'UKR']);
const BLOC_EAST = new Set([...ALLIANCES.AXIS, 'SYR', 'CUB', 'VEN', 'NIC', 'ERI']);
// [a, b, value]: negative = rivalry, positive = close ties. Symmetric unless noted.
const RELATIONS = [
  ['USA', 'IRN', -70], ['USA', 'PRK', -80], ['USA', 'RUS', -45], ['USA', 'CHN', -30], ['USA', 'CUB', -40], ['USA', 'VEN', -40],
  ['RUS', 'UKR', -90], ['RUS', 'POL', -55], ['RUS', 'GBR', -45], ['RUS', 'LTU', -55], ['RUS', 'LVA', -55], ['RUS', 'EST', -55], ['RUS', 'FIN', -40], ['RUS', 'GEO', -55], ['RUS', 'JPN', -30], ['RUS', 'SWE', -35],
  ['CHN', 'TWN', -60], ['CHN', 'JPN', -30], ['CHN', 'IND', -35], ['CHN', 'PHL', -35], ['CHN', 'VNM', -20],
  ['IND', 'PAK', -75], ['AFG', 'PAK', -30], ['PRK', 'KOR', -85], ['PRK', 'JPN', -60],
  ['SAU', 'IRN', -55], ['ISR', 'IRN', -85], ['ISR', 'SYR', -60], ['ISR', 'LBN', -60], ['ISR', 'PSX', -75], ['MAR', 'DZA', -50], ['MAR', 'SAH', -60],
  ['EGY', 'ETH', -35], ['SDN', 'SDS', -40], ['ETH', 'ERI', -30], ['ARM', 'AZE', -75], ['GRC', 'TUR', -25], ['CYP', 'TUR', -45], ['SRB', 'KOS', -55],
  ['GBR', 'ARG', -30], ['COL', 'VEN', -25], ['VEN', 'GUY', -45], ['KOR', 'JPN', 10],
  ['USA', 'GBR', 75], ['USA', 'CAN', 70], ['USA', 'JPN', 60], ['USA', 'KOR', 60], ['USA', 'AUS', 70], ['USA', 'ISR', 65], ['USA', 'TWN', 45], ['USA', 'POL', 55], ['USA', 'UKR', 45],
  ['GBR', 'AUS', 65], ['GBR', 'CAN', 65], ['GBR', 'NZL', 65], ['AUS', 'NZL', 80], ['FRA', 'DEU', 65], ['UKR', 'POL', 55], ['UKR', 'LTU', 55],
  ['RUS', 'CHN', 50], ['RUS', 'BLR', 75], ['RUS', 'PRK', 45], ['RUS', 'IRN', 40], ['RUS', 'KAZ', 35], ['RUS', 'SRB', 35], ['RUS', 'IND', 35],
  ['CHN', 'PAK', 65], ['CHN', 'PRK', 45], ['CHN', 'KHM', 50], ['CHN', 'LAO', 45], ['IND', 'USA', 30], ['IND', 'JPN', 35], ['IND', 'FRA', 30], ['IND', 'BGD', 20], ['IND', 'NPL', 20],
  ['SAU', 'ARE', 60], ['SAU', 'EGY', 40], ['SAU', 'USA', 30], ['SAU', 'PAK', 40], ['IRN', 'IRQ', 25], ['IRN', 'SYR', 20], ['CUB', 'VEN', 55], ['BRA', 'ARG', 30], ['TUR', 'AZE', 70], ['QAT', 'TUR', 45],
  ['DZA', 'SAH', 40], ['EGY', 'SDN', 25], ['JPN', 'AUS', 50], ['JPN', 'PHL', 40], ['KOR', 'AUS', 40],
];

// point-in-polygon (even-odd), poly = [[lon,lat],...]
function pointInPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function bbox(poly) {
  let a = 180, b = 90, c = -180, d = -90;
  for (const [x, y] of poly) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a, b, c, d];
}
const flagOf = (iso2) => (iso2 && iso2.length === 2 ? String.fromCodePoint(...[...iso2.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '🏳️');

const EARTH = (() => {
  const rings = [];
  COUNTRY_DATA.forEach((c, id) => c.polys.forEach((p) => rings.push({ id, p, b: bbox(p) })));
  const byA3 = new Map(COUNTRY_DATA.map((c, id) => [c.a3, id]));
  const tex = { ok: false, loading: null, TW: 2048, TH: 1024, day: null, night: null, topo: null, TPW: 1024, TPH: 512 };
  function decode(src, w, h) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h); res(g.getImageData(0, 0, w, h).data); };
      img.onerror = () => rej(new Error('Could not decode Earth imagery'));
      img.src = src;
    });
  }
  function load() {
    if (tex.ok) return Promise.resolve(tex);
    if (!tex.loading) tex.loading = Promise.all([decode(EARTH_IMG.day, tex.TW, tex.TH), decode(EARTH_IMG.night, tex.TW, tex.TH), decode(EARTH_IMG.topo, tex.TPW, tex.TPH)]).then(([d, n, t]) => {
      tex.day = d;
      tex.night = new Uint8Array(tex.TW * tex.TH); for (let i = 0; i < tex.night.length; i++) tex.night[i] = Math.max(n[i * 4], n[i * 4 + 1], n[i * 4 + 2]);
      tex.topo = new Uint8Array(tex.TPW * tex.TPH); for (let i = 0; i < tex.topo.length; i++) tex.topo[i] = t[i * 4];
      tex.ok = true; return tex;
    });
    return tex.loading;
  }
  return {
    tex, load, byA3,
    isEarthSeed: (seed) => String(seed || '').trim().toLowerCase() === 'earth',
    countryAt: (lon, lat) => { for (const e of rings) { const b = e.b; if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue; if (pointInPoly(e.p, lon, lat)) return e.id; } return -1; },
    topoAt: (lon, lat) => { const x = Math.min(tex.TPW - 1, Math.max(0, Math.floor((lon / 360 + 0.5) * tex.TPW))), y = Math.min(tex.TPH - 1, Math.max(0, Math.floor((0.5 - lat / 180) * tex.TPH))); return tex.topo[y * tex.TPW + x]; },
    dayAt: (lon, lat) => { const x = Math.min(tex.TW - 1, Math.max(0, Math.floor((lon / 360 + 0.5) * tex.TW))), y = Math.min(tex.TH - 1, Math.max(0, Math.floor((0.5 - lat / 180) * tex.TH))), i = (y * tex.TW + x) * 4; return [tex.day[i], tex.day[i + 1], tex.day[i + 2]]; },
  };
})();
