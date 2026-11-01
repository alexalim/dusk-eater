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
      parkItems: true, carsPerRoad: 6,
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
      parkItems: false, carsPerRoad: 3,
      waterFrom: 0.72, cranes: 7,
      eat: [['worker', 10, 60], ['crate', 4, 30], ['container', 3, 26], ['gull', 3, 20]],
    },
  };

  const COUNT = 150;
  const HARBOR_FROM = 11; // the first ten levels stay in town

  // Levels 11+ run in blocks of five: three in town, then two in the harbor.
  const themeOf = n => (n >= HARBOR_FROM && (n % 5 === 4 || n % 5 === 0) ? 'harbor' : 'town');
  const lerp = (a, b, t) => a + (b - a) * t;

  function level(n) {
    const t = THEMES[themeOf(n)];
    const d = Math.pow((n - 1) / (COUNT - 1), 1.3); // 0 at level 1, 1 at level 150; flat early, steeper late
    const ramp = Math.min(1, (n - 1) / 60); // light damage reaches full strength by level 61
    const guards = n < 4 ? 0 : Math.min(5, 1 + Math.floor((n - 4) / 25));
    const score = Math.round(lerp(t.theme === 'town' ? 1000 : 700, t.theme === 'town' ? 22000 : 10000, d) / 100) * 100;
    const [what, lo, hi] = t.eat[(n - 1) % t.eat.length];
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

  // How each goal reads on screen; counters follow Korean usage.
  const NAMES = {
    person: ['사람', '명'], cat: ['고양이', '마리'], tree: ['나무', '그루'], car: ['자동차', '대'],
    worker: ['일꾼', '명'], crate: ['상자', '개'], container: ['컨테이너', '개'], gull: ['갈매기', '마리'],
    guard: ['경비원', '명'],
  };

  function goalLabel(g) {
    if (g.kind === 'score') return `${g.n.toLocaleString()}점 달성`;
    if (g.kind === 'eat') { const [name, unit] = NAMES[g.what]; return `${name} ${g.n}${unit} 삼키기`; }
    if (g.kind === 'noBeam') return '불빛에 한 번도 안 걸리기';
    return g.kind;
  }

  const api = { THEMES, STAGES, NAMES, goalLabel, themeOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskStages = api;
})(this);
