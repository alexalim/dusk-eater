// Three.js renderer. Game logic hands over plain state; this file owns everything visual.
// World (x, y) maps to three.js (x, height, y), so screen-up is world -y as in the 2D version.
(function (root) {
  'use strict';
  const T = root.THREE;
  const TILT = 50 * Math.PI / 180; // tilted further (redesign guide): walls, awnings and faces show, not just rooftops

  const col = c => new T.Color(c);
  // A unit box with rounded edges (tester: "everything looks like blocks"): a rounded square extruded with a bevel, centred
  // and scaled back to 1 x 1 x 1 so it drops in wherever a box part was.
  function roundedBox(curve, bevel) {
    const h = 0.32, k = 0.1, sh = new T.Shape();
    sh.moveTo(-h + k, -h); sh.lineTo(h - k, -h); sh.quadraticCurveTo(h, -h, h, -h + k); sh.lineTo(h, h - k); sh.quadraticCurveTo(h, h, h - k, h);
    sh.lineTo(-h + k, h); sh.quadraticCurveTo(-h, h, -h, h - k); sh.lineTo(-h, -h + k); sh.quadraticCurveTo(-h, -h, -h + k, -h);
    const g = new T.ExtrudeGeometry(sh, { depth: 0.64, curveSegments: curve, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.18, bevelSegments: bevel });
    g.center(); g.computeBoundingBox();
    const z = g.boundingBox.getSize(new T.Vector3());
    g.scale(1 / z.x, 1 / z.y, 1 / z.z);
    return g;
  }
  const unit = {
    rbox: roundedBox(4, 3),
    box: new T.BoxGeometry(1, 1, 1),
    cyl: new T.CylinderGeometry(1, 1, 1, 14),
    disc: new T.CylinderGeometry(1, 1, 1, 30), // big flat ground decals (ponds, plazas): round at any size
    sphere: new T.SphereGeometry(1, 14, 10),
    blob: new T.SphereGeometry(1, 10, 8),
    cone: new T.ConeGeometry(1, 1, 12),
    capsule: new T.CapsuleGeometry(1, 2, 4, 10), // radius 1, 4 tall
  };
  // Low-poly versions for the hundreds of small instanced props: an InstancedMesh draws every
  // instance, on screen or not, so these segment counts dominate the triangle budget.
  const low = {
    box: unit.box,
    rbox: roundedBox(1, 1),
    cyl: new T.CylinderGeometry(1, 1, 1, 7),
    sphere: new T.SphereGeometry(1, 7, 5),
    blob: new T.SphereGeometry(1, 8, 5),
    cone: new T.ConeGeometry(1, 1, 6),
    capsule: new T.CapsuleGeometry(1, 2, 2, 6),
  };
  // A part is a unit geometry scaled by [sx, sy, sz] * object radius, lifted by y * r and
  // shifted by o = [forward, side] * r in the object's own frame. color 'inst' takes the object's
  // own color; glow parts ignore lighting (headlights).
  const P = (geo, s, y, color, o, glow, tex) => ({ geo, s, y, color, o, glow, tex });
  // A painted sign board (tex = the words), unlit so it reads at night too: drawn once per word.
  const signTextures = {};
  function signTex(text) {
    if (signTextures[text]) return signTextures[text];
    // The box's top face maps the canvas's width along the part's forward (long) side, so the words run along the board.
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#fff5d6'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#7a1f1f'; g.lineWidth = 12; g.strokeRect(6, 6, 244, 116);
    g.fillStyle = '#c8102e'; g.font = 'bold 92px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 68);
    const t = new T.CanvasTexture(c); t.anisotropy = 4;
    return (signTextures[text] = t);
  }
  const HAIR = '#4a3426', SKIN = '#f6d2b0';
  // Prop parts drawn into the shadow map: the crown, canopy or body only (no trunks, poles, fruit or ornaments), the same
  // shapes the game's shade rule models (index.html SHADE, core propShadow). type -> part indices.
  const CASTERS = { tree: [1, 2], persimmon: [1], ginkgo: [1, 2, 3, 4], pine: [1, 2], xtree: [1, 2, 3], palm: [1, 2, 3, 4, 5, 6],
    parasol: [1], tent: [0], haystack: [0, 1], stall: [0, 1], container: [0, 1] };
  // Big things of each place (index.html giants): the same shapes scaled up, so they shade the same way, plus the rides,
  // whose only shade is a solid part (a station box, a canopy): rims, tracks and chains are open, so they cast nothing.
  Object.assign(CASTERS, { bigtree: CASTERS.tree, bigpine: CASTERS.pine, bighay: CASTERS.haystack, bigparasol: CASTERS.parasol,
    bigpersimmon: CASTERS.persimmon, bigstall: CASTERS.stall, bigpalm: CASTERS.palm, bigtent: CASTERS.tent, bigbox: CASTERS.container,
    biggift: [0, 1, 2], wheel: [0], coaster: [0], swing: [0] });
  // A person: body in the instance color, head, hair or hat, plus any extra parts.
  const human = (hat = HAIR, extra = []) => [P('capsule', [0.55, 0.5, 0.55], 1.0, 'inst'), P('sphere', [0.55, 0.55, 0.55], 2.45, SKIN),
    P('sphere', [0.58, 0.32, 0.58], 2.7, hat)].concat(extra);
  // A part that circles (spin): round a vertical wheel's hub at height c, or (flat) round the pole; w = turns in radians/s.
  const spin = (p, sp) => Object.assign(p, { spin: sp });
  // A part turned in place (rot): yaw round the pole, then pitch, so a frond points outward and droops.
  const tilt = (p, yaw, pitch) => Object.assign(p, { rot: [yaw, pitch] });
  const frond = a => tilt(P('sphere', [0.5, 0.06, 0.2], 2.56, 'inst', [Math.cos(a) * 0.44, Math.sin(a) * 0.44]), -a, -0.42);
  const COASTER_Y = a => 0.7 + 1.6 * ((1 + Math.cos(a)) / 2) ** 2; // track height round the loop: one big hill at the +x end
  const PARTS = {
    person:    [P('capsule', [0.55, 0.5, 0.55], 1.0, 'inst'), P('sphere', [0.55, 0.55, 0.55], 2.45, SKIN), P('sphere', [0.58, 0.32, 0.58], 2.7, HAIR)],
    worker:    [P('capsule', [0.55, 0.5, 0.55], 1.0, 'inst'), P('sphere', [0.55, 0.55, 0.55], 2.45, SKIN), P('sphere', [0.62, 0.36, 0.62], 2.72, '#f2c14e')],
    // a zombie: green skin, dark hair, torn clothes in the instance color, both arms out in front (forward is +x)
    // (TestFlight: "hard to tell apart in a crowd") so the skin is a louder green, the eyes glow and never dim at night
    zombie:    [P('capsule', [0.55, 0.5, 0.55], 1.0, 'inst'), P('sphere', [0.55, 0.55, 0.55], 2.45, '#8fe07a'), P('sphere', [0.3, 0.2, 0.34], 2.88, '#2a3a1e', [-0.12, 0]), // a bald green head with a tuft, so it reads green from above
                P('box', [0.9, 0.22, 0.22], 1.9, '#8fe07a', [0.6, 0.35]), P('box', [0.9, 0.22, 0.22], 1.9, '#8fe07a', [0.6, -0.35]),
                P('sphere', [0.13, 0.13, 0.13], 2.5, '#eaff5c', [0.48, 0.2], true), P('sphere', [0.13, 0.13, 0.13], 2.5, '#eaff5c', [0.48, -0.2], true),
                P('cyl', [1.0, 0.07, 1.0], 3.45, '#d94fff', undefined, true), P('cyl', [0.72, 0.09, 0.72], 3.45, '#f3c6ff', undefined, true), // a violet halo over the head: flat, so it shows from above
                // a "좀비" sign on a post above the halo (TestFlight ask): the board lies flat so the word reads from the camera
                P('cyl', [0.1, 1.3, 0.1], 4.0, '#6b4a2b', [-0.25, 0]), P('box', [3.0, 0.06, 1.6], 4.65, '#fff5d6', [-0.25, 0], true, '좀비')],
    cat:       [P('blob', [1.1, 0.6, 0.6], 0.6, 'inst'), P('sphere', [0.5, 0.48, 0.5], 1.05, 'inst', [1.0, 0]),
                P('cone', [0.17, 0.4, 0.17], 1.55, 'inst', [1.05, 0.26]), P('cone', [0.17, 0.4, 0.17], 1.55, 'inst', [1.05, -0.26]),
                P('cyl', [0.12, 1.0, 0.12], 1.0, 'inst', [-1.1, 0])],
    gull:      [P('blob', [0.8, 0.6, 0.6], 0.9, 'inst'), P('box', [0.5, 0.12, 2.6], 1.0, '#e6e6e0'), P('cone', [0.12, 0.35, 0.12], 0.9, '#f2a33a', [0.85, 0])],
    trash:     [P('cyl', [0.8, 1.8, 0.8], 0.9, 'inst'), P('cyl', [0.9, 0.22, 0.9], 1.9, '#4d6449')],
    crate:     [P('box', [1.8, 1.8, 1.8], 0.9, 'inst'), P('box', [1.86, 0.3, 1.86], 0.9, '#8a6238')],
    buoy:      [P('cyl', [0.9, 1.0, 0.9], 0.5, 'inst'), P('cone', [0.55, 1.2, 0.55], 1.6, '#ffffff')],
    bench:     [P('box', [2.2, 0.25, 0.8], 0.6, 'inst'), P('box', [2.2, 0.6, 0.15], 1.0, 'inst', [0, -0.35])],
    container: [P('box', [2.6, 1.2, 1.2], 0.6, 'inst'), P('box', [2.64, 0.08, 1.24], 1.2, '#e8e4dc')],
    // a lumpy crown (redesign guide): three smaller balls poke out of the big one. They cast nothing (CASTERS), so the
    // drawn shade stays the two balls the rule models.
    tree:      [P('cyl', [0.25, 1.4, 0.25], 0.7, '#7a5233'), P('blob', [1.0, 0.85, 1.0], 1.8, 'inst'), P('blob', [0.68, 0.6, 0.68], 2.5, '#5fb86a'),
                P('blob', [0.5, 0.46, 0.5], 2.05, 'inst', [0.62, 0.3]), P('blob', [0.46, 0.42, 0.46], 2.0, '#74c97c', [-0.56, -0.42]),
                P('blob', [0.42, 0.4, 0.42], 2.2, 'inst', [-0.18, 0.66])],
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
    // a snowman is white on white snow, so what makes it read is the dark bits: hat, coal eyes and buttons, a red scarf
    snowman:   [P('sphere', [0.8, 0.8, 0.8], 0.8, 'inst'), P('sphere', [0.55, 0.55, 0.55], 1.9, 'inst'), P('cyl', [0.35, 0.4, 0.35], 2.55, '#222222'),
                P('cone', [0.08, 0.3, 0.08], 1.95, '#f28c28', [0.55, 0]), P('cyl', [0.5, 0.08, 0.5], 2.33, '#222222'),
                P('sphere', [0.08, 0.08, 0.08], 2.05, '#222222', [0.5, 0.18]), P('sphere', [0.08, 0.08, 0.08], 2.05, '#222222', [0.5, -0.18]),
                P('sphere', [0.08, 0.08, 0.08], 0.65, '#222222', [0.78, 0]), P('sphere', [0.08, 0.08, 0.08], 0.95, '#222222', [0.78, 0]), P('sphere', [0.08, 0.08, 0.08], 1.22, '#222222', [0.68, 0]),
                P('cyl', [0.56, 0.16, 0.56], 1.42, '#d3473d'), P('box', [0.16, 0.5, 0.14], 1.1, '#d3473d', [0.5, 0.2])],
    sled:      [P('box', [1.8, 0.2, 0.9], 0.35, 'inst'), P('box', [1.9, 0.08, 0.1], 0.08, '#555555', [0, 0.38]), P('box', [1.9, 0.08, 0.1], 0.08, '#555555', [0, -0.38])],
    fence:     [P('box', [2.0, 0.85, 0.42], 0.42, 'inst'), P('box', [2.12, 0.18, 0.62], 0.93, '#5a5e6a')], // a 16-unit span of courtyard wall with a tile cap
    // (winter maps only) snow sits on the branch tips: a white skirt around the foot of each tier, and the cap
    pine:      [P('cyl', [0.2, 0.9, 0.2], 0.45, '#7a5233'), P('cone', [1.0, 1.8, 1.0], 1.7, 'inst'), P('cone', [0.72, 1.3, 0.72], 2.6, 'inst'),
                P('cone', [0.4, 0.55, 0.4], 3.3, '#f7f9fc'), P('cone', [1.04, 0.5, 1.04], 1.06, '#f7f9fc'), P('cone', [0.76, 0.4, 0.76], 2.16, '#f7f9fc')],
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
    ginkgo:    [P('cyl', [0.3, 1.3, 0.3], 0.65, '#6b4a2e'), P('blob', [1.0, 0.8, 1.0], 2.0, 'inst'), P('blob', [0.7, 0.6, 0.7], 2.5, '#f7d24a'),
                P('blob', [0.45, 0.4, 0.45], 1.75, '#e8b422', [0.7, 0.3]), P('blob', [0.45, 0.4, 0.45], 1.8, '#e8b422', [-0.6, -0.4])],
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
    camel:     [P('blob', [0.85, 0.36, 0.38], 1.3, 'inst'), P('sphere', [0.45, 0.4, 0.45], 1.75, 'inst', [-0.2, 0]),
                P('cyl', [0.12, 0.8, 0.12], 1.8, 'inst', [0.85, 0]), P('blob', [0.28, 0.16, 0.18], 2.2, 'inst', [1.0, 0]),
                P('cyl', [0.11, 1.0, 0.11], 0.5, 'inst', [0.5, 0.2]), P('cyl', [0.11, 1.0, 0.11], 0.5, 'inst', [0.5, -0.2]), P('cyl', [0.11, 1.0, 0.11], 0.5, 'inst', [-0.5, 0.2]), P('cyl', [0.11, 1.0, 0.11], 0.5, 'inst', [-0.5, -0.2])],
    // six drooping fronds round the crown (redesign guide: a palm, not a plus sign), and the coconuts under them
    palm:      [P('cyl', [0.2, 2.6, 0.2], 1.3, '#8a6a46'), ...[0, 1, 2, 3, 4, 5].map(k => frond(k * Math.PI / 3 + 0.3)),
                P('sphere', [0.3, 0.3, 0.3], 2.5, '#6b4a2a')],
    tent:      [P('cone', [1.1, 1.3, 1.1], 0.65, 'inst'), P('box', [0.5, 0.6, 0.06], 0.3, '#3a2a20', [0, 0.9])],
    // Christmas event
    gift:      [P('box', [1.4, 1.2, 1.4], 0.6, 'inst'), P('box', [1.46, 1.26, 0.26], 0.6, '#ffd25c'), P('box', [0.26, 1.26, 1.46], 0.6, '#ffd25c'),
                P('sphere', [0.35, 0.25, 0.35], 1.3, '#ffd25c')],
    caroler:   [P('capsule', [0.55, 0.5, 0.55], 1.0, 'inst'), P('sphere', [0.55, 0.55, 0.55], 2.45, SKIN), P('cone', [0.5, 0.75, 0.5], 3.1, '#d62c3a'),
                P('sphere', [0.18, 0.18, 0.18], 3.5, '#f7f9fc'), P('box', [0.6, 0.15, 0.62], 1.85, '#f7f9fc')],
    reindeer:  [P('blob', [0.85, 0.42, 0.38], 1.3, 'inst'), P('sphere', [0.28, 0.28, 0.24], 1.8, 'inst', [0.9, 0]),
                P('box', [0.1, 0.5, 0.7], 2.25, '#d9c09a', [0.9, 0]), P('sphere', [0.13, 0.13, 0.13], 1.8, '#ff3b3b', [1.17, 0], true),
                P('cyl', [0.11, 0.9, 0.11], 0.45, '#6b4228', [0.5, 0.2]), P('cyl', [0.11, 0.9, 0.11], 0.45, '#6b4228', [0.5, -0.2]), P('cyl', [0.11, 0.9, 0.11], 0.45, '#6b4228', [-0.5, 0.2]), P('cyl', [0.11, 0.9, 0.11], 0.45, '#6b4228', [-0.5, -0.2])],
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
    cow:       [P('blob', [0.95, 0.45, 0.45], 1.0, 'inst'), P('blob', [0.24, 0.455, 0.455], 1.0, '#2a2420', [-0.3, 0]), P('sphere', [0.3, 0.28, 0.28], 1.25, 'inst', [1.05, 0]),
                P('cyl', [0.11, 0.6, 0.11], 0.3, '#2a2420', [0.5, 0.2]), P('cyl', [0.11, 0.6, 0.11], 0.3, '#2a2420', [0.5, -0.2]), P('cyl', [0.11, 0.6, 0.11], 0.3, '#2a2420', [-0.5, 0.2]), P('cyl', [0.11, 0.6, 0.11], 0.3, '#2a2420', [-0.5, -0.2])],
    tractor:   [P('box', [1.4, 0.8, 1.0], 0.7, 'inst'), P('box', [0.7, 0.7, 0.8], 1.45, '#9fc3e6', [-0.3, 0]), P('box', [0.8, 0.9, 1.25], 0.45, '#26262e', [-0.45, 0]),
                P('box', [0.5, 0.5, 1.15], 0.25, '#26262e', [0.55, 0]), P('box', [0.06, 0.16, 0.6], 0.8, '#fff3c4', [0.72, 0], true)],
    haystack:  [P('cyl', [1.0, 1.1, 1.0], 0.55, 'inst'), P('cone', [1.02, 0.4, 1.02], 1.3, '#d9b55a')],
    // beach sea life (forward is +x)
    shell:     [P('blob', [1.0, 0.35, 0.9], 0.3, 'inst'), P('box', [0.1, 0.12, 1.4], 0.6, '#fff3e2', [0.15, 0]), P('box', [0.1, 0.12, 1.3], 0.58, '#fff3e2', [-0.25, 0]),
                P('sphere', [0.175, 0.15, 0.175], 0.4, '#ffffff', [-0.75, 0])],
    crab:      [P('sphere', [0.9, 0.4, 0.7], 0.55, 'inst'), P('sphere', [0.38, 0.28, 0.32], 0.55, 'inst', [0.85, 0.55]), P('sphere', [0.38, 0.28, 0.32], 0.55, 'inst', [0.85, -0.55]),
                P('box', [0.12, 0.1, 2.4], 0.3, 'inst', [0.2, 0]), P('box', [0.12, 0.1, 2.4], 0.3, 'inst', [-0.2, 0]), P('box', [0.12, 0.1, 2.2], 0.3, 'inst', [-0.55, 0]),
                P('cyl', [0.06, 0.35, 0.06], 1.0, '#3a2020', [0.55, 0.25]), P('cyl', [0.06, 0.35, 0.06], 1.0, '#3a2020', [0.55, -0.25]),
                P('sphere', [0.15, 0.15, 0.15], 1.2, '#ffffff', [0.55, 0.25]), P('sphere', [0.15, 0.15, 0.15], 1.2, '#ffffff', [0.55, -0.25])],
    fish:      [P('sphere', [1, 0.5, 0.4], 0.6, 'inst'), P('box', [0.5, 0.8, 0.12], 0.6, 'inst', [-1.1, 0]), P('box', [0.5, 0.3, 0.1], 1.1, 'inst', [-0.1, 0]),
                P('sphere', [0.16, 0.16, 0.16], 0.75, '#ffffff', [0.6, 0.3]), P('sphere', [0.16, 0.16, 0.16], 0.75, '#ffffff', [0.6, -0.3]),
                P('sphere', [0.08, 0.08, 0.08], 0.78, '#222222', [0.68, 0.36]), P('sphere', [0.08, 0.08, 0.08], 0.78, '#222222', [0.68, -0.36])],
    jelly:     [P('sphere', [0.9, 0.6, 0.9], 1.3, 'inst')].concat([0, 1, 2, 3, 4, 5].map(i =>
                P('cyl', [0.07, 1.0, 0.07], 0.55, '#ffd6f0', [Math.cos(i * Math.PI / 3) * 0.5, Math.sin(i * Math.PI / 3) * 0.5]))),
    octopus:   [P('sphere', [0.8, 0.9, 0.8], 1.35, 'inst')].concat([0, 1, 2, 3, 4, 5, 6, 7].flatMap(i => {
                  const a = (i + 0.5) * Math.PI / 4;
                  return [P('sphere', [0.275, 0.2, 0.275], 0.3, 'inst', [Math.cos(a) * 0.8, Math.sin(a) * 0.8]), P('sphere', [0.19, 0.15, 0.19], 0.2, 'inst', [Math.cos(a) * 1.25, Math.sin(a) * 1.25])];
                }), [P('sphere', [0.21, 0.21, 0.21], 1.5, '#ffffff', [0.72, 0.3]), P('sphere', [0.21, 0.21, 0.21], 1.5, '#ffffff', [0.72, -0.3]),
                P('sphere', [0.1, 0.1, 0.1], 1.52, '#222222', [0.85, 0.32]), P('sphere', [0.1, 0.1, 0.1], 1.52, '#222222', [0.85, -0.32])]),
    dolphin:   [P('sphere', [1.2, 0.375, 0.4], 0.6, 'inst'), P('sphere', [1, 0.25, 0.3], 0.45, '#e8f1f5'), P('sphere', [0.3, 0.15, 0.15], 0.55, 'inst', [1.25, 0]),
                P('box', [0.45, 0.5, 0.1], 1.05, 'inst', [-0.1, 0]), P('box', [0.3, 0.1, 0.9], 0.6, 'inst', [-1.25, 0]),
                P('sphere', [0.07, 0.07, 0.07], 0.75, '#222222', [0.85, 0.32]), P('sphere', [0.07, 0.07, 0.07], 0.75, '#222222', [0.85, -0.32])],
    shark:     [P('sphere', [1.3, 0.425, 0.45], 0.6, 'inst'), P('sphere', [1.1, 0.275, 0.35], 0.45, '#f4f6fa'), P('cone', [0.35, 0.8, 0.1], 1.3, 'inst', [-0.1, 0]),
                P('box', [0.25, 1.0, 0.12], 0.8, 'inst', [-1.35, 0]), P('box', [0.5, 0.08, 0.4], 0.45, '#5a2a2a', [1.0, 0]), P('box', [0.5, 0.05, 0.42], 0.5, '#ffffff', [1.0, 0]),
                P('sphere', [0.07, 0.07, 0.07], 0.8, '#222222', [0.85, 0.36]), P('sphere', [0.07, 0.07, 0.07], 0.8, '#222222', [0.85, -0.36])],
    // the big things of each place: the small kind's parts, drawn at the big kind's size
    biggift:   [P('box', [1.4, 1.2, 1.4], 0.6, 'inst'), P('box', [1.46, 1.26, 0.26], 0.6, '#ffd25c'), P('box', [0.26, 1.26, 1.46], 0.6, '#ffd25c'),
                P('sphere', [0.6, 0.4, 0.6], 1.4, '#ffd25c', [0.2, 0]), P('sphere', [0.6, 0.4, 0.6], 1.4, '#ffd25c', [-0.2, 0])],
    // amusement rides. A ferris wheel: the boarding hut shades; the legs, rim and cabins are open, so they cast nothing.
    wheel:     [P('box', [1.4, 0.5, 0.8], 0.25, 'inst'), P('box', [0.12, 1.9, 0.12], 1.45, '#f4f1ea', [0, 0.38]), P('box', [0.12, 1.9, 0.12], 1.45, '#f4f1ea', [0, -0.38]),
                P('sphere', [0.18, 0.18, 0.45], 2.2, '#ffd25c')].concat(Array.from({ length: 24 }, (_, i) => {
                  const a = i * Math.PI / 12; return spin(P('box', [0.3, 0.3, 0.12], 2.2 + Math.sin(a) * 1.25, '#f4f1ea', [Math.cos(a) * 1.25, 0]), { a, R: 1.25, c: 2.2, w: 0.25 });
                }), Array.from({ length: 8 }, (_, i) => {
                  const a = i * Math.PI / 4; return spin(P('box', [0.34, 0.3, 0.34], 2.0 + Math.sin(a) * 1.25, ['#ff7aa8', '#7fd1e8', '#ffd25c', '#b5e48c'][i % 4], [Math.cos(a) * 1.25, 0]), { a, R: 1.25, c: 2.0, w: 0.25 });
                })),
    // a roller coaster: a station hut that shades, then a loop of track on posts with one big hill and a train on top
    coaster:   [P('box', [1.0, 0.6, 0.8], 0.3, 'inst')].concat(Array.from({ length: 40 }, (_, i) => {
                  const a = i * Math.PI / 20; return P('box', [0.36, 0.1, 0.36], COASTER_Y(a), '#ff5d73', [Math.cos(a) * 1.9, Math.sin(a) * 1.2]);
                }), Array.from({ length: 10 }, (_, i) => {
                  const a = i * Math.PI / 5, h = COASTER_Y(a); return P('cyl', [0.05, h / 2, 0.05], h / 2, '#f4f1ea', [Math.cos(a) * 1.9, Math.sin(a) * 1.2]);
                }), [10, 11, 12].map((i, k) => {
                  const a = i * Math.PI / 20; return P('box', [0.34, 0.22, 0.28], COASTER_Y(a) + 0.15, ['#ffd25c', '#7fd1e8', '#b5e48c'][k], [Math.cos(a) * 1.9, Math.sin(a) * 1.2]);
                })),
    // a swing ride: a striped canopy that shades, on a pole, with seats hanging out past its edge
    swing:     [P('cone', [1.4, 0.6, 1.4], 2.3, 'inst'), P('cyl', [0.15, 2.0, 0.15], 1.0, '#f4f1ea'), P('sphere', [0.4, 0.4, 0.4], 2.7, '#ffd25c')].concat(
                Array.from({ length: 8 }, (_, i) => {
                  const a = i * Math.PI / 4; return spin(P('cyl', [0.03, 0.8, 0.03], 1.55, '#dddddd', [Math.cos(a) * 1.55, Math.sin(a) * 1.55]), { a, R: 1.55, w: 1.1, flat: true });
                }), Array.from({ length: 8 }, (_, i) => {
                  const a = i * Math.PI / 4; return spin(P('box', [0.28, 0.12, 0.28], 1.1, ['#7fd1e8', '#ffd25c', '#b5e48c', '#c9a0ff'][i % 4], [Math.cos(a) * 1.55, Math.sin(a) * 1.55]), { a, R: 1.55, w: 1.1, flat: true });
                })),
  };
  Object.assign(PARTS, { bigtree: PARTS.tree, bigpine: PARTS.pine, bighay: PARTS.haystack, bigparasol: PARTS.parasol, bigpersimmon: PARTS.persimmon,
    bigstall: PARTS.stall, bigpalm: PARTS.palm, bigtent: PARTS.tent, bigbox: PARTS.container });
  // Every other chunky box part (a car body, a kiosk, a crate) gets rounded edges. Thin trims, rails and lamps stay boxes, and so
  // do the kinds that cast gameplay shade (CASTERS), whose parts the shade rule models.
  for (const [type, parts] of Object.entries(PARTS)) {
    if (CASTERS[type]) continue;
    for (const p of parts) if (p.geo === 'box' && !p.tex && Math.min(...p.s) >= 0.2) p.geo = 'rbox';
  }

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

  // A low wall around the edge of a flat roof, in world units: w by d outside, 2 thick, 3 tall, standing on y = 0.
  function parapetGeometry(w, d) {
    const t = 2, s = new T.Shape([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, y]) => new T.Vector2(x, y)));
    s.holes.push(new T.Path([[-w / 2 + t, -d / 2 + t], [-w / 2 + t, d / 2 - t], [w / 2 - t, d / 2 - t], [w / 2 - t, -d / 2 + t]].map(([x, y]) => new T.Vector2(x, y))));
    const g = new T.ExtrudeGeometry(s, { depth: 3, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); g.userData.own = true;
    return g;
  }

  // Summoning circle art (shop.js CIRCLES), drawn in `color` on a clear square `n` wide. The ground decal draws it in
  // white and tints it with the material; the shop draws a preview with the real color.
  function drawCircle(g, n, id, color) {
    const c = n / 2, R = n * 0.46;
    g.clearRect(0, 0, n, n); g.strokeStyle = g.fillStyle = color; g.lineCap = g.lineJoin = 'round';
    g.shadowColor = color; g.shadowBlur = n * 0.04; // every line carries a soft halo of its own color
    const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); };
    const at = (a, r) => [c + Math.cos(a) * r, c + Math.sin(a) * r];
    const star = (x, y, r) => { g.beginPath(); for (let k = 0; k < 8; k++) { const [px, py] = [x + Math.cos(k * Math.PI / 4) * (k % 2 ? r * 0.35 : r), y + Math.sin(k * Math.PI / 4) * (k % 2 ? r * 0.35 : r)]; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.fill(); };
    ring(R, n * 0.03);
    if (id === 'moon') { // double ring with rune ticks between, a six-point star inside
      ring(R * 0.82, n * 0.018);
      g.lineWidth = n * 0.016;
      for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12, [x1, y1] = at(a, R * 0.86), [x2, y2] = at(a, k % 2 ? R * 0.9 : R * 0.95); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
      g.lineWidth = n * 0.022;
      for (const off of [0, Math.PI / 3]) { g.beginPath(); for (let k = 0; k < 3; k++) { const [x, y] = at(off - Math.PI / 2 + k * Math.PI * 2 / 3, R * 0.78); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.stroke(); }
      ring(R * 0.36, n * 0.018);
    } else if (id === 'stars') { // eight stars on the ring, joined inside like a constellation
      const pts = [];
      for (let k = 0; k < 8; k++) pts.push(at(k * Math.PI / 4 - Math.PI / 2, R * 0.72));
      g.lineWidth = n * 0.018; g.globalAlpha = 0.75; g.beginPath(); // an eight-point star line, every third point joined
      for (let k = 0; k <= 8; k++) { const [x, y] = pts[(k * 3) % 8]; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke(); g.globalAlpha = 1;
      pts.forEach(([x, y], k) => star(x, y, n * (k % 2 ? 0.035 : 0.055)));
      for (let k = 0; k < 16; k++) { const [x, y] = at(k * Math.PI / 8, R); g.beginPath(); g.arc(x, y, n * 0.012, 0, Math.PI * 2); g.fill(); }
    } else { // petal: eight petals around a small middle
      g.lineWidth = n * 0.022;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, [x, y] = at(a, R * 0.58); g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, R * 0.3, R * 0.14, 0, 0, Math.PI * 2); g.stroke(); g.restore(); }
      ring(R * 0.16, n * 0.022);
    }
    g.shadowBlur = 0;
  }
  // The circle's outer band: rune ticks and dots on a thin ring, turned the other way from the circle.
  function drawRunes(g, n) {
    const c = n / 2, R = n * 0.47;
    g.clearRect(0, 0, n, n); g.strokeStyle = g.fillStyle = '#ffffff'; g.lineCap = 'round';
    g.shadowColor = '#ffffff'; g.shadowBlur = n * 0.03;
    g.lineWidth = n * 0.01; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 36; k++) {
      const a = k * Math.PI / 18, r0 = R * 0.9, r1 = k % 3 ? R * 0.94 : R * 0.86;
      if (k % 6 === 3) { g.beginPath(); g.arc(c + Math.cos(a) * R * 0.92, c + Math.sin(a) * R * 0.92, n * 0.012, 0, Math.PI * 2); g.fill(); continue; }
      g.lineWidth = n * 0.008; g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); g.stroke();
    }
    g.shadowBlur = 0;
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
    const SHADE_SKY = 0xb7a6f2; // lavender sky fill: what the shade is lit by
    const hemi = new T.HemisphereLight(SHADE_SKY, 0x6f6494, 0.55);
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

    // Felt (tester, build 67: "every piece with depth, like wool felt and yarn"): a fibre pattern laid on in world space
    // from three sides (so a bench and a tower show the same fibre size), and a soft brighter fuzz where a surface turns
    // away from the camera. Colour only: shapes, and with them every shadow and the shade rule, stay as they are. The
    // gameplay signals (red lit rim, orange rings, gold, shards, beams) keep their flat materials.
    const feltTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
      let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      g.lineCap = 'round';
      for (let i = 0; i < 3600; i++) { // short curly fibres, light and dark, drawn wrapped so the tile repeats seamlessly
        const x = rand() * 256, y = rand() * 256, a = rand() * Math.PI * 2, len = 4 + rand() * 10, bend = (rand() - 0.5) * 8;
        g.strokeStyle = rand() < 0.5 ? `rgba(255,255,255,${0.15 + rand() * 0.2})` : `rgba(0,0,0,${0.12 + rand() * 0.2})`;
        g.lineWidth = 0.8 + rand() * 1.4;
        for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
          g.beginPath(); g.moveTo(x + ox, y + oy);
          g.quadraticCurveTo(x + ox + Math.cos(a) * len / 2 - Math.sin(a) * bend, y + oy + Math.sin(a) * len / 2 + Math.cos(a) * bend, x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
          g.stroke();
        }
      }
      const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4;
      return t;
    })();
    // Knitting (the reference's beanies and bobbed hair): rows of V stitches, each a pair of slanted loops lit in the
    // middle and dark where they tuck under, on a dark gap. Laid on rounded yarn-ball shapes (tree crowns), not on roofs.
    const knitTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d'); g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, 256, 256);
      const N = 8, cw = 256 / N;
      for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) for (const side of [-1, 1]) {
        const cx = col * cw + cw / 2 + side * cw * 0.2, cy = row * cw + cw / 2;
        g.save(); g.translate(cx, cy); g.rotate(side * 0.5);
        const grd = g.createRadialGradient(0, -cw * 0.08, 0, 0, 0, cw * 0.42);
        grd.addColorStop(0, '#f2f2f2'); grd.addColorStop(0.6, '#bdbdbd'); grd.addColorStop(1, '#5a5a5a');
        g.fillStyle = grd; g.beginPath(); g.ellipse(0, 0, cw * 0.22, cw * 0.46, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4;
      return t;
    })();
    const FELT_TILE = 14, KNIT_TILE = 30; // world units per fibre tile, per eight stitches
    // mode: undefined (felt), true (knit), 'body' (the player and what it wears: smooth and glossy like the painted
    // character, see gloss below).
    // 'clay' (redesign guide: fibre noise on roads and walls read as low-res concrete): matte and smooth, no fibres; walls
    // darken toward their base like soft ambient occlusion, so blocks sit on the ground like toys on a diorama.
    function felt(mat, mode) {
      if (mat.userData.felt) return mat;
      mat.userData.felt = true;
      if (mode === 'clay') return clay(mat);
      if (mode === 'body') return gloss(mat);
      const knit = mode === true;
      const TILE = knit ? KNIT_TILE : FELT_TILE, lo = knit ? 0.5 : 0.4, amp = knit ? 0.85 : 1.2;
      mat.customProgramCacheKey = () => knit ? 'knit' : 'felt';
      mat.onBeforeCompile = sh => {
        sh.uniforms.feltMap = { value: knit ? knitTex : feltTex };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vFeltP;\nvarying vec3 vFeltN;\nvarying vec3 vFeltVN;')
          .replace('#include <project_vertex>', `#include <project_vertex>
            vec4 feltW = vec4(transformed, 1.0); vec3 feltN = normal;
            #ifdef USE_INSTANCING
              feltW = instanceMatrix * feltW; feltN = mat3(instanceMatrix) * feltN;
            #endif
            vFeltP = (modelMatrix * feltW).xyz; vFeltN = normalize(mat3(modelMatrix) * feltN); vFeltVN = normalize(normalMatrix * feltN);`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D feltMap;\nvarying vec3 vFeltP;\nvarying vec3 vFeltN;\nvarying vec3 vFeltVN;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            vec3 feltB = abs(vFeltN); feltB /= (feltB.x + feltB.y + feltB.z + 1e-4);
            vec3 feltQ = vFeltP / ${TILE.toFixed(1)};
            float feltF = texture2D(feltMap, feltQ.zy).r * feltB.x + texture2D(feltMap, feltQ.xz).r * feltB.y + texture2D(feltMap, feltQ.xy).r * feltB.z;
            diffuseColor.rgb *= ${lo.toFixed(2)} + feltF * ${amp.toFixed(2)}; // felt about ±20%: never enough to make sunlit ground read as shade`)
          .replace('#include <output_fragment>', `float feltFz = pow(1.0 - abs(dot(normalize(vFeltVN), vec3(0.0, 0.0, 1.0))), 2.0);
            outgoingLight += diffuseColor.rgb * feltFz * 0.35;
            #include <output_fragment>`);
      };
      return mat;
    }

    // The player (tester, build 75: "why isn't the main character in the game?"): smooth like the painted art, no fibres.
    // Shape comes from the view, not from the sun, so it looks the same by day and night: a little darker away from an
    // upper-left light, a soft light along the outline, and a small sheen where the top catches it.
    function gloss(mat) {
      mat.customProgramCacheKey = () => 'gloss';
      mat.onBeforeCompile = sh => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vGlossN;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvGlossN = normalize(normalMatrix * normal);');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vGlossN;')
          .replace('#include <output_fragment>', `vec3 glossN = normalize(vGlossN); float glossL = dot(glossN, normalize(vec3(-0.4, 0.6, 0.7)));
            outgoingLight *= 0.84 + 0.16 * smoothstep(-0.3, 0.8, glossL);
            outgoingLight += diffuseColor.rgb * pow(1.0 - abs(glossN.z), 2.5) * 0.2 + vec3(smoothstep(0.9, 0.99, glossL) * 0.22);
            #include <output_fragment>`);
      };
      return mat;
    }

    function clay(mat) {
      mat.customProgramCacheKey = () => 'clay';
      mat.onBeforeCompile = sh => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vClayP;\nvarying vec3 vClayN;\nvarying vec3 vClayVN;')
          .replace('#include <project_vertex>', `#include <project_vertex>
            vec4 clayW = vec4(transformed, 1.0); vec3 clayN = normal;
            #ifdef USE_INSTANCING
              clayW = instanceMatrix * clayW; clayN = mat3(instanceMatrix) * clayN;
            #endif
            vClayP = (modelMatrix * clayW).xyz; vClayN = normalize(mat3(modelMatrix) * clayN); vClayVN = normalize(normalMatrix * clayN);`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vClayP;\nvarying vec3 vClayN;\nvarying vec3 vClayVN;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            float claySide = 1.0 - abs(normalize(vClayN).y); // walls only: the ground and roofs keep their exact color
            diffuseColor.rgb *= mix(1.0, 0.78 + 0.22 * smoothstep(0.0, 22.0, vClayP.y), claySide);`)
          .replace('#include <output_fragment>', `float clayFz = pow(1.0 - abs(dot(normalize(vClayVN), vec3(0.0, 0.0, 1.0))), 3.0);
            outgoingLight += diffuseColor.rgb * clayFz * 0.12; // a soft lighter edge, like a rounded corner catching light
            #include <output_fragment>`);
      };
      return mat;
    }

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
    // with the face on its front. Its colors are baked into the vertices (lavender-white top, lavender underside,
    // warm where the belly star glows through, as in the painted art), so it needs no lights.
    // Mochi shape: the lower half spreads out and the top stays round, like a soft rice cake sitting down.
    const BODY_Y = 0.5, BODY_SY = 0.86;
    const bodyGeo = new T.SphereGeometry(1, 32, 20);
    const bodyCols = [], under = col(0xcbb6f3), top = col(0xf6eeff), warm = col(0xffe2b0), bp = bodyGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i), hem = Math.max(0, Math.min(1, (-y - 0.3) / 0.3)); // the hem ripples in soft scallops (painted art)
      const spread = (1 + Math.max(0, -y) * 0.14 - Math.max(0, y) * 0.04) * (1 + hem * 0.11 * Math.cos(6 * Math.atan2(bp.getZ(i), bp.getX(i))));
      const glow = Math.max(0, 1 - Math.hypot(bp.getX(i) - 0.95, y + 0.15, bp.getZ(i)) / 1.05); // how near the belly star (+x is the face)
      bp.setXYZ(i, bp.getX(i) * spread, y, bp.getZ(i) * spread);
      const c = under.clone().lerp(top, Math.pow((y + 1) / 2, 0.6)).lerp(warm, glow * glow * 0.7);
      bodyCols.push(c.r, c.g, c.b);
    }
    bodyGeo.computeBoundingSphere();
    bodyGeo.setAttribute('color', new T.Float32BufferAttribute(bodyCols, 3));
    const bodyMat = felt(new T.MeshBasicMaterial({ color: bodyColor, vertexColors: true }), 'body');
    const body = new T.Mesh(bodyGeo, bodyMat);
    const armMat = felt(new T.MeshBasicMaterial({ color: 0xe3d5fa }), 'body'), ARM_TINT = col(0xe3d5fa); // the shared sphere has no vertex colors: the body's tone at arm height
    const arms = [0, 1].map(() => new T.Mesh(unit.sphere, armMat));
    // Mouth: an open smile onto a dark void (deep violet rim, near-black throat: it eats darkness) with a pink tongue.
    const mouth = new T.Mesh(unit.sphere, new T.MeshBasicMaterial({ color: 0x2a0b55 }));
    const throat = new T.Mesh(unit.sphere, new T.MeshBasicMaterial({ color: 0x06030f }));
    const tongue = new T.Mesh(unit.sphere, new T.MeshBasicMaterial({ color: 0xff7fa6 }));
    const eyeMat = new T.MeshBasicMaterial({ color: 0x1b1240 });
    const pupilMat = new T.MeshBasicMaterial({ color: 0xffffff });
    const planeGeo0 = new T.PlaneGeometry(1, 1), sparkMat0 = new T.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, depthWrite: false }); // map set below
    // Eyes: big round glossy eyes set close together, a big glint up top and a small one below — a wide-eyed,
    // hungry look. Kept round (not tall ovals) and the mouth stays a dark void, so it never reads as Kirby.
    const eyes = [0, 1].map(() => {
      const e = new T.Mesh(unit.sphere, eyeMat), p = new T.Mesh(planeGeo0, sparkMat0), p2 = new T.Mesh(unit.sphere, pupilMat); p2.visible = false; // a sparkle star in each eye
      scene.add(e, p, p2);
      return { e, p, p2 };
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
    const cheekMat = new T.MeshBasicMaterial({ color: 0xff9fb0, transparent: true, opacity: 0.5, depthWrite: false }); // pink blush, as in the painted art
    const cheeks = [0, 1].map(() => new T.Mesh(unit.sphere, cheekMat));
    // The painted character (design/art): the head runs up into a curl, a gold crescent on the brow, sparkle-star eyes,
    // a star glowing in the belly and gold swirls around it. Looks only: the footprint and every rule stay the r-disc.
    const flat = (draw, n = 128) => { const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n); return new T.CanvasTexture(c); };
    const starPath = (g, cx, cy, R, r, k) => { g.beginPath(); for (let i = 0; i < k * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / k, q = i % 2 ? r : R; g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } g.closePath(); };
    const planeGeo = new T.PlaneGeometry(1, 1);
    // A tapering tube swept along a spine [x, y, z, radius] in body-local units (+x is the face, y up). `ref` is any
    // direction the spine never runs along. u runs along the spine, v around it.
    const sweep = (SPINE, ref, RINGS = 33, SIDES = 14) => {
      const spine = new T.CatmullRomCurve3(SPINE.map(([x, y, z]) => new T.Vector3(x, y, z)));
      const pos = [], nor = [], uv = [], idx = [], p = new T.Vector3(), d = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3();
      for (let i = 0; i < RINGS; i++) {
        const u = i / (RINGS - 1), at = u * (SPINE.length - 1), k = Math.min(SPINE.length - 2, Math.floor(at)), r = SPINE[k][3] + (SPINE[k + 1][3] - SPINE[k][3]) * (at - k);
        spine.getPoint(u, p); spine.getTangent(u, d); a.crossVectors(d, ref).normalize(); b.crossVectors(a, d);
        for (let j = 0; j <= SIDES; j++) { // the seam is doubled so a texture can wrap round
          const w = j / SIDES * Math.PI * 2, c = Math.cos(w), sn = Math.sin(w), nx = a.x * c + b.x * sn, ny = a.y * c + b.y * sn, nz = a.z * c + b.z * sn;
          pos.push(p.x + nx * r, p.y + ny * r, p.z + nz * r); nor.push(nx, ny, nz); uv.push(u, j / SIDES);
          if (i && j) { const q = (i - 1) * (SIDES + 1) + j - 1; idx.push(q, q + SIDES + 1, q + 1, q + 1, q + SIDES + 1, q + SIDES + 2); }
        }
      }
      const g = new T.BufferGeometry(); g.setIndex(idx);
      for (const [name, v, n] of [['position', pos, 3], ['normal', nor, 3], ['uv', uv, 2]]) g.setAttribute(name, new T.Float32BufferAttribute(v, n));
      return g;
    };
    // The tuft: a broad cone that starts inside the head and leaves it at a shallow angle, so the two read as one
    // teardrop; it leans back and thins to a tip hooking over to the side away from the crescent.
    // Its foot sits a little behind the crown of the head, which keeps the brow clear for the face.
    const tuftGeo = sweep([[-0.08, 0.55, 0, 0.72], [-0.1, 0.75, 0, 0.57], [-0.13, 0.92, -0.01, 0.44], [-0.17, 1.08, -0.04, 0.34], [-0.21, 1.24, -0.1, 0.25], [-0.24, 1.38, -0.2, 0.18],
      [-0.24, 1.48, -0.33, 0.12], [-0.21, 1.5, -0.46, 0.075], [-0.18, 1.44, -0.55, 0.04], [-0.17, 1.36, -0.56, 0.012]], new T.Vector3(1, 0, 0), 49, 24);
    tuftGeo.setAttribute('color', new T.Float32BufferAttribute(Array.from({ length: tuftGeo.attributes.position.count }, () => [top.r, top.g, top.b]).flat(), 3));
    const tuft = new T.Mesh(tuftGeo, bodyMat); // the body's own material: the head's color carries on up
    // The darkness it eats (title art): a purple, star-flecked stream curling round into the mouth while it sucks
    // something in. It thins and fades out at both ends (vertex alpha); the stars drift toward the mouth.
    const wispTex = flat((g, n) => {
      g.fillStyle = '#5a25b8'; g.fillRect(0, 0, n, n);
      for (const [x, y, r, c] of [[0.15, 0.25, 0.3, 'rgba(160,110,255,.55)'], [0.6, 0.7, 0.34, 'rgba(160,110,255,.5)'], [0.85, 0.2, 0.26, 'rgba(46,16,110,.6)'], [0.35, 0.85, 0.24, 'rgba(46,16,110,.55)']]) {
        for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) { // soft puffs, drawn across the edges too so it tiles
          const grd = g.createRadialGradient(n * (x + dx), n * (y + dy), 0, n * (x + dx), n * (y + dy), n * r); grd.addColorStop(0, c); grd.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
          g.fillStyle = grd; g.fillRect(0, 0, n, n);
        }
      }
      for (const [x, y, r, c] of [[0.2, 0.3, 0.06, '#ffe9a8'], [0.62, 0.14, 0.04, '#ffffff'], [0.45, 0.6, 0.075, '#ffd36b'], [0.85, 0.72, 0.045, '#ffe9a8'], [0.1, 0.82, 0.035, '#ffffff'], [0.78, 0.4, 0.03, '#ffd36b'], [0.36, 0.1, 0.025, '#ffffff'], [0.6, 0.9, 0.03, '#ffe9a8']]) {
        g.fillStyle = c; starPath(g, n * x, n * y, n * r, n * r * 0.28, 4); g.fill();
      }
    }, 256);
    wispTex.wrapS = wispTex.wrapT = T.RepeatWrapping; wispTex.repeat.set(3, 2);
    const wispGeo = sweep([[0.92, 0.28, 0, 0.09], [1.2, 0.25, -0.08, 0.17], [1.48, 0.2, -0.3, 0.24], [1.6, 0.14, -0.64, 0.27], [1.5, 0.2, -1, 0.25],
      [1.24, 0.36, -1.26, 0.18], [0.98, 0.56, -1.34, 0.08]], new T.Vector3(0, 1, 0), 41, 16);
    wispGeo.setAttribute('color', new T.Float32BufferAttribute(Array.from({ length: wispGeo.attributes.uv.count }, (_, i) => { const u = wispGeo.attributes.uv.getX(i); return [1, 1, 1, Math.min(1, u * 8, (1 - u) * 1.6)]; }).flat(), 4));
    const wispMat = new T.MeshBasicMaterial({ map: wispTex, vertexColors: true, transparent: true, depthWrite: false });
    const wisp = new T.Mesh(wispGeo, wispMat);
    // Skin accessories (shop `wear`): one small thing on the head, so a skin is more than a color. Body-local units like
    // the tuft; the side pieces sit on the brow the crescent leaves free, a hat or beret takes the tuft's place. Looks only.
    const wearMat = felt(new T.MeshBasicMaterial({ color: 0xffffff }), 'body'), wearMat2 = felt(new T.MeshBasicMaterial({ color: 0xffffff }), 'body'); // the piece, its accent
    const pinMat = new T.MeshBasicMaterial({ transparent: true, depthWrite: false, map: flat((g, n) => { g.fillStyle = '#fff'; starPath(g, n / 2, n / 2, n * 0.48, n * 0.22, 5); g.fill(); }) });
    const rimGeo = new T.TorusGeometry(1, 0.1, 6, 24), trimGeo = new T.TorusGeometry(1, 0.17, 8, 20);
    const wear = new T.Group(), WEAR = {}, facing = new T.Matrix4(), CENTRE = new T.Vector3();
    let wearBare = false; // a hat or beret is on: no tuft
    const faceOut = o => o.quaternion.setFromRotationMatrix(facing.lookAt(o.position, CENTRE, o.up)); // +z along the body's normal, +y up the slope
    const wearKind = (name, x = 0, y = 0, z = 0) => { const g = new T.Group(); g.position.set(x, y, z); g.visible = false; wear.add(g); return WEAR[name] = g; };
    const wearPart = (g, geo, mat, s, p = [0, 0, 0], r = [0, 0, 0]) => { const m = new T.Mesh(unit[geo] || geo, mat); m.scale.set(...s); m.position.set(...p); m.rotation.set(...r); g.add(m); return m; };
    const BROW = [0.254, 0.841, -0.476]; // on the unit body: 1.08 rad round from the face, 1.0 rad up, mirroring the crescent
    {
      const bow = wearKind('bow', ...BROW.map(v => v * 1.06)); faceOut(bow); bow.rotateZ(0.3); // two wings meeting at a knot
      wearPart(bow, 'cone', wearMat, [0.17, 0.27, 0.06], [-0.15, 0, 0], [0, 0, -Math.PI / 2]); wearPart(bow, 'cone', wearMat, [0.17, 0.27, 0.06], [0.15, 0, 0], [0, 0, Math.PI / 2]);
      wearPart(bow, 'sphere', wearMat2, [0.085, 0.085, 0.07]);
      const pin = wearKind('pin', ...BROW.map(v => v * 1.03)); faceOut(pin); pin.rotateZ(0.2); // a flat star hairpin, like the crescent
      wearPart(pin, planeGeo, pinMat, [0.58, 0.58, 1]);
      const flower = wearKind('flower', ...BROW.map(v => v * 1.05)); faceOut(flower); // five petals round a centre
      for (let i = 0; i < 5; i++) wearPart(flower, 'sphere', wearMat, [0.11, 0.11, 0.05], [Math.cos(i * Math.PI * 0.4) * 0.15, Math.sin(i * Math.PI * 0.4) * 0.15, 0]);
      wearPart(flower, 'sphere', wearMat2, [0.08, 0.08, 0.06], [0, 0, 0.03]);
      const glasses = wearKind('glasses'); // a ring round each eye (the eyes sit 0.86 rad up, 0.4 rad to each side) and a bridge
      for (const z of [0.277, -0.277]) faceOut(wearPart(glasses, rimGeo, wearMat, [0.245, 0.3, 0.245], [0.655, 0.826, z]));
      wearPart(glasses, 'cyl', wearMat, [0.018, 0.09, 0.018], [0.711, 0.826, 0], [Math.PI / 2, 0, 0]);
      const hat = wearKind('hat', -0.2, 0.84, -0.02); hat.rotation.set(-0.12, 0, 0.26); // a pointed hat set back off the brow and leaning back: trim, cone, pompom
      wearPart(hat, trimGeo, wearMat2, [0.5, 0.5, 0.5], [0, 0.02, 0], [Math.PI / 2, 0, 0]);
      wearPart(hat, 'cone', wearMat, [0.46, 0.85, 0.46], [0, 0.47, 0]); wearPart(hat, 'sphere', wearMat2, [0.13, 0.13, 0.13], [0, 0.92, 0]);
      const beret = wearKind('beret', -0.2, 0.88, -0.1); beret.rotation.set(-0.3, 0, 0.28); // a soft disc set back off the brow and tipped to one side, with its stalk
      wearPart(beret, 'sphere', wearMat, [0.58, 0.17, 0.58], [0, 0.05, 0]); wearPart(beret, 'sphere', wearMat, [0.045, 0.07, 0.045], [0, 0.24, 0]);
      const crown = wearKind('crown', -0.05, 0.93, 0); crown.rotation.set(0, 0, 0.1); // a band round the tuft's foot, five points with a gem each
      wearPart(crown, 'cyl', wearMat, [0.42, 0.14, 0.42], [0, 0.05, 0]);
      for (let i = 0; i < 5; i++) {
        const cx = Math.cos(i * Math.PI * 0.4) * 0.34, cz = Math.sin(i * Math.PI * 0.4) * 0.34;
        wearPart(crown, 'cone', wearMat, [0.12, 0.28, 0.12], [cx, 0.25, cz]); wearPart(crown, 'sphere', wearMat2, [0.06, 0.06, 0.06], [cx, 0.4, cz]);
      }
    }
    const moon = new T.Mesh(planeGeo, new T.MeshBasicMaterial({ transparent: true, depthWrite: false, map: flat((g, n) => {
      const grd = g.createLinearGradient(0, n * 0.1, n * 0.5, n * 0.9); grd.addColorStop(0, '#ffe07a'); grd.addColorStop(1, '#f0a630'); // lit from the upper left, like the body
      g.fillStyle = grd; g.beginPath(); g.arc(n / 2, n / 2, n * 0.44, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(n * 0.7, n * 0.36, n * 0.36, 0, Math.PI * 2); g.fill();
    }) }));
    const sparkleTex = flat((g, n) => { g.fillStyle = '#fff'; starPath(g, n / 2, n / 2, n * 0.48, n * 0.12, 4); g.fill(); });
    const sparkMat = sparkMat0; sparkMat.map = sparkleTex;
    const glowTex = flat((g, n) => { const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); grd.addColorStop(0, 'rgba(255,214,110,.7)'); grd.addColorStop(0.4, 'rgba(255,190,90,.3)'); grd.addColorStop(1, 'rgba(255,170,70,0)'); g.fillStyle = grd; g.fillRect(0, 0, n, n); });
    const bellyGlow = new T.Mesh(planeGeo, new T.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    const bellyStar = new T.Mesh(planeGeo, new T.MeshBasicMaterial({ transparent: true, depthWrite: false, map: flat((g, n) => {
      g.shadowColor = '#ffd25c'; g.shadowBlur = n * 0.08; g.fillStyle = '#fff3b0'; starPath(g, n / 2, n * 0.53, n * 0.4, n * 0.2, 5); g.fill();
      g.shadowBlur = 0; g.fillStyle = '#ffffff'; starPath(g, n / 2, n * 0.53, n * 0.2, n * 0.1, 5); g.fill();
    }) }));
    // two gold swirls crossing round the belly: [radius, tube, opacity, tilt, turns per second]
    const SWIRLS = [[1.24, 0.026, 0.9, 0.3, 0.6], [1.36, 0.016, 0.6, -0.22, -0.45]];
    const swirlRings = SWIRLS.map(([, tube, opacity]) => new T.Mesh(new T.TorusGeometry(1, tube, 6, 72), new T.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity, depthWrite: false })));
    scene.add(body, aura, mouth, throat, tongue, ...arms, ...cheeks, tuft, wear, moon, bellyGlow, bellyStar, ...swirlRings, wisp);
    const lookV = new T.Vector3(), outward = (m, player) => m.lookAt(lookV.set(m.position.x * 2 - player.x, m.position.y * 2 - player.r * (BODY_Y + bodyLift), m.position.z * 2 - player.y));
    // A point on the body's surface: horizontal angle a, elevation el (radians), pushed out by `out`·r.
    let bodyLift = 0; // share of r the body sits up (the car skin's seat)
    const onBody = (player, a, el, out, v) => {
      const r = player.r, c = Math.cos(el);
      return v.set(player.x + Math.cos(a) * c * r * (1 + out), r * (BODY_Y + bodyLift) + Math.sin(el) * r * BODY_SY * (1 + out),
        player.y + Math.sin(a) * c * r * (1 + out));
    };
    scene.add(blob, litRing);
    // A painted skin (setSkin, skin.art): the character is its picture, a card that always faces the camera, standing
    // where the 3D body stands; the body and its face step aside. It hops along while moving, breathes at rest,
    // swells with each gulp and wobbles green while poisoned, as the body does. Looks only.
    const artMat = new T.SpriteMaterial({ transparent: true, depthWrite: false, alphaTest: 0.02 });
    const artSprite = new T.Sprite(artMat); artSprite.center.set(0.5, 0.2); // pinned near its feet, so it stands on the ground
    artSprite.visible = false; artSprite.renderOrder = 7; scene.add(artSprite);
    const artTex = {}; let artOn = false, artLean = 0, artHid = false, artNow = null, artFlip = false;
    // The picture's face moves: over the painted smile the mouth opens into a tall dark O with its tongue while it
    // sucks something in, the eyes squeeze shut happily (^^) after a gulp and during a combo, and the blush deepens
    // with the combo. Drawn on the card's own canvas at the spots tools/skins/pack.py found (DuskSkinFace), and only
    // when one of the three steps changes (`step` remembers the last one drawn).
    function artDraw(a, gulp, happy, cheer) {
      const step = Math.round(gulp * 6) + (happy ? 10 : 0) + Math.round(cheer * 3) * 100;
      if (!a.ready || step === a.step) return;
      a.step = step;
      const g = a.canvas.getContext('2d'), n = a.canvas.width, u = n / 192, f = a.face;
      g.clearRect(0, 0, n, n); g.drawImage(a.img, 0, 0, n, n);
      if (!f) { a.tex.needsUpdate = true; return; }
      const [mx, my, lx, ly, rx, ry, skin] = f, hexOf = c => '#' + c.toString(16).padStart(6, '0');
      const soft = (x, y, r, color, alpha) => { // a round patch that fades out at its edge
        const grd = g.createRadialGradient(x * u, y * u, 0, x * u, y * u, r * u);
        grd.addColorStop(0, color); grd.addColorStop(0.65, color); grd.addColorStop(1, color + '00');
        g.globalAlpha = alpha; g.fillStyle = grd; g.beginPath(); g.arc(x * u, y * u, r * u, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      };
      const c3 = Math.round(cheer * 3) / 3;
      const there = ([x]) => x >= 0; // a covered eye (the pirate's patch) is written as -1 and left alone
      if (c3 > 0) for (const [x, y] of [[lx, ly, -7], [rx, ry, 6]].filter(there).map(([x, y, dx]) => [x + dx, y + 12])) soft(x, y, 8.5, '#ff6f96', 0.55 * c3);
      if (happy) for (const [x, y] of [[lx, ly], [rx, ry]].filter(there)) {
        soft(x, y, 10, hexOf(skin), 1);
        g.strokeStyle = '#2a1640'; g.lineWidth = 2.4 * u; g.lineCap = 'round';
        g.beginPath(); g.moveTo((x - 5.5) * u, (y + 2.5) * u); g.quadraticCurveTo(x * u, (y - 5.5) * u, (x + 5.5) * u, (y + 2.5) * u); g.stroke();
      }
      const o = Math.round(gulp * 6) / 6;
      if (o > 0) {
        const cy = my + o * 5, w = 7 + o * 4.5, h = 5 + o * 11;
        soft(mx, my, 10, hexOf(skin), 1); // the painted smile goes under
        g.fillStyle = '#6a2a6a'; g.beginPath(); g.ellipse(mx * u, cy * u, (w + 1.4) * u, (h + 1.4) * u, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1c0a24'; g.beginPath(); g.ellipse(mx * u, cy * u, w * u, h * u, 0, 0, Math.PI * 2); g.fill();
        g.save(); g.clip(); g.fillStyle = '#ff7fa6'; g.beginPath(); g.ellipse(mx * u, (cy + h * 0.72) * u, w * 0.75 * u, h * 0.45 * u, 0, 0, Math.PI * 2); g.fill(); g.restore();
      }
      a.tex.needsUpdate = true;
    }
    const artAlways = [body, mouth, throat, ...arms, bellyGlow, bellyStar, ...swirlRings]; // parts nothing else shows again each frame
    const artStandIns = [body, mouth, throat, tongue, ...arms, ...cheeks, tuft, wear, moon, bellyGlow, bellyStar, ...swirlRings, ...eyes.flatMap(o => [o.e, o.p, o.p2].filter(Boolean))];
    // Car skin (shop `car`): the bean sits on a little felt car that drives where it goes, wheels turning with the speed.
    // Looks only: the body's footprint (r) and every rule stay the same. Unlit like the body, so day and night match.
    const carMat = felt(new T.MeshBasicMaterial({ color: 0x8fd3e8 })), tyreMat = felt(new T.MeshBasicMaterial({ color: 0x2a2d3a }));
    const trimMat = new T.MeshBasicMaterial({ color: 0xf4f1ea }), lampMat = new T.MeshBasicMaterial({ color: 0xfff3b0 });
    const car = new T.Group(), wheels = [];
    const carPart = (geo, mat, sx, sy, sz, x, y, z) => { const m = new T.Mesh(unit[geo], mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); car.add(m); return m; };
    carPart('rbox', carMat, 2.6, 0.42, 1.7, 0, 0.36, 0);                                   // the chassis, forward is +x
    carPart('rbox', trimMat, 0.16, 0.18, 1.5, 1.3, 0.24, 0); carPart('rbox', trimMat, 0.16, 0.18, 1.5, -1.3, 0.24, 0); // bumpers
    for (const z of [0.5, -0.5]) carPart('sphere', lampMat, 0.1, 0.1, 0.1, 1.3, 0.42, z);  // headlights
    for (const [x, z] of [[0.85, 0.86], [0.85, -0.86], [-0.85, 0.86], [-0.85, -0.86]]) {
      const hub = new T.Group(); hub.position.set(x, 0.3, z); hub.rotation.x = Math.PI / 2; car.add(hub); // axle across the car
      const spin = new T.Group(); hub.add(spin); wheels.push(spin);
      const tyre = new T.Mesh(unit.cyl, tyreMat); tyre.scale.set(0.3, 0.2, 0.3); spin.add(tyre);
      const cap = new T.Mesh(unit.box, trimMat); cap.scale.set(0.34, 0.22, 0.07); spin.add(cap); // a bar on the hubcap shows it turning
    }
    car.visible = false; scene.add(car);
    let carOn = false, carHead = 0, wheelTurn = 0, carT = 0;

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
    // Buildings get a calm ring: thin, faint and still. A building-sized ring that pulses reads as the building
    // blinking (TestFlight: "the buildings on map 1 flicker") once a big body may eat most of the map.
    const calmGeo = new T.RingGeometry(1.08, 1.16, 36); calmGeo.rotateX(-Math.PI / 2);
    const calmMat = new T.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.32, depthWrite: false });
    const calmHints = new T.InstancedMesh(calmGeo, calmMat, MAX_HINTS);
    calmHints.renderOrder = 4; calmHints.count = 0; calmHints.frustumCulled = false; scene.add(calmHints);
    hints.renderOrder = 4;
    // the same ring in violet under things that are edible but bad for you (zombies): a warning, not an invitation
    const badMat = new T.MeshBasicMaterial({ color: 0xc766ff, transparent: true, opacity: 0.85, depthWrite: false });
    const badGeo = new T.RingGeometry(0.95, 1.5, 28); badGeo.rotateX(-Math.PI / 2); // wider than the orange ring: a warning you cannot miss
    const badHints = new T.InstancedMesh(badGeo, badMat, 64);
    badHints.renderOrder = 4;
    scene.add(hints, badHints);
    // Light shards (pickups): a spinning crystal over a pale ring with a thin pillar, colored by kind, instanced.
    const MAX_SHARDS = 4, SHARD_COL = { bolt: 0x7debff, cloud: 0xe3d7ff, magnet: 0xff7ad9 };
    const shardGem = new T.InstancedMesh(new T.OctahedronGeometry(1), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }), MAX_SHARDS);
    // Spat darkness: small deep-violet blobs with a pale rim, flying low (f.spits).
    const MAX_SPITS = 8;
    const spitBlob = new T.InstancedMesh(unit.sphere, new T.MeshBasicMaterial({ color: 0x2a0b55 }), MAX_SPITS);
    const spitRim = new T.InstancedMesh(unit.sphere, new T.MeshBasicMaterial({ color: 0xb78cff, transparent: true, opacity: 0.45, depthWrite: false }), MAX_SPITS);
    spitBlob.count = spitRim.count = 0; spitBlob.frustumCulled = spitRim.frustumCulled = false; scene.add(spitBlob, spitRim);
    const shardRing = new T.InstancedMesh(goldGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }), MAX_SHARDS);
    const shardBeam = new T.InstancedMesh(new T.CylinderGeometry(1, 1, 1, 10, 1, true),
      new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }), MAX_SHARDS);
    for (const m of [shardGem, shardRing, shardBeam]) { // instance colors exist up front, so the shader is built with them (as the props do)
      for (let i = 0; i < MAX_SHARDS; i++) m.setColorAt(i, new T.Color(0xffffff));
      m.instanceColor.needsUpdate = true; m.count = 0; m.frustumCulled = false; m.renderOrder = 8; scene.add(m);
    }
    // the cloud shard's bubble of shade and the magnet's closing ring, both around the player
    const bubble = new T.Mesh(unit.sphere, new T.MeshBasicMaterial({ color: 0xcfc2ff, transparent: true, opacity: 0.16, depthWrite: false, blending: T.AdditiveBlending }));
    bubble.visible = false; bubble.renderOrder = 7;
    const magnetRing = new T.Mesh(hintGeo, new T.MeshBasicMaterial({ color: 0xff7ad9, transparent: true, opacity: 0.5, depthWrite: false }));
    magnetRing.visible = false; magnetRing.renderOrder = 4;
    scene.add(bubble, magnetRing);
    // The worn summoning circle (setCircle): looks only, casts nothing. Three flat layers under the blob — a
    // violet shadow pool with the pattern pressed into it (normal blending, so it darkens the ground like a cast
    // shadow, but tinted so it never reads as real shade), the glowing pattern turning one way, a rune band turning
    // the other — plus motes of its color rising from the rim.
    const decal = (size, blending, order) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = size;
      const tex = new T.CanvasTexture(cv), geo = new T.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
      const m = new T.Mesh(geo, new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending }));
      m.renderOrder = order; m.userData.canvas = cv; scene.add(m); return m;
    };
    const circleShade = decal(256, T.NormalBlending, 3), circleMesh = decal(256, T.AdditiveBlending, 4), circleRunes = decal(256, T.AdditiveBlending, 4);
    {
      const g = circleRunes.userData.canvas.getContext('2d'); drawRunes(g, 256); circleRunes.material.map.needsUpdate = true;
    }
    const MOTES = 14, moteGeo = new T.BufferGeometry();
    moteGeo.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(MOTES * 3), 3));
    const moteTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 32, 32); return new T.CanvasTexture(c);
    })();
    const circleMotes = new T.Points(moteGeo, new T.PointsMaterial({ map: moteTex, size: 9, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    circleMotes.renderOrder = 8; circleMotes.frustumCulled = false; scene.add(circleMotes);
    // The circle's tail: a string of little stars that trail after the blob like ducklings, each one a fixed step
    // behind the one before it (a rope, so no frame time is needed), shrinking and fading toward the end. Looks only.
    const TRAIL = 6, starTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.shadowColor = '#ffffff'; g.shadowBlur = 8; g.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 10 : 22; k ? g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r) : g.moveTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
      g.closePath(); g.fill(); return new T.CanvasTexture(c);
    })();
    const circleTrail = Array.from({ length: TRAIL }, () => {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      sp.renderOrder = 8; sp.userData.at = null; scene.add(sp); return sp;
    });
    const circleParts = [circleShade, circleMesh, circleRunes, circleMotes, ...circleTrail];
    circleParts.forEach(m => { m.visible = false; });

    const TEX = makeTextures();
    const NIGHT_WINDOWS = col('#ffc46b');
    const dummy = new T.Object3D();
    const tmpCol = new T.Color(), tmpAxis = new T.Vector3();
    const tmpDir = new T.Vector3(), tmpRight = new T.Vector3(), tmpUp = new T.Vector3(), tmpFocus = new T.Vector3(); // shadow-camera snapping
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

    // Hard things (ground, roads, buildings, roofs) are matte clay; soft things (props, people, animals, guards) stay felt.
    function lambert(color, extra, mode = 'clay') { return felt(new T.MeshLambertMaterial(Object.assign({ color: col(color) }, extra)), mode); }

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
        w.waterMat = felt(new T.MeshPhongMaterial({ color: col(stage.water[0]), shininess: 60, specular: 0x334455 }), 'clay');
        const water = new T.Mesh(wg, w.waterMat);
        water.position.set(WORLD / 2, -1.5, waterY + (WORLD - waterY) / 2);
        water.receiveShadow = true;
        group.add(water);
        const quay = new T.Mesh(unit.box, lambert(stage.theme === 'beach' ? '#ecd9aa' : '#7d7a76')); // sand runs into the sea on the beach
        quay.scale.set(WORLD, 4, 8); quay.position.set(WORLD / 2, -0.5, waterY - 3);
        quay.receiveShadow = true;
        group.add(quay);
      }

      // earthen lanes: no lane paint, no crosswalks, low stone edges. `street` gives a map its own path surface
      // (TestFlight: the later maps all looked like the same gray grid) and drops the city paint with it.
      const street = stage.street || null, alley = !!stage.alley || !!street, snowy = !!(stage.look && stage.look.snow);
      // Day colors of the street (the frame loop restores them after night): a cool mid gray so paint and curbs pop.
      // on a snow map the streets are packed snow, not bare asphalt (TestFlight: "too little snow")
      w.roadDay = street ? street.road : alley ? '#cdb892' : snowy ? '#d9e0e9' : '#9a96a4';
      w.curbDay = street ? street.curb : alley ? '#b8aa90' : snowy ? '#f6f8fb' : '#e6e0d4';
      w.roadMat = lambert(w.roadDay);
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
          if (alley || nearCross(a)) continue;
          if (a < waterY - 12) dashes.push([c, a, 1.6, 12]);
          if (c < waterY - 12) dashes.push([a, c, 12, 1.6]);
        }
        for (let m = 0; m <= cells; m++) {
          const r = m * CELL;
          if (r > land && c > land) continue;
          for (let i = -2; i <= 2 && !alley; i++) {
            const off = ROAD / 2 + 7;
            if (r <= land) { stripes.push([c - off, r + i * 8, 10, 4.5]); stripes.push([c + off, r + i * 8, 10, 4.5]); }
            if (c <= land && r < waterY - 6) { stripes.push([c + i * 8, r - off, 4.5, 10]); stripes.push([c + i * 8, r + off, 4.5, 10]); } // only where a cross street exists: never out on the water
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
      w.curbMat = lambert(w.curbDay);
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
      // Natural ground for the open-air maps (redesign guide: a place, not a gray grid): flat decals on the open lots
      // and along the shore. Like the lawns they lie above the ground, are not part of it and cast nothing, so the
      // shade rule and the QA pixel check still see buildings only. Each keeps a day and a night color (frame loop).
      w.terrain = [];
      const decal = (day, night) => { const mat = lambert(day); w.terrain.push({ mat, day, night }); return mat; };
      const discs = (list, mat, y, h, geo = unit.disc) => {
        const im = new T.InstancedMesh(geo, mat, list.length);
        list.forEach(([x, z, rx, rz], i) => {
          dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(rx, h, rz); dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
        });
        im.receiveShadow = true; group.add(im);
      };
      const open = w.lots.filter(([, y0, inner]) => y0 + inner <= land), theme = stage.theme;
      const pick = ([x0, y0]) => Math.abs(Math.round(x0 * 7 + y0 * 13)); // a steady number per lot, as for buildings
      const corner = (lot, n, far) => { // a spot in one quarter of the lot (far: the opposite quarter), clear of the centrepiece
        const [x0, y0, inner] = lot, fx = (n % 4 < 2) !== !!far ? 0.28 : 0.72, fy = (n % 3 === 0) !== !!far ? 0.28 : 0.72;
        return [x0 + inner * fx, y0 + inner * fy];
      };
      if (theme === 'farm') { // ploughed fields: soil with rows of greens or wheat; every third lot stays pasture
        const soil = [], greens = [], wheat = [];
        for (const lot of open) {
          const [x0, y0, inner] = lot, n = pick(lot);
          if (n % 3 === 0) continue;
          soil.push([x0 + inner / 2, y0 + inner / 2, inner - 16, inner - 16]);
          for (let a = 15; a <= inner - 15; a += 10)
            (n % 3 === 1 ? greens : wheat).push(n % 2 ? [x0 + inner / 2, y0 + a, inner - 26, 4.6] : [x0 + a, y0 + inner / 2, 4.6, inner - 26]);
        }
        if (soil.length) slabs(soil, decal('#c39a6b', '#3a3350'), 0.3, 0.3);
        if (greens.length) slabs(greens, decal('#7fbb5c', '#2c4a40'), 0.5, 0.5);
        if (wheat.length) slabs(wheat, decal('#ecc95e', '#4c4762'), 0.5, 0.5);
      }
      if (theme === 'desert' || theme === 'beach') { // wind ripples on the sand; in the desert some lots hold a green-rimmed pool
        const ripple = [], rim = [], pool = [];
        for (const lot of open) {
          const [x0, y0, inner] = lot, n = pick(lot);
          for (let i = 0; i < 4; i++) ripple.push([x0 + inner * (0.2 + 0.2 * i), y0 + inner * (0.2 + 0.2 * ((n >> (i * 2)) % 4)), inner * 0.15, 2.6]);
          if (theme === 'desert' && n % 2) {
            const [px, py] = corner(lot, n), r = inner * 0.15;
            rim.push([px, py, r + 5, r * 0.78 + 5]); pool.push([px, py, r, r * 0.78]);
          }
        }
        if (ripple.length) discs(ripple, decal(theme === 'beach' ? '#fbefd0' : '#f8e7c2', '#3a3454'), 0.22, 0.3);
        if (rim.length) { discs(rim, decal('#a9cf78', '#2c4a40'), 0.24, 0.36); discs(pool, decal('#6fcbd8', '#243a5c'), 0.26, 0.44); }
      }
      if (theme === 'oasis') { // on each lawn: a pond in a pale stone ring, and a flower bed across from it
        const rim = [], pool = [], pink = [], gold = [];
        for (const lot of open) {
          const n = pick(lot), [px, py] = corner(lot, n), [bx, by] = corner(lot, n, true), r = lot[2] * 0.14;
          rim.push([px, py, r + 4, r * 0.75 + 4]); pool.push([px, py, r, r * 0.75]);
          (n % 2 ? pink : gold).push([bx, by, 10, 10]);
        }
        if (rim.length) { discs(rim, decal('#ece5d6', '#4b4868'), 0.66, 0.4); discs(pool, decal('#7fd1e8', '#243a5c'), 0.7, 0.44); }
        if (pink.length) discs(pink, decal('#ffa3c6', '#5a4672'), 0.66, 0.4);
        if (gold.length) discs(gold, decal('#ffd76a', '#5c5470'), 0.66, 0.4);
      }
      if (theme === 'park' && open.length) { // a round paved plaza in each lot: cream, a pink band, cream again
        const ring = k => open.map(([x0, y0, inner]) => [x0 + inner / 2, y0 + inner / 2, inner * k, inner * k]);
        const cream = decal('#fff6e6', '#4b4868');
        discs(ring(0.37), cream, 0.22, 0.3); discs(ring(0.31), decal('#f6bccb', '#5a4672'), 0.24, 0.34); discs(ring(0.2), cream, 0.26, 0.38);
      }
      if (waterY < WORLD && theme === 'beach') { // the waterline: a band of wet sand, and foam lapping at it
        slabs([[WORLD / 2, waterY - 13, WORLD, 12]], decal('#e2c88f', '#34304e'), 0.17, 0.3);
        const foam = [];
        for (let x = 0, i = 0; x <= WORLD; x += 20, i++) foam.push([x, waterY + 2.5 + (i % 2) * 2.5, 12 + (i % 3) * 3, 5 + (i % 2) * 1.5]);
        discs(foam, decal('#ffffff', '#6a78a8'), -1.3, 0.3);
      }
      if (waterY < WORLD && theme === 'harbor') { // the quay's edge: a yellow safety line and mooring bollards
        slabs([[WORLD / 2, waterY - 0.8, WORLD, 2.4]], decal('#f2c14e', '#5c5470'), 1.6, 0.3);
        const posts = [];
        for (let x = 18; x < WORLD; x += 36) posts.push([x, waterY - 3.4, 2.1, 2.1]);
        const iron = decal('#3d3b4a', '#23223c');
        discs(posts, iron, 3.6, 4.2, unit.cyl); discs(posts.map(([x, z]) => [x, z, 3, 3]), iron, 6.1, 1.2, unit.cyl);
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
      w.wallMats = []; w.rideCars = [];
      const propMat = lambert('#a19d94');
      // Rooftop units come in three kinds (machine gray, a roof garden, a solar panel), so the skyline is not all one gray.
      const roofProps = [propMat, lambert('#8ccf86'), lambert('#6f8fc9')];
      const AWNINGS = ['#ff7575', '#ffd166', '#7fd1e8', '#8fd694'], awnMats = {}, awnTrim = lambert('#fff6e6');
      // The theme's look: which wall texture, and what color the walls take (default: the roof color lightened).
      const look = w.stage.look || {};
      const WALL_BASE = { glass: '#cfe3f5', brick: '#b86a4e', adobe: '#e9d3a8', hanok: '#f3e7cf', concrete: '#b9b7b0' };
      const wallKindOf = b => b.plain && !look.wall ? 'planks' : look.wall || 'windows';
      const litAtNight = k => k === 'windows' || k === 'glass';
      for (const b of w.buildings) {
        if (b.wall) continue; // courtyard walls are instanced below
        const kind = wallKindOf(b);
        const key = b.crane ? 'crane' : b.roof + '/' + kind;
        if (!mats[key]) {
          // walls take more of the roof's color than before: saturated blocks, each building its own hue
          const wallCol = WALL_BASE[kind] ? col(WALL_BASE[kind]).lerp(col(b.roof), kind === 'glass' ? 0.3 : 0.3)
            : col(b.roof).lerp(col('#ffffff'), kind === 'pastel' ? 0.4 : 0.25);
          const glow = wallCol.clone().multiplyScalar(0.35);
          const map = { windows: TEX.windows, planks: TEX.planks, pastel: TEX.planks, glass: TEX.glass, brick: TEX.brick, adobe: TEX.adobe,
            hanok: TEX.hanok, corrugated: TEX.corrugated, concrete: TEX.concrete }[kind] || TEX.windows;
          const wall = b.crane ? lambert(wallCol, { emissive: glow }) : lambert(wallCol, { map, emissive: glow, emissiveMap: TEX.plain });
          wall.userData.day = glow; wall.userData.night = litAtNight(kind) ? TEX.lit : TEX.dark;
          if (!b.crane) w.wallMats.push(wall);
          // clay, never knit: knit stitches over the roof's own lines made a fine checker that crawled as the camera moved
          // (tester, build 69: "every map's roofs flicker")
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
        } else if (b.ride === 'drop') { // a drop tower (park): a ring of seats that rises and drops along the box, and a lit crown
          // The box is the shade, as for every tower; the ring and crown are wider than it but cast nothing, like a crane's boom.
          const ring = new T.Mesh(unit.cyl, lambert('#ffd25c', { emissive: col('#ffd25c').multiplyScalar(0.3) }));
          ring.scale.set(17 / b.w, 7 / b.h, 17 / b.d);
          const crown = new T.Mesh(unit.cone, lambert('#ff7aa8'));
          crown.scale.set(14 / b.w, 16 / b.h, 14 / b.d); crown.position.y = 0.5 + 8 / b.h;
          mesh.add(ring, crown);
          w.rideCars.push({ ring, b, phase: (hash % 17) / 17 });
        } else { // one or two rooftop units; they cast no shadow, so the rule stays buildings-only
          // A flat top gets a raised rim and a round water tank too, so it reads as a roof, not the top of a block
          // (tester, build 53: everything looks like blocks). The wall box itself is the shade rule and stays as it is.
          const flat = !ROOFS[look.roof] || (look.roof === 'gable' && b.h > (look.gableMax || 80));
          if (flat) {
            if (!mats[key].rim) mats[key].rim = lambert(col(b.roof).lerp(col('#ffffff'), 0.35));
            const rim = new T.Mesh(parapetGeometry(b.w, b.d), mats[key].rim);
            rim.scale.set(1 / b.w, 1 / b.h, 1 / b.d); rim.position.y = 0.5;
            rim.receiveShadow = true;
            mesh.add(rim);
          }
          for (let k = 0; k <= hash % 2; k++) {
            const tank = flat && k === 0 && hash % 3 === 0, sz = 9 + (hash >> (k + 2)) % 8, h = tank ? 8 : 5;
            const prop = new T.Mesh(tank ? unit.cyl : unit.rbox, tank ? propMat : roofProps[(hash >> 5) % 3]);
            prop.scale.set((tank ? sz / 2 : sz) / b.w, h / b.h, (tank ? sz / 2 : sz) / b.d);
            prop.position.set((((hash >> (k * 3)) % 5) - 2) * 0.12, 0.5 + h / 2 / b.h, (((hash >> (k * 3 + 4)) % 5) - 2) * 0.12);
            prop.receiveShadow = true;
            mesh.add(prop);
          }
        }
        if (look.awning && !b.crane && b.h >= 18) { // a shop awning over the wall that faces the camera, with a pale valance; drawn, casting nothing
          const c = AWNINGS[hash % AWNINGS.length], am = awnMats[c] || (awnMats[c] = lambert(c));
          const top = new T.Mesh(unit.box, am), val = new T.Mesh(unit.box, awnTrim);
          top.scale.set(0.86, 1.4 / b.h, 6 / b.d); top.position.set(0, -0.5 + 12.5 / b.h, 0.5 + 3 / b.d);
          val.scale.set(0.86, 2.6 / b.h, 0.8 / b.d); val.position.set(0, -0.5 + 11.2 / b.h, 0.5 + 6 / b.d);
          top.receiveShadow = val.receiveShadow = true;
          mesh.add(top, val);
        }
        placeBuilding(b, b.x + b.w / 2, b.y + b.d / 2, 1, 0);
      }
      w.roofMats = Object.values(mats).map(m => m.roof);

      // Courtyard walls (hanok): thin 'buildings' drawn as one instanced mud wall plus a tile cap. The wall casts
      // real shadows, so the rule, the shadow map, the bounce and the swallow all see the same thing.
      w.wallIM = w.capIM = null;
      const walls = w.buildings.filter(b => b.wall);
      if (walls.length) {
        const im = new T.InstancedMesh(unit.box, lambert('#e3d5b8'), walls.length), cim = new T.InstancedMesh(unit.box, lambert('#5a5e6a'), walls.length);
        im.castShadow = im.receiveShadow = cim.receiveShadow = true; im.frustumCulled = cim.frustumCulled = false;
        walls.forEach((b, i) => { b.wallIM = im; b.capIM = cim; b.wallIdx = i; placeBuilding(b, b.x + b.w / 2, b.y + b.d / 2, 1, 0); });
        group.add(im, cim); w.wallIM = im; w.capIM = cim;
      }

      // Shaped roofs (gable / hip): one instanced mesh for the whole map, colored per building, no gameplay shadow
      // (the rule and the shadow map use the wall box only). placeBuilding keeps each instance over its building.
      w.roofIM = null;
      if (ROOFS[look.roof]) {
        const list = w.buildings.filter(b => !b.crane && !b.wall);
        const roofMat = lambert('#ffffff', { map: look.snow ? TEX.snowroof : look.roof === 'flat' ? TEX.roof : look.roof === 'gable' ? TEX.shingles : TEX.tiles }); // clay, as above
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
          const mat = part.tex ? new T.MeshBasicMaterial({ map: signTex(part.tex) }) : part.glow ? new T.MeshBasicMaterial({ color: col(c) }) : lambert(c, undefined, part.geo === 'blob' || undefined); // round crowns are yarn balls, the rest felt
          const im = new T.InstancedMesh(low[part.geo], mat, list.length);
          im.receiveShadow = true;
          if (CASTERS[type] && CASTERS[type].includes(PARTS[type].indexOf(part))) im.castShadow = true; // shades the ground, as the rule says
          // Every part gets an instance color up front (white = the material's own color), so turning an object
          // golden later is just a color write, never a shader recompile.
          list.forEach((o, i) => im.setColorAt(i, tmpCol.set(part.color === 'inst' ? o.color : '#ffffff')));
          im.instanceColor.needsUpdate = true;
          group.add(im);
          w.instanced.push({ im, part, list, hidden: new Uint8Array(list.length) });
        }
      }
      for (const o of w.objects) o.dirty = true;

    // Region bosses (stages.js BOSSES), one figure per map, about 26 tall like a guard and facing +x (the beam side).
    // M(geo, color, scale, position, glow?, rotation?) adds a part; glow parts ignore lighting (lamps, eyes).
    function bossMesh(kind, color) {
      const g = new T.Group();
      const M = (geo, c, sc, pos, glow, rot) => {
        const m = new T.Mesh(unit[geo], glow ? new T.MeshBasicMaterial({ color: c }) : lambert(c, undefined, undefined));
        m.scale.set(sc[0], sc[1], sc[2]); m.position.set(pos[0], pos[1], pos[2]); if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
        m.receiveShadow = !glow; g.add(m); return m;
      };
      const eyes = (c, x, y, z, r = 1.2) => { M('sphere', c, [r, r, r], [x, y, z], true); M('sphere', c, [r, r, r], [x, y, -z], true); };
      const DARK = '#1b1b24', SKIN = '#f6d2b0';
      switch (kind) {
        case 'robot': // boxy patrol robot: headlight chest, antenna, cyan eyes
          M('box', '#2b3444', [3, 6, 3], [0, 3, 2.6]); M('box', '#2b3444', [3, 6, 3], [0, 3, -2.6]);
          M('box', color, [9, 13, 8], [0, 12.5, 0]); M('box', '#55688c', [7, 6, 7], [0, 22, 0]);
          M('box', '#ffd23f', [1.5, 2.4, 4], [4.7, 12.5, 0], true); M('cyl', '#9aa7bd', [0.5, 4, 0.5], [0, 27, 0]); M('sphere', '#ff5e3a', [1, 1, 1], [0, 29.2, 0], true);
          M('box', '#2b3444', [2.4, 8, 2.4], [1, 12, 5.6]); M('box', '#2b3444', [2.4, 8, 2.4], [1, 12, -5.6]);
          eyes('#7debff', 3.6, 23, 1.9); break;
        case 'genie': // smoke tail from a golden lamp, bare torso, turban, bright eyes
          M('box', '#d4a017', [9, 2.6, 5], [-2, 1.3, 0]); M('cone', '#d4a017', [1.2, 4, 1.2], [3, 2.6, 0], false, [0, 0, -1.3]);
          M('cone', '#8fd6f2', [3.2, 9, 3.2], [-1, 8, 0], false, [Math.PI, 0, 0]);
          M('capsule', color, [4, 2.6, 4], [0, 16.5, 0]); M('sphere', '#5fc8ea', [4, 4, 4], [0, 25.5, 0]);
          M('cone', '#f2c14e', [3.6, 4, 3.6], [0, 30.5, 0]); M('sphere', '#ff4fd8', [1, 1, 1], [3.2, 30.5, 0], true);
          M('capsule', color, [1.3, 1.6, 1.3], [3.5, 17, 4.8], false, [0, 0, -1.1]); M('capsule', color, [1.3, 1.6, 1.3], [3.5, 17, -4.8], false, [0, 0, -1.1]);
          eyes('#ffffff', 3.4, 26, 1.5, 0.9); break;
        case 'dokkaebi': // red goblin: horns, tusks, fur skirt, a spiked club held out front, fire-yellow eyes
          M('cyl', '#5a3a1a', [6, 5, 6], [0, 5.5, 0]); M('capsule', color, [4.5, 2.6, 4.5], [0, 15, 0]); M('sphere', color, [4.8, 4.8, 4.8], [0, 25, 0]);
          M('cone', '#f5e6c8', [1.2, 4, 1.2], [0, 30.5, 2.2], false, [0, 0, -0.3]); M('cone', '#f5e6c8', [1.2, 4, 1.2], [0, 30.5, -2.2], false, [0, 0, 0.3]);
          M('cone', '#ffffff', [0.6, 1.8, 0.6], [4.2, 22.8, 1.4]); M('cone', '#ffffff', [0.6, 1.8, 0.6], [4.2, 22.8, -1.4]);
          M('box', '#6b4a2b', [14, 2.6, 2.6], [9, 15, 4.5]); M('cyl', '#4a3220', [2.2, 5, 2.2], [15, 15, 4.5], false, [0, 0, Math.PI / 2]);
          M('capsule', color, [1.3, 1.8, 1.3], [3.5, 16, -5], false, [0, 0, -1.1]); eyes('#ffd23f', 3.8, 26, 1.8); break;
        case 'tiger': // orange teacher with stripes, round glasses and a flashlight
          M('capsule', color, [4.5, 2.6, 4.5], [0, 15, 0]); M('box', DARK, [4.6, 1, 9.4], [0.3, 17.5, 0]); M('box', DARK, [4.6, 1, 9.4], [0.3, 13.5, 0]);
          M('sphere', color, [4.8, 4.8, 4.8], [0, 25, 0]); M('sphere', '#ffffff', [2.2, 1.8, 2.6], [3.6, 23.6, 0]);
          M('cone', color, [1.4, 2.4, 1.4], [0, 30, 3]); M('cone', color, [1.4, 2.4, 1.4], [0, 30, -3]);
          M('cyl', DARK, [1.9, 0.5, 1.9], [4.4, 26, 1.9], false, [0, 0, Math.PI / 2]); M('cyl', DARK, [1.9, 0.5, 1.9], [4.4, 26, -1.9], false, [0, 0, Math.PI / 2]);
          M('cyl', DARK, [1.2, 7, 1.2], [8, 14, -5], false, [0, 0, Math.PI / 2]); M('cyl', '#fff3b0', [1.8, 1.5, 1.8], [12, 14, -5], true, [0, 0, Math.PI / 2]);
          eyes('#ffffff', 4.2, 26, 1.9, 0.9); break;
        case 'snowman': // three snowballs, top hat, red glowing eyes, a jagged coal grin, stick arms, a lantern
          M('sphere', color, [7, 7, 7], [0, 6.5, 0]); M('sphere', color, [5.2, 5.2, 5.2], [0, 16.5, 0]); M('sphere', color, [4, 4, 4], [0, 24.5, 0]);
          M('cyl', DARK, [3, 5, 3], [0, 30, 0]); M('cyl', DARK, [5, 0.6, 5], [0, 27.8, 0]);
          M('cone', '#f28c28', [0.8, 3.5, 0.8], [5, 24, 0], false, [0, 0, -Math.PI / 2]);
          for (const [z, y] of [[-2.2, 22.6], [-1.1, 22], [0, 22.4], [1.1, 22], [2.2, 22.6]]) M('box', DARK, [0.8, 1, 0.8], [3.7, y, z]);
          M('box', '#6b4a2b', [10, 0.8, 0.8], [5, 18, 4], false, [0, 0.5, 0]); M('box', '#6b4a2b', [10, 0.8, 0.8], [5, 18, -4], false, [0, -0.5, 0]);
          M('box', '#ffd23f', [2.4, 3, 2.4], [9.4, 16, 6.5], true);
          eyes('#ff3b3b', 3.5, 25.5, 1.5, 1.1); break;
        case 'jangseung': // a carved wooden post: bulging glowing eyes, big nose, grinning teeth, a hat band
          M('cyl', color, [5.5, 26, 5.5], [0, 13, 0]); M('cyl', '#5a3a1a', [6.2, 3, 6.2], [0, 27.5, 0]); M('cyl', '#2b1a0a', [5.7, 1.2, 5.7], [0, 20.5, 0]);
          M('box', '#6b4a2b', [2.6, 3.5, 2], [5.5, 17, 0]);
          for (const z of [-2.4, -0.8, 0.8, 2.4]) M('box', '#fff3d6', [1, 2.2, 1.2], [5.2, 13, z]);
          M('box', '#6b4a2b', [2, 0.8, 7], [5, 15, 0]); M('box', '#6b4a2b', [2, 0.8, 7], [5, 11.6, 0]);
          eyes('#ffd23f', 5.2, 23, 2.4, 1.6); break;
        case 'signal': // a walking traffic light: housing on a pole, three lamps (red lit), arms and legs
          M('box', '#444c55', [3, 7, 3], [0, 3.5, 2.6]); M('box', '#444c55', [3, 7, 3], [0, 3.5, -2.6]);
          M('cyl', '#444c55', [1.6, 8, 1.6], [0, 11, 0]); M('box', color, [6, 15, 6], [0, 22.5, 0]);
          M('sphere', '#ff3b3b', [1.9, 1.9, 1.9], [3.2, 27, 0], true); M('sphere', '#5a4a1a', [1.9, 1.9, 1.9], [3.2, 22.5, 0]); M('sphere', '#1f4a2a', [1.9, 1.9, 1.9], [3.2, 18, 0]);
          M('box', '#444c55', [2, 9, 2], [1, 18, 5]); M('box', '#444c55', [2, 9, 2], [1, 18, -5]); break;
        case 'mascot': // a foam-headed plush mascot with a jersey number, holding a stadium light
          M('sphere', color, [7, 7, 7], [0, 8, 0]); M('box', '#ffffff', [1.2, 5, 4], [6.2, 9, 0]);
          M('sphere', '#ffd23f', [6, 6, 6], [0, 21, 0]); M('sphere', '#ffd23f', [2.4, 2.4, 2.4], [0, 27, 4.5]); M('sphere', '#ffd23f', [2.4, 2.4, 2.4], [0, 27, -4.5]);
          M('sphere', '#ffffff', [3, 2.4, 3.6], [4.5, 19.5, 0]); M('sphere', DARK, [1.2, 1.2, 1.2], [6.8, 19.8, 0]);
          M('cyl', '#444c55', [1, 8, 1], [7, 12, -7], false, [0, 0, Math.PI / 2]); M('box', '#fff3b0', [2, 4, 4], [11.5, 12, -7], true);
          eyes('#ffffff', 5, 22.5, 2.2, 1.3); eyes(DARK, 6, 22.5, 2.2, 0.6); break;
        case 'lighthouse': // a small lighthouse on legs: white tower, red band, lamp head, cross arms
          M('cyl', '#ddd6c8', [2.2, 6, 2.2], [0, 3, 3]); M('cyl', '#ddd6c8', [2.2, 6, 2.2], [0, 3, -3]);
          M('cyl', color, [6, 20, 6], [0, 16, 0]); M('cyl', '#d9534f', [6.3, 4, 6.3], [0, 14, 0]); M('cyl', '#d9534f', [6.3, 1.5, 6.3], [0, 24, 0]);
          M('cyl', '#444c55', [5, 1.2, 5], [0, 26.5, 0]); M('sphere', '#fff3b0', [4, 4, 4], [0, 29.5, 0], true); M('cone', '#d9534f', [4.6, 3, 4.6], [0, 33.5, 0]);
          M('box', DARK, [1, 1.2, 2.4], [5.6, 20, 1.8], false, [0.4, 0, 0]); M('box', DARK, [1, 1.2, 2.4], [5.6, 20, -1.8], false, [-0.4, 0, 0]);
          M('box', '#ddd6c8', [2, 9, 2], [1, 15, 7]); M('box', '#ddd6c8', [2, 9, 2], [1, 15, -7]); break;
        case 'crane': // a crane on tracks: yellow body, dark cab with lit glass, a long boom with a hook, a warning light
          M('box', '#2b2b2b', [12, 4, 3.5], [0, 2, 5]); M('box', '#2b2b2b', [12, 4, 3.5], [0, 2, -5]);
          M('box', color, [9, 10, 9], [0, 9, 0]); M('box', '#2c3e50', [7, 7, 7], [1, 17.5, 0]); M('box', '#9fd0ff', [0.6, 4, 5], [4.6, 18, 0], true);
          M('box', color, [20, 2, 2], [8, 24, -2], false, [0, 0, 0.35]); M('cyl', '#444c55', [0.4, 6, 0.4], [16.5, 24, -2]); M('box', '#444c55', [1.6, 1.6, 1.6], [16.5, 20.5, -2]);
          M('sphere', '#ff5e3a', [1.3, 1.3, 1.3], [0, 22, 0], true); break;
        case 'clown': // white suit, red nose, orange hair, cone hat, big shoes, a balloon on a string, a flashlight
          M('box', '#ff3b3b', [6, 2, 3.5], [1.5, 1, 3]); M('box', '#ff3b3b', [6, 2, 3.5], [1.5, 1, -3]);
          M('capsule', color, [4.6, 2.6, 4.6], [0, 15, 0]); M('sphere', '#ff3b3b', [1.3, 1.3, 1.3], [0, 18, 0]); M('sphere', '#2a7fff', [1.3, 1.3, 1.3], [0, 14, 0]);
          M('sphere', SKIN, [4.6, 4.6, 4.6], [0, 25, 0]); M('sphere', '#ff3b3b', [1.6, 1.6, 1.6], [4.4, 25, 0], true);
          M('sphere', '#ff7a00', [2.4, 2.4, 2.4], [0, 26, 4.6]); M('sphere', '#ff7a00', [2.4, 2.4, 2.4], [0, 26, -4.6]);
          M('cone', '#2a7fff', [2.6, 5, 2.6], [0, 31.5, 0]); M('sphere', '#ffd23f', [1, 1, 1], [0, 34.3, 0]);
          M('cyl', '#ffffff', [0.15, 14, 0.15], [-3, 25, 6]); M('sphere', '#ff4fd8', [3.2, 3.8, 3.2], [-3, 35, 6]);
          M('cyl', DARK, [1.2, 7, 1.2], [8, 14, -5], false, [0, 0, Math.PI / 2]); M('cyl', '#fff3b0', [1.8, 1.5, 1.8], [12, 14, -5], true, [0, 0, Math.PI / 2]);
          eyes(DARK, 4, 26.2, 1.8, 0.8); break;
        case 'crab': // a wide flat crab: eye stalks with glowing eyes, two claws out front, six legs
          M('sphere', color, [9, 5, 7.5], [0, 6, 0]);
          M('cyl', color, [0.7, 6, 0.7], [4, 12, 2.5]); M('cyl', color, [0.7, 6, 0.7], [4, 12, -2.5]); eyes('#ff3b3b', 4, 15.5, 2.5, 1.4);
          M('sphere', color, [3.5, 3, 3], [9, 6, 6]); M('box', color, [5, 1.6, 2], [12.5, 7, 6], false, [0, 0, 0.3]); M('box', color, [5, 1.6, 2], [12.5, 5, 6], false, [0, 0, -0.3]);
          M('sphere', color, [3.5, 3, 3], [9, 6, -6]); M('box', color, [5, 1.6, 2], [12.5, 7, -6], false, [0, 0, 0.3]); M('box', color, [5, 1.6, 2], [12.5, 5, -6], false, [0, 0, -0.3]);
          for (const x of [-4, 0, 4]) for (const sgn of [1, -1]) M('box', color, [1.2, 1.2, 8], [x, 3, sgn * 9], false, [sgn * 0.5, 0, 0]);
          break;
        case 'mummy': // bandaged walker: stripes of darker wrap, one burning eye, arms out, a torch
          M('capsule', color, [4.4, 2.6, 4.4], [0, 15, 0]); M('sphere', color, [4.6, 4.6, 4.6], [0, 25, 0]);
          for (const y of [11, 14.5, 18, 23.5, 26.8]) M('box', '#cbbf9f', [4.8, 0.9, 9.4], [0.2, y, 0], false, [0, 0, 0.12]);
          M('sphere', '#ff5e3a', [1.4, 1.4, 1.4], [3.9, 25.5, 1.6], true); M('box', DARK, [1.5, 1.2, 1.2], [4, 25.5, -1.6]);
          M('capsule', color, [1.3, 1.8, 1.3], [5, 17, 3.6], false, [0, 0, -1.4]); M('capsule', color, [1.3, 1.8, 1.3], [5, 17, -3.6], false, [0, 0, -1.4]);
          M('cyl', '#6b4a2b', [0.7, 7, 0.7], [9, 20, -3.6]); M('sphere', '#ffb020', [2, 2.6, 2], [9, 24.5, -3.6], true); break;
        case 'scarecrow': // a straw man off its pole: crossbar arms, burlap head, button eyes, a straw hat, a lantern
          M('cyl', '#6b4a2b', [1.2, 9, 1.2], [0, 4.5, 0]); M('box', color, [6, 12, 5], [0, 15, 0]); M('box', '#7a4a8f', [6.4, 5, 5.4], [0, 13, 0]);
          M('box', '#6b4a2b', [1.4, 1.4, 22], [0, 19, 0]); M('box', color, [2.4, 2.4, 5], [0, 19, 9]); M('box', color, [2.4, 2.4, 5], [0, 19, -9]);
          M('sphere', '#c9a86a', [4.2, 4.6, 4.2], [0, 25, 0]); M('box', DARK, [0.8, 0.8, 4], [3.9, 23.2, 0]);
          M('cyl', '#b08d3a', [7, 0.6, 7], [0, 28.8, 0]); M('cone', '#b08d3a', [4, 4, 4], [0, 31, 0]);
          M('box', '#ffd23f', [2, 2.6, 2], [3, 15.5, 11], true); eyes('#ffd23f', 3.8, 26, 1.6, 0.9); break;
        default: // keeper (the original): tall violet coat, a head, a hand lamp
          M('cyl', color, [5, 18, 5], [0, 9, 0]); M('sphere', SKIN, [4.5, 4.5, 4.5], [0, 22, 0]); M('box', '#ffd23f', [6, 3, 3], [7, 14, 0], true);
      }
      return g;
    }

      // Guards: few, so plain meshes. A boss is the map's own figure (bossMesh), built at guard size and scaled up to its radius.
      const guardMat = lambert('#2f3e66', undefined, undefined), skinMat = lambert('#f6d2b0', undefined, undefined), lampMat = new T.MeshBasicMaterial({ color: 0xffd23f });
      for (const g of w.guards) {
        g.k = g.boss ? g.r / 9 : 1;
        let gg;
        if (g.boss) gg = bossMesh(g.kind, g.color);
        else {
          gg = new T.Group();
          const body = new T.Mesh(unit.cyl, guardMat); body.scale.set(5, 18, 5); body.position.y = 9;
          const head = new T.Mesh(unit.sphere, skinMat); head.scale.setScalar(4.5); head.position.y = 22;
          const lamp = new T.Mesh(unit.box, lampMat); lamp.scale.set(6, 3, 3); lamp.position.set(7, 14, 0);
          body.receiveShadow = head.receiveShadow = true;
          gg.add(body, head, lamp);
        }
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
      if (b.wall) { // instanced wall body, and its tile cap a little wider than the wall
        const across = b.w > b.d;
        dummy.position.set(cx, b.h * s / 2 + lift, cy); dummy.rotation.set(0, 0, 0);
        dummy.scale.set(b.w * s || 1e-6, b.h * s || 1e-6, b.d * s || 1e-6);
        dummy.updateMatrix(); b.wallIM.setMatrixAt(b.wallIdx, dummy.matrix); b.wallIM.instanceMatrix.needsUpdate = true;
        dummy.position.set(cx, (b.h + 0.6) * s + lift, cy);
        dummy.scale.set((b.w + (across ? 0 : 2)) * s || 1e-6, 1.2 * s || 1e-6, (b.d + (across ? 2 : 0)) * s || 1e-6);
        dummy.updateMatrix(); b.capIM.setMatrixAt(b.wallIdx, dummy.matrix); b.capIM.instanceMatrix.needsUpdate = true;
        return;
      }
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
      for (const c of world.rideCars) { // drop towers: the seats climb slowly, hang at the top, drop fast, rest at the bottom
        const u = (t * 0.1 + c.phase) % 1, up = u < 0.6 ? u / 0.6 : u < 0.72 ? 1 : u < 0.8 ? 1 - ((u - 0.72) / 0.08) ** 2 : 0;
        c.ring.position.y = -0.5 + (8 + (c.b.h - 26) * up) / c.b.h;
      }

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
      for (const d of world.terrain) d.mat.color.set(phase.night ? d.night : d.day);
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
        // Shade is dusk-violet, not gray (redesign guide): the sky fill is lavender, and the sun makes up the rest so
        // sunlit ground still lands near its palette color. The shade stays as dark as before, so its edge reads the same.
        const HEMI = 0.36;
        sunLight.intensity = Math.min(1.8, (1 - HEMI * 0.82) / Math.sin(sun.elev));
        sunLight.color.set(0xfff4dd).lerp(col('#ff9a5a'), lowSun); // deeper orange toward dusk
        hemi.color.set(SHADE_SKY); hemi.groundColor.set(0x6f6494); hemi.intensity = HEMI;
        world.roadMat.color.set(world.roadDay);
        world.paintMat.color.set('#faf6ee'); world.curbMat.color.set(world.curbDay);
        if (world.lawnMat) world.lawnMat.color.set(world.stage.lawn);
        for (const m of world.roofMats) m.emissive.set(0x000000);
        for (const m of world.wallMats) { m.emissiveMap = TEX.plain; m.emissive.copy(m.userData.day); }
        world.lampMat.color.set('#d8d4c8'); world.haloMat.opacity = 0;
        // Stable shadows (TestFlight: "buildings flicker" on a big, wide view): the shadow box grows in 10% steps
        // instead of every frame, and its center snaps to whole shadow-map texels across the light's view, so
        // following the player slides the texel grid by whole cells and shadow edges stop shimmering.
        const ce = Math.cos(sun.elev), sc = sunLight.shadow.camera;
        const S = Math.pow(1.1, Math.ceil(Math.log(f.view * 1.5 + 60 + (520 - f.view * 1.5 - 60) * e) / Math.log(1.1)));
        const texel = 2 * S / sunLight.shadow.mapSize.x;
        tmpDir.set(sun.sx * ce, -Math.sin(sun.elev), sun.sy * ce).normalize(); // toward the ground, along the light
        tmpRight.crossVectors(tmpDir, tmpUp.set(0, 1, 0)).normalize(); tmpUp.crossVectors(tmpRight, tmpDir);
        tmpFocus.set(focusX, 0, focusY);
        const da = Math.round(tmpFocus.dot(tmpRight) / texel) * texel - tmpFocus.dot(tmpRight);
        const db = Math.round(tmpFocus.dot(tmpUp) / texel) * texel - tmpFocus.dot(tmpUp);
        tmpFocus.addScaledVector(tmpRight, da).addScaledVector(tmpUp, db);
        sunLight.target.position.copy(tmpFocus);
        sunLight.position.copy(tmpFocus).addScaledVector(tmpDir, -3000);
        sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S;
        sc.updateProjectionMatrix();
      }

      // Buildings (including ones mid-swallow).
      for (const b of world.buildings) {
        if (b.state === 0) continue;
        if (b.state === 2) { if (!b.gone) { b.gone = true; if (b.wall) placeBuilding(b, 0, 0, 0, 0); else b.mesh.visible = false; } continue; }
        const p = f.swallowPos(b);
        placeBuilding(b, p.x, p.y, p.s, p.lift);
        if (!b.wall) { // it keels over toward the mouth as it goes down
          const dx = f.player.x - p.x, dy = f.player.y - p.y, d = Math.hypot(dx, dy) || 1;
          b.mesh.rotation.set(0, 0, 0);
          b.mesh.rotateOnWorldAxis(tmpAxis.set(dy / d, 0, -dx / d), Math.min(1, b.ft) * 0.9);
        }
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
          if ((o.state === 0 && !o.dirty && !o.glow && !o.glowShown && !part.spin) || (o.state === 2 && hidden[i])) continue; // ride parts turn every frame
          if (o.state === 2) hidden[i] = 1;
          let x = o.x, y = o.y, s = 1, lift = 0;
          if (o.state === 1) { const p = f.swallowPos(o); x = p.x; y = p.y; s = p.s; lift = p.lift; }
          if (o.state === 2) s = 0;
          if (o.glow) { s *= 1.2; lift += o.r * (0.6 + Math.sin(t * 6 + o.x) * 0.4); }
          if (o.state === 0 && o.r <= 12 && (o.vx || o.vy)) lift += Math.abs(Math.sin(t * 11 + o.x * 0.1)) * o.r * 0.16; // small walkers hop along
          if (o.type === 'dolphin' && o.state === 0) lift += Math.max(0, Math.sin(t * 1.3 + o.x * 0.05)) ** 4 * o.r * 1.2; // a leap now and then
          const r = o.r * s;
          let py = part.y, po = part.o;
          if (part.spin && o.state === 0) {
            const sp = part.spin, a = sp.a + t * sp.w;
            if (sp.flat) po = [Math.cos(a) * sp.R, Math.sin(a) * sp.R]; else { po = [Math.cos(a) * sp.R, 0]; py = sp.c + Math.sin(a) * sp.R; }
          }
          dummy.position.set(x, py * r + lift + (o.zf || 0), y); // zf: per-object height hair against z-fighting
          dummy.rotation.set(0, -o.rot, 0);
          if (po) { dummy.translateX(po[0] * r); dummy.translateZ(po[1] * r); }
          if (part.rot) { dummy.rotateY(part.rot[0]); dummy.rotateZ(part.rot[1]); }
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
        const alive = (src.state === undefined || src.state === 0) && !(f.dark && f.dark.includes(src)); // a doused lamp shows no beam
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
      rimMat.color.set(player.lit ? LIT_RIM : player.slow ? 0x9bd38a : rimColor); // red for sunlight always wins; green while poisoned
      rimMat.opacity = player.lit ? 0.85 : 0.55;
      litRing.position.copy(blob.position).setY(1.3);
      litRing.scale.setScalar(player.r);
      if (circleMesh.visible) {
        const cr = player.r * 2.5, pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
        circleShade.position.set(player.x, 0.9, player.y); circleShade.scale.setScalar(cr * 1.08); circleShade.rotation.y = t * 0.4;
        circleMesh.position.set(player.x, 1.0, player.y); circleMesh.scale.setScalar(cr); circleMesh.rotation.y = t * 0.4;
        circleMesh.material.opacity = 0.5 + pulse * 0.25; // see-through, breathing
        circleRunes.position.set(player.x, 1.05, player.y); circleRunes.scale.setScalar(cr * 1.14); circleRunes.rotation.y = -t * 0.25;
        circleRunes.material.opacity = 0.35 + (1 - pulse) * 0.25;
        const mp = moteGeo.attributes.position;
        for (let i = 0; i < MOTES; i++) { // each mote rises from the rim, drifting round, and starts over
          const life = (t * 0.45 + i / MOTES) % 1, a = i * 2.39996 + t * 0.3, rr = cr * (0.75 + 0.2 * Math.sin(i * 7.1));
          mp.setXYZ(i, player.x + Math.cos(a) * rr, 2 + life * player.r * 1.6, player.y + Math.sin(a) * rr);
        }
        mp.needsUpdate = true; circleMotes.material.size = Math.max(6, player.r * 0.5); circleMotes.material.opacity = 0.85;
        let lx = player.x, ly = player.y;
        circleTrail.forEach((sp, i) => { // follow the leader: pulled along only once the one ahead is a full step away
          const gap = player.r * (i ? 0.95 : 1.9), at = sp.userData.at || (sp.userData.at = { x: lx, y: ly + gap });
          let dx = at.x - lx, dy = at.y - ly, d = Math.hypot(dx, dy);
          if (d > gap * 12 || d < 1e-6) { dx = 0; dy = gap; d = gap; at.x = lx; at.y = ly + gap; } // a new run or a jump: line up afresh
          if (d > gap) { at.x = lx + dx / d * gap; at.y = ly + dy / d * gap; }
          const tw = 0.5 + 0.5 * Math.sin(t * 5 + i * 1.3), k = 1 - i / TRAIL;
          sp.position.set(at.x, 2 + player.r * (0.5 + 0.18 * Math.sin(t * 3 + i * 0.9)), at.y);
          sp.scale.setScalar(player.r * (0.45 + 0.5 * k) * (0.85 + 0.15 * tw)); sp.material.rotation = Math.sin(t * 2 + i) * 0.35;
          sp.material.opacity = (0.45 + 0.5 * k) * (0.75 + 0.25 * tw);
          lx = at.x; ly = at.y;
        });
      }
      bubble.visible = !!player.bubble;
      if (player.bubble) { bubble.position.set(player.x, 2, player.y); bubble.scale.set(player.bubble, player.bubble * 0.35, player.bubble); }
      magnetRing.visible = player.magnet >= 0;
      if (player.magnet >= 0) { const s = 220 - (220 - player.r) * player.magnet; magnetRing.position.set(player.x, 1.4, player.y); magnetRing.scale.setScalar(s); magnetRing.material.opacity = 0.5 * (1 - player.magnet); }
      // Face toward `look` (the game keeps it turned to the camera); the mouth opens wide and the arms
      // reach in while something is being sucked in, and the body bulges once when it goes down.
      const gulp = player.gulp || 0, bulge = player.bulge || 0, L = player.look === undefined ? player.face : player.look;
      const breathe = 1 + Math.sin(t * (player.fast ? 9 : 3)) * 0.025, R = player.r; // quick, excited breath while fast
      bodyLift = carOn ? 0.32 : 0;
      car.visible = carOn && k < 0.6;
      if (car.visible) {
        const sp = Math.hypot(player.vx || 0, player.vy || 0), dt = Math.max(0, Math.min(0.1, t - carT));
        if (sp > 2) carHead = Math.atan2(player.vy, player.vx);
        wheelTurn -= sp * dt / (0.3 * R); wheels.forEach(w => { w.rotation.y = wheelTurn; });
        car.position.set(player.x, 0, player.y); car.scale.setScalar(R); car.rotation.set(0, -carHead, 0);
      }
      carT = t;
      body.position.set(player.x, R * (BODY_Y + bodyLift), player.y);
      body.scale.set(R * (1 + bulge * 0.12), R * BODY_SY * breathe * (1 - bulge * 0.06), R * (1 + bulge * 0.12));
      if (player.slow) { const w = Math.sin(t * 14); body.scale.x *= 1 + w * 0.08; body.scale.z *= 1 - w * 0.08; body.scale.y *= 1 + Math.sin(t * 14 + 1) * 0.06; } // poisoned: a wobbling jelly
      body.rotation.set(0, -L, Math.sin(t * 1.7) * 0.035); // a slow idle sway, like humming to itself
      const grown = Math.min(1, Math.max(0, (player.r / (player.r0 || player.r) - 1) / 4));
      bodyMat.color.copy(bodyColor).lerp(glowColor, grown * 0.08);
      if (player.slow) bodyMat.color.lerp(tmpCol.set(0x9bd38a), 0.45); // queasy green while a zombie bite slows it
      // Growth stages: the darkness it has eaten swirls faintly inside, and the belly star glows brighter the bigger it gets.
      aura.position.copy(body.position); aura.scale.copy(body.scale).multiplyScalar(1.01); aura.rotation.copy(body.rotation);
      auraMat.opacity = grown * 0.28; auraMat.color.copy(glowColor);
      swirl.offset.set(t * 0.05, 0); swirl.rotation = t * 0.4;
      armMat.color.copy(bodyMat.color).multiply(ARM_TINT);
      // First person looks over the top of the head; the eyes high on its front would peek over it.
      eyes.forEach(o => { o.e.visible = o.p.visible = k < 0.6; });
      wear.visible = moon.visible = k < 0.6; tuft.visible = wear.visible && !wearBare;
      for (const o of [tuft, wear, wisp]) { o.position.copy(body.position); o.scale.copy(body.scale); o.rotation.copy(body.rotation); }
      wisp.visible = gulp > 0.04 && k < 0.6; wispMat.opacity = Math.min(1, gulp * 1.8) * 0.82; wispTex.offset.set(t * 0.9, t * 0.15);
      // gold crescent high on the brow, off to one side; belly star low in front, glowing brighter as it grows
      onBody(player, L + 1.08, 1.0, 0.09, moon.position); outward(moon, player); moon.scale.setScalar(R * 0.46); // out: clear of the tuft's foot
      onBody(player, L, 0.1, 0.03, bellyStar.position); outward(bellyStar, player);
      const starBeat = 1 + Math.sin(t * 2.4) * 0.06;
      bellyStar.scale.setScalar(R * 0.68 * starBeat);
      bellyGlow.position.copy(bellyStar.position); bellyGlow.quaternion.copy(bellyStar.quaternion); bellyGlow.scale.setScalar(R * (1.15 + grown * 0.45) * starBeat);
      bellyGlow.material.opacity = 0.5 + grown * 0.4; bellyStar.renderOrder = 9; bellyGlow.renderOrder = 8;
      swirlRings.forEach((m, i) => {
        const [size, , , tilt, turn] = SWIRLS[i];
        m.position.set(player.x, R * (BODY_Y + bodyLift - 0.2), player.y);
        m.rotation.set(Math.PI / 2 - tilt, Math.sin(t * 0.7 + i * 2) * 0.15, t * turn); m.scale.setScalar(R * size);
      });
      arms.forEach((m, k) => {
        onBody(player, L + (k ? 1 : -1) * (1.12 - gulp * 0.45), -0.24, 0.03, m.position);
        m.scale.set(R * 0.22, R * 0.19, R * 0.22);
      });
      // Mouth: a small open smile at rest (wider than tall, the tongue showing) that stretches into a big tall O while
      // it sucks something in. The whole face sits high on the body: the camera looks down on it.
      const MOUTH_EL = 0.5 - gulp * 0.2; // the big O drops clear of the eyes
      onBody(player, L, MOUTH_EL, 0.02, mouth.position);
      mouth.rotation.set(0, -L, MOUTH_EL); // lying on the surface, like every piece of the face
      mouth.scale.set(R * 0.1, R * (0.16 + gulp * 0.3), R * (0.22 + gulp * 0.17));
      onBody(player, L, MOUTH_EL, 0.08, throat.position);
      throat.rotation.copy(mouth.rotation);
      throat.scale.set(R * 0.06, mouth.scale.y * (0.6 + gulp * 0.2), mouth.scale.z * (0.66 + gulp * 0.14));
      onBody(player, L, MOUTH_EL - 0.07 - gulp * 0.12, 0.115, tongue.position);
      tongue.rotation.copy(mouth.rotation); tongue.visible = k < 0.6;
      tongue.scale.set(R * 0.05, mouth.scale.y * 0.45, mouth.scale.z * 0.55);
      // Eyes: big round glossy eyes; they squeeze shut happily (^^) for a moment after each gulp, and stay a little
      // squinted while a combo is going (player.cheer 0..1). A blink every few seconds keeps it alive.
      const cheer = player.cheer || 0, blink = (t + 1.3) % 4.1 < 0.11 ? 1 : 0;
      const happy = Math.max(Math.min(1, bulge * 1.6), cheer * 0.55), wide = player.fast ? 1 : 0; // fast: the eyes open even bigger
      const EYE_EL = 0.86 + gulp * 0.05;
      eyes.forEach(({ e, p, p2 }, k) => {
        const a = L + (k ? 1 : -1) * 0.4, shut = (1 - happy) * (1 - blink);
        onBody(player, a, EYE_EL, 0.0, e.position);
        e.rotation.set(0, -a, EYE_EL);
        e.scale.set(R * 0.09, R * (0.25 + wide * 0.04) * Math.max(0.15, shut), R * (0.2 + wide * 0.03));
        onBody(player, a + (k ? 1 : -1) * 0.02, EYE_EL + 0.03, 0.11, p.position); outward(p, player); // just in front of the eye's bulge
        p.scale.setScalar(R * (0.3 + wide * 0.03) * Math.max(0.001, shut)); p.renderOrder = 9;
      });
      // Cheeks: a pink blush that deepens and grows while a combo is going.
      cheekMat.color.set(0xff9fb0).lerp(tmpCol.set(0xff7f9e), cheer); cheekMat.opacity = 0.62 + cheer * 0.25;
      cheeks.forEach((m, i) => {
        onBody(player, L + (i ? 1 : -1) * 0.82, 0.58, 0.0, m.position);
        m.rotation.set(0, -L - (i ? 1 : -1) * 0.82, 0.58);
        m.scale.set(R * 0.05, R * (0.08 + cheer * 0.02), R * (0.15 + cheer * 0.04));
        m.visible = k < 0.6;
      });

      artSprite.visible = artOn && !!artMat.map && k < 0.6;
      if (artSprite.visible) {
        for (const o of artStandIns) o.visible = false;
        artHid = true;
        const sp = Math.hypot(player.vx || 0, player.vy || 0), go = Math.min(1, sp / 40);
        const hop = go * Math.abs(Math.sin(t * 9)) * 0.14 + (1 - go) * Math.sin(t * 3) * 0.02;
        const squash = go * Math.sin(t * 18) * 0.04, swell = bulge * 0.14 + gulp * 0.08;
        artLean += ((Math.abs(player.vx || 0) > 2 ? -Math.sign(player.vx) * 0.12 * go : 0) - artLean) * 0.15; // leans into its run, eased
        artSprite.position.set(player.x, R * (0.05 + hop + bodyLift), player.y);
        artSprite.scale.set(R * 3.3 * (1 + swell - squash), R * 3.3 * (breathe + swell * 0.6 + squash), 1);
        artMat.rotation = artLean + Math.sin(t * 1.7) * 0.03 + (player.slow ? Math.sin(t * 14) * 0.08 : 0);
        artMat.color.setHex(0xffffff); if (player.slow) artMat.color.lerp(tmpCol.set(0x9bd38a), 0.45);
        // Which way it looks follows where it is going: the picture looks to the right, so it is mirrored when heading
        // left. A dead band, and standing still keeps the last way, so it does not flicker. There is one picture per
        // skin (a front view): a side or back view needs art of its own.
        const vx = player.vx || 0;
        if (sp > 6 && Math.abs(vx) > sp * 0.25) artFlip = vx < 0;
        if (artNow) {
          artDraw(artNow, Math.min(1, gulp), happy > 0.5, cheer);
          artNow.tex.repeat.x = artFlip ? -1 : 1; artNow.tex.offset.x = artFlip ? 1 : 0;
        }
      } else if (artHid) { artHid = false; for (const o of artAlways) o.visible = true; } // back to the 3D body (the car, first person)

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
      const shardsL = f.shards || [];
      shardGem.count = shardRing.count = shardBeam.count = Math.min(MAX_SHARDS, shardsL.length);
      shardsL.slice(0, MAX_SHARDS).forEach((h, i) => {
        const c = tmpCol.set(SHARD_COL[h.kind] || 0xffffff), vis = h.blink ? (Math.sin(t * 14) > 0 ? 1 : 0.25) : 1;
        dummy.position.set(h.x, 15 + Math.sin(t * 3 + i) * 3, h.y); dummy.rotation.set(0.6, t * 2, 0.3); dummy.scale.set(9 * vis, 13 * vis, 9 * vis); dummy.updateMatrix(); shardGem.setMatrixAt(i, dummy.matrix); shardGem.setColorAt(i, c);
        dummy.position.set(h.x, 1.3, h.y); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(14 * (1 + Math.sin(t * 5) * 0.1)); dummy.updateMatrix(); shardRing.setMatrixAt(i, dummy.matrix); shardRing.setColorAt(i, c);
        dummy.position.set(h.x, 45, h.y); dummy.rotation.set(0, t, 0); dummy.scale.set(6, 90, 6); dummy.updateMatrix(); shardBeam.setMatrixAt(i, dummy.matrix); shardBeam.setColorAt(i, c);
      });
      for (const m of [shardGem, shardRing, shardBeam]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
      const spitsL = f.spits || [];
      spitBlob.count = spitRim.count = Math.min(MAX_SPITS, spitsL.length);
      spitsL.slice(0, MAX_SPITS).forEach((s, i) => {
        dummy.position.set(s.x, s.r * 0.9, s.y); dummy.rotation.set(t * 7, t * 5, 0); dummy.scale.set(s.r * 1.1, s.r * 0.8, s.r * 0.9); dummy.updateMatrix(); spitBlob.setMatrixAt(i, dummy.matrix);
        dummy.scale.multiplyScalar(1.25); dummy.updateMatrix(); spitRim.setMatrixAt(i, dummy.matrix);
      });
      spitBlob.instanceMatrix.needsUpdate = spitRim.instanceMatrix.needsUpdate = true;
      goldBeam.count = goldRings.count;
      for (let i = 0; i < goldBeam.count; i++) {
        const w = Math.max(golden[i].r * 0.9, 8);
        dummy.position.set(golden[i].x, 50, golden[i].y); dummy.rotation.set(0, t * 2, 0); dummy.scale.set(w * 0.6, 100, w * 0.6); dummy.updateMatrix();
        goldBeam.setMatrixAt(i, dummy.matrix);
      }
      goldBeam.instanceMatrix.needsUpdate = true;

      // Hints: pulse rings under things the player could eat right now.
      let n = 0, nb = 0, nc = 0;
      const pulse = 0.5 + Math.sin(t * 6) * 0.5;
      for (const item of f.hints) {
        const im = item.bad ? badHints : item.steady ? calmHints : hints, k = item.bad ? nb : item.steady ? nc : n;
        if (k >= (item.bad ? 64 : MAX_HINTS)) continue;
        dummy.position.set(item.x, 1.0, item.y);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(item.r * (item.steady ? 1 : 1 + pulse * 0.08));
        dummy.updateMatrix();
        im.setMatrixAt(k, dummy.matrix);
        if (item.bad) nb++; else if (item.steady) nc++; else n++;
      }
      hints.count = n; badHints.count = nb; calmHints.count = nc;
      hints.instanceMatrix.needsUpdate = badHints.instanceMatrix.needsUpdate = calmHints.instanceMatrix.needsUpdate = true;
      hintMat.opacity = 0.35 + pulse * 0.45; badMat.opacity = 0.6 + pulse * 0.35; // the warning ring never fades far

      renderer.render(scene, fp ? fpCamera : camera);
    }

    // `debug` is read by the QA scripts (pixel checks, memory counters); the game never uses it.
    // Cosmetic skin: body, unlit rim (also the growth glow), eye colors and what it wears. The lit warning stays red regardless.
    function setSkin(skin) {
      carOn = !!skin.car;
      bodyColor.setHex(skin.body);
      glowColor.setHex(skin.rim);
      rimColor = skin.rim;
      eyeMat.color.setHex(skin.eye);
      pupilMat.color.setHex(skin.pupil !== undefined ? skin.pupil : 0x16122a); // the eye sparkle stays warm gold-white on every skin, like the painted art
      const [kind, color, accent = 0xffffff] = skin.wear || [];
      for (const name in WEAR) WEAR[name].visible = name === kind;
      wearBare = kind === 'hat' || kind === 'beret';
      if (kind) { wearMat.color.setHex(color); pinMat.color.setHex(color); wearMat2.color.setHex(accent); }
      // its painted picture, if it has one (skin-art.js); each is loaded once and kept
      const src = skin.art && root.DuskSkinArt && root.DuskSkinArt[skin.art];
      artOn = !!src; artMat.map = null; artNow = null;
      if (src) {
        let a = artTex[skin.art];
        if (!a) { // its own canvas (twice the picture, so the drawn face stays crisp), filled once the picture has loaded
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 384;
          a = artTex[skin.art] = { canvas, tex: new T.CanvasTexture(canvas), img: new Image(), face: (root.DuskSkinFace || {})[skin.art], ready: false, step: -1 };
          a.img.onload = () => { a.ready = true; artDraw(a, 0, false, 0); };
          a.img.src = src;
        }
        artNow = a; artMat.map = a.tex;
      }
      artMat.needsUpdate = true;
    }
    // Summoning circle: a CIRCLES entry, or null for none.
    function setCircle(c) {
      circleParts.forEach(m => { m.visible = !!c; });
      if (!c) return;
      drawCircle(circleMesh.userData.canvas.getContext('2d'), 256, c.id, '#ffffff');
      circleMesh.material.map.needsUpdate = true;
      // the shadow: a soft violet-black pool, darkest in the middle, with the pattern pressed in darker still
      const g = circleShade.userData.canvas.getContext('2d');
      drawCircle(g, 256, c.id, '#ffffff'); // drawn white; the material tints it violet-black
      g.globalCompositeOperation = 'destination-over';
      const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grd.addColorStop(0, 'rgba(255,255,255,.75)'); grd.addColorStop(0.75, 'rgba(255,255,255,.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 256); g.globalCompositeOperation = 'source-over';
      circleShade.material.map.needsUpdate = true;
      circleShade.material.color.set(0x1a0b3a); circleShade.material.opacity = 0.55;
      for (const m of [circleMesh, circleRunes, circleMotes, ...circleTrail]) m.material.color.setHex(c.color);
    }

    return { build, resize, draw, setSkin, setCircle, setQuality, artDraw, get quality() { return quality; }, debug: { renderer, camera, scene, rimMat, fpCamera, circleMesh, circleTrail, artSprite, body, artDraw, get art() { return artNow; }, get artFlip() { return artFlip; } } };
  }

  root.DuskRender = { create, drawCircle, PARTS, GEO: unit }; // PARTS and the unit shapes also feed tools/icons (collection-book pictures)
})(this);
