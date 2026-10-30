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
  };
  // A part is a unit geometry scaled by [sx, sy, sz] * object radius, lifted by y * r.
  // color 'inst' takes the object's own color.
  const P = (geo, s, y, color) => ({ geo, s, y, color });
  const PARTS = {
    person:    [P('cyl', [0.55, 2.0, 0.55], 1.0, 'inst'), P('sphere', [0.5, 0.5, 0.5], 2.4, '#f6d2b0')],
    worker:    [P('cyl', [0.55, 2.0, 0.55], 1.0, 'inst'), P('sphere', [0.5, 0.5, 0.5], 2.4, '#f6d2b0')],
    cat:       [P('box', [2.0, 1.0, 1.0], 0.5, 'inst'), P('sphere', [0.55, 0.55, 0.55], 1.2, 'inst')],
    gull:      [P('blob', [0.8, 0.6, 0.6], 0.9, 'inst'), P('box', [0.5, 0.12, 2.6], 1.0, '#e6e6e0')],
    trash:     [P('cyl', [0.8, 2.0, 0.8], 1.0, 'inst')],
    crate:     [P('box', [1.8, 1.8, 1.8], 0.9, 'inst')],
    buoy:      [P('cyl', [0.9, 1.0, 0.9], 0.5, 'inst'), P('cone', [0.55, 1.2, 0.55], 1.6, '#ffffff')],
    bench:     [P('box', [2.2, 0.35, 0.8], 0.6, 'inst')],
    container: [P('box', [2.6, 1.2, 1.2], 0.6, 'inst')],
    tree:      [P('cyl', [0.25, 1.4, 0.25], 0.7, '#7a5233'), P('blob', [1.0, 1.0, 1.0], 2.0, 'inst')],
    car:       [P('box', [2.0, 0.6, 1.1], 0.45, 'inst'), P('box', [1.1, 0.5, 0.95], 1.0, '#2b3550')],
    boat:      [P('box', [2.0, 0.5, 0.9], 0.25, 'inst'), P('box', [0.7, 0.6, 0.6], 0.8, '#3d5a80')],
    kiosk:     [P('box', [2.0, 1.4, 2.0], 0.7, 'inst'), P('box', [2.3, 0.2, 2.3], 1.5, '#f4f1ea')],
  };

  function create(canvas) {
    const renderer = new T.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    const scene = new T.Scene();
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
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

    const dummy = new T.Object3D();
    const tmpCol = new T.Color();
    let world = null, group = null, vw = 1, vh = 1;

    function disposeGroup() {
      if (!group) return;
      group.traverse(o => {
        if (o.isInstancedMesh) o.dispose();
        if (o.material) [].concat(o.material).forEach(m => m.dispose());
        if (o.geometry && !Object.values(unit).includes(o.geometry) && o.geometry.userData.own) o.geometry.dispose();
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

      // Buildings cast the only shadows in the scene, matching the game rule.
      // Walls get a lighter, self-lit tone so a camera-facing wall never reads as a ground shadow.
      const mats = {};
      w.wallMats = [];
      for (const b of w.buildings) {
        if (!mats[b.roof]) {
          const wallCol = col(b.roof).lerp(col('#ffffff'), 0.35);
          const wall = lambert(wallCol, { emissive: wallCol.clone().multiplyScalar(0.35) });
          w.wallMats.push(wall);
          const roof = lambert(b.roof);
          mats[b.roof] = { roof, faces: [wall, wall, roof, wall, wall, wall] }; // +x -x +y -y +z -z
        }
        const mesh = new T.Mesh(unit.box, mats[b.roof].faces);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
        b.mesh = mesh;
        if (b.crane) { // boom over the water; drawn but casts no gameplay shadow
          const boom = new T.Mesh(unit.box, lambert('#e0a92e'));
          boom.scale.set(6 / 18, 6 / b.h, 90 / 18);
          boom.position.set(0, 0.5 - 3 / b.h, 0.5 + 45 / 18);
          mesh.add(boom);
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
          const mat = lambert(part.color === 'inst' ? '#ffffff' : part.color);
          const im = new T.InstancedMesh(unit[part.geo], mat, list.length);
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

    function resize(w, h, dpr) {
      vw = w; vh = h;
      renderer.setPixelRatio(Math.min(dpr || 1, 2));
      renderer.setSize(w, h, false);
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
      const aspect = vw / vh;
      const halfW = aspect < 1 ? f.view / 2 : f.view / 2 * aspect;
      const halfH = halfW / aspect;
      camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
      camera.updateProjectionMatrix();
      const D = 2500;
      camera.position.set(f.camX, D * Math.sin(TILT), f.camY + D * Math.cos(TILT));
      camera.lookAt(f.camX, 0, f.camY);

      // Sun: same vector the game rule uses, so rendered shadows match the eat polygons.
      world.groundMat.color.copy(dayColor(world.stage.ground, world.stage.groundNight, phase));
      if (world.waterMat) world.waterMat.color.copy(dayColor(world.stage.water, world.stage.waterNight, phase));
      const lowSun = 1 - Math.min(1, sun.elev / (40 * Math.PI / 180));
      // castShadow stays on at night: toggling it recompiles every shader right as the climax starts.
      if (phase.night) {
        sunLight.intensity = 0;
        hemi.color.set(0x7d86d8); hemi.groundColor.set(0x23203a); hemi.intensity = 0.55;
        world.roadMat.color.set('#3b3958');
        for (const m of world.roofMats) m.emissive.set(0x1c1606);
      } else {
        // Sunlit ground lands at exactly its palette color (hemi + sun·sin(elev) = 1) instead of
        // washing out at noon or going dull at dawn; shade gets the hemisphere term only (~36%).
        // The cap keeps sun-facing walls from blowing out when the sun is very low.
        const HEMI = 0.36;
        sunLight.intensity = Math.min(1.8, (1 - HEMI) / Math.sin(sun.elev));
        sunLight.color.set(0xfff4dd).lerp(col('#ffb070'), lowSun);
        hemi.color.set(0xffffff); hemi.groundColor.set(0x8a7f70); hemi.intensity = HEMI;
        world.roadMat.color.set('#b9b4a8');
        for (const m of world.roofMats) m.emissive.set(0x000000);
        const ce = Math.cos(sun.elev);
        sunLight.position.set(f.camX - sun.sx * ce * 3000, Math.sin(sun.elev) * 3000, f.camY - sun.sy * ce * 3000);
        sunLight.target.position.set(f.camX, 0, f.camY);
        const S = f.view * 1.5 + 60, sc = sunLight.shadow.camera;
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

      renderer.render(scene, camera);
    }

    // `debug` is read by the QA scripts (pixel checks, memory counters); the game never uses it.
    // Cosmetic skin: body, unlit rim and eye colors. The lit warning stays red regardless.
    function setSkin(skin) {
      blobMat.color.setHex(skin.body);
      rimColor = skin.rim;
      eyeMat.color.setHex(skin.eye);
    }

    return { build, resize, draw, setSkin, debug: { renderer, camera, scene, rimMat } };
  }

  root.DuskRender = { create };
})(this);
