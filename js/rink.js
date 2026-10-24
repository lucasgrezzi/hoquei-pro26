'use strict';
// ===== Geometria e colisão da pista =====

// Pontos do contorno de um retângulo de cantos arredondados (fechado).
function rinkPerimeter(hl, hw, r, seg = 12) {
  const pts = [], cx = hl - r, cz = hw - r;
  const corners = [[cx, cz, 0], [-cx, cz, Math.PI / 2], [-cx, -cz, Math.PI], [cx, -cz, 1.5 * Math.PI]];
  for (const [x0, z0, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + i / seg * Math.PI / 2;
      pts.push([x0 + Math.cos(a) * r, z0 + Math.sin(a) * r]);
    }
  }
  pts.push(pts[0]);
  return pts;
}

// Retorna a normal (apontando para dentro) e a penetração se um círculo de raio rad sair da pista.
function boardsCollide(x, z, rad) {
  const hx = HALF_L - rad, hz = HALF_W - rad, cr = CORNER_R - rad;
  const cx = HALF_L - CORNER_R, cz = HALF_W - CORNER_R;
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax > cx && az > cz) {
    const dx = ax - cx, dz = az - cz, d = Math.hypot(dx, dz);
    if (d > cr) return { nx: -Math.sign(x) * dx / d, nz: -Math.sign(z) * dz / d, pen: d - cr };
    return null;
  }
  if (ax > hx) return { nx: -Math.sign(x), nz: 0, pen: ax - hx };
  if (az > hz) return { nx: 0, nz: -Math.sign(z), pen: az - hz };
  return null;
}

function clampToRink(x, z, margin) {
  for (let i = 0; i < 3; i++) {
    const c = boardsCollide(x, z, margin);
    if (!c) break;
    x += c.nx * c.pen; z += c.nz * c.pen;
  }
  return { x, z };
}

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

function makeIceTexture(renderer) {
  const S = 20, W = Math.round(2 * HALF_L * S), H = Math.round(2 * HALF_W * S);
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const X = x => (x + HALF_L) * S, Z = z => (z + HALF_W) * S;
  g.fillStyle = '#1a1d24'; g.fillRect(0, 0, W, H);
  g.save();
  roundRectPath(g, 0, 0, W, H, CORNER_R * S); g.clip();
  const grd = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.6);
  grd.addColorStop(0, '#f5f9fc'); grd.addColorStop(1, '#e2eaf0');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // riscos de patins
  g.lineWidth = 1;
  for (let i = 0; i < 1400; i++) {
    g.strokeStyle = `rgba(140,165,190,${0.04 + Math.random() * 0.08})`;
    const x = Math.random() * W, y = Math.random() * H, r = 40 + Math.random() * 260, a = Math.random() * 6.28;
    g.beginPath(); g.arc(x, y, r, a, a + 0.15 + Math.random() * 0.5); g.stroke();
  }
  const RED = '#c8102e', BLUE = '#0b3fa8';
  const vline = (x, w, col) => { g.fillStyle = col; g.fillRect(X(x) - w * S / 2, 0, w * S, H); };
  vline(0, 0.30, RED);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let z = -HALF_W; z < HALF_W; z += 0.9) g.fillRect(X(0) - 0.02 * S, Z(z), 0.04 * S, 0.45 * S);
  vline(BLUE_X, 0.30, BLUE); vline(-BLUE_X, 0.30, BLUE);
  vline(GOAL_X, 0.05, RED); vline(-GOAL_X, 0.05, RED);
  // áreas do goleiro
  for (const s of [1, -1]) {
    g.beginPath(); g.moveTo(X(s * GOAL_X), Z(-CREASE_R));
    g.arc(X(s * GOAL_X), Z(0), CREASE_R * S, -Math.PI / 2, Math.PI / 2, s > 0);
    g.closePath(); g.fillStyle = '#7fb8f0'; g.fill();
    g.lineWidth = 0.05 * S; g.strokeStyle = RED; g.stroke();
    // trapézio atrás do gol
    g.beginPath();
    g.moveTo(X(s * GOAL_X), Z(-3.35)); g.lineTo(X(s * HALF_L), Z(-4.27));
    g.moveTo(X(s * GOAL_X), Z(3.35)); g.lineTo(X(s * HALF_L), Z(4.27));
    g.stroke();
  }
  const circle = (x, z, r, col, lw) => { g.beginPath(); g.arc(X(x), Z(z), r * S, 0, Math.PI * 2); g.lineWidth = lw * S; g.strokeStyle = col; g.stroke(); };
  const dot = (x, z, r, col) => { g.beginPath(); g.arc(X(x), Z(z), r * S, 0, Math.PI * 2); g.fillStyle = col; g.fill(); };
  // logo central
  dot(0, 0, 2.6, '#ffffff');
  circle(0, 0, 2.6, '#1b1f2a', 0.08);
  g.fillStyle = '#1b1f2a'; g.font = `900 ${1.6 * S}px Arial Black, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('LBH', X(0), Z(-0.25));
  g.font = `700 ${0.42 * S}px Arial`; g.fillText('LIGA BRASILEIRA DE HÓQUEI', X(0), Z(1.15));
  circle(0, 0, CIRCLE_R, BLUE, 0.05); dot(0, 0, 0.15, BLUE);
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const cx = sx * DOT_END_X, cz = sz * DOT_Z;
    circle(cx, cz, CIRCLE_R, RED, 0.05);
    g.fillStyle = RED;
    for (const hx of [-0.95, 0.85]) for (const hz of [-1, 1]) g.fillRect(X(cx + hx), Z(cz + hz * CIRCLE_R) - (hz > 0 ? 0 : 0.6 * S), 0.05 * S, 0.6 * S);
    dot(cx, cz, 0.3, RED); dot(cx, cz, 0.2, '#ffffff'); dot(cx, cz, 0.12, RED);
    dot(sx * DOT_NEU_X, sz * DOT_Z, 0.3, RED);
  }
  // área do árbitro
  g.beginPath(); g.arc(X(0), Z(HALF_W), 3 * S, Math.PI, 0); g.lineWidth = 0.05 * S; g.strokeStyle = RED; g.stroke();
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function makeBoardsTexture() {
  const W = 4096, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, W, H);
  const ads = [['GELO+', '#0b3fa8', '#fff'], ['PUCK BANK', '#ffffff', '#c8102e'], ['CAFÉ FORTE', '#3b2314', '#f2c14e'],
    ['SKATE MAX', '#111', '#2fd3ff'], ['LBH', '#ffffff', '#111'], ['ZAMBONETA', '#e8f4ff', '#0b3fa8'], ['TV ARENA', '#c8102e', '#fff'], ['GÁS POLAR', '#ffffff', '#0f6b3a']];
  const aw = W / ads.length;
  ads.forEach(([txt, bg, fg], i) => {
    g.fillStyle = bg; g.fillRect(i * aw + 16, 14, aw - 32, 82);
    g.fillStyle = fg; g.font = '900 54px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, i * aw + aw / 2, 57, aw - 60);
  });
  g.fillStyle = '#f5c400'; g.fillRect(0, H - 22, W, 22);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping;
  return t;
}

function makeCrowdTexture(colors) {
  const W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#1b1e26'; g.fillRect(0, 0, W, H);
  const rows = 16, rh = H / rows;
  for (let r = 0; r < rows; r++) {
    g.fillStyle = r % 2 ? '#2a2f3a' : '#232833'; g.fillRect(0, r * rh + rh * 0.55, W, rh * 0.45);
    for (let x = 4; x < W; x += 8 + Math.random() * 3) {
      if (Math.random() < 0.08) continue;
      const col = Math.random() < 0.45 ? colors[Math.floor(Math.random() * colors.length)] : `hsl(${Math.random() * 360},${20 + Math.random() * 40}%,${25 + Math.random() * 45}%)`;
      g.fillStyle = col; g.fillRect(x - 3, r * rh + rh * 0.35, 7, rh * 0.45);
      g.fillStyle = `hsl(25,${30 + Math.random() * 30}%,${35 + Math.random() * 40}%)`;
      g.beginPath(); g.arc(x, r * rh + rh * 0.25, 2.6, 0, 6.28); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Faixa conectando dois anéis de pontos (mesma contagem) — usada para tabelas, vidro e arquibancada.
function ringStrip(ptsA, yA, ptsB, yB, uLen) {
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < ptsA.length; i++) {
    if (i > 0) acc += Math.hypot(ptsA[i][0] - ptsA[i - 1][0], ptsA[i][1] - ptsA[i - 1][1]);
    pos.push(ptsA[i][0], yA, ptsA[i][1], ptsB[i][0], yB, ptsB[i][1]);
    uv.push(acc / uLen, 0, acc / uLen, 1);
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

function makeNetTexture() {
  const c = makeCanvas(64, 64), g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Gol com a boca virada para -x local (para o gol do lado +x).
function buildNet(netTex) {
  const grp = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0xd0101c });
  const white = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
  const cyl = (len, mat, r = 0.03) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
  for (const s of [-1, 1]) {
    const post = cyl(GOAL_H, red); post.position.set(0, GOAL_H / 2, s * GOAL_HW); post.castShadow = true; grp.add(post);
  }
  const bar = cyl(GOAL_HW * 2, red); bar.rotation.x = Math.PI / 2; bar.position.set(0, GOAL_H, 0); grp.add(bar);
  // estrutura de base e topo
  const tube = (a, b, mat, r = 0.022) => {
    const v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = v.length();
    const m = cyl(len, mat, r); m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); grp.add(m);
  };
  const base = [[0, 0.02, -GOAL_HW], [0.55, 0.02, -GOAL_HW - 0.05], [NET_D, 0.02, -0.55], [NET_D, 0.02, 0.55], [0.55, 0.02, GOAL_HW + 0.05], [0, 0.02, GOAL_HW]];
  for (let i = 0; i < base.length - 1; i++) tube(base[i], base[i + 1], white);
  tube([0, GOAL_H, -GOAL_HW], [0.45, GOAL_H - 0.05, -GOAL_HW * 0.9], red);
  tube([0, GOAL_H, GOAL_HW], [0.45, GOAL_H - 0.05, GOAL_HW * 0.9], red);
  tube([0.45, GOAL_H - 0.05, -GOAL_HW * 0.9], [0.45, GOAL_H - 0.05, GOAL_HW * 0.9], red);
  // rede
  const pos = [], uv = [];
  const tri = (a, b, c) => { for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); uv.push((p[0] + p[2]) * 7, p[1] * 7); } };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  const hw = GOAL_HW + 0.02;
  for (const s of [-1, 1]) {
    const z = s * hw, zb = s * 0.6;
    quad([0, 0, z], [0, GOAL_H, z], [0.45, GOAL_H - 0.05, s * GOAL_HW * 0.9], [NET_D, 0, zb]);
  }
  quad([0.45, GOAL_H - 0.05, -GOAL_HW * 0.9], [0.45, GOAL_H - 0.05, GOAL_HW * 0.9], [NET_D, 0, 0.6], [NET_D, 0, -0.6]);
  quad([0, GOAL_H, -hw], [0, GOAL_H, hw], [0.45, GOAL_H - 0.05, GOAL_HW * 0.9], [0.45, GOAL_H - 0.05, -GOAL_HW * 0.9]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const net = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: netTex, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  grp.add(net);
  return grp;
}

function buildArena(scene, renderer, high, crowdColors) {
  scene.background = new THREE.Color(0x0a0e18);
  scene.fog = new THREE.Fog(0x0a0e18, 60, 130);

  // gelo
  const iceTex = makeIceTexture(renderer);
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(HALF_L * 2, HALF_W * 2),
    new THREE.MeshPhongMaterial({ map: iceTex, shininess: 120, specular: 0x6a7c8e }));
  ice.rotation.x = -Math.PI / 2; ice.receiveShadow = high; scene.add(ice);

  const seg = 14;
  const inner = rinkPerimeter(HALF_L, HALF_W, CORNER_R, seg);
  const outer = rinkPerimeter(HALF_L + 0.2, HALF_W + 0.2, CORNER_R + 0.2, seg);
  // tabelas
  const boards = new THREE.Mesh(ringStrip(inner, 0, inner, 1.07, 40),
    new THREE.MeshLambertMaterial({ map: makeBoardsTexture(), side: THREE.DoubleSide }));
  scene.add(boards);
  const cap = new THREE.Mesh(ringStrip(inner, 1.07, outer, 1.07, 10), new THREE.MeshLambertMaterial({ color: 0xd8dde3, side: THREE.DoubleSide }));
  scene.add(cap);
  // vidro
  const glass = new THREE.Mesh(ringStrip(outer, 1.07, outer, 2.7, 10),
    new THREE.MeshPhongMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, shininess: 120 }));
  scene.add(glass);
  const glassTop = new THREE.Mesh(ringStrip(outer, 2.7, outer, 2.74, 10), new THREE.MeshBasicMaterial({ color: 0x9aa6b2, side: THREE.DoubleSide }));
  scene.add(glassTop);
  // arquibancada em degraus (compacta) + torcedores 3D
  const ROWS = 9, ROW_D = 0.85, ROW_H = 0.55, D0 = 1.0, Y0 = 1.1;
  const ring = d => rinkPerimeter(HALF_L + d, HALF_W + d, CORNER_R + d, seg);
  const mTread = new THREE.MeshLambertMaterial({ color: 0x24304a, side: THREE.DoubleSide });
  const mRiser = new THREE.MeshLambertMaterial({ color: 0x141926, side: THREE.DoubleSide });
  const stands = new THREE.Group(); scene.add(stands);
  stands.add(new THREE.Mesh(ringStrip(outer, 0.0, ring(D0), 0.0, 10), mRiser));
  stands.add(new THREE.Mesh(ringStrip(ring(D0), 0.0, ring(D0), Y0, 10), mRiser));
  for (let k = 0; k < ROWS; k++) {
    const d = D0 + k * ROW_D, y = Y0 + k * ROW_H;
    stands.add(new THREE.Mesh(ringStrip(ring(d), y, ring(d + ROW_D), y, 10), mTread));
    stands.add(new THREE.Mesh(ringStrip(ring(d + ROW_D), y, ring(d + ROW_D), y + ROW_H, 10), mRiser));
  }
  const dTop = D0 + ROWS * ROW_D, yTop = Y0 + ROWS * ROW_H;
  // arena fechada: anel de camarotes iluminados, faixa de LED e parede superior inclinada até o teto.
  // Só a face de dentro é desenhada (BackSide): se a câmera de TV recuar para fora da parede, ela enxerga através.
  stands.add(new THREE.Mesh(ringStrip(ring(dTop), yTop, ring(dTop), yTop + 3.2, 34), new THREE.MeshBasicMaterial({ map: makeSuitesTexture(), side: THREE.BackSide })));
  const ledTex = makeBoardsTexture();
  stands.add(new THREE.Mesh(ringStrip(ring(dTop - 0.05), yTop + 3.3, ring(dTop - 0.05), yTop + 4.2, 40), new THREE.MeshBasicMaterial({ map: ledTex, side: THREE.BackSide })));
  stands.add(new THREE.Mesh(ringStrip(ring(dTop), yTop + 3.2, ring(dTop + 9), ROOF_Y + 2.2, 12), new THREE.MeshLambertMaterial({ map: makeUpperWallTexture(), side: THREE.BackSide })));
  const crowd = new Crowd(scene, crowdColors, { rows: ROWS, rowD: ROW_D, rowH: ROW_H, d0: D0, y0: Y0, spacing: high ? 0.62 : 0.85 });
  // teto, treliças, holofotes e telão: tudo que fica no alto entra em "overhead" (some na câmera Alta)
  const overhead = new THREE.Group(); scene.add(overhead);
  const jumbo = buildJumbotron(); jumbo.group.position.set(0, 18.5, 0); overhead.add(jumbo.group);
  jumbo.group.updateMatrixWorld(true); jumbo.box = new THREE.Box3().setFromObject(jumbo.group);
  jumbo.box.max.y = Math.min(jumbo.box.max.y, 22.5); // os cabos não contam
  buildRoof(overhead);
  const flags = new ArenaFlags(overhead, dTop);

  // gols
  const netTex = makeNetTexture(); netTex.repeat.set(1, 1);
  const n1 = buildNet(netTex); n1.position.set(GOAL_X, 0, 0); scene.add(n1);
  const n2 = buildNet(netTex); n2.position.set(-GOAL_X, 0, 0); n2.rotation.y = Math.PI; scene.add(n2);

  // luzes
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4a5a, 0.85));
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const dl = new THREE.DirectionalLight(0xffffff, 0.7);
  dl.position.set(-8, 40, 14);
  if (high) {
    dl.castShadow = true; dl.shadow.mapSize.set(2048, 2048);
    const sc = dl.shadow.camera; sc.left = -38; sc.right = 38; sc.top = 26; sc.bottom = -26; sc.near = 5; sc.far = 90;
    dl.shadow.bias = -0.0006;
  }
  scene.add(dl);
  return { crowd, stands, ice, iceTex, jumbo, overhead, flags };
}

function makeBlobTexture() {
  const c = makeCanvas(64, 64), g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let _blobTex = null;
function makeBlobShadow(size) {
  if (!_blobTex) _blobTex = makeBlobTexture();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: _blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.renderOrder = 1;
  return m;
}

const ROOF_Y = 24;

// Camarotes: janelas com luz quente e silhuetas de gente.
function makeSuitesTexture() {
  const W = 2048, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#0b0e15'; g.fillRect(0, 0, W, H);
  for (let x = 8; x < W; x += 128) {
    const gr = g.createLinearGradient(0, 18, 0, 104), warm = Math.random() < 0.8;
    gr.addColorStop(0, warm ? '#ffd58a' : '#6d7f99'); gr.addColorStop(1, warm ? '#7a4a1c' : '#26303f');
    g.fillStyle = gr; g.fillRect(x, 18, 112, 86);
    g.fillStyle = 'rgba(10,12,18,0.85)';
    for (let k = 0; k < 4; k++) if (Math.random() < 0.6) {
      const px = x + 10 + Math.random() * 90;
      g.beginPath(); g.arc(px, 70, 7, 0, 6.29); g.fill(); g.fillRect(px - 9, 77, 18, 27);
    }
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, 18, 112, 10);
    g.fillStyle = '#11151d'; g.fillRect(x + 55, 18, 3, 86);
  }
  g.fillStyle = '#2b7fff'; g.fillRect(0, 108, W, 5);
  g.fillStyle = '#c9ced6'; g.fillRect(0, 113, W, 15);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Parede superior: painéis escuros com nervuras e uma linha de luz.
function makeUpperWallTexture() {
  const c = makeCanvas(512, 512), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 512, 0, 0);
  gr.addColorStop(0, '#1d2638'); gr.addColorStop(1, '#0a0d14');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = 0; x < 512; x += 128) g.fillRect(x, 0, 6, 512);
  for (let y = 60; y < 512; y += 110) g.fillRect(0, y, 512, 3);
  g.fillStyle = 'rgba(255,214,140,0.55)'; g.fillRect(0, 380, 512, 4);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Bandeiras dos times, banners de campeão e a bandeira do Brasil pendurados sob o teto, balançando de leve.
function makeBannerTexture(team) {
  const c = makeCanvas(256, 512), g = c.getContext('2d');
  g.fillStyle = team.primary; g.fillRect(0, 0, 256, 470);
  g.beginPath(); g.moveTo(0, 470); g.lineTo(128, 510); g.lineTo(256, 470); g.fill(); // ponta em V
  g.fillStyle = team.secondary; g.fillRect(0, 0, 256, 26);
  g.fillStyle = team.accent; g.fillRect(0, 26, 256, 8);
  g.fillStyle = team.secondary; g.beginPath(); g.arc(128, 170, 78, 0, 6.29); g.fill();
  g.fillStyle = team.primary; g.beginPath(); g.arc(128, 170, 66, 0, 6.29); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 54px Arial Black, Arial'; g.fillText(team.id, 128, 172);
  g.font = '900 40px Arial Black, Arial'; g.fillText(team.name.toUpperCase(), 128, 310, 236);
  g.font = '700 26px Arial'; g.fillText(team.city.toUpperCase(), 128, 360, 236);
  return new THREE.CanvasTexture(c);
}
function makeChampTexture(year, team) {
  const c = makeCanvas(256, 512), g = c.getContext('2d');
  g.fillStyle = '#10141d'; g.fillRect(0, 0, 256, 512);
  g.strokeStyle = '#f2c14e'; g.lineWidth = 8; g.strokeRect(14, 14, 228, 484);
  g.fillStyle = '#f2c14e'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 34px Arial Black, Arial'; g.fillText('CAMPEÃO', 128, 90);
  g.font = '900 26px Arial Black, Arial'; g.fillText('LIGA BRASILEIRA', 128, 140, 220);
  g.fillStyle = '#fff'; g.font = '900 86px Arial Black, Arial'; g.fillText(String(year), 128, 270);
  g.fillStyle = team.primary; g.fillRect(40, 350, 176, 70);
  g.fillStyle = '#fff'; g.font = '900 44px Arial Black, Arial'; g.fillText(team.id, 128, 387);
  return new THREE.CanvasTexture(c);
}
function makeBrazilTexture() {
  const c = makeCanvas(400, 280), g = c.getContext('2d');
  g.fillStyle = '#009c3b'; g.fillRect(0, 0, 400, 280);
  g.fillStyle = '#ffdf00'; g.beginPath(); g.moveTo(200, 24); g.lineTo(376, 140); g.lineTo(200, 256); g.lineTo(24, 140); g.fill();
  g.fillStyle = '#002776'; g.beginPath(); g.arc(200, 140, 70, 0, 6.29); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 10; g.beginPath(); g.arc(200, 245, 125, -2.1, -1.04); g.stroke();
  g.fillStyle = '#fff';
  for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(160 + Math.random() * 80, 150 + Math.random() * 45, 2.5, 0, 6.29); g.fill(); }
  return new THREE.CanvasTexture(c);
}
class ArenaFlags {
  constructor(parent, dTop) {
    this.items = [];
    const d = dTop + 3.6, top = ROOF_Y - 0.2;
    const rod = new THREE.MeshLambertMaterial({ color: 0x9aa3b0 });
    const add = (tex, w, h, x, z, ry) => {
      const geo = new THREE.PlaneGeometry(w, h, 4, 8); geo.translate(0, -h / 2, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, alphaTest: 0.5 }));
      m.position.set(x, top, z); m.rotation.y = ry; parent.add(m);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, w + 0.3, 6), rod); r.rotation.z = Math.PI / 2; m.add(r);
      this.items.push({ geo, base: Float32Array.from(geo.attributes.position.array), h, ph: Math.random() * 6.28 });
    };
    // laterais: as bandeiras dos 8 times
    TEAMS.forEach((t, i) => {
      const side = i < 4 ? 1 : -1, x = -21 + (i % 4) * 14;
      add(makeBannerTexture(t), 3.6, 7.2, x, side * (HALF_W + d), side > 0 ? Math.PI : 0);
    });
    // fundos: bandeira do Brasil no meio e banners de campeão dos lados
    const champs = [[2019, 0], [2021, 2], [2023, 5], [2025, 1]];
    for (const side of [1, -1]) {
      const X = side * (HALF_L + d), ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      add(makeBrazilTexture(), 9, 6.3, X, 0, ry);
      champs.splice(0, 2).forEach(([y, ti], k) => add(makeChampTexture(y, TEAMS[ti]), 3.2, 6.4, X, (k ? 1 : -1) * 8.5, ry));
    }
  }
  update(t) {
    for (const f of this.items) {
      const P = f.geo.attributes.position.array, B = f.base;
      for (let i = 0; i < P.length; i += 3) {
        const hang = -B[i + 1] / f.h; // 0 no topo, 1 embaixo
        P[i + 2] = Math.sin(t * 1.7 + f.ph + B[i + 1] * 0.9 + B[i] * 0.6) * 0.22 * hang;
      }
      f.geo.attributes.position.needsUpdate = true;
    }
  }
}

// ===== Telão pendurado: 4 telas com a transmissão ao vivo, faixa de placar e saia de anúncio =====
function buildJumbotron() {
  const group = new THREE.Group();
  const W = 8, SH = 4.5, D = (W + 0.3) / 2 + 0.02;
  const mFrame = new THREE.MeshLambertMaterial({ color: 0x14171e });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 7.1, W + 0.3), mFrame); frame.position.y = -0.35; group.add(frame);
  // cabeçalho com o nome da arena
  const hc = makeCanvas(1024, 80), hg = hc.getContext('2d');
  hg.fillStyle = '#0a0c12'; hg.fillRect(0, 0, 1024, 80);
  hg.fillStyle = '#fff'; hg.font = '900 50px Arial Black, Arial'; hg.textAlign = 'center'; hg.textBaseline = 'middle';
  hg.fillText('ARENA LBH', 512, 42);
  hg.fillStyle = '#2b7fff'; hg.fillRect(0, 74, 1024, 6);
  const mHead = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc) });
  // tela (a textura da transmissão é ligada depois, pelo Game) e faixa de placar
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x1d2a44, toneMapped: false });
  const stripMat = new THREE.MeshBasicMaterial({ color: 0x05070c, toneMapped: false });
  const geoS = new THREE.PlaneGeometry(W, SH), geoT = new THREE.PlaneGeometry(W, 1.05), geoH = new THREE.PlaneGeometry(W, 0.62);
  const screens = [];
  for (let i = 0; i < 4; i++) {
    const face = new THREE.Group(); face.rotation.y = i * Math.PI / 2;
    const sc = new THREE.Mesh(geoS, screenMat); sc.position.set(0, 0.3, D); face.add(sc); screens.push(sc);
    const st = new THREE.Mesh(geoT, stripMat); st.position.set(0, 0.3 - SH / 2 - 0.58, D); face.add(st);
    const hd = new THREE.Mesh(geoH, mHead); hd.position.set(0, 0.3 + SH / 2 + 0.36, D); face.add(hd);
    group.add(face);
  }
  // saia amarela de anúncio embaixo do telão
  const sc2 = makeCanvas(1024, 128), sg = sc2.getContext('2d');
  sg.fillStyle = '#f5c400'; sg.fillRect(0, 0, 1024, 128);
  sg.fillStyle = '#1a1a1a'; sg.font = '900 60px Arial Black, Arial'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
  sg.fillText('PUCK BANK  ·  ARENA', 512, 66, 980);
  const mSkirt = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(sc2) });
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(W - 1.2, 1.4, W - 1.2), [mSkirt, mSkirt, mFrame, mFrame, mSkirt, mSkirt]);
  skirt.position.y = -4.75; group.add(skirt);
  const ringLed = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.22, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x2b7fff, side: THREE.DoubleSide }));
  ringLed.position.y = -5.55; group.add(ringLed);
  // cabos de sustentação
  const mCable = new THREE.MeshBasicMaterial({ color: 0x20242c });
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 4), mCable); c.position.set(x, 7.2, z); group.add(c);
  }
  return { group, screenMat, stripMat, screens };
}

// ===== Teto da arena: forro escuro, treliças metálicas e holofotes com brilho =====
function buildRoof(parent) {
  const RY = ROOF_Y, SPAN_Z = HALF_W * 2 + 34, SPAN_X = HALF_L * 2 + 30;
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(SPAN_X + 20, SPAN_Z + 20), new THREE.MeshBasicMaterial({ color: 0x06080c, side: THREE.DoubleSide }));
  roof.rotation.x = Math.PI / 2; roof.position.y = RY + 2.2; parent.add(roof);
  // treliças: banzos superior e inferior + diagonais, tudo numa InstancedMesh
  const beams = [];
  const beam = (ax, ay, az, bx, by, bz, t) => beams.push([ax, ay, az, bx, by, bz, t]);
  const truss = (ax, az, bx, bz, h, y, step, t) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / step));
    beam(ax, y, az, bx, y, bz, t * 1.6); beam(ax, y + h, az, bx, y + h, bz, t * 1.6);
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n;
      const x0 = ax + (bx - ax) * u0, z0 = az + (bz - az) * u0, x1 = ax + (bx - ax) * u1, z1 = az + (bz - az) * u1;
      if (i % 2) beam(x0, y, z0, x1, y + h, z1, t); else beam(x0, y + h, z0, x1, y, z1, t);
      beam(x0, y, z0, x0, y + h, z0, t * 0.8);
    }
  };
  for (let x = -SPAN_X / 2 + 6; x <= SPAN_X / 2 - 6; x += 9) truss(x, -SPAN_Z / 2, x, SPAN_Z / 2, 1.8, RY, 2.2, 0.12);
  for (const z of [-11, 0, 11]) truss(-SPAN_X / 2, z, SPAN_X / 2, z, 1.2, RY + 0.3, 3, 0.09);
  const mSteel = new THREE.MeshLambertMaterial({ color: 0x4a5262 });
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mSteel, beams.length);
  const o = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  beams.forEach(([ax, ay, az, bx, by, bz, t], i) => {
    dir.set(bx - ax, by - ay, bz - az); const L = dir.length(); dir.normalize();
    o.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    o.quaternion.setFromUnitVectors(up, dir); o.scale.set(t, L, t); o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  parent.add(im);
  // passarela branca dos holofotes (como nas arenas de verdade) + holofotes com halo
  const ringPts = rinkPerimeter(HALF_L - 4, HALF_W - 3, CORNER_R - 3, 8);
  parent.add(new THREE.Mesh(ringStrip(ringPts, 21.2, ringPts, 21.6, 10), new THREE.MeshLambertMaterial({ color: 0xc9ced6, side: THREE.DoubleSide })));
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
  const lampGeo = new THREE.BoxGeometry(1.2, 0.25, 0.7);
  const glowMat = new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xfff4d6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  rinkPerimeter(HALF_L - 4, HALF_W - 3, CORNER_R - 3, 3).forEach((p, i) => {
    const l = new THREE.Mesh(lampGeo, lampMat); l.position.set(p[0], 21, p[1]); parent.add(l);
    if (i % 2) return;
    const g = new THREE.Sprite(glowMat); g.position.set(p[0], 20.8, p[1]); g.scale.set(3.2, 3.2, 1); parent.add(g);
  });
  // cabos verticais segurando a passarela
  const mCable = new THREE.MeshBasicMaterial({ color: 0x1c2028 });
  ringPts.forEach((p, i) => { if (i % 6) return; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3, 4), mCable); c.position.set(p[0], 23, p[1]); parent.add(c); });
}
function makeGlowTexture() {
  const c = makeCanvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,245,220,0.6)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ===== Torcida: torcedores individuais (InstancedMesh) que reagem ao jogo =====
class Crowd {
  constructor(scene, colors, o) {
    const fans = [];
    const cx = HALF_L - CORNER_R, cz = HALF_W - CORNER_R;
    for (let k = 0; k < o.rows; k++) {
      const d = o.d0 + k * o.rowD + o.rowD * 0.45, y = o.y0 + k * o.rowH;
      const pts = rinkPerimeter(HALF_L + d, HALF_W + d, CORNER_R + d, 24);
      let acc = 0, next = Math.random() * o.spacing;
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
        while (next <= acc + L) {
          const t = (next - acc) / L, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          next += o.spacing * (0.9 + Math.random() * 0.2);
          if ((next % 14) < 1.1 || Math.random() < 0.07) continue; // escadas e lugares vazios
          let nx, nz; const qx = Math.abs(x), qz = Math.abs(z);
          if (qx > cx && qz > cz) { nx = Math.sign(x) * (qx - cx); nz = Math.sign(z) * (qz - cz); }
          else if (qx > cx) { nx = Math.sign(x); nz = 0; } else { nx = 0; nz = Math.sign(z); }
          const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
          const r = Math.random();
          const team = r < 0.62 ? 0 : r < 0.88 ? 1 : 2;
          fans.push({ x, y, z, yaw: Math.atan2(nz, -nx), ph: Math.random() * 6.28, team,
            lazy: Math.random() * 0.5, jumpF: 7 + Math.random() * 4, h: 0.92 + Math.random() * 0.16 });
        }
        acc += L;
      }
    }
    this.fans = fans;
    const n = fans.length;
    const bodyG = new THREE.BoxGeometry(0.26, 0.52, 0.4); bodyG.translate(0, 0.26, 0);
    const headG = new THREE.SphereGeometry(0.12, 8, 6);
    const armG = new THREE.BoxGeometry(0.08, 0.44, 0.08); armG.translate(0, -0.22, 0);
    const mat = new THREE.MeshLambertMaterial();
    this.body = new THREE.InstancedMesh(bodyG, mat, n);
    this.head = new THREE.InstancedMesh(headG, mat, n);
    this.armL = new THREE.InstancedMesh(armG, mat, n);
    this.armR = new THREE.InstancedMesh(armG, mat, n);
    const c = new THREE.Color(), skin = new THREE.Color();
    const pal = [[colors[0], colors[1]], [colors[2], colors[3]]];
    fans.forEach((f, i) => {
      if (f.team < 2) c.set(pal[f.team][Math.random() < 0.75 ? 0 : 1]);
      else c.setHSL(Math.random(), 0.15 + Math.random() * 0.35, 0.2 + Math.random() * 0.45);
      skin.setHSL(0.07, 0.35 + Math.random() * 0.2, 0.25 + Math.random() * 0.45);
      this.body.setColorAt(i, c); this.armL.setColorAt(i, c); this.armR.setColorAt(i, c); this.head.setColorAt(i, skin);
    });
    for (const m of [this.body, this.head, this.armL, this.armR]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); }
    this.dummy = new THREE.Object3D(); this.dummy.rotation.order = 'YXZ';
    this.acc = 0;
    this.update(0, 0, [0, 0], 1);
  }
  // hype[0..1] por time; os neutros reagem ao maior
  update(t, dt, hype, force, hideNear) {
    this.acc += dt;
    if (!force && this.acc < 1 / 30) return;
    this.acc = 0;
    const D = this.dummy, neutral = Math.max(hype[0], hype[1]) * 0.6;
    this.fans.forEach((f, i) => {
      if (hideNear && f.z > HALF_W + 0.5) {
        D.position.set(0, -50, 0); D.scale.set(0.001, 0.001, 0.001); D.rotation.set(0, 0, 0); D.updateMatrix();
        this.body.setMatrixAt(i, D.matrix); this.head.setMatrixAt(i, D.matrix); this.armL.setMatrixAt(i, D.matrix); this.armR.setMatrixAt(i, D.matrix);
        return;
      }
      const hy = f.team < 2 ? hype[f.team] : neutral;
      const ex = Math.max(0, hy - f.lazy * 0.5);
      const stand = Math.min(1, ex * 2.2);
      const jump = ex > 0.45 ? Math.max(0, Math.sin(t * f.jumpF + f.ph)) * 0.32 * ex : 0;
      const sway = Math.sin(t * 1.3 + f.ph) * 0.04;
      const by = f.y + 0.28 + stand * 0.28 + jump;
      const cs = Math.cos(f.yaw), sn = Math.sin(f.yaw);
      D.position.set(f.x, by, f.z); D.rotation.set(0, f.yaw, sway); D.scale.set(1, f.h, 1); D.updateMatrix();
      this.body.setMatrixAt(i, D.matrix);
      D.position.set(f.x + cs * 0.03, by + 0.52 * f.h + 0.12, f.z - sn * 0.03); D.rotation.set(0, f.yaw, 0); D.scale.set(1, 1, 1); D.updateMatrix();
      this.head.setMatrixAt(i, D.matrix);
      // braços: parados ao lado do corpo, batendo palma ou para cima comemorando
      let a = 0.15;
      if (ex > 0.55) a = 2.6 + Math.sin(t * 6 + f.ph) * 0.25;
      else if (ex > 0.15) a = 0.9 + Math.sin(t * 14 + f.ph) * 0.35;
      const sy = by + 0.48 * f.h;
      for (const [m, side] of [[this.armL, -1], [this.armR, 1]]) {
        D.position.set(f.x + sn * 0.24 * side, sy, f.z + cs * 0.24 * side);
        D.rotation.set(-side * a, f.yaw, 0); D.updateMatrix();
        m.setMatrixAt(i, D.matrix);
      }
    });
    for (const m of [this.body, this.head, this.armL, this.armR]) m.instanceMatrix.needsUpdate = true;
  }
}
