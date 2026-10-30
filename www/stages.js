// Stage definitions: everything that differs between locations lives here as data.
(function (root) {
  'use strict';

  const STAGES = [
    {
      id: 'town',
      name: '조용한 마을',
      map: { x: 32, y: 112 }, // position on the stage map (viewBox 100 × 150)
      desc: '낮은 지붕과 공원이 있는 동네. 그림자 연습하기 좋은 곳이에요.',
      ground: ['#f1d4a2', '#ece6cf', '#e8a066'], groundNight: '#2e2c4a',
      roofs: ['#c9b8a6', '#b7a7c9', '#a9c3b6', '#d1a99a', '#bfbfc9'],
      parkChance: 0.18, splitChance: 0.45, height: [25, 140],
      small: [['person', 320], ['cat', 60], ['trash', 90], ['bench', 50], ['tree', 70]],
      parkItems: true, carsPerRoad: 6, guards: 3,
      waterFrom: null, cranes: 0, lighthouse: null,
      goals: [
        { kind: 'score', n: 15000 },
        { kind: 'eat', what: 'cat', n: 15 },
        { kind: 'eat', what: 'guard', n: 1 },
      ],
    },
    {
      id: 'harbor',
      name: '안개 항구',
      map: { x: 64, y: 52 },
      desc: '긴 크레인 그림자가 다리가 되고, 등대 불빛은 밤에도 꺼지지 않아요.',
      ground: ['#d9d3c0', '#e3e0d2', '#d99a6a'], groundNight: '#262b45',
      water: ['#7fb3c8', '#8cc0d1', '#6f86a8'], waterNight: '#1d2a48',
      roofs: ['#8fa3b0', '#a8b5a0', '#b59c8a', '#9a9fb8'],
      parkChance: 0.04, splitChance: 0.8, height: [30, 85],
      small: [['worker', 200], ['container', 150], ['crate', 120], ['gull', 60]],
      waterSmall: [['boat', 18], ['buoy', 40]],
      parkItems: false, carsPerRoad: 3, guards: 2,
      waterFrom: 0.72, cranes: 7,
      lighthouse: { x: 0.5, y: 0.87, range: 560, half: 0.16, speed: 0.55 },
      goals: [
        { kind: 'score', n: 6000 },
        { kind: 'eat', what: 'boat', n: 3 },
        { kind: 'noBeam' },
      ],
    },
  ];

  // How each goal reads on screen; counters follow Korean usage (마리/명/척).
  const NAMES = {
    cat: ['고양이', '마리'], guard: ['경비원', '명'], boat: ['배', '척'],
  };

  function goalLabel(g) {
    if (g.kind === 'score') return `${g.n.toLocaleString()}점 달성`;
    if (g.kind === 'eat') { const [name, unit] = NAMES[g.what]; return `${name} ${g.n}${unit} 삼키기`; }
    if (g.kind === 'noBeam') return '불빛에 한 번도 안 걸리기';
    return g.kind;
  }

  const api = { STAGES, NAMES, goalLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuskStages = api;
})(this);
