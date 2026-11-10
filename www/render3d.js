// Three.js renderer. Game logic hands over plain state; this file owns everything visual.
// World (x, y) maps to three.js (x, height, y), so screen-up is world -y as in the 2D version.
(function (root) {
  'use strict';
  const T = root.THREE;
  const TILT = 55 * Math.PI / 180;

  const col = c => new T.Color(c);
  const unit = {
    box: new T.BoxGeometry(1, 1, 1),
    cyl: new T.CylinderGeometry(1, 1, 1, 14),
    sphere: new T.SphereGeometry(1, 14, 10),
    blob: new T.SphereGeometry(1, 10, 8),
    cone: new T.ConeGeometry(1, 1, 12),
    capsule: new T.CapsuleGeometry(1, 2, 4, 10), // radius 1, 4 tall
  };
  // Low-poly versions for the hundreds of small instanced props: an InstancedMesh draws every
  // instance, on screen or not, so these segment counts dominate the triangle budget.
  const low = {
    box: unit.box,
    cyl: new T.CylinderGeometry(1, 1, 1, 7),
    sphere: new T.SphereGeometry(1, 7, 5),
    blob: new T.SphereGeometry(1, 8, 5),
    cone: new T.ConeGeometry(1, 1, 6),
    capsule: new T.CapsuleGeometry(1, 2, 2, 6),
  };
  // A part is a unit geometry scaled by [sx, sy, sz] * object radius, lifted by y * r and
  // shifted by o = [forward, side] * r in the object's own frame. color 'inst' takes the object's
  // own color; glow parts ignore lighting (headlights).
  const P = (geo, s, y, color, o, glow) => ({ geo, s, y, color, o, glow });
  const HAIR = '#4a3426', SKIN = '#f6d2b0';
  // A person: body in the instance color, head, hair or hat, plus any extra parts.
  const human = (hat = HAIR, extra = []) => [P('capsule', [0.55, 0.5, 0.55], 1.0, 'inst'), P('sphere', [0.55, 0.55, 0.55], 2.45, SKIN),
    P('sphere', [0.58, 0.32, 0.58], 2.7, hat)].concat(extra);
  const PARTS = {
    person:    [P('capsule', [0.55, 0.5, 0.55], 1.0, 'inst'), P('sphere', [0.55, 0.55, 0.55], 2.45, SKIN), P('sphere', [0.58, 0.32, 0.58], 2.7, HAIR)],
    worker:    [P('capsule', [0.55, 0.5, 0.55], 1.0, 'inst'), P('sphere', [0.55, 0.55, 0.55], 2.45, SKIN), P('sphere', [0.62, 0.36, 0.62], 2.72, '#f2c14e')],
    cat:       [P('blob', [1.1, 0.6, 0.6], 0.6, 'inst'), P('sphere', [0.5, 0.48, 0.5], 1.05, 'inst', [1.0, 0]),
                P('cone', [0.17, 0.4, 0.17], 1.55, 'inst', [1.05, 0.26]), P('cone', [0.17, 0.4, 0.17], 1.55, 'inst', [1.05, -0.26]),
                P('cyl', [0.12, 1.0, 0.12], 1.0, 'inst', [-1.1, 0])],
    gull:      [P('blob', [0.8, 0.6, 0.6], 0.9, 'inst'), P('box', [0.5, 0.12, 2.6], 1.0, '#e6e6e0'), P('cone', [0.12, 0.35, 0.12], 0.9, '#f2a33a', [0.85, 0])],
    trash:     [P('cyl', [0.8, 1.8, 0.8], 0.9, 'inst'), P('cyl', [0.9, 0.22, 0.9], 1.9, '#4d6449')],
    crate:     [P('box', [1.8, 1.8, 1.8], 0.9, 'inst'), P('box', [1.86, 0.3, 1.86], 0.9, '#8a6238')],
    buoy:      [P('cyl', [0.9, 1.0, 0.9], 0.5, 'inst'), P('cone', [0.55, 1.2, 0.55], 1.6, '#ffffff')],
    bench:     [P('box', [2.2, 0.25, 0.8], 0.6, 'inst'), P('box', [2.2, 0.6, 0.15], 1.0, 'inst', [0, -0.35])],
    container: [P('box', [2.6, 1.2, 1.2], 0.6, 'inst'), P('box', [2.64, 0.08, 1.24], 1.2, '#e8e4dc')],
    tree:      [P('cyl', [0.25, 1.4, 0.25], 0.7, '#7a5233'), P('blob', [1.0, 0.85, 1.0], 1.8, 'inst'), P('blob', [0.68, 0.6, 0.68], 2.5, '#5fb86a')],
    car:       [P('box', [1.6, 0.32, 1.16], 0.18, '#26262e'), P('box', [2.0, 0.5, 1.1], 0.5, 'inst'), P('box', [1.1, 0.42, 0.96], 0.96, '#9fc3e6', [-0.1, 0]),
                P('box', [0.95, 0.08, 0.9], 1.2, 'inst', [-0.1, 0]), P('box', [0.06, 0.16, 0.8], 0.55, '#fff3c4', [1.0, 0], true)],
    boat:      [P('box', [2.0, 0.5, 0.9], 0.25, 'inst'), P('box', [0.7, 0.6, 0.6], 0.8, '#3d5a80'), P('cyl', [0.06, 1.8, 0.06], 1.3, '#dddddd', [0.5, 0])],
    kiosk:     [P('box', [2.0, 1.4, 2.0], 0.7, 'inst'), P('box', [2.3, 0.2, 2.3], 1.5, '#f4f1ea'), P('box', [2.32, 0.3, 0.3], 1.3, '#d9534f', [0, 1.0])],
    // city
    officer:   [P('capsule', [0.55, 0.5, 0.55], 1.0, 'inst'), P('sphere', [0.55, 0.55, 0.55], 2.45, SKIN), P('sphere', [0.58, 0.3, 0.58], 2.72, '#2a2420'),
                P('box', [0.5, 0.4, 0.15], 0.8, '#5a3d2b', [0, 0.7])],
    vending:   [P('box', [1.0, 2.2, 0.8], 1.1, 'inst'), P('box', [0.06, 1.2, 0.6], 1.4, '#cfe8ff', [0.52, 0], true)],
    taxi:      [P('box', [1.6, 0.32, 1.16], 0.18, '#26262e'), P('box', [2.0, 0.5, 1.1], 0.5, 'inst'), P('box', [1.1, 0.42, 0.96], 0.96, '#9fc3e6', [-0.1, 0]),
                P('box', [0.95, 0.08, 0.9], 1.2, 'inst', [-0.1, 0]), P('box', [0.3, 0.2, 0.5], 1.34, '#fff3c4', [-0.1, 0], true),
                P('box', [0.06, 0.16, 0.8], 0.55, '#fff3c4', [1.0, 0], true)],
    bus:       [P('box', [2.2, 0.3, 0.95], 0.15, '#26262e'), P('box', [2.4, 0.9, 1.0], 0.65, 'inst'), P('box', [2.42, 0.28, 1.02], 0.85, '#9fc3e6'),
                P('box', [0.06, 0.14, 0.7], 0.45, '#fff3c4', [1.2, 0], true)],
    // amusement park
    visitor:   [P('capsule', [0.55, 0.5, 0.55], 1.0, 'inst'), P('sphere', [0.55, 0.55, 0.55], 2.45, SKIN), P('sphere', [0.58, 0.32, 0.58], 2.7, HAIR)],
    balloon:   [P('cyl', [0.04, 2.4, 0.04], 1.2, '#dddddd'), P('sphere', [0.9, 1.1, 0.9], 3.2, 'inst')],
    candy:     [P('box', [1.6, 1.0, 1.0], 0.5, '#f4f1ea'), P('sphere', [0.45, 0.45, 0.45], 1.4, 'inst', [0.4, 0]), P('sphere', [0.45, 0.45, 0.45], 1.4, '#c9f0ff', [-0.4, 0]),
                P('cone', [1.3, 0.5, 1.3], 2.3, '#ffd25c'), P('cyl', [0.06, 1.0, 0.06], 1.6, '#dddddd')],
    carousel:  [P('cyl', [1.0, 0.25, 1.0], 0.12, '#f4f1ea'), P('cyl', [0.15, 1.5, 0.15], 0.9, '#ffd27a'), P('cone', [1.1, 0.6, 1.1], 1.9, 'inst'),
                P('box', [0.5, 0.35, 0.18], 0.7, '#fff3c4', [0.65, 0]), P('box', [0.5, 0.35, 0.18], 0.7, '#7fd1e8', [-0.65, 0]),
                P('box', [0.18, 0.35, 0.5], 0.7, '#ffd25c', [0, 0.65]), P('box', [0.18, 0.35, 0.5], 0.7, '#c9a0ff', [0, -0.65])],
    // snow village
    skier:     [P('box', [0.2, 0.08, 2.4], 0.05, '#2b3550'), P('capsule', [0.55, 0.5, 0.55], 1.0, 'inst'), P('sphere', [0.55, 0.55, 0.55], 2.45, SKIN),
                P('sphere', [0.6, 0.36, 0.6], 2.72, '#f7f9fc')],
    snowman:   [P('sphere', [0.8, 0.8, 0.8], 0.8, 'inst'), P('sphere', [0.55, 0.55, 0.55], 1.9, 'inst'), P('cyl', [0.35, 0.4, 0.35], 2.55, '#222222'),
                P('cone', [0.08, 0.3, 0.08], 1.95, '#f28c28', [0.55, 0])],
    sled:      [P('box', [1.8, 0.2, 0.9], 0.35, 'inst'), P('box', [1.9, 0.08, 0.1], 0.08, '#555555', [0, 0.38]), P('box', [1.9, 0.08, 0.1], 0.08, '#555555', [0, -0.38])],
    pine:      [P('cyl', [0.2, 0.9, 0.2], 0.45, '#7a5233'), P('cone', [1.0, 1.8, 1.0], 1.7, 'inst'), P('cone', [0.72, 1.3, 0.72], 2.6, 'inst'),
                P('cone', [0.4, 0.55, 0.4], 3.3, '#f7f9fc')],
    // oasis, hanok, campus
    parasol:   [P('cyl', [0.05, 1.8, 0.05], 0.9, '#dddddd'), P('cone', [1.1, 0.4, 1.1], 1.9, 'inst'), P('cyl', [0.5, 0.06, 0.5], 0.75, '#f4f1ea')],
    planter:   [P('box', [1.4, 0.8, 1.4], 0.4, 'inst'), P('blob', [0.8, 0.5, 0.8], 1.0, '#4f9b4f'), P('sphere', [0.25, 0.25, 0.25], 1.3, '#ff7aa8', [0.35, 0.2]),
                P('sphere', [0.25, 0.25, 0.25], 1.3, '#ffd25c', [-0.3, -0.25])],
    fountain:  [P('cyl', [1.0, 0.3, 1.0], 0.15, 'inst'), P('cyl', [0.88, 0.05, 0.88], 0.3, '#7fd1e8'), P('cyl', [0.12, 0.8, 0.12], 0.6, 'inst'),
                P('sphere', [0.3, 0.45, 0.3], 1.15, '#e9f7ff')],
    hanbok:    human('#2a2420', [P('cone', [0.75, 0.9, 0.75], 0.45, 'inst')]),
    jangdok:   [P('blob', [0.85, 0.9, 0.85], 0.85, 'inst'), P('cyl', [0.5, 0.15, 0.5], 1.75, '#3a2618')],
    persimmon: [P('cyl', [0.22, 1.4, 0.22], 0.7, '#6b4228'), P('blob', [1.0, 0.8, 1.0], 1.8, 'inst'),
                P('sphere', [0.14, 0.14, 0.14], 2.2, '#ff8a2a', [0.6, 0.3]), P('sphere', [0.14, 0.14, 0.14], 2.0, '#ff8a2a', [-0.4, -0.5]),
                P('sphere', [0.14, 0.14, 0.14], 2.4, '#ff8a2a', [0.1, 0.65])],
    pagoda:    [P('box', [1.0, 0.4, 1.0], 0.2, 'inst'), P('box', [0.8, 0.5, 0.8], 0.65, 'inst'), P('box', [1.1, 0.12, 1.1], 0.95, 'inst'),
                P('box', [0.6, 0.45, 0.6], 1.25, 'inst'), P('box', [0.85, 0.12, 0.85], 1.5, 'inst'), P('cone', [0.2, 0.5, 0.2], 1.85, 'inst')],
    student:   human(HAIR, [P('box', [0.5, 0.65, 0.3], 1.3, '#5a3d2b', [-0.55, 0])]),
    bicycle:   [P('box', [1.6, 0.6, 0.1], 0.4, '#26262e'), P('box', [1.2, 0.12, 0.12], 0.75, 'inst'), P('box', [0.3, 0.1, 0.25], 0.95, '#2a2a2a', [-0.3, 0])],
    statue:    [P('box', [1.0, 0.6, 1.0], 0.3, '#c9c2b8'), P('capsule', [0.35, 0.4, 0.35], 1.4, 'inst'), P('sphere', [0.32, 0.32, 0.32], 2.4, 'inst')],
    // market, crossing, stadium, construction
    grandma:   human('#c9c2d6', [P('box', [0.45, 0.35, 0.3], 0.8, '#d6608a', [0, 0.7])]),
    fruit:     [P('box', [1.4, 0.6, 1.0], 0.3, '#a0703c'), P('sphere', [0.3, 0.3, 0.3], 0.75, '#e5533d', [0.35, 0.2]),
                P('sphere', [0.3, 0.3, 0.3], 0.75, '#f2c14e', [-0.3, -0.2]), P('sphere', [0.3, 0.3, 0.3], 0.75, '#9bc53d', [0, 0.25])],
    stall:     [P('box', [1.6, 0.7, 1.0], 0.35, '#a0703c'), P('box', [1.8, 0.1, 1.3], 1.4, 'inst'), P('cyl', [0.05, 1.0, 0.05], 0.9, '#dddddd', [0.8, 0.55]),
                P('cyl', [0.05, 1.0, 0.05], 0.9, '#dddddd', [-0.8, 0.55]), P('sphere', [0.25, 0.25, 0.25], 0.85, '#ff8a2a', [0.3, 0])],
    scooter:   [P('box', [1.4, 0.35, 0.4], 0.35, 'inst'), P('box', [0.1, 0.6, 0.5], 0.8, '#2a2a2a', [0.6, 0]), P('capsule', [0.3, 0.25, 0.3], 1.0, '#3b3f52', [-0.2, 0]),
                P('sphere', [0.3, 0.3, 0.3], 1.45, '#f2c14e', [-0.2, 0])],
    commuter:  human(),
    umbrella:  human(HAIR, [P('cyl', [0.04, 1.4, 0.04], 2.6, '#333333'), P('cone', [1.1, 0.45, 1.1], 3.4, 'inst')]),
    fan:       human('#f4f1ea', [P('box', [0.12, 0.6, 0.6], 2.2, '#f4f1ea', [0, 0.65])]),
    ball:      [P('sphere', [1.0, 1.0, 1.0], 1.0, 'inst'), P('box', [1.02, 0.15, 0.4], 1.0, '#222222')],
    foodtruck: [P('box', [2.0, 0.3, 1.0], 0.15, '#26262e'), P('box', [2.0, 1.1, 1.0], 0.85, 'inst'), P('box', [0.9, 0.35, 0.05], 0.95, '#f4f1ea', [0, 0.53]),
                P('box', [1.1, 0.1, 0.4], 1.25, '#e05a4f', [0, 0.7]), P('box', [0.06, 0.16, 0.7], 0.55, '#fff3c4', [1.0, 0], true)],
    cone:      [P('box', [1.2, 0.15, 1.2], 0.08, '#222222'), P('cone', [0.6, 1.8, 0.6], 1.0, 'inst'), P('cyl', [0.42, 0.3, 0.42], 1.0, '#f4f1ea')],
    beam:      [P('box', [2.2, 0.25, 0.25], 0.15, 'inst'), P('box', [2.2, 0.25, 0.25], 0.45, 'inst', [0, 0.25]), P('box', [2.2, 0.25, 0.25], 0.45, 'inst', [0, -0.25])],
    pipe:      [P('box', [1.8, 0.8, 0.8], 0.45, 'inst'), P('box', [1.82, 0.5, 0.5], 0.45, '#5a5f69')],
    excavator: [P('box', [1.4, 0.4, 1.1], 0.25, '#26262e'), P('box', [1.1, 0.8, 0.9], 0.8, 'inst'), P('box', [0.5, 0.6, 0.6], 1.4, '#9fc3e6', [-0.2, 0]),
                P('box', [1.2, 0.2, 0.2], 1.2, 'inst', [0.95, 0]), P('box', [0.35, 0.35, 0.5], 0.7, '#555555', [1.5, 0])],
    // beach, desert
    sunbather: [P('box', [1.8, 0.2, 0.8], 0.15, '#f4f1ea'), P('capsule', [0.4, 0.25, 0.4], 0.45, 'inst'), P('sphere', [0.38, 0.38, 0.38], 0.5, SKIN, [0.75, 0])],
    sandcastle:[P('box', [1.2, 0.6, 1.2], 0.3, 'inst'), P('box', [0.8, 0.5, 0.8], 0.85, 'inst'), P('cyl', [0.18, 0.5, 0.18], 1.0, 'inst', [0.5, 0.5]),
                P('cyl', [0.18, 0.5, 0.18], 1.0, 'inst', [-0.5, -0.5]), P('box', [0.04, 0.4, 0.2], 1.35, '#e5533d')],
    towel:     [P('box', [2.0, 0.05, 1.0], 0.03, 'inst'), P('box', [2.02, 0.06, 0.2], 0.04, '#f4f1ea')],
    tube:      [P('cyl', [1.0, 0.35, 1.0], 0.2, 'inst'), P('cyl', [0.5, 0.37, 0.5], 0.2, '#5ec4d6')],
    surfer:    [P('box', [2.2, 0.08, 0.6], 0.1, '#ffd25c'), P('capsule', [0.45, 0.35, 0.45], 0.8, 'inst'), P('sphere', [0.42, 0.42, 0.42], 1.6, SKIN)],
    traveler:  human('#f4f1ea', [P('box', [0.55, 0.7, 0.35], 1.3, '#7d5a3a', [-0.55, 0])]),
    pot:       [P('blob', [0.8, 0.9, 0.8], 0.8, 'inst'), P('cyl', [0.35, 0.35, 0.35], 1.7, 'inst')],
    camel:     [P('box', [1.6, 0.6, 0.6], 1.3, 'inst'), P('sphere', [0.45, 0.4, 0.45], 1.75, 'inst', [-0.2, 0]), P('box', [1.2, 1.0, 0.4], 0.5, 'inst'),
                P('box', [0.25, 0.8, 0.25], 1.8, 'inst', [0.85, 0]), P('box', [0.45, 0.25, 0.3], 2.2, 'inst', [1.0, 0])],
    palm:      [P('cyl', [0.2, 2.6, 0.2], 1.3, '#8a6a46'), P('box', [1.6, 0.08, 0.4], 2.6, 'inst'), P('box', [0.4, 0.08, 1.6], 2.6, 'inst'),
                P('sphere', [0.3, 0.3, 0.3], 2.5, '#6b4a2a')],
    tent:      [P('cone', [1.1, 1.3, 1.1], 0.65, 'inst'), P('box', [0.5, 0.6, 0.06], 0.3, '#3a2a20', [0, 0.9])],
    // Christmas event
    gift:      [P('box', [1.4, 1.2, 1.4], 0.6, 'inst'), P('box', [1.46, 1.26, 0.26], 0.6, '#ffd25c'), P('box', [0.26, 1.26, 1.46], 0.6, '#ffd25c'),
                P('sphere', [0.35, 0.25, 0.35], 1.3, '#ffd25c')],
    caroler:   [P('capsule', [0.55, 0.5, 0.55], 1.0, 'inst'), P('sphere', [0.55, 0.55, 0.55], 2.45, SKIN), P('cone', [0.5, 0.75, 0.5], 3.1, '#d62c3a'),
                P('sphere', [0.18, 0.18, 0.18], 3.5, '#f7f9fc'), P('box', [0.6, 0.15, 0.62], 1.85, '#f7f9fc')],
    reindeer:  [P('box', [1.6, 0.75, 0.7], 1.3, 'inst'), P('box', [1.3, 0.9, 0.5], 0.45, '#6b4228'), P('box', [0.5, 0.5, 0.42], 1.8, 'inst', [0.9, 0]),
                P('box', [0.1, 0.5, 0.7], 2.25, '#d9c09a', [0.9, 0]), P('sphere', [0.13, 0.13, 0.13], 1.8, '#ff3b3b', [1.17, 0], true)],
    xtree:     [P('cyl', [0.15, 0.6, 0.15], 0.3, '#7a5233'), P('cone', [1.0, 1.4, 1.0], 1.2, 'inst'), P('cone', [0.75, 1.1, 0.75], 2.0, 'inst'),
                P('cone', [0.5, 0.8, 0.5], 2.7, 'inst'), P('sphere', [0.14, 0.14, 0.14], 3.15, '#ffe27a', [0, 0], true),
                P('sphere', [0.09, 0.09, 0.09], 1.3, '#ff5d73', [0.8, 0.3], true), P('sphere', [0.09, 0.09, 0.09], 1.6, '#7fd1e8', [-0.5, 0.55], true),
                P('sphere', [0.09, 0.09, 0.09], 2.1, '#ffd25c', [0.3, -0.55], true), P('sphere', [0.09, 0.09, 0.09], 2.4, '#b5e48c', [-0.45, -0.2], true)],
    sleigh:    [P('box', [1.8, 0.7, 1.0], 0.55, 'inst'), P('box', [1.9, 0.08, 0.1], 0.08, '#ffd25c', [0, 0.42]), P('box', [1.9, 0.08, 0.1], 0.08, '#ffd25c', [0, -0.42]),
                P('box', [0.7, 0.5, 0.7], 1.1, '#2f9e5a', [-0.4, 0]), P('box', [0.5, 0.4, 0.5], 1.05, '#ffd25c', [0.3, 0])],
    // farm
    chicken:   [P('blob', [0.8, 0.7, 0.6], 0.7, 'inst'), P('sphere', [0.35, 0.35, 0.35], 1.3, 'inst', [0.5, 0]), P('box', [0.1, 0.25, 0.08], 1.65, '#e5533d', [0.5, 0]),
                P('cone', [0.08, 0.2, 0.08], 1.3, '#f2a33a', [0.85, 0])],
    sheep:     [P('blob', [1.1, 0.75, 0.85], 0.95, 'inst'), P('sphere', [0.38, 0.38, 0.38], 1.15, '#3a3330', [1.0, 0]), P('box', [0.9, 0.5, 0.6], 0.25, '#3a3330')],
    cow:       [P('box', [1.8, 0.8, 0.8], 1.0, 'inst'), P('box', [0.55, 0.82, 0.5], 1.0, '#2a2420', [-0.3, 0]), P('box', [0.5, 0.5, 0.45], 1.2, 'inst', [1.1, 0]),
                P('box', [1.5, 0.6, 0.6], 0.3, '#2a2420')],
    tractor:   [P('box', [1.4, 0.8, 1.0], 0.7, 'inst'), P('box', [0.7, 0.7, 0.8], 1.45, '#9fc3e6', [-0.3, 0]), P('box', [0.8, 0.9, 1.25], 0.45, '#26262e', [-0.45, 0]),
                P('box', [0.5, 0.5, 1.15], 0.25, '#26262e', [0.55, 0]), P('box', [0.06, 0.16, 0.6], 0.8, '#fff3c4', [0.72, 0], true)],
    haystack:  [P('cyl', [1.0, 1.1, 1.0], 0.55, 'inst'), P('cone', [1.02, 0.4, 1.02], 1.3, '#d9b55a')],
  };

  // Canvas textures made once: wall windows by day, a lit-window pattern for night, a roof rim.
  // Day and night share one 4×4 cell layout so they use the same UVs.
  function makeTextures() {
    const mk = draw => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      draw(c.getContext('2d'));
      const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4;
      return t;
    };
    const cells = (g, wall, win) => {
      g.fillStyle = wall; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = win(); g.fillRect(i * 64 + 14, j * 64 + 16, 36, 30); }
    };
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    return {
      windows: mk(g => cells(g, '#ffffff', () => '#8796ad')),
      plain: mk(g => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256); }),
      lit: mk(g => cells(g, '#121212', () => (rnd() < 0.55 ? '#ffffff' : '#262626'))),
      dark: mk(g => { g.fillStyle = '#121212'; g.fillRect(0, 0, 256, 256); }),
      planks: mk(g => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#d6d6d6'; for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 3, 256); }),
      roof: mk(g => { g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#ffffff'; g.fillRect(12, 12, 232, 232); }),
      // Per-theme walls (multiplied by the wall color) and roof shapes (multiplied by the roof color).
      glass: mk(g => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#9cc0e6'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.fillRect(i * 64 + 4, j * 64 + 4, 56, 56); }),
      brick: mk(g => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#d2c4bc';
        for (let y = 0; y < 256; y += 16) { g.fillRect(0, y, 256, 3); for (let x = (y / 16) % 2 ? 0 : 16; x < 256; x += 32) g.fillRect(x, y, 3, 16); } }),
      adobe: mk(g => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i * 7 + j * 3) % 3 !== 1) { g.fillStyle = '#5a4634'; g.fillRect(i * 64 + 22, j * 64 + 18, 20, 26); g.fillStyle = '#e4d6bd'; g.fillRect(i * 64 + 18, j * 64 + 14, 28, 4); } }),
      hanok: mk(g => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
        for (let j = 0; j < 4; j++) { g.fillStyle = '#7a5433'; g.fillRect(0, j * 64, 256, 7); // lintel beam
          for (let i = 0; i < 4; i++) { g.fillStyle = '#6b4a2b'; g.fillRect(i * 64, j * 64, 9, 64); // post
            g.fillStyle = '#8a6a3a'; g.fillRect(i * 64 + 18, j * 64 + 16, 34, 44); g.fillStyle = '#e9d9b8'; g.fillRect(i * 64 + 21, j * 64 + 19, 28, 38); // lattice door
            g.fillStyle = '#8a6a3a'; for (let k = 0; k < 3; k++) { g.fillRect(i * 64 + 21 + k * 10 + 7, j * 64 + 19, 2, 38); g.fillRect(i * 64 + 21, j * 64 + 19 + k * 12 + 10, 28, 2); } } } }),
      corrugated: mk(g => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#cfcfcf'; for (let x = 0; x < 256; x += 10) g.fillRect(x, 0, 3, 256); g.fillStyle = '#b89a7a'; g.fillRect(0, 118, 256, 6); }),
      concrete: mk(g => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = '#3a3a3a'; g.fillRect(i * 64 + 7, j * 64 + 8, 50, 40); g.fillStyle = '#d6d2c8'; g.fillRect(i * 64 + 7, j * 64 + 48, 50, 4); } }),
      shingles: mk(g => { g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#d6d6d6'; for (let y = 0; y < 256; y += 24) g.fillRect(0, y, 256, 4); }),
      tiles: mk(g => { g.fillStyle = '#ececf0'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#b4b6be'; for (let x = 0; x < 256; x += 14) g.fillRect(x, 0, 4, 256); g.fillStyle = '#c8cad2'; for (let y = 0; y < 256; y += 28) g.fillRect(0, y, 256, 3); }),
      snowroof: mk(g => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#e4ebf3'; for (let y = 20; y < 256; y += 40) g.fillRect(0, y, 256, 5); }),
    };
  }
  const WIN_W = 14, WIN_H = 12; // world units per window cell

  // Roof shapes in unit space: footprint ±0.5 at y 0, apex at y 1. Faces wound outward; UVs planar.
  function roofGeometry(kind) {
    const pos = [], nor = [], uv = [], ctr = [0, 0.35, 0];
    const tri = (a, b, c) => {
      // tile ribs run down the slope: faces that look along x take their stripes from z
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const m = Math.hypot(...n) || 1; n = n.map(x => x / m);
      const out = (a[0] + b[0] + c[0]) / 3 - ctr[0], outy = (a[1] + b[1] + c[1]) / 3 - ctr[1], outz = (a[2] + b[2] + c[2]) / 3 - ctr[2];
      const pts = n[0] * out + n[1] * outy + n[2] * outz < 0 ? [a, c, b] : [a, b, c];
      if (n[0] * out + n[1] * outy + n[2] * outz < 0) n = n.map(x => -x);
      const sideways = Math.abs(n[0]) > Math.abs(n[2]);
      for (const p of pts) { pos.push(...p); nor.push(...n); uv.push(((sideways ? p[2] : p[0]) + 0.5) * 4, ((sideways ? p[0] : p[2]) + 0.5) * 4); }
    };
    const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
    const A = [-.5, 0, -.5], B = [.5, 0, -.5], C = [.5, 0, .5], D = [-.5, 0, .5];
    if (kind === 'gable') { // ridge along x
      const E = [-.5, 1, 0], F = [.5, 1, 0];
      quad(A, B, F, E); quad(D, C, F, E); tri(A, E, D); tri(B, F, C);
    } else if (kind === 'hip') { // hip: a flattened pyramid with a small flat top
      const k = 0.22, a = [-k, 1, -k], b = [k, 1, -k], c = [k, 1, k], d = [-k, 1, k];
      quad(A, B, b, a); quad(B, C, c, b); quad(C, D, d, c); quad(D, A, a, d); quad(a, b, c, d);
    } else { // hanok: eave corners lifted (the curve of 처마), a long ridge, and a pale ridge cap (용마루) in its own group
      const up = 0.14, Au = [-.5, up, -.5], Bu = [.5, up, -.5], Cu = [.5, up, .5], Du = [-.5, up, .5];
      const M1 = [0, 0, -.5], M2 = [.5, 0, 0], M3 = [0, 0, .5], M4 = [-.5, 0, 0], E = [-.36, 1, 0], F = [.36, 1, 0];
      tri(Au, M1, E); tri(M1, F, E); tri(M1, Bu, F); // front slope
      tri(Du, M3, E); tri(M3, F, E); tri(M3, Cu, F); // back slope
      tri(Au, E, M4); tri(M4, E, Du); tri(Bu, M2, F); tri(M2, Cu, F); // ends
      const n0 = pos.length / 3, cx = 0.42, cz = 0.06, y0 = 0.96, y1 = 1.12;
      quad([-cx, y1, -cz], [cx, y1, -cz], [cx, y1, cz], [-cx, y1, cz]);
      quad([-cx, y0, -cz], [cx, y0, -cz], [cx, y1, -cz], [-cx, y1, -cz]); quad([-cx, y0, cz], [cx, y0, cz], [cx, y1, cz], [-cx, y1, cz]);
      quad([-cx, y0, -cz], [-cx, y0, cz], [-cx, y1, cz], [-cx, y1, -cz]); quad([cx, y0, -cz], [cx, y0, cz], [cx, y1, cz], [cx, y1, -cz]);
      // pale lines along the four hips (추녀마루) and the eave edges (처마 끝), laid just above the slopes
      const strip = (p, q, w) => { const dx = q[2] - p[2], dz = -(q[0] - p[0]), m = Math.hypot(dx, dz) || 1, ox = dx / m * w, oz = dz / m * w, lift = 0.02;
        quad([p[0] - ox, p[1] + lift, p[2] - oz], [p[0] + ox, p[1] + lift, p[2] + oz], [q[0] + ox, q[1] + lift, q[2] + oz], [q[0] - ox, q[1] + lift, q[2] - oz]); };
      for (const [r, c] of [[E, Au], [E, Du], [F, Bu], [F, Cu]]) strip(r, c, 0.018);
      for (const [a, b] of [[Au, M1], [M1, Bu], [Bu, M2], [M2, Cu], [Cu, M3], [M3, Du], [Du, M4], [M4, Au]]) strip(a, b, 0.016);
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.addGroup(0, n0, 0); g.addGroup(n0, pos.length / 3 - n0, 1);
      return g;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    return g;
  }
  const ROOFS = { gable: roofGeometry('gable'), hip: roofGeometry('hip'), hanok: roofGeometry('hanok') };

  // A unit box whose wall UVs count windows in world units, so every building gets the same window size.
  function buildingGeometry(b, shift) {
    const g = unit.box.clone(); g.userData.own = true;
    const uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) {
      if (f === 2 || f === 3) continue; // roof and floor keep 0..1
      const width = f < 2 ? b.d : b.w;
      for (let k = f * 4; k < f * 4 + 4; k++) uv.setXY(k, uv.getX(k) * width / (WIN_W * 4) + shift, uv.getY(k) * b.h / (WIN_H * 4));
    }
    // Two draw groups instead of six: the four walls together (material 0), then the roof (1).
    // The floor (face 3) is never seen, so it is dropped.
    const idx = g.index.array, face = f => Array.from(idx.slice(f * 6, f * 6 + 6));
    g.setIndex([0, 1, 4, 5, 2].flatMap(face));
    g.clearGroups(); g.addGroup(0, 24, 0); g.addGroup(24, 6, 1);
    return g;
  }

  function create(canvas) {
    const renderer = new T.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    const scene = new T.Scene();
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
    // First person (experimental): a perspective camera at the shadow's eye height. Fog is always on so
    // switching views never recompiles shaders; top-down pushes it far out of sight.
    const fpCamera = new T.PerspectiveCamera(72, 1, 1, 2000);
    const FAR_FOG = 1e5;
    scene.fog = new T.Fog(0xbcd9f0, FAR_FOG, FAR_FOG * 2);
    const SKY = { day: col('#bcd9f0'), dusk: col('#f0a46e'), night: col('#1b1830') };
    const skyCol = new T.Color();
    const hemi = new T.HemisphereLight(0xffffff, 0x8a7f70, 0.55);
    scene.add(hemi);
    const sunLight = new T.DirectionalLight(0xfff4dd, 0.9);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    // Small biases: larger ones detach shadows from wall bases at low sun ("peter-panning"),
    // leaving a lit strip where the rule says shade. Ground never casts, so it cannot acne.
    sunLight.shadow.bias = -0.0001;
    sunLight.shadow.normalBias = 0.15;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 7000;
    scene.add(sunLight, sunLight.target);

    // Player: a soft dome standing on its wobbling ground shadow, with eyes and a mouth that opens to eat.
    // The footprint stays the r-disc the game collides with; the dome only adds height.
    const BLOB_N = 40;
    const blobGeo = new T.CircleGeometry(1, BLOB_N);
    blobGeo.rotateX(-Math.PI / 2);
    const blobBase = Float32Array.from(blobGeo.attributes.position.array);
    const blobMat = new T.MeshBasicMaterial({ color: 0x0b0620, transparent: true, opacity: 0.55, depthWrite: false });
    const blob = new T.Mesh(blobGeo, blobMat);
    blob.renderOrder = 5;
    const ringGeo = new T.RingGeometry(1.0, 1.12, BLOB_N); ringGeo.rotateX(-Math.PI / 2);
    // Rim: the skin's color in the dark so the blob stays visible at night, always red while lit.
    const LIT_RIM = 0xff6b6b;
    let rimColor = 0xb78cff, bodyColor = col(0xfff7f8), glowColor = col(0xb78cff);
    const rimMat = new T.MeshBasicMaterial({ color: rimColor, transparent: true, opacity: 0.85, depthWrite: false });
    const litRing = new T.Mesh(ringGeo, rimMat);
    litRing.renderOrder = 6;
    // Body: a round bean (sphere squashed to BODY_SY, centered BODY_Y·r up, its bottom under the ground)
    // with the face on its front. Shading is baked into vertex colors (white top, lavender underside)
    // so it needs no lights and looks the same by day and night.
    // Mochi shape: the lower half spreads out and the top stays round, like a soft rice cake sitting down.
    const BODY_Y = 0.5, BODY_SY = 0.86;
    const bodyGeo = new T.SphereGeometry(1, 32, 20);
    const bodyCols = [], under = col(0xc9b2f2), top = col(0xffffff), bp = bodyGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i), spread = 1 + Math.max(0, -y) * 0.14 - Math.max(0, y) * 0.04;
      bp.setXYZ(i, bp.getX(i) * spread, y, bp.getZ(i) * spread);
      const c = under.clone().lerp(top, Math.pow((y + 1) / 2, 0.6));
      bodyCols.push(c.r, c.g, c.b);
    }
    bodyGeo.computeBoundingSphere();
    bodyGeo.setAttribute('color', new T.Float32BufferAttribute(bodyCols, 3));
    const bodyMat = new T.MeshBasicMaterial({ color: bodyColor, vertexColors: true });
    const body = new T.Mesh(bodyGeo, bodyMat);
    const armMat = new T.MeshBasicMaterial({ color: 0xf1e8ff }); // the shared sphere has no vertex colors
    const arms = [0, 1].map(() => new T.Mesh(unit.sphere, armMat));
    // Mouth: a crimson lip with a dark throat just in front of it, so an open mouth reads as a hole.
    const mouth = new T.Mesh(unit.sphere, new T.MeshBasicMaterial({ color: 0xd8436a }));
    const throat = new T.Mesh(unit.sphere, new T.MeshBasicMaterial({ color: 0x3a0e2a }));
    const eyeMat = new T.MeshBasicMaterial({ color: 0x241640 });
    const pupilMat = new T.MeshBasicMaterial({ color: 0xffffff });
    const eyes = [0, 1].map(() => {
      const e = new T.Mesh(unit.sphere, eyeMat), p = new T.Mesh(unit.sphere, pupilMat);
      scene.add(e, p);
      return { e, p };
    });
    // Growth glow: a swirl of violet darkness shows through the body as it grows (a translucent shell over it).
    const swirl = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      grd.addColorStop(0, 'rgba(201,77,255,1)'); grd.addColorStop(1, 'rgba(58,14,106,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.1) { const r = 6 + a * 3.4; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
      g.stroke();
      const tex = new T.CanvasTexture(c); tex.wrapS = tex.wrapT = T.RepeatWrapping; return tex;
    })();
    const auraMat = new T.MeshBasicMaterial({ map: swirl, color: 0xb78cff, transparent: true, opacity: 0, depthWrite: false });
    const aura = new T.Mesh(bodyGeo, auraMat);
    aura.renderOrder = 7;
    const cheekMat = new T.MeshBasicMaterial({ color: 0xff9fc0, transparent: true, opacity: 0.55, depthWrite: false });
    const cheeks = [0, 1].map(() => new T.Mesh(unit.sphere, cheekMat));
    scene.add(body, aura, mouth, throat, ...arms, ...cheeks);
    // A point on the body's surface: horizontal angle a, elevation el (radians), pushed out by `out`·r.
    const onBody = (player, a, el, out, v) => {
      const r = player.r, c = Math.cos(el);
      return v.set(player.x + Math.cos(a) * c * r * (1 + out), r * BODY_Y + Math.sin(el) * r * BODY_SY * (1 + out),
        player.y + Math.sin(a) * c * r * (1 + out));
    };
    scene.add(blob, litRing);

    // Twists: cloud shade drifting on the ground and gold rings under golden friends, instanced; counts set per frame.
    const MAX_CLOUDS = 12, MAX_GOLD = 6;
    const cloudGeo = new T.CircleGeometry(1, 36); cloudGeo.rotateX(-Math.PI / 2);
    const cloudShade = new T.InstancedMesh(cloudGeo, new T.MeshBasicMaterial({ color: 0x120a2a, transparent: true, opacity: 0.45, depthWrite: false }), MAX_CLOUDS);
    cloudShade.renderOrder = 4; cloudShade.count = 0; cloudShade.frustumCulled = false;
    const goldGeo = new T.RingGeometry(0.75, 1.15, 28); goldGeo.rotateX(-Math.PI / 2);
    const goldMat = new T.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.9, depthWrite: false });
    const goldRings = new T.InstancedMesh(goldGeo, goldMat, MAX_GOLD);
    goldRings.renderOrder = 4; goldRings.count = 0; goldRings.frustumCulled = false;
    // A gold pillar of light rises over each golden friend so it can't be mistaken for an orange hint ring.
    const goldBeam = new T.InstancedMesh(new T.CylinderGeometry(1, 1, 1, 12, 1, true),
      new T.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.25, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }), MAX_GOLD);
    goldBeam.renderOrder = 8; goldBeam.count = 0; goldBeam.frustumCulled = false;
    scene.add(cloudShade, goldRings, goldBeam);

    // Edible hint rings, instanced; count is set per frame.
    const MAX_HINTS = 400;
    const hintGeo = new T.RingGeometry(1.15, 1.4, 28); hintGeo.rotateX(-Math.PI / 2);
    const hintMat = new T.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.7, depthWrite: false });
    const hints = new T.InstancedMesh(hintGeo, hintMat, MAX_HINTS);
    hints.renderOrder = 4;
    scene.add(hints);

    const TEX = makeTextures();
    const NIGHT_WINDOWS = col('#ffc46b');
    const dummy = new T.Object3D();
    const tmpCol = new T.Color();
    let world = null, group = null, vw = 1, vh = 1;

    function disposeGroup() {
      if (!group) return;
      group.traverse(o => {
        if (o.isInstancedMesh) o.dispose();
        if (o.material) [].concat(o.material).forEach(m => m.dispose());
        if (o.geometry && o.geometry.userData.own) o.geometry.dispose();
      });
      scene.remove(group);
    }

    function lambert(color, extra) { return new T.MeshLambertMaterial(Object.assign({ color: col(color) }, extra)); }

    function build(w) {
      disposeGroup();
      world = w;
      group = new T.Group();
      scene.add(group);
      const { WORLD, CELL, ROAD, waterY, stage } = w;

      const groundGeo = new T.PlaneGeometry(WORLD, waterY); groundGeo.rotateX(-Math.PI / 2); groundGeo.userData.own = true;
      w.groundMat = lambert(stage.ground[0]);
      const ground = new T.Mesh(groundGeo, w.groundMat);
      ground.position.set(WORLD / 2, 0, waterY / 2);
      ground.receiveShadow = true;
      ground.userData.ground = true;
      group.add(ground);

      w.waterMat = null;
      if (waterY < WORLD) {
        const wg = new T.PlaneGeometry(WORLD, WORLD - waterY, 1, 1); wg.rotateX(-Math.PI / 2); wg.userData.own = true;
        w.waterMat = new T.MeshPhongMaterial({ color: col(stage.water[0]), shininess: 60, specular: 0x334455 });
        const water = new T.Mesh(wg, w.waterMat);
        water.position.set(WORLD / 2, -1.5, waterY + (WORLD - waterY) / 2);
        water.receiveShadow = true;
        group.add(water);
        const quay = new T.Mesh(unit.box, lambert('#7d7a76'));
        quay.scale.set(WORLD, 4, 8); quay.position.set(WORLD / 2, -0.5, waterY - 3);
        quay.receiveShadow = true;
        group.add(quay);
      }

      w.roadMat = lambert('#b9b4a8');
      for (let k = 0; k <= WORLD / CELL; k++) {
        const v = new T.Mesh(unit.box, w.roadMat);
        v.scale.set(ROAD, 0.4, waterY - 6); v.position.set(k * CELL, 0.2, (waterY - 6) / 2);
        v.receiveShadow = true; v.userData.ground = true; group.add(v);
        if (k * CELL < waterY - 6) {
          const h = new T.Mesh(unit.box, w.roadMat);
          h.scale.set(WORLD, 0.4, ROAD); h.position.set(WORLD / 2, 0.21, k * CELL);
          h.receiveShadow = true; h.userData.ground = true; group.add(h);
        }
      }

      // Street dressing: lane dashes, crosswalks, curbs and lamps. Not marked as ground and never
      // casting shadows, so the shadow rule (and the QA pixel check) only sees buildings.
      const cells = WORLD / CELL, land = waterY - 40;
      const dashes = [], stripes = [], curbs = [], lamps = [];
      const nearCross = v => Math.abs(v - Math.round(v / CELL) * CELL) < ROAD / 2 + 10;
      for (let k = 0; k <= cells; k++) {
        const c = k * CELL;
        for (let a = 15; a < WORLD; a += 30) {
          if (nearCross(a)) continue;
          if (a < waterY - 12) dashes.push([c, a, 1.6, 12]);
          if (c < waterY - 12) dashes.push([a, c, 12, 1.6]);
        }
        for (let m = 0; m <= cells; m++) {
          const r = m * CELL;
          if (r > land && c > land) continue;
          for (let i = -2; i <= 2; i++) {
            const off = ROAD / 2 + 7;
            if (r <= land) { stripes.push([c - off, r + i * 8, 10, 4.5]); stripes.push([c + off, r + i * 8, 10, 4.5]); }
            if (c <= land) { stripes.push([c + i * 8, r - off, 4.5, 10]); stripes.push([c + i * 8, r + off, 4.5, 10]); }
          }
          if (r <= land && c <= land && (k + m) % 2 === 0) lamps.push([c + ROAD / 2 + 4, r + ROAD / 2 + 4]);
        }
      }
      for (let gy = 0; gy < cells; gy++) for (let gx = 0; gx < cells; gx++) {
        const x0 = gx * CELL + ROAD / 2, y0 = gy * CELL + ROAD / 2, inner = CELL - ROAD;
        if (y0 + inner > land) continue;
        curbs.push([x0 + inner / 2, y0 + 3, inner, 6], [x0 + inner / 2, y0 + inner - 3, inner, 6],
                   [x0 + 3, y0 + inner / 2, 6, inner - 12], [x0 + inner - 3, y0 + inner / 2, 6, inner - 12]);
      }
      const slabs = (list, mat, y, h) => {
        const im = new T.InstancedMesh(unit.box, mat, list.length);
        list.forEach(([x, z, sx, sz], i) => {
          dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(sx, h, sz); dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
        });
        im.receiveShadow = true; group.add(im);
        return im;
      };
      w.paintMat = lambert('#f4efe2');
      w.curbMat = lambert('#d9d2c2');
      slabs(dashes, w.paintMat, 0.55, 0.3);
      slabs(stripes, w.paintMat, 0.55, 0.3);
      slabs(curbs, w.curbMat, 0.45, 0.9);
      // Lawns on open lots (inside the curbs) for maps that have them; drawn above the ground, not part of it.
      w.lawnMat = null;
      if (stage.lawn && w.lots.length) {
        w.lawnMat = lambert(stage.lawn);
        slabs(w.lots.filter(([, y0, inner]) => y0 + inner <= land).map(([x0, y0, inner]) => [x0 + inner / 2, y0 + inner / 2, inner - 12, inner - 12]),
          w.lawnMat, 0.35, 0.5);
      }
      const poleMat = lambert('#3d3b4a');
      w.lampMat = new T.MeshBasicMaterial({ color: col('#d8d4c8') });
      w.haloMat = new T.MeshBasicMaterial({ color: col('#ffb84d'), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
      const lampParts = [[unit.cyl, poleMat, 13, [1.2, 26, 1.2]], [unit.sphere, w.lampMat, 27, [3.2, 3.2, 3.2]], [unit.sphere, w.haloMat, 27, [12, 12, 12]]];
      for (const [geo, mat, y, sc] of lampParts) {
        const im = new T.InstancedMesh(geo, mat, lamps.length);
        lamps.forEach(([x, z], i) => {
          dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(...sc); dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
        });
        if (mat === w.haloMat) im.renderOrder = 2;
        group.add(im);
      }

      // Buildings cast the only shadows in the scene, matching the game rule.
      // Walls get a lighter, self-lit tone so a camera-facing wall never reads as a ground shadow.
      // Windows come from a texture; at night the emissive map swaps to lit windows (no shader change).
      const mats = {};
      w.wallMats = [];
      const propMat = lambert('#a19d94');
      // The theme's look: which wall texture, and what color the walls take (default: the roof color lightened).
      const look = w.stage.look || {};
      const WALL_BASE = { glass: '#cfe3f5', brick: '#b86a4e', adobe: '#e9d3a8', hanok: '#f3e7cf', concrete: '#b9b7b0' };
      const wallKindOf = b => b.plain && !look.wall ? 'planks' : look.wall || 'windows';
      const litAtNight = k => k === 'windows' || k === 'glass';
      for (const b of w.buildings) {
        const kind = wallKindOf(b);
        const key = b.crane ? 'crane' : b.roof + '/' + kind;
        if (!mats[key]) {
          const wallCol = WALL_BASE[kind] ? col(WALL_BASE[kind]).lerp(col(b.roof), kind === 'glass' ? 0.25 : 0.1)
            : col(b.roof).lerp(col('#ffffff'), kind === 'pastel' ? 0.55 : 0.35);
          const glow = wallCol.clone().multiplyScalar(0.35);
          const map = { windows: TEX.windows, planks: TEX.planks, pastel: TEX.planks, glass: TEX.glass, brick: TEX.brick, adobe: TEX.adobe,
            hanok: TEX.hanok, corrugated: TEX.corrugated, concrete: TEX.concrete }[kind] || TEX.windows;
          const wall = b.crane ? lambert(wallCol, { emissive: glow }) : lambert(wallCol, { map, emissive: glow, emissiveMap: TEX.plain });
          wall.userData.day = glow; wall.userData.night = litAtNight(kind) ? TEX.lit : TEX.dark;
          if (!b.crane) w.wallMats.push(wall);
          const roof = lambert(b.roof, b.crane ? {} : { map: TEX.roof });
          // Cranes use the shared six-face box (+x -x +y -y +z -z); other buildings their own two-group box.
          mats[key] = { roof, faces: b.crane ? [wall, wall, roof, wall, wall, wall] : [wall, roof] };
        }
        const hash = Math.abs(Math.round(b.x * 7 + b.y * 13));
        const mesh = new T.Mesh(b.crane ? unit.box : buildingGeometry(b, (hash % 4) / 4), mats[key].faces);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
        b.mesh = mesh;
        if (b.crane) { // boom over the water; drawn but casts no gameplay shadow
          const boom = new T.Mesh(unit.box, lambert('#e0a92e'));
          boom.scale.set(6 / 18, 6 / b.h, 90 / 18);
          boom.position.set(0, 0.5 - 3 / b.h, 0.5 + 45 / 18);
          mesh.add(boom);
        } else { // one or two rooftop units; they cast no shadow, so the rule stays buildings-only
          for (let k = 0; k <= hash % 2; k++) {
            const prop = new T.Mesh(unit.box, propMat), sz = 9 + (hash >> (k + 2)) % 8;
            prop.scale.set(sz / b.w, 5 / b.h, sz / b.d);
            prop.position.set((((hash >> (k * 3)) % 5) - 2) * 0.12, 0.5 + 2.5 / b.h, (((hash >> (k * 3 + 4)) % 5) - 2) * 0.12);
            prop.receiveShadow = true;
            mesh.add(prop);
          }
        }
        placeBuilding(b, b.x + b.w / 2, b.y + b.d / 2, 1, 0);
      }
      w.roofMats = Object.values(mats).map(m => m.roof);

      // Shaped roofs (gable / hip): one instanced mesh for the whole map, colored per building, no gameplay shadow
      // (the rule and the shadow map use the wall box only). placeBuilding keeps each instance over its building.
      w.roofIM = null;
      if (ROOFS[look.roof]) {
        const list = w.buildings.filter(b => !b.crane);
        const roofMat = lambert('#ffffff', { map: look.snow ? TEX.snowroof : look.roof === 'flat' ? TEX.roof : look.roof === 'gable' ? TEX.shingles : TEX.tiles });
        const capMat = lambert('#e6e4e0'); // pale ridge cap, hip lines and eave edges of a hanok roof; the second geometry group
        const im = new T.InstancedMesh(ROOFS[look.roof], look.roof === 'hanok' ? [roofMat, capMat] : roofMat, list.length);
        im.receiveShadow = true; im.frustumCulled = false;
        list.forEach((b, i) => { b.roofIM = im; b.roofIdx = i; im.setColorAt(i, look.snow ? col('#f7f9fc').lerp(col(b.roof), 0.15) : col(b.roof)); });
        im.instanceColor.needsUpdate = true;
        group.add(im); w.roofIM = im; w.roofMats.push(roofMat);
        if (look.base) { // a stone platform under each building (기단), a shade lighter than the ground
          const bim = new T.InstancedMesh(unit.box, lambert('#cfc6b6'), list.length);
          bim.receiveShadow = true; bim.frustumCulled = false;
          list.forEach((b, i) => { b.baseIM = bim; b.baseIdx = i; });
          group.add(bim);
        }
        for (const b of list) placeBuilding(b, b.x + b.w / 2, b.y + b.d / 2, 1, 0);
      }

      // Small objects: one InstancedMesh per (type, part).
      const byType = {};
      for (const o of w.objects) (byType[o.type] = byType[o.type] || []).push(o);
      w.instanced = [];
      for (const [type, list] of Object.entries(byType)) {
        for (const part of PARTS[type]) {
          const c = part.color === 'inst' ? '#ffffff' : part.color;
          const mat = part.glow ? new T.MeshBasicMaterial({ color: col(c) }) : lambert(c);
          const im = new T.InstancedMesh(low[part.geo], mat, list.length);
          im.receiveShadow = true;
          // Every part gets an instance color up front (white = the material's own color), so turning an object
          // golden later is just a color write, never a shader recompile.
          list.forEach((o, i) => im.setColorAt(i, tmpCol.set(part.color === 'inst' ? o.color : '#ffffff')));
          im.instanceColor.needsUpdate = true;
          group.add(im);
          w.instanced.push({ im, part, list, hidden: new Uint8Array(list.length) });
        }
      }
      for (const o of w.objects) o.dirty = true;

      // Guards: few, so plain meshes.
      const guardMat = lambert('#2f3e66'), skinMat = lambert('#f6d2b0'), lampMat = new T.MeshBasicMaterial({ color: 0xffd23f });
      const bossMat = lambert('#5a2a6e');
      for (const g of w.guards) {
        const gg = new T.Group();
        g.k = g.boss ? g.r / 9 : 1; // the boss is a guard scaled up to its radius
        const body = new T.Mesh(unit.cyl, g.boss ? bossMat : guardMat); body.scale.set(5, 18, 5); body.position.y = 9;
        const head = new T.Mesh(unit.sphere, skinMat); head.scale.setScalar(4.5); head.position.y = 22;
        const lamp = new T.Mesh(unit.box, lampMat); lamp.scale.set(6, 3, 3); lamp.position.set(7, 14, 0);
        body.receiveShadow = head.receiveShadow = true;
        gg.add(body, head, lamp);
        group.add(gg);
        g.mesh = gg;
      }

      // Beams: flat translucent fans on the ground.
      w.beamMeshes = [];
      const beamMat = new T.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.32, depthWrite: false });
      const beamsOf = w.guards.concat(w.lighthouse ? [w.lighthouse] : []);
      for (const b of beamsOf) {
        const geo = new T.CircleGeometry(b.range, 28, -b.half, b.half * 2); geo.rotateX(-Math.PI / 2); geo.userData.own = true;
        const m = new T.Mesh(geo, beamMat);
        m.renderOrder = 3;
        group.add(m);
        w.beamMeshes.push({ src: b, mesh: m });
      }

      if (w.lighthouse) {
        const L = w.lighthouse, tower = new T.Group();
        const shaft = new T.Mesh(unit.cyl, lambert('#f4f1ea')); shaft.scale.set(14, 110, 14); shaft.position.y = 55;
        const band = new T.Mesh(unit.cyl, lambert('#d9534f')); band.scale.set(14.5, 22, 14.5); band.position.y = 70;
        const lamp = new T.Mesh(unit.sphere, new T.MeshBasicMaterial({ color: 0xfff3b0 })); lamp.scale.setScalar(9); lamp.position.y = 118;
        tower.add(shaft, band, lamp);
        tower.position.set(L.x, 0, L.y);
        group.add(tower);
      }
    }

    // While swallowed, `lift` raises it toward the player's mouth.
    function placeBuilding(b, cx, cy, s, lift) {
      b.mesh.visible = s > 0.01;
      b.mesh.scale.set(b.w * s, b.h * s, b.d * s);
      b.mesh.position.set(cx, b.h * s / 2 + lift, cy);
      if (b.roofIM) { // the shaped roof sits on the wall box, ridge along the longer side, overhanging by `eave`
        const look = world.stage.look, e = 1 + (look.eave || 0.1), along = b.w >= b.d;
        // houses get the shaped roof; a tall block (over gableMax) keeps its flat top, like an apartment building
        const tall = look.roof === 'gable' && b.h > (look.gableMax || 80);
        const rise = tall ? 0 : Math.min((look.rise || 0.35) * b.h, 0.6 * Math.min(b.w, b.d));
        dummy.position.set(cx, b.h * s + lift, cy); dummy.rotation.set(0, along ? 0 : Math.PI / 2, 0);
        dummy.scale.set((along ? b.w : b.d) * s * e || 1e-6, rise * s || 1e-6, (along ? b.d : b.w) * s * e || 1e-6);
        dummy.updateMatrix(); b.roofIM.setMatrixAt(b.roofIdx, dummy.matrix); b.roofIM.instanceMatrix.needsUpdate = true;
        if (b.baseIM) {
          dummy.position.set(cx, 1.5 * s + lift, cy); dummy.rotation.set(0, 0, 0);
          dummy.scale.set(b.w * s * 1.14 || 1e-6, 3 * s || 1e-6, b.d * s * 1.14 || 1e-6);
          dummy.updateMatrix(); b.baseIM.setMatrixAt(b.baseIdx, dummy.matrix); b.baseIM.instanceMatrix.needsUpdate = true;
        }
      }
    }

    // Quality steps, lowered by the game when frames run slow: 0 full, 1 lower resolution,
    // 2 lowest resolution and a smaller, hard-edged shadow map. Shader programs stay the same.
    let quality = 0, lastDpr = 1;
    const PIXEL_CAP = [2, 1.5, 1];
    function resize(w, h, dpr) {
      vw = w; vh = h; lastDpr = dpr || 1;
      renderer.setPixelRatio(Math.min(lastDpr, PIXEL_CAP[quality]));
      renderer.setSize(w, h, false);
    }
    function setQuality(q) {
      quality = Math.max(0, Math.min(2, q));
      resize(vw, vh, lastDpr);
      const size = quality === 2 ? 1024 : 2048;
      if (sunLight.shadow.mapSize.x !== size) {
        sunLight.shadow.mapSize.set(size, size);
        if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
      }
      return quality;
    }

    function dayColor(trio, night, phase) {
      if (phase.night) return tmpCol.set(night);
      const t = phase.dayT;
      return t < 0.5 ? tmpCol.set(trio[0]).lerp(col(trio[1]), t / 0.5) : tmpCol.set(trio[1]).lerp(col(trio[2]), (t - 0.5) / 0.5);
    }

    function draw(f) {
      if (!world) return;
      const { phase, sun, player, t } = f;

      // Camera: orthographic, tilted 55°, `view` world units across the shorter screen side.
      // In first person the light/shadow box centers ahead of the player instead of under the camera.
      const aspect = vw / vh;
      const halfW = aspect < 1 ? f.view / 2 : f.view / 2 * aspect;
      const halfH = halfW / aspect;
      // f.fp (0..1) blends the top-down view into first person: a perspective camera swoops from a
      // narrow-angle copy of the top-down shot down to the shadow's eye height, easing in and out.
      const k = Math.max(0, Math.min(1, f.fp || 0)), e = k * k * (3 - 2 * k), fp = k > 0;
      const eye = Math.max(10, player.r * (BODY_Y + BODY_SY) * 1.4);
      const lookX = player.x + Math.cos(player.face) * 300, lookY = player.y + Math.sin(player.face) * 300;
      const focusX = f.camX + (player.x + Math.cos(player.face) * 260 - f.camX) * e;
      const focusY = f.camY + (player.y + Math.sin(player.face) * 260 - f.camY) * e;
      camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
      camera.updateProjectionMatrix();
      const D = 2500;
      camera.position.set(f.camX, D * Math.sin(TILT), f.camY + D * Math.cos(TILT));
      camera.lookAt(f.camX, 0, f.camY);
      if (fp) {
        const fov0 = 20, fov1 = 72, d0 = halfH / Math.tan(fov0 * Math.PI / 360);
        const lerp = (a, b) => a + (b - a) * e;
        fpCamera.fov = lerp(fov0, fov1);
        fpCamera.aspect = aspect; fpCamera.far = Math.max(2000, d0 * 1.6);
        fpCamera.updateProjectionMatrix();
        const ex = player.x - Math.cos(player.face) * player.r * 0.3, ey = player.y - Math.sin(player.face) * player.r * 0.3;
        // Height drops late (e²) so the swoop flies over the rooftops before diving to eye level.
        const h0 = d0 * Math.sin(TILT);
        fpCamera.position.set(lerp(f.camX, ex), h0 + (eye - h0) * e * e, lerp(f.camY + d0 * Math.cos(TILT), ey));
        fpCamera.lookAt(lerp(f.camX, lookX), lerp(0, eye * 0.45), lerp(f.camY, lookY));
        skyCol.copy(phase.night ? SKY.night : SKY.day.clone().lerp(SKY.dusk, Math.max(0, phase.dayT - 0.6) / 0.4));
        const fe = e * e; // fog only closes in near the end of the swoop
        scene.fog.color.copy(skyCol); scene.fog.near = FAR_FOG + (350 - FAR_FOG) * fe; scene.fog.far = FAR_FOG * 2 + (1300 - FAR_FOG * 2) * fe;
        renderer.setClearColor(tmpCol.set(0x000000).lerp(skyCol, e));
      } else {
        scene.fog.near = FAR_FOG; scene.fog.far = FAR_FOG * 2;
        renderer.setClearColor(0x000000);
      }

      // Sun: same vector the game rule uses, so rendered shadows match the eat polygons.
      world.groundMat.color.copy(dayColor(world.stage.ground, world.stage.groundNight, phase));
      if (world.waterMat) world.waterMat.color.copy(dayColor(world.stage.water, world.stage.waterNight, phase));
      const lowSun = 1 - Math.min(1, sun.elev / (40 * Math.PI / 180));
      // castShadow stays on at night: toggling it recompiles every shader right as the climax starts.
      if (phase.night) {
        sunLight.intensity = 0;
        hemi.color.set(0x7d86d8); hemi.groundColor.set(0x23203a); hemi.intensity = 0.55;
        world.roadMat.color.set('#3b3958');
        world.paintMat.color.set('#6f6c92'); world.curbMat.color.set('#4b4868');
        if (world.lawnMat) world.lawnMat.color.set('#2c4a40');
        for (const m of world.roofMats) m.emissive.set(0x1c1606);
        for (const m of world.wallMats) { m.emissiveMap = m.userData.night; m.emissive.copy(NIGHT_WINDOWS); }
        world.lampMat.color.set('#ffe2a0'); world.haloMat.opacity = 0.28;
      } else {
        // Sunlit ground lands at exactly its palette color (hemi + sun·sin(elev) = 1) instead of
        // washing out at noon or going dull at dawn; shade gets the hemisphere term only (~36%).
        // The cap keeps sun-facing walls from blowing out when the sun is very low.
        const HEMI = 0.36;
        sunLight.intensity = Math.min(1.8, (1 - HEMI) / Math.sin(sun.elev));
        sunLight.color.set(0xfff4dd).lerp(col('#ff9a5a'), lowSun); // deeper orange toward dusk
        hemi.color.set(0xffffff); hemi.groundColor.set(0x8a7f70); hemi.intensity = HEMI;
        world.roadMat.color.set('#b9b4a8');
        world.paintMat.color.set('#f4efe2'); world.curbMat.color.set('#d9d2c2');
        if (world.lawnMat) world.lawnMat.color.set(world.stage.lawn);
        for (const m of world.roofMats) m.emissive.set(0x000000);
        for (const m of world.wallMats) { m.emissiveMap = TEX.plain; m.emissive.copy(m.userData.day); }
        world.lampMat.color.set('#d8d4c8'); world.haloMat.opacity = 0;
        const ce = Math.cos(sun.elev);
        sunLight.position.set(focusX - sun.sx * ce * 3000, Math.sin(sun.elev) * 3000, focusY - sun.sy * ce * 3000);
        sunLight.target.position.set(focusX, 0, focusY);
        const S = f.view * 1.5 + 60 + (520 - f.view * 1.5 - 60) * e, sc = sunLight.shadow.camera;
        sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S;
        sc.updateProjectionMatrix();
      }

      // Buildings (including ones mid-swallow).
      for (const b of world.buildings) {
        if (b.state === 0) continue;
        if (b.state === 2) { b.mesh.visible = false; continue; }
        const p = f.swallowPos(b);
        placeBuilding(b, p.x, p.y, p.s, p.lift);
      }

      // Instanced objects: rewrite matrices only for objects that changed this frame. A golden friend (o.glow)
      // is painted gold, a little bigger, and bobs, so it is redrawn every frame while it shines.
      for (const { im, part, list, hidden } of world.instanced) {
        let changed = false, recolor = false;
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          if (!!o.glow !== !!o.glowShown) {
            im.setColorAt(i, tmpCol.set(o.glow ? (part.color === 'inst' ? '#ffd23f' : '#ffe27a') : (part.color === 'inst' ? o.color : '#ffffff')));
            recolor = true;
          }
          if ((o.state === 0 && !o.dirty && !o.glow && !o.glowShown) || (o.state === 2 && hidden[i])) continue;
          if (o.state === 2) hidden[i] = 1;
          let x = o.x, y = o.y, s = 1, lift = 0;
          if (o.state === 1) { const p = f.swallowPos(o); x = p.x; y = p.y; s = p.s; lift = p.lift; }
          if (o.state === 2) s = 0;
          if (o.glow) { s *= 1.2; lift += o.r * (0.6 + Math.sin(t * 6 + o.x) * 0.4); }
          const r = o.r * s;
          dummy.position.set(x, part.y * r + lift, y);
          dummy.rotation.set(0, -o.rot, 0);
          if (part.o) { dummy.translateX(part.o[0] * r); dummy.translateZ(part.o[1] * r); }
          dummy.scale.set(part.s[0] * r || 1e-6, part.s[1] * r || 1e-6, part.s[2] * r || 1e-6);
          dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
          changed = true;
        }
        if (changed) im.instanceMatrix.needsUpdate = true;
        if (recolor) im.instanceColor.needsUpdate = true;
      }
      for (const o of world.objects) { if (o.state !== 1) o.dirty = false; o.glowShown = o.glow; }

      for (const g of world.guards) {
        if (g.state === 2) { g.mesh.visible = false; continue; }
        let x = g.x, y = g.y, s = 1, lift = 0;
        if (g.state === 1) { const p = f.swallowPos(g); x = p.x; y = p.y; s = p.s; lift = p.lift; }
        g.mesh.position.set(x, lift, y);
        g.mesh.rotation.y = -g.dir;
        g.mesh.scale.setScalar(s * (g.k || 1));
      }
      for (const { src, mesh } of world.beamMeshes) {
        const alive = src.state === undefined || src.state === 0;
        mesh.visible = alive;
        if (!alive) continue;
        mesh.position.set(src.x, 0.9, src.y);
        mesh.rotation.y = -src.dir;
        mesh.material.opacity = phase.night ? 0.42 : 0.3;
      }

      // Player blob with wobble.
      const pos = blobGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const bx = blobBase[i * 3], bz = blobBase[i * 3 + 2];
        const a = Math.atan2(bz, bx);
        const wob = (bx === 0 && bz === 0) ? 0 : 1 + Math.sin(a * 5 + t * 4) * 0.05 + Math.sin(a * 3 - t * 3) * 0.04;
        pos.setXYZ(i, bx * wob, 0, bz * wob);
      }
      pos.needsUpdate = true;
      blob.position.set(player.x, 1.2, player.y);
      blob.scale.setScalar(player.r);
      blobMat.opacity = player.lit ? 0.35 + Math.sin(t * 30) * 0.2 : 0.55;
      rimMat.color.set(player.lit ? LIT_RIM : rimColor);
      rimMat.opacity = player.lit ? 0.85 : 0.55;
      litRing.position.copy(blob.position).setY(1.3);
      litRing.scale.setScalar(player.r);
      // Face toward `look` (the game keeps it turned to the camera); the mouth opens wide and the arms
      // reach in while something is being sucked in, and the body bulges once when it goes down.
      const gulp = player.gulp || 0, bulge = player.bulge || 0, L = player.look === undefined ? player.face : player.look;
      const breathe = 1 + Math.sin(t * 3) * 0.025, R = player.r;
      body.position.set(player.x, R * BODY_Y, player.y);
      body.scale.set(R * (1 + bulge * 0.12), R * BODY_SY * breathe * (1 - bulge * 0.06), R * (1 + bulge * 0.12));
      body.rotation.set(0, -L, 0);
      const grown = Math.min(1, Math.max(0, (player.r / (player.r0 || player.r) - 1) / 4));
      bodyMat.color.copy(bodyColor).lerp(glowColor, grown * 0.25);
      // Growth stages: the darkness it has eaten swirls inside, brighter the bigger it gets.
      aura.position.copy(body.position); aura.scale.copy(body.scale).multiplyScalar(1.01); aura.rotation.copy(body.rotation);
      auraMat.opacity = grown * 0.8; auraMat.color.copy(glowColor);
      swirl.offset.set(t * 0.05, 0); swirl.rotation = t * 0.4;
      armMat.color.copy(bodyMat.color).multiplyScalar(0.94);
      // First person looks over the top of the head; the eyes high on its front would peek over it.
      eyes.forEach(o => { o.e.visible = o.p.visible = k < 0.6; });
      arms.forEach((m, k) => {
        onBody(player, L + (k ? 1 : -1) * (1.05 - gulp * 0.45), -0.28, 0.06, m.position);
        m.scale.set(R * 0.3, R * 0.24, R * 0.3);
      });
      const MOUTH_EL = 0.28 - gulp * 0.06;
      onBody(player, L, MOUTH_EL, 0.02, mouth.position);
      mouth.rotation.set(0, -L, 0);
      mouth.scale.set(R * 0.1, R * (0.14 + gulp * 0.4), R * (0.24 + gulp * 0.36));
      onBody(player, L, MOUTH_EL, 0.08, throat.position);
      throat.rotation.copy(mouth.rotation);
      throat.scale.set(R * 0.06, mouth.scale.y * (0.45 + gulp * 0.35), mouth.scale.z * (0.5 + gulp * 0.3));
      // Eyes: big glossy ovals that squeeze shut happily (^^) for a moment after each gulp.
      const happy = Math.min(1, bulge * 1.6);
      eyes.forEach(({ e, p }, k) => {
        onBody(player, L + (k ? 1 : -1) * 0.4, 0.7 + gulp * 0.1, 0.0, e.position);
        e.rotation.set(0, -L, 0);
        e.scale.set(R * 0.1, R * (0.22 - happy * 0.17), R * 0.16);
        onBody(player, L + (k ? 1 : -1) * 0.35, 0.8 + gulp * 0.1, 0.09, p.position);
        p.scale.setScalar(R * 0.06 * (1 - happy));
      });
      cheeks.forEach((m, i) => {
        onBody(player, L + (i ? 1 : -1) * 0.66, 0.5, 0.0, m.position);
        m.rotation.set(0, -L, 0);
        m.scale.set(R * 0.05, R * 0.06, R * 0.12);
        m.visible = k < 0.6;
      });

      const clouds = f.clouds || [], golden = f.golden || [];
      cloudShade.count = Math.min(MAX_CLOUDS, clouds.length);
      for (let i = 0; i < cloudShade.count; i++) {
        dummy.position.set(clouds[i].x, 1.1, clouds[i].y); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(clouds[i].r); dummy.updateMatrix();
        cloudShade.setMatrixAt(i, dummy.matrix);
      }
      cloudShade.instanceMatrix.needsUpdate = true;
      goldRings.count = Math.min(MAX_GOLD, golden.length);
      for (let i = 0; i < goldRings.count; i++) {
        dummy.position.set(golden[i].x, 1.3, golden[i].y); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Math.max(golden[i].r * 1.6, 16) * (1 + Math.sin(t * 8) * 0.12)); // never smaller than a person-sized ring dummy.updateMatrix();
        goldRings.setMatrixAt(i, dummy.matrix);
      }
      goldRings.instanceMatrix.needsUpdate = true;
      goldBeam.count = goldRings.count;
      for (let i = 0; i < goldBeam.count; i++) {
        const w = Math.max(golden[i].r * 0.9, 8);
        dummy.position.set(golden[i].x, 50, golden[i].y); dummy.rotation.set(0, t * 2, 0); dummy.scale.set(w * 0.6, 100, w * 0.6); dummy.updateMatrix();
        goldBeam.setMatrixAt(i, dummy.matrix);
      }
      goldBeam.instanceMatrix.needsUpdate = true;

      // Hints: pulse rings under things the player could eat right now.
      let n = 0;
      const pulse = 0.5 + Math.sin(t * 6) * 0.5;
      for (const item of f.hints) {
        if (n >= MAX_HINTS) break;
        dummy.position.set(item.x, 1.0, item.y);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(item.r * (1 + pulse * 0.08));
        dummy.updateMatrix();
        hints.setMatrixAt(n++, dummy.matrix);
      }
      hints.count = n;
      hints.instanceMatrix.needsUpdate = true;
      hintMat.opacity = 0.35 + pulse * 0.45;

      renderer.render(scene, fp ? fpCamera : camera);
    }

    // `debug` is read by the QA scripts (pixel checks, memory counters); the game never uses it.
    // Cosmetic skin: body, unlit rim (also the growth glow) and eye colors. The lit warning stays red regardless.
    function setSkin(skin) {
      bodyColor.setHex(skin.body);
      glowColor.setHex(skin.rim);
      rimColor = skin.rim;
      eyeMat.color.setHex(skin.eye);
      pupilMat.color.setHex(skin.pupil !== undefined ? skin.pupil : 0x16122a);
    }

    return { build, resize, draw, setSkin, setQuality, get quality() { return quality; }, debug: { renderer, camera, scene, rimMat, fpCamera } };
  }

  root.DuskRender = { create, PARTS }; // PARTS also feeds tools/icons (collection-book pictures)
})(this);
