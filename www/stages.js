// Stage definitions: two hand-made map themes, stretched into 150 levels of rising difficulty.
(function (root) {
  'use strict';

  const THEMES = {
    town: {
      theme: 'town',
      name: '조용한 마을',
      desc: '낮은 지붕과 공원이 있는 동네. 그림자 연습하기 좋은 곳이에요.',
      ground: ['#f1d4a2', '#ece6cf', '#e8a066'], groundNight: '#2e2c4a',
      roofs: ['#c9b8a6', '#b7a7c9', '#a9c3b6', '#d1a99a', '#bfbfc9'],
      parkChance: 0.18, splitChance: 0.45, height: [25, 140],
      small: [['person', 320], ['cat', 60], ['trash', 90], ['bench', 50], ['tree', 70]],
      parkItems: [['tree', 9], ['bench', 3], ['kiosk', 0.5, 'center']], carsPerRoad: 6,
      waterFrom: null, cranes: 0, lighthouse: null,
      // [type, count at level 1, count at level 150]; kept well under what spawns
      eat: [['person', 12, 80], ['cat', 4, 22], ['tree', 4, 30], ['car', 2, 16]],
    },
    harbor: {
      theme: 'harbor',
      name: '안개 항구',
      desc: '긴 크레인 그림자가 다리가 되고, 등대 불빛은 밤에도 꺼지지 않아요.',
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
      theme: 'city',
      name: '도심 빌딩숲',
      desc: '하늘을 찌르는 빌딩이 길고 좁은 그림자 다리를 놓아요. 그늘에서 그늘로 건너뛰세요.',
      ground: ['#d6d0c4', '#dedad0', '#cf9a72'], groundNight: '#26243f',
      roofs: ['#8fa3b8', '#a3b4c6', '#7d8ea3', '#b0a8c0', '#9aa7a0'],
      parkChance: 0.05, splitChance: 0.6, height: [120, 320],
      small: [['officer', 260], ['vending', 50], ['trash', 60], ['bench', 20]],
      parkItems: [['tree', 6], ['bench', 4]], carsPerRoad: 9, vehicle: 'taxi',
      waterFrom: null, cranes: 0,
      eat: [['officer', 12, 70], ['vending', 3, 20], ['taxi', 2, 16]],
    },
    park: {
      theme: 'park',
      name: '놀이공원',
      desc: '낮은 매점과 놀이기구 탑이 그늘을 만들어요. 풍선과 솜사탕이 가득한 광장을 노려요.',
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
      theme: 'snow',
      name: '눈 덮인 산마을',
      desc: '겨울 해는 낮게 떠서 하루 종일 그림자가 길어요. 대신 눈밭은 눈이 부시게 밝아요.',
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
      theme: 'farm',
      name: '시골 농장',
      desc: '넓은 밭에 그늘은 헛간과 사일로뿐이에요. 그림자가 귀한 곳이라 길을 잘 골라야 해요.',
      ground: ['#cfe3a0', '#dbe8b0', '#e7b878'], groundNight: '#24304a',
      roofs: ['#b5452f', '#c25a3c', '#8a5a3a', '#a33b2b'],
      parkChance: 0.6, splitChance: 0.3, height: [30, 70], plainWalls: true,
      small: [['chicken', 120], ['sheep', 70], ['cow', 40], ['haystack', 50]],
      parkItems: [['haystack', 3], ['sheep', 4], ['cow', 2], ['chicken', 6]], carsPerRoad: 1, vehicle: 'tractor',
      towers: { n: 8, w: 22, h: [90, 140], color: '#c9c2b8' },
      waterFrom: null, cranes: 0,
      eat: [['chicken', 8, 45], ['sheep', 4, 25], ['cow', 2, 14]],
    },
    // Seasonal: only played through EVENTS below, never in the 150-level ladder.
    xmas: {
      theme: 'xmas', event: true,
      name: '크리스마스 마을',
      desc: '눈 내린 광장에 커다란 트리와 선물이 가득해요. 겨울 해라 그림자가 길어요.',
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
    { id: 'xmas', theme: 'xmas', title: '크리스마스 이벤트', icon: '🎄', from: [12, 1], to: [1, 6], count: 10,
      reward: { skin: 'santa', stars: 15 } },
  ];
  function eventActive(ev, date) {
    const md = (date.getMonth() + 1) * 100 + date.getDate(), a = ev.from[0] * 100 + ev.from[1], b = ev.to[0] * 100 + ev.to[1];
    return a <= b ? md >= a && md <= b : md >= a || md <= b;
  }
  const activeEvents = date => EVENTS.filter(ev => eventActive(ev, date));

  const COUNT = 150;
  // First-star score at level 1 and level 150 for each map (tuned with the bot; see docs).
  const SCORE = { xmas: [700, 16000], town: [1000, 22000], harbor: [700, 10000], city: [900, 40000], park: [400, 7000], snow: [700, 16000], farm: [500, 7000] };
  const HARBOR_FROM = 11; // the first ten levels stay in town

  // Levels 11+ run in blocks of five, cycling through every map.
  const CYCLE = ['harbor', 'city', 'park', 'snow', 'farm', 'town'];
  const themeOf = n => (n < HARBOR_FROM ? 'town' : CYCLE[Math.floor((n - HARBOR_FROM) / 5) % CYCLE.length]);
  const lerp = (a, b, t) => a + (b - a) * t;

  // `pick` rotates the eat target; event levels pass their own order so targets vary.
  function level(n, theme = themeOf(n), pick = n) {
    const t = THEMES[theme];
    const d = Math.pow((n - 1) / (COUNT - 1), 1.3); // 0 at level 1, 1 at level 150; flat early, steeper late
    const ramp = Math.min(1, (n - 1) / 60); // light damage reaches full strength by level 61
    const guards = n < 4 ? 0 : Math.min(5, 1 + Math.floor((n - 4) / 25));
    const [s0, s1] = SCORE[t.theme];
    const score = Math.round(lerp(s0, s1, d) / 100) * 100;
    const [what, lo, hi] = t.eat[(pick - 1) % t.eat.length];
    const goals = [
      { kind: 'score', n: score },
      { kind: 'eat', what, n: Math.round(lerp(lo, hi, d)) },
    ];
    // Third star: a bigger score early on; later a guard to swallow or, in the harbor, staying out of the lighthouse.
    if (t.theme === 'harbor' && n >= 60 && n % 2 === 0) goals.push({ kind: 'noBeam' });
    else if (guards && n >= 8 && n % 3 === 0) goals.push({ kind: 'eat', what: 'guard', n: Math.min(guards, 1 + Math.floor(d * 3)) });
    else goals.push({ kind: 'score', n: Math.round(score * 1.8 / 100) * 100 });
    return Object.assign({}, t, {
      id: 'L' + n, n, name: `${n}. ${t.name}`, goals, guards,
      sunDrain: lerp(0.4, 1.6, ramp), beamDrain: lerp(3, 7, ramp),
      lighthouse: t.theme === 'harbor' ? { x: 0.5, y: 0.87, range: lerp(380, 560, ramp), half: 0.16, speed: lerp(0.35, 0.55, ramp) } : null,
    });
  }

  const STAGES = Array.from({ length: COUNT }, (_, i) => level(i + 1));
  // Event level k borrows the ladder's difficulty at level 4 + 8(k - 1): gentle start, mid-ladder finish.
  const EVENT_LEVELS = Object.fromEntries(EVENTS.map(ev => [ev.id, Array.from({ length: ev.count }, (_, i) => {
    const k = i + 1, base = level(4 + 8 * i, ev.theme, k);
    return Object.assign(base, { id: `${ev.id}-${k}`, n: k, name: `${ev.icon} ${k}. ${base.name.replace(/^\d+\. /, '')}` });
  })]));

  // How each goal reads on screen; counters follow Korean usage.
  const NAMES = {
    person: ['사람', '명'], cat: ['고양이', '마리'], tree: ['나무', '그루'], car: ['자동차', '대'],
    worker: ['일꾼', '명'], crate: ['상자', '개'], container: ['컨테이너', '개'], gull: ['갈매기', '마리'],
    officer: ['직장인', '명'], vending: ['자판기', '대'], taxi: ['택시', '대'],
    visitor: ['관람객', '명'], balloon: ['풍선', '개'], candy: ['솜사탕 가판', '개'],
    skier: ['스키어', '명'], snowman: ['눈사람', '개'], sled: ['썰매', '개'], pine: ['전나무', '그루'],
    chicken: ['닭', '마리'], sheep: ['양', '마리'], cow: ['소', '마리'],
    gift: ['선물 상자', '개'], caroler: ['캐럴 합창단', '명'], reindeer: ['순록', '마리'],
    guard: ['경비원', '명'],
  };

  function goalLabel(g) {
    if (g.kind === 'score') return `${g.n.toLocaleString()}점 달성`;
    if (g.kind === 'eat') { const [name, unit] = NAMES[g.what]; return `${name} ${g.n}${unit} 삼키기`; }
    if (g.kind === 'noBeam') return '불빛에 한 번도 안 걸리기';
    return g.kind;
  }

  const api = { THEMES, STAGES, NAMES, goalLabel, themeOf, EVENTS, EVENT_LEVELS, eventActive, activeEvents };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskStages = api;
})(this);
