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
    };
  }
  const WIN_W = 14, WIN_H = 12; // world units per window cell

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

    // Player: a flat wobbling disc on the ground with two eyes popping up.
    const BLOB_N = 40;
    const blobGeo = new T.CircleGeometry(1, BLOB_N);
    blobGeo.rotateX(-Math.PI / 2);
    const blobBase = Float32Array.from(blobGeo.attributes.position.array);
    const blobMat = new T.MeshBasicMaterial({ color: 0x16122a, transparent: true, opacity: 0.92, depthWrite: false });
    const blob = new T.Mesh(blobGeo, blobMat);
    blob.renderOrder = 5;
    const ringGeo = new T.RingGeometry(1.0, 1.12, BLOB_N); ringGeo.rotateX(-Math.PI / 2);
    // Rim: the skin's color in the dark so the blob stays visible at night, always red while lit.
    const LIT_RIM = 0xff6b6b;
    let rimColor = 0xb9a8ff;
    const rimMat = new T.MeshBasicMaterial({ color: 0xb9a8ff, transparent: true, opacity: 0.85, depthWrite: false });
    const litRing = new T.Mesh(ringGeo, rimMat);
    litRing.renderOrder = 6;
    const eyeMat = new T.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new T.MeshBasicMaterial({ color: 0x16122a });
    const eyes = [0, 1].map(() => {
      const e = new T.Mesh(unit.sphere, eyeMat), p = new T.Mesh(unit.sphere, pupilMat);
      scene.add(e, p);
      return { e, p };
    });
    scene.add(blob, litRing);

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
      for (const b of w.buildings) {
        const key = b.crane ? 'crane' : b.roof + (b.plain ? '/plain' : '');
        if (!mats[key]) {
          const wallCol = col(b.roof).lerp(col('#ffffff'), 0.35), glow = wallCol.clone().multiplyScalar(0.35);
          // Plain walls (barns, silos, ride towers) get boards instead of windows and stay dark at night.
          const wall = b.crane ? lambert(wallCol, { emissive: glow })
            : lambert(wallCol, { map: b.plain ? TEX.planks : TEX.windows, emissive: glow, emissiveMap: TEX.plain });
          wall.userData.day = glow; wall.userData.night = b.plain ? TEX.dark : TEX.lit;
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
          list.forEach((o, i) => {
            if (part.color === 'inst') im.setColorAt(i, tmpCol.set(o.color));
          });
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
          group.add(im);
          w.instanced.push({ im, part, list, hidden: new Uint8Array(list.length) });
        }
      }
      for (const o of w.objects) o.dirty = true;

      // Guards: few, so plain meshes.
      const guardMat = lambert('#2f3e66'), skinMat = lambert('#f6d2b0'), lampMat = new T.MeshBasicMaterial({ color: 0xffd23f });
      for (const g of w.guards) {
        const gg = new T.Group();
        const body = new T.Mesh(unit.cyl, guardMat); body.scale.set(5, 18, 5); body.position.y = 9;
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

    function placeBuilding(b, cx, cy, s, sink) {
      b.mesh.visible = s > 0.01;
      b.mesh.scale.set(b.w * s, b.h * s, b.d * s);
      b.mesh.position.set(cx, b.h * s / 2 - sink * b.h, cy);
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
      const eye = Math.max(10, player.r * 0.9);
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
        placeBuilding(b, p.x, p.y, p.s, b.ft * b.ft * 0.6);
      }

      // Instanced objects: rewrite matrices only for objects that changed this frame.
      for (const { im, part, list, hidden } of world.instanced) {
        let changed = false;
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          if ((o.state === 0 && !o.dirty) || (o.state === 2 && hidden[i])) continue;
          if (o.state === 2) hidden[i] = 1;
          let x = o.x, y = o.y, s = 1, sink = 0;
          if (o.state === 1) { const p = f.swallowPos(o); x = p.x; y = p.y; s = p.s; sink = o.ft * o.ft * o.r * 2; }
          if (o.state === 2) s = 0;
          const r = o.r * s;
          dummy.position.set(x, part.y * r - sink, y);
          dummy.rotation.set(0, -o.rot, 0);
          if (part.o) { dummy.translateX(part.o[0] * r); dummy.translateZ(part.o[1] * r); }
          dummy.scale.set(part.s[0] * r || 1e-6, part.s[1] * r || 1e-6, part.s[2] * r || 1e-6);
          dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
          changed = true;
        }
        if (changed) im.instanceMatrix.needsUpdate = true;
      }
      for (const o of world.objects) if (o.state !== 1) o.dirty = false;

      for (const g of world.guards) {
        if (g.state === 2) { g.mesh.visible = false; continue; }
        let x = g.x, y = g.y, s = 1;
        if (g.state === 1) { const p = f.swallowPos(g); x = p.x; y = p.y; s = p.s; }
        g.mesh.position.set(x, 0, y);
        g.mesh.rotation.y = -g.dir;
        g.mesh.scale.setScalar(s);
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
      blobMat.opacity = player.lit ? 0.6 + Math.sin(t * 30) * 0.2 : 0.92;
      rimMat.color.set(player.lit ? LIT_RIM : rimColor);
      rimMat.opacity = player.lit ? 0.85 : 0.55;
      litRing.position.copy(blob.position).setY(1.3);
      litRing.scale.setScalar(player.r);
      eyes.forEach(o => { o.e.visible = o.p.visible = k < 0.6; }); // the eyes would sit inside the first-person camera
      eyes.forEach(({ e, p }, k) => {
        const side = k ? 1 : -1, a = player.face + side * 0.5;
        const ex = player.x + Math.cos(a) * player.r * 0.42, ey = player.y + Math.sin(a) * player.r * 0.42;
        e.position.set(ex, player.r * 0.2, ey); e.scale.setScalar(player.r * 0.16);
        p.position.set(ex + Math.cos(player.face) * player.r * 0.06, player.r * 0.24, ey + Math.sin(player.face) * player.r * 0.06 + player.r * 0.08);
        p.scale.setScalar(player.r * 0.08);
      });

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
    // Cosmetic skin: body, unlit rim and eye colors. The lit warning stays red regardless.
    function setSkin(skin) {
      blobMat.color.setHex(skin.body);
      rimColor = skin.rim;
      eyeMat.color.setHex(skin.eye);
    }

    return { build, resize, draw, setSkin, setQuality, get quality() { return quality; }, debug: { renderer, camera, scene, rimMat, fpCamera } };
  }

  root.DuskRender = { create };
})(this);
