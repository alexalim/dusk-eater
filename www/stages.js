// Stage definitions: two hand-made map themes, stretched into 150 levels of rising difficulty.
(function (root) {
  'use strict';

  const THEMES = {
    town: {
      look: { wall: 'windows', roof: 'gable', rise: 0.35 }, // building walls and roofs (render3d.js)
      theme: 'town',
      name: '조용한 마을',
      desc: '낮은 지붕과 공원이 있는 동네예요. 처음 연습하기 딱 좋아요.',
      ground: ['#f1d4a2', '#ece6cf', '#e8a066'], groundNight: '#2e2c4a',
      roofs: ['#c9b8a6', '#b7a7c9', '#a9c3b6', '#d1a99a', '#bfbfc9'],
      parkChance: 0.18, splitChance: 0.45, height: [25, 140],
      small: [['person', 320], ['cat', 60], ['trash', 90], ['bench', 50], ['tree', 70]],
      parkItems: [['tree', 9], ['bench', 3], ['kiosk', 0.5, 'center']], carsPerRoad: 6,
      waterFrom: null, cranes: 0, lighthouse: null,
      // [type, count at level 1, count at level 150]; kept well under what spawns
      eat: [['person', 12, 80], ['cat', 4, 14], ['tree', 4, 30], ['car', 2, 8]],
    },
    harbor: {
      look: { wall: 'corrugated', roof: 'gable', rise: 0.25 }, // building walls and roofs (render3d.js)
      theme: 'harbor',
      name: '안개 항구',
      desc: '크레인의 긴 그림자가 다리가 돼요. 등대 불빛은 밤에도 안 꺼지니 조심!',
      ground: ['#d9d3c0', '#e3e0d2', '#d99a6a'], groundNight: '#262b45',
      water: ['#7fb3c8', '#8cc0d1', '#6f86a8'], waterNight: '#1d2a48',
      roofs: ['#8fa3b0', '#a8b5a0', '#b59c8a', '#9a9fb8'],
      parkChance: 0.04, splitChance: 0.8, height: [30, 85],
      small: [['worker', 200], ['container', 150], ['crate', 120], ['gull', 60]],
      waterSmall: [['boat', 18], ['buoy', 40]],
      parkItems: [], carsPerRoad: 3,
      waterFrom: 0.72, cranes: 7,
      eat: [['worker', 10, 60], ['crate', 4, 30], ['container', 3, 26], ['gull', 3, 20]],
    },
    city: {
      look: { wall: 'glass', roof: 'flat' }, // building walls and roofs (render3d.js)
      theme: 'city',
      name: '도심 빌딩숲',
      desc: '높은 빌딩이 길쭉한 그늘 다리를 만들어 줘요. 그늘에서 그늘로 건너가요.',
      ground: ['#d6d0c4', '#dedad0', '#cf9a72'], groundNight: '#26243f',
      roofs: ['#8fa3b8', '#a3b4c6', '#7d8ea3', '#b0a8c0', '#9aa7a0'],
      parkChance: 0.05, splitChance: 0.6, height: [120, 320],
      small: [['officer', 260], ['vending', 50], ['trash', 60], ['bench', 20]],
      parkItems: [['tree', 6], ['bench', 4]], carsPerRoad: 9, vehicle: 'taxi',
      waterFrom: null, cranes: 0,
      eat: [['officer', 12, 70], ['vending', 3, 20], ['taxi', 2, 16]],
    },
    park: {
      look: { wall: 'pastel', roof: 'gable', rise: 0.4 }, // building walls and roofs (render3d.js)
      theme: 'park',
      name: '놀이공원',
      desc: '매점과 놀이기구가 그늘을 만들어요. 풍선이랑 솜사탕이 가득한 광장이 목표예요.',
      ground: ['#f3dcb0', '#f4e6c8', '#efab78'], groundNight: '#2c2648',
      roofs: ['#ff9ec4', '#ffd25c', '#7fd1e8', '#b5e48c', '#c9a0ff'],
      parkChance: 0.3, splitChance: 0.7, height: [30, 80],
      small: [['visitor', 300], ['balloon', 70], ['candy', 60], ['trash', 40]],
      parkItems: [['carousel', 0.6, 'center'], ['balloon', 4], ['tree', 3], ['bench', 2]], carsPerRoad: 0,
      towers: { n: 10, w: 18, h: [140, 200], color: '#ff7aa8' },
      waterFrom: null, cranes: 0,
      eat: [['visitor', 10, 70], ['balloon', 4, 26], ['candy', 1, 6]],
    },
    snow: {
      look: { wall: 'planks', roof: 'gable', rise: 0.55, snow: true }, // building walls and roofs (render3d.js)
      theme: 'snow',
      streetTree: 'pine',
      name: '눈 덮인 산마을',
      desc: '겨울 해는 낮아서 하루 종일 그늘이 길어요. 그 대신 눈밭은 눈부시게 밝아요.',
      ground: ['#eef3f8', '#f6f8fb', '#f1d9cf'], groundNight: '#2a3150',
      roofs: ['#f4f6fa', '#e9eef5', '#d9e2ec', '#c8763e'],
      parkChance: 0.22, splitChance: 0.4, height: [22, 70],
      small: [['skier', 160], ['snowman', 50], ['sled', 60], ['pine', 90]],
      parkItems: [['pine', 8], ['snowman', 2], ['sled', 2]], carsPerRoad: 2,
      sunMax: 35 * Math.PI / 180,
      waterFrom: null, cranes: 0,
      eat: [['skier', 8, 50], ['snowman', 3, 18], ['pine', 3, 25], ['sled', 3, 22]],
    },
    farm: {
      look: { wall: 'planks', roof: 'gable', rise: 0.45 }, // building walls and roofs (render3d.js)
      theme: 'farm',
      name: '시골 농장',
      desc: '넓은 밭에 그늘은 헛간이랑 사일로뿐이에요. 그늘이 귀하니 길을 잘 골라요.',
      ground: ['#cfe3a0', '#dbe8b0', '#e7b878'], groundNight: '#24304a',
      roofs: ['#b5452f', '#c25a3c', '#8a5a3a', '#a33b2b'],
      parkChance: 0.6, splitChance: 0.3, height: [30, 70], plainWalls: true,
      small: [['chicken', 120], ['sheep', 70], ['cow', 40], ['haystack', 50]],
      parkItems: [['haystack', 3], ['sheep', 4], ['cow', 2], ['chicken', 6]], carsPerRoad: 1, vehicle: 'tractor',
      towers: { n: 8, w: 22, h: [90, 140], color: '#c9c2b8' },
      waterFrom: null, cranes: 0,
      eat: [['chicken', 8, 45], ['sheep', 4, 25], ['cow', 2, 14]],
    },
    oasis: {
      look: { wall: 'adobe', roof: 'flat' }, // building walls and roofs (render3d.js)
      theme: 'oasis',
      name: '어반 오아시스',
      desc: '빌딩 숲 한가운데 잔디 정원이에요. 오후엔 빌딩 그늘이 정원까지 들어와요.',
      ground: ['#d9d4c8', '#e2ddd2', '#d7a27a'], groundNight: '#262640', lawn: '#7fbf6a',
      roofs: ['#9fb0c4', '#b4c2cf', '#8d9db0', '#c2b8a8'],
      parkChance: 0.35, splitChance: 0.5, height: [90, 200],
      small: [['person', 220], ['parasol', 40], ['planter', 70], ['trash', 30]],
      parkItems: [['fountain', 0.6, 'center'], ['parasol', 3], ['planter', 4], ['tree', 4], ['bench', 2]], carsPerRoad: 4,
      waterFrom: null, cranes: 0,
      eat: [['person', 12, 70], ['planter', 3, 24], ['parasol', 2, 14]],
    },
    hanok: {
      look: { wall: 'hanok', roof: 'hanok', rise: 0.55, eave: 0.3, base: true }, // curved tiled roof on a stone platform (render3d.js)
      compound: true, extras: ['fence', 'ginkgo'], // lots become walled compounds of ㄱ/ㄷ-shaped houses (index.html buildWorld); walls and the village tree are book entries
      landmark: 'ginkgo', // the middle cell is the village square with one great ginkgo (당산나무) whose crown throws a round shade
      alley: true, // earthen lanes: no lane paint or crosswalks (render3d.js)
      sunMax: 45 * Math.PI / 180, // a low autumn sun: the houses are a quarter the height of a city block, so the day's shade would be all but gone
      theme: 'hanok',
      name: '한옥 마을',
      desc: '낮은 기와집과 흙담 골목이에요. 담장 밑 그늘과 은행나무 아래가 쉼터고, 몸이 커지면 담장은 그냥 밀고 지나가요.',
      ground: ['#e6d6b8', '#ece2cc', '#e2ad7c'], groundNight: '#2a2740', lawn: '#d2bc92', // earthen courtyards, not lawns
      roofs: ['#5a5e6a', '#50545f', '#646876'], plainWalls: true, // charcoal tiles, light enough to show the ribs
      parkChance: 0.25, splitChance: 0.75, height: [24, 48],
      small: [['hanbok', 200], ['jangdok', 120], ['persimmon', 50]],
      parkItems: [['pagoda', 0.5], ['jangdok', 6], ['persimmon', 3]], carsPerRoad: 1,
      waterFrom: null, cranes: 0,
      eat: [['hanbok', 10, 60], ['jangdok', 6, 40], ['persimmon', 2, 14]],
    },
    campus: {
      look: { wall: 'brick', roof: 'flat' }, // building walls and roofs (render3d.js)
      theme: 'campus',
      name: '대학 캠퍼스',
      desc: '큰 강의동 사이에 잔디밭이 넓어요. 수업이 끝나면 학생들이 우르르 나와요.',
      ground: ['#ddd6c6', '#e5dfd1', '#dba57c'], groundNight: '#272742', lawn: '#86c070',
      roofs: ['#b98a6a', '#a77a5e', '#c9a383', '#8f9aa8'],
      parkChance: 0.35, splitChance: 0.3, height: [45, 110],
      small: [['student', 260], ['bicycle', 70], ['bench', 40], ['trash', 30]],
      parkItems: [['statue', 0.5, 'center'], ['tree', 5], ['bench', 3], ['student', 4]], carsPerRoad: 2,
      waterFrom: null, cranes: 0,
      eat: [['student', 12, 70], ['bicycle', 3, 22], ['bench', 2, 14]],
    },
    market: {
      look: { wall: 'pastel', roof: 'gable', rise: 0.35 }, // building walls and roofs (render3d.js)
      theme: 'market',
      name: '전통시장',
      desc: '다닥다닥 붙은 가게 사이 좁은 그늘을 누벼요. 스쿠터 조심!',
      ground: ['#d8cfc0', '#e0d8ca', '#d6a07a'], groundNight: '#2a2642',
      roofs: ['#e05a4f', '#3f8fd6', '#f2c14e', '#4fb06a', '#c46fd8'], plainWalls: true,
      parkChance: 0.08, splitChance: 0.95, height: [20, 45],
      small: [['grandma', 200], ['fruit', 140], ['stall', 80]],
      parkItems: [['stall', 4], ['fruit', 6]], carsPerRoad: 5, vehicle: 'scooter',
      waterFrom: null, cranes: 0,
      eat: [['grandma', 10, 60], ['fruit', 6, 40], ['stall', 2, 16]],
    },
    crossing: {
      look: { wall: 'glass', roof: 'flat' }, // building walls and roofs (render3d.js)
      theme: 'crossing',
      name: '스크램블 교차로',
      desc: '사방으로 사람들이 건너는 큰 교차로예요. 비 오는 날엔 우산도 냠냠.',
      ground: ['#cfcac2', '#d8d4cc', '#cd9d7c'], groundNight: '#23223c',
      roofs: ['#7d8ea3', '#94a3b5', '#6f7d90', '#a3a0b8'],
      parkChance: 0.04, splitChance: 0.55, height: [100, 220],
      small: [['commuter', 420], ['umbrella', 70], ['vending', 30]],
      parkItems: [['commuter', 8]], carsPerRoad: 8,
      waterFrom: null, cranes: 0,
      eat: [['commuter', 14, 80], ['umbrella', 3, 24], ['car', 2, 8]],
    },
    stadium: {
      look: { wall: 'windows', roof: 'flat' }, // building walls and roofs (render3d.js)
      theme: 'stadium',
      name: '경기장 앞 광장',
      desc: '커다란 경기장이 넓은 그늘을 만들어요. 경기가 끝나면 팬들이 광장을 꽉 채워요.',
      ground: ['#d3cfc4', '#dcd8ce', '#d29f7a'], groundNight: '#24233e', lawn: '#6fb35e',
      roofs: ['#c8ccd4', '#b7bcc6', '#e05a4f'],
      parkChance: 0.3, splitChance: 0.05, height: [40, 70],
      small: [['fan', 320], ['ball', 80], ['trash', 40]],
      parkItems: [['fan', 6], ['ball', 3]], carsPerRoad: 3, vehicle: 'foodtruck',
      waterFrom: null, cranes: 0,
      eat: [['fan', 14, 80], ['ball', 4, 26], ['trash', 2, 14]],
    },
    construction: {
      look: { wall: 'concrete', roof: 'flat' }, // building walls and roofs (render3d.js)
      theme: 'construction',
      name: '공사장',
      desc: '타워크레인이 길고 가는 그늘 다리를 만들어요. 짓고 있는 건물 사이를 오가요.',
      ground: ['#cbbfa8', '#d5cbb6', '#cf9e74'], groundNight: '#272538',
      roofs: ['#a8a8a8', '#9a9a9a', '#b5b0a5'], plainWalls: true,
      parkChance: 0.3, splitChance: 0.5, height: [30, 120],
      small: [['worker', 160], ['cone', 120], ['beam', 60], ['pipe', 60]],
      parkItems: [['beam', 3], ['pipe', 3], ['cone', 5]], carsPerRoad: 2, vehicle: 'excavator',
      towers: { n: 7, w: 14, h: [180, 240], color: '#f2c14e' },
      waterFrom: null, cranes: 0,
      eat: [['worker', 10, 60], ['cone', 6, 40], ['beam', 2, 16]],
    },
    beach: {
      look: { wall: 'pastel', roof: 'gable', rise: 0.3 }, // building walls and roofs (render3d.js)
      theme: 'beach',
      streetTree: 'palm',
      name: '해변 리조트',
      desc: '한여름 해가 높아서 그늘이 아주 짧아요. 파라솔 그늘을 콩콩 건너가요.',
      ground: ['#f2dfb0', '#f6e8c4', '#efb98a'], groundNight: '#2a2a48',
      water: ['#5ec4d6', '#6fd0df', '#5a8fb8'], waterNight: '#1b2c4c',
      roofs: ['#f4f1ea', '#e8f1f5', '#ffd25c', '#7fd1e8'],
      parkChance: 0.35, splitChance: 0.5, height: [40, 110],
      small: [['sunbather', 220], ['parasol', 90], ['sandcastle', 50], ['towel', 60]],
      waterSmall: [['surfer', 20], ['tube', 40]],
      parkItems: [['parasol', 4], ['towel', 3], ['sandcastle', 1]], carsPerRoad: 1,
      sunMax: 78 * Math.PI / 180,
      waterFrom: 0.66, cranes: 0,
      eat: [['sunbather', 10, 60], ['parasol', 3, 26], ['sandcastle', 2, 14]],
    },
    desert: {
      look: { wall: 'adobe', roof: 'flat' }, // building walls and roofs (render3d.js)
      theme: 'desert',
      streetTree: 'palm', // trees along the curbs of built lots (index.html buildWorld)
      name: '사막 오아시스',
      desc: '해가 머리 위에 있어서 그늘이 거의 없어요. 흙집과 야자수 그늘이 소중해요.',
      ground: ['#ecd3a0', '#f2ddb2', '#eaa874'], groundNight: '#2c2742',
      roofs: ['#d9a86c', '#c9955a', '#e3bb84'], plainWalls: true,
      parkChance: 0.35, splitChance: 0.6, height: [26, 70],
      small: [['traveler', 160], ['pot', 120], ['camel', 50], ['palm', 60]],
      parkItems: [['tent', 0.6, 'center'], ['palm', 5], ['camel', 1]], carsPerRoad: 1,
      sunMax: 80 * Math.PI / 180,
      waterFrom: null, cranes: 0,
      eat: [['traveler', 8, 50], ['pot', 5, 36], ['camel', 2, 12]],
    },
    // Seasonal: only played through EVENTS below, never in the 150-level ladder.
    xmas: {
      look: { wall: 'planks', roof: 'gable', rise: 0.55, snow: true }, // building walls and roofs (render3d.js)
      theme: 'xmas', event: true,
      streetTree: 'pine',
      name: '크리스마스 마을',
      desc: '눈 내린 광장에 큰 트리랑 선물이 가득해요. 겨울 해라 그늘이 길어요.',
      ground: ['#eef3f8', '#f6f8fb', '#f6d9cf'], groundNight: '#1f2a4a',
      roofs: ['#c0392b', '#2f7d4a', '#f4f6fa', '#d9e2ec'],
      parkChance: 0.25, splitChance: 0.45, height: [25, 90],
      small: [['caroler', 180], ['gift', 120], ['snowman', 40], ['reindeer', 40]],
      parkItems: [['xtree', 0.7, 'center'], ['gift', 6], ['pine', 4]], carsPerRoad: 2, vehicle: 'sleigh',
      sunMax: 30 * Math.PI / 180,
      waterFrom: null, cranes: 0,
      eat: [['gift', 6, 40], ['caroler', 6, 40], ['reindeer', 2, 14], ['snowman', 3, 16]],
    },
  };

  // Limited-time events, judged by the device date. [month, day] bounds are inclusive and may wrap the new year.
  const EVENTS = [
    { id: 'xmas', theme: 'xmas', title: '크리스마스 이벤트', from: [12, 1], to: [1, 6], count: 10,
      reward: { skin: 'santa', stars: 15 } },
  ];
  function eventActive(ev, date) {
    const md = (date.getMonth() + 1) * 100 + date.getDate(), a = ev.from[0] * 100 + ev.from[1], b = ev.to[0] * 100 + ev.to[1];
    return a <= b ? md >= a && md <= b : md >= a || md <= b;
  }
  const activeEvents = date => EVENTS.filter(ev => eventActive(ev, date));

  const COUNT = 150;
  // The ladder is six regions of 25 levels, easiest map first. `score` is the first-star target at
  // the region's first and last level (tuned with the novice/full bots).
  const REGION_SIZE = 10;
  const REGIONS = [
    { theme: 'town', score: [1000, 2500] },
    { theme: 'city', score: [11500, 28700] },
    { theme: 'oasis', score: [2400, 5900] },
    { theme: 'hanok', score: [700, 1000] },
    { theme: 'campus', score: [1300, 2300] },
    { theme: 'snow', score: [2000, 4900] },
    { theme: 'market', score: [700, 1000] },
    { theme: 'crossing', score: [2000, 5000] },
    { theme: 'stadium', score: [500, 800] },
    { theme: 'harbor', score: [1000, 2100] },
    { theme: 'construction', score: [700, 1300] },
    { theme: 'park', score: [900, 2200] },
    { theme: 'beach', score: [1200, 3000] },
    { theme: 'desert', score: [1100, 1800] },
    { theme: 'farm', score: [800, 1300] },
  ];
  const EVENT_SCORE = { xmas: [700, 16000] }; // events borrow a ladder level's difficulty instead
  // Twist per position inside a region (0-based): clouds 2, golden 5, eclipse 8, boss 10.
  const TWISTS = { 1: 'clouds', 4: 'golden', 7: 'eclipse', 9: 'boss' };
  const TWIST_INFO = {
    clouds: { name: '떠다니는 구름', text: '구름이 지나가며 움직이는 그늘을 만들어요. 구름 그늘을 타고 다녀요!',
      tips: ['땅에 비친 구름 그림자 안은 그늘이에요.', '구름은 바람 따라 천천히 흘러가요. 같이 움직여 봐요.', '경비원 불빛 안은 구름 아래여도 위험해요.'] },
    golden: { name: '황금 친구', text: '가끔 친구 하나가 금빛으로 변해요. 햇빛 속에 있어도 삼킬 수 있고, 점수는 5배!',
      tips: ['금빛으로 빛나며 통통 튀고, 위로 빛기둥이 올라가요.', '황금 친구만은 햇빛 속에서도 꿀꺽! 대신 내 몸은 햇빛에 줄어드니 빠르게 다녀와요.', '8초가 지나면 원래대로 돌아가요.', '근처에 9초마다 새로 나타나요.'] },
    eclipse: { name: '일식', text: '낮에 잠깐 일식이 와요. 그동안은 온 동네가 그늘이에요!',
      tips: ['판이 30%쯤 지나면 하늘이 어두워져요.', '6초 동안은 햇빛 걱정 없이 어디든 꿀꺽!', '큰 건물을 노려 두었다가 그때 달려가요.'] },
    boss: { name: '보스: 거대 등불지기', text: '거대 등불지기가 큰 불빛을 비추며 돌아다녀요. 충분히 커진 뒤 그늘에서 삼켜요!',
      tips: ['불빛이 아주 넓으니 뒤나 옆으로 다가가요.', '화면 위 표시가 금색이 되면 삼킬 수 있는 크기예요.', '삼키면 세 번째 별!'] },
  };
  const TIME_SCALE = 0.85;
  const regionOf = n => Math.floor((n - 1) / REGION_SIZE);
  const themeOf = n => REGIONS[regionOf(n)].theme;
  const lerp = (a, b, t) => a + (b - a) * t;

  // `pick` rotates the eat target; event levels pass their own order so targets vary.
  function level(n, theme = themeOf(n), pick = n) {
    const t = THEMES[theme];
    const d = Math.pow((n - 1) / (COUNT - 1), 1.3); // 0 at level 1, 1 at level 150; flat early, steeper late
    const ramp = Math.min(1, (n - 1) / 60); // light damage reaches full strength by level 61
    const guards = n < 4 ? 0 : Math.min(5, 1 + Math.floor((n - 4) / 25));
    const local = (n - 1) % REGION_SIZE; // 0..24 inside the region
    const region = REGIONS.find(r => r.theme === t.theme);
    const [s0, s1] = region ? region.score : EVENT_SCORE[t.theme];
    // Targets were tuned for 120-second runs; runs are 90 s now, so they shrink by less than the time (15%) to get harder.
    const score = Math.round(lerp(s0, s1, region ? local / (REGION_SIZE - 1) : d) * TIME_SCALE / 100) * 100;
    const [what, lo, hi] = t.eat[(pick - 1) % t.eat.length];
    const goals = [
      { kind: 'score', n: score },
      // Ladder: each region restarts the count low and climbs halfway to `hi` by its last level.
      { kind: 'eat', what, n: Math.max(1, Math.round(lerp(lo, hi, region ? 0.5 * local / (REGION_SIZE - 1) : d) * TIME_SCALE)) },
    ];
    // Third star: a bigger score early on; later a guard to swallow or, in the harbor, staying out of the lighthouse.
    if (t.theme === 'harbor' && local >= 10 && n % 2 === 0) goals.push({ kind: 'noBeam' });
    else if (guards && n >= 8 && n % 3 === 0) goals.push({ kind: 'eat', what: 'guard', n: Math.min(guards, 1 + Math.floor(d * 3)) });
    else goals.push({ kind: 'score', n: Math.round(score * 1.8 / 100) * 100 });
    // Twists on the ladder: the 2nd, 5th and 8th level of every region add a new rule, the 10th a boss.
    const twist = region ? TWISTS[local] || null : null;
    let boss = null;
    if (twist === 'boss') {
      boss = { r: 30 + regionOf(n) * 3 }; // must be outgrown (and caught in shade) to swallow
      goals[2] = { kind: 'eat', what: 'boss', n: 1 };
    }
    // Hard levels: the 8th of a region needs two stars to clear, the boss (10th) needs the boss swallowed.
    const hard = region ? { 7: 'hard', 9: 'super' }[local] || null : null;
    return Object.assign({}, t, {
      id: 'L' + n, n, name: `${n}. ${t.name}`, goals, guards, twist, boss, hard,
      sunDrain: lerp(0.4, 1.6, ramp), beamDrain: lerp(3, 7, ramp),
      lighthouse: t.theme === 'harbor' ? { x: 0.5, y: 0.87, range: lerp(380, 560, ramp), half: 0.16, speed: lerp(0.35, 0.55, ramp) } : null,
    });
  }

  const STAGES = Array.from({ length: COUNT }, (_, i) => level(i + 1));
  // Event level k borrows the ladder's difficulty at level 4 + 8(k - 1): gentle start, mid-ladder finish.
  const EVENT_LEVELS = Object.fromEntries(EVENTS.map(ev => [ev.id, Array.from({ length: ev.count }, (_, i) => {
    const k = i + 1, base = level(4 + 8 * i, ev.theme, k);
    return Object.assign(base, { id: `${ev.id}-${k}`, n: k, name: `${k}. ${base.name.replace(/^\d+\. /, '')}` });
  })]));

  // How each goal reads on screen; counters follow Korean usage.
  const NAMES = {
    person: ['사람', '명'], cat: ['고양이', '마리'], tree: ['나무', '그루'], car: ['자동차', '대'],
    worker: ['일꾼', '명'], crate: ['상자', '개'], container: ['컨테이너', '개'], gull: ['갈매기', '마리'],
    officer: ['직장인', '명'], vending: ['자판기', '대'], taxi: ['택시', '대'],
    visitor: ['관람객', '명'], balloon: ['풍선', '개'], candy: ['솜사탕 가판', '개'],
    skier: ['스키어', '명'], snowman: ['눈사람', '개'], sled: ['썰매', '개'], pine: ['전나무', '그루'],
    chicken: ['닭', '마리'], sheep: ['양', '마리'], cow: ['소', '마리'],
    parasol: ['파라솔', '개'], planter: ['화분', '개'], hanbok: ['한복 관광객', '명'], jangdok: ['장독', '개'],
    persimmon: ['감나무', '그루'], student: ['학생', '명'], bicycle: ['자전거', '대'], bench: ['벤치', '개'],
    grandma: ['장보는 할머니', '명'], fruit: ['과일 상자', '개'], stall: ['노점', '개'], commuter: ['행인', '명'],
    umbrella: ['우산 쓴 사람', '명'], fan: ['응원하는 팬', '명'], ball: ['공', '개'],
    foodtruck: ['푸드트럭', '대'], trash: ['쓰레기통', '개'], cone: ['꼬깔콘', '개'], beam: ['철골', '개'], sunbather: ['피서객', '명'],
    sandcastle: ['모래성', '개'], traveler: ['여행자', '명'], pot: ['항아리', '개'], camel: ['낙타', '마리'],
    gift: ['선물 상자', '개'], caroler: ['캐럴 합창단', '명'], reindeer: ['순록', '마리'],
    guard: ['경비원', '명'], boss: ['거대 등불지기', '명'],
  };

  function goalLabel(g) {
    if (g.kind === 'score') return `${g.n.toLocaleString()}점 달성`;
    if (g.kind === 'eat') { const [name, unit] = NAMES[g.what]; return `${name} ${g.n}${unit} 삼키기`; }
    if (g.kind === 'noBeam') return '불빛에 한 번도 안 걸리기';
    return g.kind;
  }

  const api = { THEMES, STAGES, NAMES, TWISTS, TWIST_INFO, TIME_SCALE, goalLabel, themeOf, REGIONS, REGION_SIZE, regionOf, EVENTS, EVENT_LEVELS, eventActive, activeEvents };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskStages = api;
})(this);
