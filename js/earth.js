// Real Earth mode: simplified hand-drawn coastlines, country outlines and major cities.
// Coordinates are [longitude, latitude] in degrees. Outlines are deliberately coarse
// (a few points each): this is a toy globe, not a survey map. No external dataset is used.
'use strict';

const EARTH_LAND = [
  // North America
  [[-168,66],[-162,70],[-140,70],[-120,72],[-95,72],[-80,74],[-62,66],[-55,52],[-66,45],[-70,41],[-76,35],[-81,31],[-80,25],[-83,29],[-90,30],[-97,26],[-97,21],[-90,21],[-87,15],[-83,9],[-79,8],[-77,8],[-80,7],[-86,12],[-92,14],[-96,16],[-105,20],[-110,24],[-114,31],[-117,32],[-121,35],[-124,40],[-124,48],[-130,54],[-140,59],[-152,58],[-165,61]],
  [[-125,70],[-105,73],[-90,76],[-75,82],[-62,82],[-80,70],[-100,68]], // Arctic islands
  [[-55,60],[-43,60],[-20,70],[-18,80],[-35,83],[-60,82],[-72,78],[-55,70]], // Greenland
  [[-24,63.5],[-14,64],[-14,66.5],[-22,66.5]], // Iceland
  [[-85,22],[-74,20],[-76,19],[-84,22]], // Cuba
  // South America
  [[-80,8],[-72,12],[-60,10],[-50,0],[-35,-5],[-35,-10],[-39,-17],[-41,-23],[-48,-26],[-53,-34],[-58,-38],[-65,-42],[-68,-50],[-69,-55],[-74,-52],[-74,-44],[-72,-30],[-71,-18],[-76,-14],[-81,-5],[-80,0],[-78,2],[-77,8]],
  // Eurasia
  [[-10,36],[-9,43],[-2,44],[-5,48],[-1,49],[5,52],[8,54],[8,57],[5,59],[5,62],[14,68],[25,71],[40,68],[45,68],[60,70],[70,73],[80,73],[100,77],[115,74],[130,71],[150,71],[170,70],[180,68],[180,64],[170,60],[163,56],[156,51],[156,58],[142,54],[140,48],[135,43],[130,42],[127,38],[126,35],[122,40],[121,31],[119,25],[110,21],[108,16],[109,12],[105,9],[103,10],[100,13],[100,7],[103,1],[98,8],[98,16],[94,17],[92,22],[88,22],[86,20],[80,15],[78,8],[73,16],[72,21],[67,24],[62,25],[57,26],[56,24],[59,22],[55,17],[52,16],[45,13],[43,13],[39,21],[35,28],[34,31],[36,36],[30,36],[27,37],[26,40],[23,40],[21,37],[19,40],[13,45],[16,41],[18,40],[16,38],[12,38],[12,42],[9,44],[3,43],[-1,37],[-6,36]],
  [[-6,50],[1,51],[2,53],[-1,55],[-2,58],[-5,59],[-6,56],[-5,54],[-3,52]], // Great Britain
  [[-10,52],[-6,52],[-6,55],[-8,55],[-10,54]], // Ireland
  [[80,9.8],[82,7.5],[81,6],[80,6]], // Sri Lanka
  [[120,22],[122,25],[121,25],[120,23]], // Taiwan
  // Africa
  [[-17,15],[-17,21],[-13,27],[-10,30],[-6,36],[10,37],[11,34],[20,31],[30,31],[32,31],[34,27],[38,18],[43,12],[51,12],[51,10],[48,5],[42,-1],[40,-10],[40,-15],[35,-22],[33,-26],[27,-34],[20,-35],[18,-32],[15,-27],[12,-18],[13,-12],[12,-5],[9,-1],[9,4],[5,6],[-2,5],[-8,4],[-12,7],[-15,11]],
  [[43,-12],[50,-15],[48,-25],[44,-25]], // Madagascar
  // Oceania & SE Asia islands
  [[113,-22],[114,-34],[118,-35],[124,-33],[131,-31],[138,-35],[140,-38],[147,-39],[150,-37],[153,-28],[153,-25],[146,-19],[145,-15],[142,-11],[141,-17],[136,-12],[131,-11],[126,-14],[122,-18]],
  [[145,-41],[148,-41],[148,-43],[146,-43.5]], // Tasmania
  [[172,-34],[178,-38],[175,-41],[171,-46],[167,-46],[172,-41]], // New Zealand
  [[130,31],[132,34],[135,34],[140,35],[141,39],[142,43],[145,44],[141,45],[139,40],[137,37],[133,36],[130,33]], // Japan
  [[95,5],[98,4],[106,-6],[102,-5]], // Sumatra
  [[109,1],[111,-3],[116,-4],[119,1],[117,7],[110,2]], // Borneo
  [[105,-6],[114,-7],[114,-8.5],[105,-7]], // Java
  [[119,-1],[125,1],[121,-5]], // Sulawesi
  [[131,-1],[141,-3],[150,-10],[143,-9],[138,-8]], // New Guinea
  [[120,18],[122,18],[126,7],[124,6],[120,14]], // Philippines
  // Antarctica
  [[-180,-90],[180,-90],[180,-70],[90,-66],[0,-70],[-60,-64],[-90,-72],[-180,-72]],
];

// gov: form of government (simplified), econ: 0..100 economic strength (roughly GDP per person)
const COUNTRIES = [
  { name: 'United States', flag: '🇺🇸', pop: 335, gov: 'Federal presidential republic', econ: 88, polys: [
    [[-124,48],[-95,49],[-83,46],[-82,42],[-75,45],[-67,45],[-70,41],[-76,35],[-81,31],[-80,25],[-83,29],[-90,30],[-97,26],[-104,29],[-106,32],[-111,31],[-117,32],[-121,35],[-124,40]],
    [[-168,66],[-162,70],[-141,70],[-141,60],[-152,58],[-165,61]]] },
  { name: 'Canada', flag: '🇨🇦', pop: 39, gov: 'Parliamentary democracy', econ: 82, polys: [
    [[-141,70],[-120,72],[-95,72],[-80,74],[-62,66],[-55,52],[-66,45],[-67,45],[-75,45],[-82,42],[-83,46],[-95,49],[-124,48],[-130,54],[-141,60]],
    [[-125,70],[-105,73],[-90,76],[-75,82],[-62,82],[-80,70],[-100,68]]] },
  { name: 'Mexico', flag: '🇲🇽', pop: 129, gov: 'Federal presidential republic', econ: 45, polys: [[[-117,32],[-111,31],[-106,32],[-104,29],[-97,26],[-97,21],[-90,21],[-87,18],[-92,14],[-96,16],[-105,20],[-110,24],[-114,31]]] },
  { name: 'Cuba', flag: '🇨🇺', pop: 11, gov: 'Communist one-party state', econ: 25, polys: [[[-85,22],[-74,20],[-76,19],[-84,22]]] },
  { name: 'Greenland', flag: '🇬🇱', pop: 0.06, gov: 'Autonomous territory (Denmark)', econ: 70, polys: [[[-55,60],[-43,60],[-20,70],[-18,80],[-35,83],[-60,82],[-72,78],[-55,70]]] },
  { name: 'Iceland', flag: '🇮🇸', pop: 0.4, gov: 'Parliamentary republic', econ: 90, polys: [[[-24,63.5],[-14,64],[-14,66.5],[-22,66.5]]] },
  { name: 'Colombia', flag: '🇨🇴', pop: 52, gov: 'Presidential republic', econ: 35, polys: [[[-79,8],[-72,12],[-67,6],[-67,1],[-70,-3],[-76,-1],[-79,2]]] },
  { name: 'Venezuela', flag: '🇻🇪', pop: 28, gov: 'Presidential republic', econ: 20, polys: [[[-72,12],[-60,10],[-60,5],[-64,1],[-67,1],[-67,6]]] },
  { name: 'Peru', flag: '🇵🇪', pop: 34, gov: 'Presidential republic', econ: 35, polys: [[[-81,-5],[-76,-1],[-70,-3],[-69,-11],[-69,-18],[-71,-18],[-76,-14]]] },
  { name: 'Chile', flag: '🇨🇱', pop: 20, gov: 'Presidential republic', econ: 55, polys: [[[-70,-18],[-68,-22],[-70,-30],[-72,-40],[-72,-50],[-69,-55],[-74,-52],[-74,-44],[-72,-30],[-71,-18]]] },
  { name: 'Argentina', flag: '🇦🇷', pop: 46, gov: 'Federal presidential republic', econ: 45, polys: [[[-58,-20],[-57,-30],[-53,-34],[-58,-38],[-65,-42],[-68,-50],[-69,-55],[-72,-50],[-72,-40],[-70,-30],[-68,-22],[-62,-22]]] },
  { name: 'Brazil', flag: '🇧🇷', pop: 216, gov: 'Federal presidential republic', econ: 42, polys: [[[-73,-8],[-70,4],[-60,5],[-50,2],[-35,-5],[-35,-10],[-39,-17],[-41,-23],[-48,-26],[-53,-34],[-57,-30],[-58,-20],[-65,-10]]] },
  { name: 'United Kingdom', flag: '🇬🇧', pop: 68, gov: 'Constitutional monarchy', econ: 84, polys: [[[-6,50],[1,51],[2,53],[-1,55],[-2,58],[-5,59],[-6,56],[-5,54],[-3,52]]] },
  { name: 'Ireland', flag: '🇮🇪', pop: 5, gov: 'Parliamentary republic', econ: 92, polys: [[[-10,52],[-6,52],[-6,55],[-8,55],[-10,54]]] },
  { name: 'Spain', flag: '🇪🇸', pop: 48, gov: 'Constitutional monarchy', econ: 70, polys: [[[-9,43],[-2,43],[3,42],[0,39],[-2,37],[-6,36],[-9,37]]] },
  { name: 'France', flag: '🇫🇷', pop: 68, gov: 'Semi-presidential republic', econ: 80, polys: [[[-5,48],[-1,49],[2,51],[8,49],[7,44],[3,43],[-2,43],[-1,46]]] },
  { name: 'Germany', flag: '🇩🇪', pop: 84, gov: 'Federal parliamentary republic', econ: 86, polys: [[[6,51],[8,54],[14,54],[15,51],[13,48],[8,47.5],[6,49]]] },
  { name: 'Italy', flag: '🇮🇹', pop: 59, gov: 'Parliamentary republic', econ: 74, polys: [[[7,44],[12,47],[14,46],[13,45],[16,41],[18,40],[16,38],[12,38],[11,42],[9,44]]] },
  { name: 'Poland', flag: '🇵🇱', pop: 37, gov: 'Parliamentary republic', econ: 66, polys: [[[14,54],[19,54.5],[24,54],[24,50],[19,49.5],[15,51]]] },
  { name: 'Ukraine', flag: '🇺🇦', pop: 37, gov: 'Semi-presidential republic', econ: 30, polys: [[[24,50],[24,52],[32,52],[38,50],[40,48],[36,46],[33,46],[30,45.5],[29,48],[26,48]]] },
  { name: 'Norway', flag: '🇳🇴', pop: 5.5, gov: 'Constitutional monarchy', econ: 95, polys: [[[5,59],[5,62],[14,68],[25,71],[30,70],[20,69],[15,66],[12,63],[12,59],[8,58]]] },
  { name: 'Sweden', flag: '🇸🇪', pop: 10.5, gov: 'Constitutional monarchy', econ: 88, polys: [[[12,59],[12,63],[15,66],[20,69],[24,66],[18,62],[19,60],[16,56],[13,55.5]]] },
  { name: 'Finland', flag: '🇫🇮', pop: 5.6, gov: 'Parliamentary republic', econ: 85, polys: [[[21,60],[24,66],[20,69],[28,70],[30,67],[30,62],[27,60]]] },
  { name: 'Turkey', flag: '🇹🇷', pop: 85, gov: 'Presidential republic', econ: 48, polys: [[[26,40],[27,37],[36,36],[42,37],[45,39],[42,41],[36,42],[29,41]]] },
  { name: 'Russia', flag: '🇷🇺', pop: 144, gov: 'Federal semi-presidential republic', econ: 50, polys: [[[28,70],[40,68],[60,70],[70,73],[80,73],[100,77],[115,74],[130,71],[150,71],[170,70],[180,68],[180,64],[170,60],[163,56],[156,51],[156,58],[142,54],[140,48],[135,43],[130,42],[120,52],[110,50],[100,51],[90,50],[87,49],[80,51],[70,54],[62,52],[50,51],[47,46],[48,42],[40,43],[38,47],[40,48],[38,50],[32,52],[28,56],[28,60]]] },
  { name: 'Kazakhstan', flag: '🇰🇿', pop: 20, gov: 'Presidential republic', econ: 45, polys: [[[47,46],[50,51],[62,52],[70,54],[80,51],[87,49],[80,45],[80,42],[70,41],[60,43],[55,41],[52,42],[48,42]]] },
  { name: 'Mongolia', flag: '🇲🇳', pop: 3.4, gov: 'Semi-presidential republic', econ: 30, polys: [[[88,49],[90,50],[100,51],[110,50],[116,50],[119,47],[112,43],[105,42],[96,43],[91,45]]] },
  { name: 'Saudi Arabia', flag: '🇸🇦', pop: 36, gov: 'Absolute monarchy', econ: 72, polys: [[[36,28],[39,21],[42,17],[45,17],[52,19],[55,22],[51,24],[50,26],[48,28],[45,29],[40,32],[37,31]]] },
  { name: 'Iraq', flag: '🇮🇶', pop: 45, gov: 'Federal parliamentary republic', econ: 30, polys: [[[39,32],[42,37],[45,37],[46,33],[48,30],[46,29],[42,31]]] },
  { name: 'Iran', flag: '🇮🇷', pop: 89, gov: 'Theocratic republic', econ: 35, polys: [[[44,39],[48,38],[54,37],[61,36],[61,31],[63,26],[57,26],[54,27],[50,30],[48,30],[46,33],[44,35]]] },
  { name: 'Afghanistan', flag: '🇦🇫', pop: 41, gov: 'Theocratic emirate', econ: 8, polys: [[[61,31],[61,36],[67,37],[71,37],[71,34],[69,31],[66,30],[63,29]]] },
  { name: 'Pakistan', flag: '🇵🇰', pop: 240, gov: 'Federal parliamentary republic', econ: 18, polys: [[[61,25],[67,24],[70,25],[71,28],[75,31],[74,35],[77,37],[72,37],[71,34],[69,31],[66,30],[61,29]]] },
  { name: 'India', flag: '🇮🇳', pop: 1430, gov: 'Federal parliamentary republic', econ: 25, polys: [[[68,24],[71,21],[73,16],[78,8],[80,15],[86,20],[89,22],[92,22],[97,28],[89,28],[80,30],[78,35],[74,35],[75,31],[71,28],[70,25]]] },
  { name: 'Sri Lanka', flag: '🇱🇰', pop: 22, gov: 'Presidential republic', econ: 25, polys: [[[80,9.8],[82,7.5],[81,6],[80,6]]] },
  { name: 'China', flag: '🇨🇳', pop: 1410, gov: 'Communist one-party state', econ: 52, polys: [[[75,40],[80,45],[87,49],[90,50],[100,51],[110,50],[120,52],[127,50],[135,48],[130,42],[125,40],[122,40],[121,31],[119,25],[110,21],[108,22],[101,22],[98,24],[97,28],[89,28],[80,30],[78,35],[74,38]]] },
  { name: 'Taiwan', flag: '🇹🇼', pop: 23, gov: 'Semi-presidential republic', econ: 80, polys: [[[120,22],[122,25],[121,25],[120,23]]] },
  { name: 'North Korea', flag: '🇰🇵', pop: 26, gov: 'Totalitarian one-party state', econ: 8, polys: [[[125,38],[129,38],[130,42],[125,40]]] },
  { name: 'South Korea', flag: '🇰🇷', pop: 52, gov: 'Presidential republic', econ: 82, polys: [[[126,35],[129,35],[129,38],[126,38]]] },
  { name: 'Japan', flag: '🇯🇵', pop: 124, gov: 'Constitutional monarchy', econ: 80, polys: [[[130,31],[132,34],[135,34],[140,35],[141,39],[142,43],[145,44],[141,45],[139,40],[137,37],[133,36],[130,33]]] },
  { name: 'Vietnam', flag: '🇻🇳', pop: 100, gov: 'Communist one-party state', econ: 30, polys: [[[103,22],[108,21],[106,17],[109,12],[105,9],[106,11],[107,15],[105,18]]] },
  { name: 'Thailand', flag: '🇹🇭', pop: 72, gov: 'Constitutional monarchy', econ: 40, polys: [[[98,10],[100,7],[102,6],[101,13],[105,14],[105,17],[101,20],[98,18]]] },
  { name: 'Philippines', flag: '🇵🇭', pop: 117, gov: 'Presidential republic', econ: 28, polys: [[[120,18],[122,18],[126,7],[124,6],[120,14]]] },
  { name: 'Indonesia', flag: '🇮🇩', pop: 278, gov: 'Presidential republic', econ: 32, polys: [[[95,5],[98,4],[106,-6],[102,-5]], [[109,1],[111,-3],[116,-4],[119,1],[117,4],[110,2]], [[105,-6],[114,-7],[114,-8.5],[105,-7]], [[119,-1],[125,1],[121,-5]], [[131,-1],[141,-3],[141,-9],[138,-8]]] },
  { name: 'Australia', flag: '🇦🇺', pop: 27, gov: 'Federal constitutional monarchy', econ: 88, polys: [[[113,-22],[114,-34],[118,-35],[124,-33],[131,-31],[138,-35],[140,-38],[147,-39],[150,-37],[153,-28],[153,-25],[146,-19],[145,-15],[142,-11],[141,-17],[136,-12],[131,-11],[126,-14],[122,-18]], [[145,-41],[148,-41],[148,-43],[146,-43.5]]] },
  { name: 'New Zealand', flag: '🇳🇿', pop: 5.2, gov: 'Constitutional monarchy', econ: 82, polys: [[[172,-34],[178,-38],[175,-41],[171,-46],[167,-46],[172,-41]]] },
  { name: 'Egypt', flag: '🇪🇬', pop: 112, gov: 'Presidential republic', econ: 25, polys: [[[25,31.5],[32,31.5],[34,31],[35,24],[37,22],[25,22]]] },
  { name: 'Libya', flag: '🇱🇾', pop: 7, gov: 'Provisional government', econ: 30, polys: [[[10,30],[12,33],[20,31],[25,31.5],[25,20],[24,19.5],[14,23],[12,23]]] },
  { name: 'Algeria', flag: '🇩🇿', pop: 45, gov: 'Presidential republic', econ: 30, polys: [[[-8,29],[-2,35],[8,37],[9,33],[10,30],[12,23],[6,19],[2,19],[-8,26]]] },
  { name: 'Morocco', flag: '🇲🇦', pop: 37, gov: 'Constitutional monarchy', econ: 28, polys: [[[-13,27],[-10,30],[-6,36],[-2,35],[-8,29],[-8,26]]] },
  { name: 'Nigeria', flag: '🇳🇬', pop: 224, gov: 'Federal presidential republic', econ: 18, polys: [[[3,6],[3,12],[8,13.5],[13,13.5],[14,12],[12,7],[9,4.5],[5,4.5]]] },
  { name: 'Ethiopia', flag: '🇪🇹', pop: 127, gov: 'Federal parliamentary republic', econ: 10, polys: [[[34,8],[36,15],[42,13],[43,11],[48,8],[44,5],[39,3.5],[35,5]]] },
  { name: 'Kenya', flag: '🇰🇪', pop: 55, gov: 'Presidential republic', econ: 18, polys: [[[34,4],[39,3.5],[41,4],[41,-2],[39,-4.5],[34,-1]]] },
  { name: 'DR Congo', flag: '🇨🇩', pop: 102, gov: 'Semi-presidential republic', econ: 6, polys: [[[12,-6],[18,-5],[19,-8],[22,-11],[28,-13],[30,-9],[29,-3],[31,2],[27,5],[19,4],[18,-1],[12,-5]]] },
  { name: 'South Africa', flag: '🇿🇦', pop: 60, gov: 'Parliamentary republic', econ: 40, polys: [[[17,-29],[20,-35],[27,-34],[31,-29],[32,-27],[31,-22.5],[26,-24],[20,-25],[20,-29]]] },
  { name: 'Madagascar', flag: '🇲🇬', pop: 30, gov: 'Semi-presidential republic', econ: 6, polys: [[[43,-12],[50,-15],[48,-25],[44,-25]]] },
  { name: 'Antarctica', flag: '🇦🇶', pop: 0.001, gov: 'International treaty zone', econ: 50, polys: [[[-180,-90],[180,-90],[180,-70],[90,-66],[0,-70],[-60,-64],[-90,-72],[-180,-72]]] },
];

// [name, country, lon, lat, population in millions]
const CITIES = [
  ['New York', 'United States', -74, 40.7, 8.3], ['Los Angeles', 'United States', -118.2, 34, 3.9], ['Chicago', 'United States', -87.6, 41.9, 2.7], ['Houston', 'United States', -95.4, 29.8, 2.3],
  ['Toronto', 'Canada', -79.4, 43.7, 2.8], ['Vancouver', 'Canada', -123.1, 49.3, 0.7], ['Mexico City', 'Mexico', -99.1, 19.4, 9.2], ['Havana', 'Cuba', -82.4, 23.1, 2.1],
  ['Bogotá', 'Colombia', -74.1, 4.7, 7.9], ['Caracas', 'Venezuela', -66.9, 10.5, 2.2], ['Lima', 'Peru', -77, -12, 10], ['Santiago', 'Chile', -70.7, -33.45, 6.2],
  ['Buenos Aires', 'Argentina', -58.4, -34.6, 3.1], ['São Paulo', 'Brazil', -46.6, -23.5, 12.3], ['Rio de Janeiro', 'Brazil', -43.2, -22.9, 6.7], ['Brasília', 'Brazil', -47.9, -15.8, 3],
  ['London', 'United Kingdom', -0.1, 51.5, 8.9], ['Dublin', 'Ireland', -6.26, 53.35, 1.2], ['Madrid', 'Spain', -3.7, 40.4, 3.3], ['Barcelona', 'Spain', 2.2, 41.4, 1.6],
  ['Paris', 'France', 2.35, 48.86, 2.1], ['Berlin', 'Germany', 13.4, 52.5, 3.7], ['Munich', 'Germany', 11.6, 48.1, 1.5], ['Rome', 'Italy', 12.5, 41.9, 2.8], ['Milan', 'Italy', 9.2, 45.5, 1.4],
  ['Warsaw', 'Poland', 21, 52.2, 1.8], ['Kyiv', 'Ukraine', 30.5, 50.45, 2.9], ['Oslo', 'Norway', 10.75, 59.9, 0.7], ['Stockholm', 'Sweden', 18, 59.3, 1], ['Helsinki', 'Finland', 25, 60.2, 0.66],
  ['Reykjavík', 'Iceland', -21.9, 64.1, 0.13], ['Nuuk', 'Greenland', -51.7, 64.2, 0.02], ['Istanbul', 'Turkey', 29, 41, 15.5], ['Ankara', 'Turkey', 32.9, 39.9, 5.7],
  ['Moscow', 'Russia', 37.6, 55.75, 12.6], ['St Petersburg', 'Russia', 30.3, 59.9, 5.4], ['Novosibirsk', 'Russia', 82.9, 55, 1.6], ['Vladivostok', 'Russia', 131.9, 43.1, 0.6],
  ['Almaty', 'Kazakhstan', 76.9, 43.2, 2], ['Ulaanbaatar', 'Mongolia', 106.9, 47.9, 1.6], ['Riyadh', 'Saudi Arabia', 46.7, 24.7, 7.6], ['Jeddah', 'Saudi Arabia', 39.2, 21.5, 4.7], ['Mecca', 'Saudi Arabia', 39.8, 21.4, 2],
  ['Baghdad', 'Iraq', 44.4, 33.3, 7.5], ['Tehran', 'Iran', 51.4, 35.7, 9], ['Kabul', 'Afghanistan', 69.2, 34.5, 4.6], ['Karachi', 'Pakistan', 67, 24.9, 16], ['Lahore', 'Pakistan', 74.3, 31.5, 13],
  ['Delhi', 'India', 77.2, 28.6, 32], ['Mumbai', 'India', 72.9, 19.1, 21], ['Bangalore', 'India', 77.6, 12.97, 13], ['Chennai', 'India', 80.3, 13.1, 11.5], ['Kolkata', 'India', 88.4, 22.6, 15], ['Hyderabad', 'India', 78.5, 17.4, 10.5],
  ['Colombo', 'Sri Lanka', 79.9, 6.9, 0.75], ['Beijing', 'China', 116.4, 39.9, 21.5], ['Shanghai', 'China', 121.5, 31.2, 24.9], ['Shenzhen', 'China', 114.1, 22.5, 17.5], ['Chengdu', 'China', 104.1, 30.7, 21],
  ['Taipei', 'Taiwan', 121.5, 25, 2.6], ['Pyongyang', 'North Korea', 125.75, 39, 3.1], ['Seoul', 'South Korea', 127, 37.6, 9.7], ['Tokyo', 'Japan', 139.7, 35.7, 14], ['Osaka', 'Japan', 135.5, 34.7, 2.7],
  ['Hanoi', 'Vietnam', 105.8, 21, 8.4], ['Ho Chi Minh City', 'Vietnam', 106.7, 10.8, 9.4], ['Bangkok', 'Thailand', 100.5, 13.75, 10.7], ['Manila', 'Philippines', 121, 14.6, 14],
  ['Jakarta', 'Indonesia', 106.8, -6.2, 10.6], ['Sydney', 'Australia', 151.2, -33.9, 5.3], ['Melbourne', 'Australia', 145, -37.8, 5.1], ['Perth', 'Australia', 115.9, -31.95, 2.1], ['Auckland', 'New Zealand', 174.8, -36.8, 1.7],
  ['Cairo', 'Egypt', 31.2, 30, 22], ['Tripoli', 'Libya', 13.2, 32.9, 1.2], ['Algiers', 'Algeria', 3, 36.8, 3.4], ['Casablanca', 'Morocco', -7.6, 33.6, 3.7], ['Lagos', 'Nigeria', 3.4, 6.5, 15.4],
  ['Abuja', 'Nigeria', 7.5, 9.1, 3.6], ['Addis Ababa', 'Ethiopia', 38.7, 9, 5.2], ['Nairobi', 'Kenya', 36.8, -1.3, 4.4], ['Kinshasa', 'DR Congo', 15.3, -4.3, 17], ['Johannesburg', 'South Africa', 28, -26.2, 6],
  ['Cape Town', 'South Africa', 18.4, -33.9, 4.8], ['Antananarivo', 'Madagascar', 47.5, -18.9, 3.4],
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
const EARTH = (() => {
  const land = EARTH_LAND.map((p) => ({ p, b: bbox(p) }));
  const ctry = [];
  COUNTRIES.forEach((c, id) => c.polys.forEach((p) => ctry.push({ id, p, b: bbox(p) })));
  const hit = (list, lon, lat) => { for (const e of list) { const b = e.b; if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue; if (pointInPoly(e.p, lon, lat)) return e; } return null; };
  return {
    landAt: (lon, lat) => !!hit(land, lon, lat),
    countryAt: (lon, lat) => { const e = hit(ctry, lon, lat); return e ? e.id : -1; },
    isEarthSeed: (seed) => String(seed || '').trim().toLowerCase() === 'earth',
  };
})();
