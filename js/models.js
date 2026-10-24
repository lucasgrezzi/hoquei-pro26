'use strict';
// ===== Modelos dos jogadores (geometria procedural, sem arquivos externos) =====
// O esqueleto (pose, legs, knees, upper, head, stick, arms) é o mesmo que as animações em entities.js usam.
// As peças fixas de cada osso são fundidas numa malha por material (bem menos chamadas de desenho).
const LEAN = -0.32;
const HIP_Y = 0.9;               // altura do quadril em pé
const THIGH_L = 0.44, SHIN_L = 0.55; // coxa / canela+patins (até a lâmina)

// ---------- materiais (cache) ----------
const _matCache = {};
// luz de contorno (como os refletores de uma transmissão): destaca a silhueta dos jogadores contra o gelo
function rim(mat) {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <output_fragment>',
      'float rimF = 1.0 - abs(dot(normalize(vViewPosition), normal));\n' +
      'outgoingLight += vec3(0.75, 0.85, 1.0) * pow(rimF, 3.0) * 0.32;\n#include <output_fragment>');
  };
  return mat;
}
function lam(col, extra) {
  const key = 'l' + col + (extra ? JSON.stringify(extra) : '');
  if (!_matCache[key]) _matCache[key] = rim(new THREE.MeshLambertMaterial(Object.assign({ color: col }, extra || {})));
  return _matCache[key];
}
function gloss(col, shininess = 60, extra) {
  const key = 'p' + col + shininess + (extra ? JSON.stringify(extra) : '');
  if (!_matCache[key]) _matCache[key] = rim(new THREE.MeshPhongMaterial(Object.assign({ color: col, shininess, specular: 0x444444 }, extra || {})));
  return _matCache[key];
}
// tecido de camisa/calção: relevo de trama e dobras (normal map gerado) + brilho suave de poliéster
let _fabricTex = null;
function fabricTexture() {
  if (_fabricTex) return _fabricTex;
  const N = 256, c = makeCanvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N);
  const TAU = Math.PI * 2, rnd = mulberry32(7);
  // dobras: senos de frequência inteira (a textura repete sem emenda), quase horizontais como numa camisa
  const folds = [...Array(12)].map((_, i) => ({ k: Math.floor(rnd() * 5) - 2, l: 1 + Math.floor(rnd() * 3), a: 0.7 / (1 + i * 0.3), p: rnd() * TAU }));
  const H = (x, y) => {
    let h = 0.1 * Math.sin(TAU * x * 32 / N) * Math.sin(TAU * y * 32 / N); // trama
    for (const f of folds) h += f.a * Math.sin(TAU * (f.k * x + f.l * y) / N + f.p + 1.2 * Math.sin(TAU * (x + 2 * y) / N + f.p * 3));
    return h;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  _fabricTex = new THREE.CanvasTexture(c);
  _fabricTex.wrapS = _fabricTex.wrapT = THREE.RepeatWrapping;
  _fabricTex.repeat.set(2, 2);
  return _fabricTex;
}
const FABRIC = { shininess: 18, specular: 0x2c2c2c, normalScale: new THREE.Vector2(0.4, 0.4) };
function fab(col, sh) {
  const key = 'f' + col + (sh || '');
  if (!_matCache[key]) _matCache[key] = rim(new THREE.MeshPhongMaterial(Object.assign({ color: col, normalMap: fabricTexture() }, FABRIC, sh ? { shininess: sh, specular: 0x3a3a3a } : {})));
  return _matCache[key];
}
// decalques (números, escudo): iluminados como a camisa, recortados pelo alfa
function decalMat(tex) { return rim(new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -2 })); }

// textura do rosto (canvas 128², mapeada num pedaço de esfera na frente da cabeça): olhos com íris e brilho,
// pálpebras, sobrancelhas, sombra das órbitas, lábios e, em alguns jogadores, barba rala
function faceMat(skin, hair, seed) {
  const iris = seed < 0.62 ? '#4a2f1c' : seed < 0.82 ? '#3b6ea8' : '#4f7a46', beard = (seed * 7.3) % 1 < 0.4;
  const key = 'face' + skin + hair + iris + beard;
  if (_matCache[key]) return _matCache[key];
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  const soft = (x, y, rx, ry, col, a) => {
    g.save(); g.translate(x, y); g.scale(rx, ry);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 6.29); g.fill(); g.restore();
  };
  if (beard) { soft(64, 104, 40, 22, hair, 0.45); soft(64, 92, 18, 7, hair, 0.35); }
  for (const s of [-1, 1]) {
    const ex = 64 + s * 26;
    soft(ex, 52, 15, 9, '#3a2214', 0.28);                                      // órbita
    g.fillStyle = '#f4efe8'; g.beginPath(); g.ellipse(ex, 54, 7.5, 3.6, 0, 0, 6.29); g.fill();
    g.fillStyle = iris; g.beginPath(); g.arc(ex - s * 0.5, 54, 3.3, 0, 6.29); g.fill();
    g.fillStyle = '#0d0a08'; g.beginPath(); g.arc(ex - s * 0.5, 54, 1.6, 0, 6.29); g.fill();
    g.fillStyle = '#ffffff'; g.fillRect(ex - s * 0.5 - 1.6, 52, 1.4, 1.4);
    g.strokeStyle = 'rgba(30,18,12,0.9)'; g.lineWidth = 1.6;                 // pálpebra
    g.beginPath(); g.ellipse(ex, 54.6, 7.8, 4.2, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    g.strokeStyle = hair; g.lineWidth = 3.4; g.lineCap = 'round';             // sobrancelha
    g.beginPath(); g.moveTo(ex - s * 9, 44); g.quadraticCurveTo(ex + s * 1, 39.5, ex + s * 9, 43); g.stroke();
  }
  soft(64, 76, 6, 8, '#3a2214', 0.18);                                         // sombra do nariz
  g.fillStyle = 'rgba(70,30,26,0.9)'; g.beginPath(); g.moveTo(52, 98); g.quadraticCurveTo(64, 101, 76, 98); g.quadraticCurveTo(64, 99.5, 52, 98); g.fill();
  g.strokeStyle = 'rgba(80,35,30,0.85)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(52, 98.5); g.quadraticCurveTo(64, 100.5, 76, 98.5); g.stroke();
  soft(64, 102.5, 9, 2.6, '#b5675a', 0.5);                                     // lábio de baixo
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  return (_matCache[key] = rim(new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
}

// ---------- geometrias ----------
function bx(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
function sph(r, mat, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat); m.scale.set(sx, sy, sz); return m; }
function cyl(rt, rb, h, mat, seg = 12) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); }
// caixa com cantos arredondados (extrusão de um retângulo arredondado com chanfro)
function rboxGeo(w, h, d, r) {
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const b = r * 0.7, sw = w - 2 * b, sh = h - 2 * b, cr = Math.max(0.001, r - b);
  const s = new THREE.Shape(), x0 = -sw / 2, y0 = -sh / 2;
  s.moveTo(x0 + cr, y0); s.lineTo(x0 + sw - cr, y0); s.quadraticCurveTo(x0 + sw, y0, x0 + sw, y0 + cr);
  s.lineTo(x0 + sw, y0 + sh - cr); s.quadraticCurveTo(x0 + sw, y0 + sh, x0 + sw - cr, y0 + sh);
  s.lineTo(x0 + cr, y0 + sh); s.quadraticCurveTo(x0, y0 + sh, x0, y0 + sh - cr);
  s.lineTo(x0, y0 + cr); s.quadraticCurveTo(x0, y0, x0 + cr, y0);
  const depth = Math.max(0.001, d - 2 * b);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 3 });
  g.translate(0, 0, -depth / 2);
  return g;
}
// extrusão de um perfil 2D (x para frente, y para cima) com espessura d em z, cantos suaves
function profileGeo(pts, d, bevel = 0.008) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]); else s.lineTo(p[0], p[1]);
  }
  const depth = Math.max(0.001, d - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}
const _Y = new THREE.Vector3(0, 1, 0);
function limb(a, b, t, mat) {
  const v = new THREE.Vector3().subVectors(b, a), len = v.length();
  const m = bx(t, len, t, mat);
  m.position.copy(a).addScaledVector(v, 0.5);
  m.quaternion.setFromUnitVectors(_Y, v.normalize());
  return m;
}
// Segmento de geometria com altura 1 esticado entre dois pontos.
function setSeg(mesh, a, b) {
  const v = new THREE.Vector3().subVectors(b, a), len = v.length();
  mesh.position.copy(a).addScaledVector(v, 0.5);
  mesh.quaternion.setFromUnitVectors(_Y, v.divideScalar(len || 1));
  mesh.scale.set(1, len, 1);
}

// ---------- fusão de peças fixas ----------
// Junta todas as peças de um mesmo osso e material numa única malha.
class PartBuilder {
  constructor() { this.groups = new Map(); this.o = new THREE.Object3D(); }
  add(parent, geo, mat, pos, rot, scl) {
    const o = this.o;
    o.position.set(...(pos || [0, 0, 0])); o.rotation.set(...(rot || [0, 0, 0])); o.scale.set(...(scl || [1, 1, 1]));
    o.updateMatrix();
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(o.matrix);
    if (geo !== g) geo.dispose();
    let byMat = this.groups.get(parent); if (!byMat) this.groups.set(parent, byMat = new Map());
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(g);
    return g;
  }
  // adiciona uma malha já posicionada (filhos aninhados não são suportados)
  addMesh(parent, mesh) {
    mesh.updateMatrix();
    const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix);
    mesh.geometry.dispose();
    let byMat = this.groups.get(parent); if (!byMat) this.groups.set(parent, byMat = new Map());
    if (!byMat.has(mesh.material)) byMat.set(mesh.material, []);
    byMat.get(mesh.material).push(g);
  }
  build() {
    // peças de cor sólida do mesmo osso viram uma malha só, com a cor gravada nos vértices
    for (const [parent, byMat] of this.groups) {
      const solid = new Map();
      for (const [mat, list] of byMat) {
        const plain = !mat.map && !mat.transparent && (mat.isMeshLambertMaterial || mat.isMeshPhongMaterial);
        if (!plain) { parent.add(new THREE.Mesh(mergeGeos(list), mat)); continue; }
        const key = mat.normalMap ? 'f' + mat.shininess : mat.isMeshPhongMaterial ? 'p' + mat.shininess : 'l';
        if (!solid.has(key)) solid.set(key, { mat, parts: [] });
        for (const g of list) solid.get(key).parts.push({ g, c: mat.color });
      }
      for (const [key, { mat, parts }] of solid) parent.add(new THREE.Mesh(mergeGeos(parts.map(p => p.g), parts.map(p => p.c)), vcMat(key, mat)));
    }
    this.groups.clear();
  }
}
function vcMat(key, like) {
  const k = 'vc' + key;
  if (!_matCache[k]) _matCache[k] = rim(like.isMeshPhongMaterial
    ? new THREE.MeshPhongMaterial({ vertexColors: true, shininess: like.shininess, specular: like.specular, normalMap: like.normalMap, normalScale: like.normalScale })
    : new THREE.MeshLambertMaterial({ vertexColors: true }));
  return _matCache[k];
}
function mergeGeos(list, colors) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = colors ? new Float32Array(n * 3) : null;
  let o = 0;
  list.forEach((g, i) => {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (col) { const k = colors[i]; for (let j = 0; j < c; j++) { col[(o + j) * 3] = k.r; col[(o + j) * 3 + 1] = k.g; col[(o + j) * 3 + 2] = k.b; } }
    o += c; g.dispose();
  });
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.computeBoundingSphere();
  return m;
}

// ---------- texturas ----------
function numberTexture(num, fill, stroke) {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  g.font = '900 86px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = stroke; g.strokeText(String(num), 64, 68);
  g.fillStyle = fill; g.fillText(String(num), 64, 68);
  return new THREE.CanvasTexture(c);
}
// Costas da camisa: nome em arco + número grande
function backTexture(num, name, fill, stroke) {
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const txt = (name || '').toUpperCase().split('').join(String.fromCharCode(8202));
  g.font = '900 30px Arial Black, Arial'; g.lineWidth = 5; g.strokeStyle = stroke; g.fillStyle = fill;
  const w = Math.min(220, g.measureText(txt).width);
  let x = 128 - w / 2;
  for (const ch of txt) { // nome levemente curvado
    const cw = g.measureText(ch).width * (w / Math.max(w, g.measureText(txt).width));
    const t = (x + cw / 2 - 128) / 128, y = 40 + t * t * 14;
    g.save(); g.translate(x + cw / 2, y); g.rotate(t * 0.18); g.strokeText(ch, 0, 0); g.fillText(ch, 0, 0); g.restore();
    x += cw;
  }
  g.font = '900 150px Arial Black, Arial'; g.lineWidth = 14;
  g.strokeText(String(num), 128, 150); g.fillText(String(num), 128, 150);
  return new THREE.CanvasTexture(c);
}
// escudo do peito: círculo com as cores do time e a sigla
const _crestCache = {};
function crestTexture(team, ring) {
  const key = team.id + ring;
  if (_crestCache[key]) return _crestCache[key];
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  g.beginPath(); g.arc(64, 64, 60, 0, 6.29); g.fillStyle = ring; g.fill();
  g.beginPath(); g.arc(64, 64, 50, 0, 6.29); g.fillStyle = team.primary; g.fill();
  g.beginPath(); g.arc(64, 64, 50, 0, 6.29); g.lineWidth = 5; g.strokeStyle = team.secondary; g.stroke();
  g.fillStyle = team.secondary === '#111111' || team.secondary === '#1a1a1a' ? '#ffffff' : team.secondary;
  g.font = '900 38px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(team.id, 64, 68, 92);
  return (_crestCache[key] = new THREE.CanvasTexture(c));
}
// listras horizontais (meião, punho da luva): lista de [cor, fração da altura]
function stripeTexture(bands) {
  const key = 'st' + JSON.stringify(bands);
  if (_crestCache[key]) return _crestCache[key];
  const c = makeCanvas(8, 128), g = c.getContext('2d');
  let y = 0;
  for (const [col, f] of bands) { g.fillStyle = col; g.fillRect(0, Math.round(y * 128), 8, Math.ceil(f * 128)); y += f; }
  return (_crestCache[key] = new THREE.CanvasTexture(c));
}
function stripeMat(bands, fabric) {
  const key = 'sm' + JSON.stringify(bands) + (fabric ? 'f' : '');
  return _matCache[key] || (_matCache[key] = rim(fabric
    ? new THREE.MeshPhongMaterial(Object.assign({ map: stripeTexture(bands), normalMap: fabricTexture() }, FABRIC))
    : new THREE.MeshLambertMaterial({ map: stripeTexture(bands) })));
}

function shadowAll(obj, on) { obj.traverse(o => { if (o.isMesh) o.castShadow = on; }); }
function toUpper(p) {
  const m = new THREE.Matrix4().makeRotationZ(LEAN).setPosition(0, HIP_Y, 0).invert();
  return p.clone().applyMatrix4(m);
}
// número estável a partir do nome (para pele, cabelo, porte)
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
const SKIN = ['#f3cfb3', '#e8b892', '#d49e76', '#bb8158', '#9a6542', '#74482e'];
const HAIR = ['#1c140f', '#2e2016', '#4a3222', '#6e4c2c', '#a07a4a', '#141414'];

// ---------- perfil do tronco (raio x altura, no espaço do "upper") ----------
const TORSO = [[0.212, 0.12], [0.214, 0.17], [0.222, 0.25], [0.24, 0.35], [0.264, 0.45], [0.284, 0.55], [0.282, 0.62], [0.254, 0.68], [0.196, 0.72], [0.124, 0.745], [0.075, 0.752]];
function torsoR(y) {
  const P = TORSO;
  if (y <= P[0][1]) return P[0][0];
  for (let i = 1; i < P.length; i++) if (y <= P[i][1]) { const t = (y - P[i - 1][1]) / (P[i][1] - P[i - 1][1]); return P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t; }
  return P[P.length - 1][0];
}
// faixa do tronco entre y0 e y1 que acompanha o perfil (anéis de listra e decalques curvos)
function torsoBand(y0, y1, off, phiStart = 0, phiLen = Math.PI * 2, seg = 22) {
  const n = 8, pts = [];
  for (let k = 0; k <= n; k++) { const y = y0 + (y1 - y0) * k / n; pts.push(new THREE.Vector2(torsoR(y) + off, y)); }
  return new THREE.LatheGeometry(pts, seg, phiStart, phiLen);
}

// look (opcional, jogador criado na carreira): { skin, hair, tall, wide, tape } no lugar do sorteio pelo nome
function makeSkaterModel(kit, num, hand, shadows, name, look) {
  const team = kit.team || { id: '', primary: kit.jersey, secondary: kit.trim, accent: kit.numStroke };
  const hs = hashStr(name || String(num));
  const L = look || {};
  const tall = L.tall != null ? L.tall : 0.95 + hashStr('h' + name) * 0.1, wide = L.wide != null ? L.wide : 0.94 + hashStr('w' + name) * 0.13;
  const F = shadows ? fab : lam;
  const mJ = F(kit.jersey), mT = F(kit.trim), mP = shadows ? fab(kit.pants, 34) : lam(kit.pants), mH = gloss(kit.helmet, 80);
  const skinCol = SKIN[L.skin != null ? L.skin : Math.floor(hs * SKIN.length)], hairCol = HAIR[L.hair != null ? L.hair : Math.floor(hashStr('c' + name) * HAIR.length)];
  const mSkin = lam(skinCol), mHair = lam(hairCol);
  const mBlack = gloss(0x141414, 50), mDark = lam(0x1e1e1e), mSteel = gloss(0xdfe6ee, 120, { specular: 0x999999 });
  const mHolder = gloss(0xf2f2f2, 50), mStick = gloss(0x202226, 50), mTape = lam(0xf4f4f4), mTapeB = lam(0x161616);
  const mVisor = new THREE.MeshPhongMaterial({ color: 0xa9cbea, transparent: true, opacity: 0.2, shininess: 150, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide });
  const sockMat = stripeMat([[kit.jersey, 0.38], [kit.trim, 0.1], [kit.jersey, 0.06], [kit.trim, 0.1], [kit.jersey, 0.36]], shadows);
  const B = new PartBuilder();
  const root = new THREE.Group(); root.scale.setScalar(tall);
  const pose = new THREE.Group(); root.add(pose);
  const legs = [], knees = [];

  // ----- pernas -----
  const breezerGeo = new THREE.LatheGeometry([[0.10, 0.02], [0.128, 0.0], [0.146, -0.1], [0.142, -0.24], [0.122, -0.34], [0.104, -0.37]].map(p => new THREE.Vector2(p[0], p[1])), 16);
  const bootGeo = profileGeo([[-0.105, 0], [0.12, 0], [0.175, 0.012, 0.178, 0.045], [0.165, 0.075, 0.12, 0.085], [0.07, 0.1], [0.058, 0.19], [0.0, 0.19], [-0.06, 0.205], [-0.1, 0.18, -0.108, 0.12], [-0.115, 0.05, -0.105, 0]], 0.112, 0.022);
  const holderGeo = profileGeo([[-0.115, 0], [0.15, 0], [0.135, -0.065], [-0.1, -0.065]], 0.03, 0.006);
  const bladeGeo = profileGeo([[-0.15, 0], [0.13, 0], [0.175, 0.012, 0.17, 0.03], [-0.15, 0.03]], 0.008, 0.002);
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0, HIP_Y, 0.12 * s); pose.add(hip);
    // calção (breezer) com faixa lateral e barra
    B.add(hip, breezerGeo.clone(), mP);
    B.add(hip, rboxGeo(0.07, 0.3, 0.03, 0.012), mT, [0, -0.17, s * 0.138]);
    B.add(hip, new THREE.CylinderGeometry(0.108, 0.106, 0.04, 16, 1, true), mT, [0, -0.35, 0]);
    const knee = new THREE.Group(); knee.position.y = -THIGH_L; hip.add(knee);
    // joelheira e meião listrado sobre a caneleira
    B.add(knee, new THREE.SphereGeometry(0.082, 14, 10), mJ, [0.024, 0.0, 0], null, [0.95, 1.05, 0.95]);
    B.add(knee, new THREE.CylinderGeometry(0.088, 0.07, 0.3, 14, 1, true), sockMat, [0.004, -0.15, 0]);
    // patins: bota, língua, suporte e lâmina
    const skate = new THREE.Group(); skate.position.y = -0.4; knee.add(skate);
    B.add(skate, bootGeo.clone(), mBlack, [0, -0.055, 0]);
    B.add(skate, rboxGeo(0.05, 0.09, 0.07, 0.015), mDark, [0.075, 0.1, 0], [0, 0, 0.12]);
    B.add(skate, rboxGeo(0.21, 0.018, 0.116, 0.008), mT, [0.02, -0.035, 0]);
    B.add(skate, holderGeo.clone(), mHolder, [0, -0.055, 0]);
    B.add(skate, bladeGeo.clone(), mSteel, [0.01, -0.15, 0]);
    legs.push(hip); knees.push(knee);
  }
  breezerGeo.dispose(); bootGeo.dispose(); holderGeo.dispose(); bladeGeo.dispose();

  // ----- tronco -----
  const upper = new THREE.Group(); upper.position.y = HIP_Y; upper.rotation.z = LEAN; pose.add(upper);
  const torsoG = new THREE.Group(); torsoG.scale.set(0.72, 1, wide); upper.add(torsoG);
  // calção (parte de cima) por baixo da camisa
  B.add(torsoG, new THREE.LatheGeometry([[0.16, -0.12], [0.205, -0.07], [0.214, 0.02], [0.206, 0.1], [0.198, 0.16]].map(p => new THREE.Vector2(p[0], p[1])), 20), mP);
  // camisa: corpo, barra com duas listras e gola em V
  B.add(torsoG, new THREE.LatheGeometry(TORSO.map(p => new THREE.Vector2(p[0], p[1])), 22), mJ);
  B.add(torsoG, torsoBand(0.165, 0.205, 0.004), mT);
  B.add(torsoG, torsoBand(0.235, 0.26, 0.004), mT);
  B.add(torsoG, torsoBand(0.12, 0.13, 0.006), mT);
  for (const s of [-1, 1]) B.add(torsoG, rboxGeo(0.026, 0.12, 0.02, 0.008), mT, [torsoR(0.69) + 0.002, 0.69, s * 0.03], [s * 0.54, 0, 0.66]);
  B.add(torsoG, new THREE.CylinderGeometry(0.085, 0.1, 0.05, 16, 1, true), mT, [0.01, 0.745, 0]);
  // escudo no peito e nome/número nas costas acompanhando a curva do corpo
  const crest = new THREE.Mesh(torsoBand(0.39, 0.53, 0.007, Math.PI / 2 - 0.3, 0.6, 10), decalMat(crestTexture(team, kit.trim)));
  torsoG.add(crest);
  const back = new THREE.Mesh(torsoBand(0.24, 0.66, 0.007, Math.PI * 1.5 - 0.82, 1.64, 14), decalMat(backTexture(num, (name || '').split('. ').pop(), kit.numFill, kit.numStroke)));
  torsoG.add(back);
  // ombreiras por baixo da camisa
  const shG = new THREE.Group(); shG.scale.set(1, 1, wide); upper.add(shG);
  for (const s of [-1, 1]) B.add(shG, new THREE.SphereGeometry(0.135, 16, 12), mJ, [0.0, 0.615, s * 0.19], null, [1, 0.78, 1.05]);
  // números nos ombros
  for (const s of [-1, 1]) {
    const sn = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), decalMat(numberTexture(num, kit.numFill, kit.numStroke)));
    sn.position.set(0.02, 0.63 + 0.03, s * (0.3 * wide + 0.088)); sn.rotation.set(-0.36, s < 0 ? Math.PI : 0, 0, 'YXZ');
    upper.add(sn);
  }
  B.add(upper, new THREE.CylinderGeometry(0.062, 0.072, 0.13, 12), mSkin, [0.035, 0.785, 0]);

  // ----- cabeça e capacete -----
  const head = new THREE.Group(); head.position.set(0.06, 0.92, 0); head.rotation.z = -LEAN * 0.75; upper.add(head);
  B.add(head, new THREE.SphereGeometry(0.1, 18, 14), mSkin, [0.03, -0.035, 0], null, [1, 1.2, 0.9]);   // rosto
  B.add(head, new THREE.SphereGeometry(0.016, 8, 6), mSkin, [0.122, -0.038, 0], null, [0.9, 1.35, 0.85]); // nariz
  B.add(head, new THREE.SphereGeometry(0.046, 12, 8), mSkin, [0.062, -0.112, 0], null, [0.9, 0.62, 1.25]);  // queixo
  for (const s of [-1, 1]) B.add(head, new THREE.SphereGeometry(0.024, 10, 8), mSkin, [0.084, -0.062, s * 0.044], null, [0.8, 0.9, 1]); // maçãs do rosto
  // olhos, sobrancelhas, boca e barba: textura desenhada sobre a frente do rosto
  const faceG = new THREE.SphereGeometry(0.1015, 16, 12, Math.PI - 0.95, 1.9, 0.7, 1.6);
  const face = new THREE.Mesh(faceG, faceMat(skinCol, hairCol, hashStr('f' + name)));
  face.position.set(0.03, -0.035, 0); face.scale.set(1, 1.2, 0.9); head.add(face);
  B.add(head, new THREE.SphereGeometry(0.098, 14, 10), mHair, [-0.035, -0.05, 0], null, [1, 0.9, 0.98]); // nuca
  // casco: topo, parte de trás descendo até a nuca, protetores de orelha, respiros e viseira curva
  B.add(head, new THREE.SphereGeometry(0.128, 22, 14, 0, Math.PI * 2, 0, 1.72), mH, [-0.005, 0.028, 0], null, [1.08, 0.94, 0.97]);
  B.add(head, new THREE.SphereGeometry(0.128, 16, 10, -Math.PI / 2, Math.PI, 1.5, 0.75), mH, [-0.005, 0.028, 0], null, [1.08, 0.94, 0.97]);
  B.add(head, new THREE.CylinderGeometry(0.14, 0.14, 0.016, 22, 1, true), mT, [-0.005, 0.012, 0], null, [1.0, 1, 0.89]);
  for (const s of [-1, 1]) B.add(head, rboxGeo(0.07, 0.08, 0.026, 0.011), mH, [0.0, -0.045, s * 0.116]);
  for (let i = -1; i <= 1; i++) B.add(head, rboxGeo(0.065, 0.011, 0.014, 0.005), mDark, [-0.02, 0.143, i * 0.038], [0, 0, 0.15]);
  B.add(head, new THREE.TorusGeometry(0.095, 0.0055, 5, 18, Math.PI), mDark, [0.035, -0.07, 0], [0, Math.PI / 2, Math.PI]);  // jugular
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.143, 0.139, 0.07, 20, 1, true, Math.PI / 2 - 1.0, 2.0), mVisor);
  visor.position.set(0.0, -0.012, 0); visor.scale.set(1.0, 1, 0.92); visor.renderOrder = 2; head.add(visor);

  // ----- taco (pivô na mão de cima) -----
  const bladeRoot = new THREE.Vector3(0.85, 0.035, 0.3 * hand);
  const topRoot = new THREE.Vector3(0.3, 1.08, -0.14 * hand);
  const topL = toUpper(topRoot), bladeL = toUpper(bladeRoot);
  const stick = new THREE.Group(); stick.position.copy(topL); upper.add(stick);
  const rel = bladeL.clone().sub(topL), dirN = rel.clone().normalize();
  const butt = dirN.clone().multiplyScalar(-0.1);
  const shaft = limb(butt, rel, 0.03, mStick); shaft.scale.set(1, 1, 0.72); B.addMesh(stick, shaft);
  const knob = limb(butt.clone().addScaledVector(dirN, -0.01), butt.clone().addScaledVector(dirN, 0.1), 0.038, mTape); B.addMesh(stick, knob);
  const gfxCol = lam(team.accent && team.accent !== '#ffffff' ? team.accent : '#d8dde3');
  for (const [t0, t1] of [[0.18, 0.26], [0.5, 0.53]]) B.addMesh(stick, limb(rel.clone().multiplyScalar(t0), rel.clone().multiplyScalar(t1), 0.0335, gfxCol));
  // lâmina com fita (deitada no gelo apesar da inclinação do tronco)
  const bladeG = new THREE.Group(); bladeG.position.copy(rel); bladeG.rotation.z = -LEAN; stick.add(bladeG);
  B.add(bladeG, profileGeo([[-0.02, -0.035], [0.25, -0.037], [0.29, -0.03, 0.292, 0.0], [0.285, 0.03, 0.25, 0.032], [0.02, 0.04], [-0.03, 0.035, -0.03, 0.0], [-0.03, -0.03, -0.02, -0.035]], 0.016, 0.004), mStick, [0.0, 0, 0]);
  B.add(bladeG, rboxGeo(0.17, 0.066, 0.02, 0.006), (L.tape != null ? L.tape === 0 : hashStr('t' + name) < 0.5) ? mTape : mTapeB, [0.13, 0.001, 0]);
  const botLocal = rel.clone().multiplyScalar(0.42);
  // luvas (a mão que segura o taco): dorso arredondado, rolos dos dedos, polegar e palma
  const mGlove = lam(kit.trim), mGlove2 = lam(kit.jersey);
  const gloveTop = new THREE.Group(); stick.add(gloveTop);
  const gloveBot = new THREE.Group(); gloveBot.position.copy(botLocal); stick.add(gloveBot);
  for (const gl of [gloveTop, gloveBot]) {
    B.add(gl, rboxGeo(0.13, 0.115, 0.125, 0.035), mGlove);
    for (let i = 0; i < 3; i++) B.add(gl, rboxGeo(0.045, 0.034, 0.13, 0.014), i === 1 ? mGlove2 : mGlove, [0.06, 0.04 - i * 0.038, 0]);
    B.add(gl, new THREE.CapsuleGeometry(0.022, 0.05, 4, 8), mGlove, [0.03, -0.065, 0.04], [0.6, 0, 0.9]);
  }

  // ----- braços articulados (atualizados por IK a cada quadro) -----
  // listras da manga (de cima = mão para baixo = cotovelo)
  const sleeveMat = stripeMat([[kit.jersey, 0.31], [kit.trim, 0.14], [kit.jersey, 0.06], [kit.trim, 0.07], [kit.jersey, 0.42]], shadows);
  const cuffMat = stripeMat([[kit.trim, 0.55], [kit.jersey, 0.18], [kit.trim, 0.27]]);
  const arms = [];
  for (const which of ['top', 'bot']) {
    const side = which === 'top' ? -hand : hand;
    const up = cyl(0.079, 0.092, 1, mJ, 14), fore = cyl(0.068, 0.08, 1, sleeveMat, 14);
    const elbow = sph(0.08, mJ, 1, 1, 1); const pad = sph(0.096, mJ, 1, 0.86, 1);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.076, 1, 14), cuffMat);
    upper.add(up); upper.add(fore); upper.add(elbow); upper.add(pad); upper.add(cuff);
    arms.push({ which, S: new THREE.Vector3(0.02, 0.63, side * 0.3 * wide), up, fore, elbow, pad, cuff, hint: new THREE.Vector3(-0.4, -0.6, side * 0.8), E: new THREE.Vector3() });
  }
  B.build();
  shadowAll(root, shadows);
  visor.castShadow = false;
  const m = { root, pose, legs, knees, upper, stick, stickBase: stick.position.clone(), head, arms, botLocal, kind: 'skater' };
  updateArms(m);
  return m;
}

const _hand = new THREE.Vector3(), _cuffEnd = new THREE.Vector3();
function updateArms(m) {
  m.stick.updateMatrix();
  for (const a of m.arms) {
    _hand.set(0, 0, 0);
    if (a.which === 'bot') _hand.copy(m.botLocal);
    _hand.applyMatrix4(m.stick.matrix);
    elbowIK(a.S, _hand, 0.3, 0.3, a.hint, a.E);
    setSeg(a.up, a.S, a.E); setSeg(a.fore, a.E, _hand);
    a.elbow.position.copy(a.E); a.pad.position.copy(a.S);
    // punho da luva: do pulso em direção ao cotovelo, comprimento fixo
    _cuffEnd.subVectors(a.E, _hand).normalize().multiplyScalar(0.17).add(_hand);
    setSeg(a.cuff, _hand, _cuffEnd);
  }
}
// IK de dois ossos: devolve o cotovelo entre ombro S e mão H.
const _tmp = new THREE.Vector3(), _tmp2 = new THREE.Vector3();
function elbowIK(S, H, l1, l2, hint, out) {
  const dir = _tmp.subVectors(H, S); let d = dir.length();
  d = Math.min(d, l1 + l2 - 0.001); dir.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const bend = _tmp2.copy(hint).addScaledVector(dir, -hint.dot(dir)).normalize();
  return out.copy(S).addScaledVector(dir, a).addScaledVector(bend, h);
}

// ---------- goleiro ----------
// textura da frente da caneleira: base branca com blocos nas cores do time e canais verticais
function padTexture(team) {
  const key = 'pad' + team.id;
  if (_crestCache[key]) return _crestCache[key];
  const c = makeCanvas(128, 512), g = c.getContext('2d');
  g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, 128, 512);
  g.fillStyle = team.primary; g.fillRect(0, 0, 128, 64); g.fillRect(0, 150, 128, 46); g.fillRect(0, 440, 128, 72);
  g.fillStyle = team.secondary; g.fillRect(0, 64, 128, 10); g.fillRect(0, 196, 128, 8); g.fillRect(0, 430, 128, 10);
  g.beginPath(); g.moveTo(0, 330); g.lineTo(128, 270); g.lineTo(128, 300); g.lineTo(0, 360); g.fillStyle = team.primary; g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2;
  for (const x of [32, 64, 96]) { g.beginPath(); g.moveTo(x, 210); g.lineTo(x, 430); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return (_crestCache[key] = t);
}
function blockerTexture(team) {
  const key = 'blk' + team.id;
  if (_crestCache[key]) return _crestCache[key];
  const c = makeCanvas(128, 192), g = c.getContext('2d');
  g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, 128, 192);
  g.fillStyle = team.primary; g.fillRect(0, 0, 128, 26); g.fillRect(0, 166, 128, 26);
  g.beginPath(); g.arc(64, 96, 34, 0, 6.29); g.fillStyle = team.primary; g.fill();
  g.beginPath(); g.arc(64, 96, 34, 0, 6.29); g.lineWidth = 6; g.strokeStyle = team.secondary; g.stroke();
  g.fillStyle = '#fff'; g.font = '900 26px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(team.id, 64, 98, 60);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return (_crestCache[key] = t);
}
// pintura da máscara (mapeada na esfera: u = 0 atrás, 0,25 lado +z, 0,5 frente, 0,75 lado -z)
function maskTexture(team, num, base) {
  const c = makeCanvas(512, 256), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 512, 256);
  g.fillStyle = team.primary;
  g.beginPath(); g.moveTo(0, 40); g.bezierCurveTo(140, 0, 370, 0, 512, 40); g.lineTo(512, 92); g.bezierCurveTo(370, 50, 140, 50, 0, 92); g.fill();
  g.fillStyle = team.secondary;
  g.beginPath(); g.moveTo(0, 92); g.bezierCurveTo(140, 50, 370, 50, 512, 92); g.lineTo(512, 106); g.bezierCurveTo(370, 66, 140, 66, 0, 106); g.fill();
  g.font = '900 54px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = team.secondary; g.fillStyle = team.primary;
  for (const x of [128, 384]) { g.strokeText(String(num), x, 160); g.fillText(String(num), x, 160); }
  return new THREE.CanvasTexture(c);
}
// caixa arredondada com a textura só na face da frente (+x)
function frontTexturedBox(w, h, d, r, tex) {
  const geo = rboxGeo(w, h, d, r);       // frente w x h, espessura d (extrusão em z)
  geo.rotateY(Math.PI / 2);              // a tampa da frente passa a olhar para +x
  const front = new THREE.MeshLambertMaterial({ map: tex });
  const b = Math.min(r, w / 2, h / 2, d / 2) * 0.7;
  tex.repeat.set(1 / (w - 2 * b), 1 / (h - 2 * b)); tex.offset.set(0.5, 0.5);
  return new THREE.Mesh(geo, front);
}

function makeGoalieModel(kit, num, shadows, name) {
  const team = kit.team || { id: '', primary: kit.jersey, secondary: kit.trim, accent: kit.numStroke };
  const mJ = lam(kit.jersey), mT = lam(kit.trim), mP = lam(kit.pants), mPad = lam(0xf4f4f4);
  const mBlack = gloss(0x141414, 40), mSteel = gloss(0xdfe6ee, 120, { specular: 0x999999 }), mCage = gloss(0x2a2a2a, 90);
  const mStick = gloss(0xe9e3d3, 30), mTapeB = lam(0x161616), mTape = lam(0xf4f4f4), mDark = lam(0x2a2a2a);
  const B = new PartBuilder();
  const root = new THREE.Group();
  const pose = new THREE.Group(); root.add(pose);
  const legs = [];
  const padTex = padTexture(team);
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0, 0.8, 0.17 * s); pose.add(hip);
    // caneleira: corpo arredondado com o desenho do time na frente, rolos do joelho e "boot" sobre o patins
    const t = padTex.clone(); t.needsUpdate = true;
    const pad = frontTexturedBox(0.27, 0.84, 0.25, 0.05, t); pad.position.set(0.08, -0.38, 0); B.addMesh(hip, pad);
    B.add(hip, new THREE.CapsuleGeometry(0.06, 0.2, 4, 10), mT, [0.21, -0.14, 0], [Math.PI / 2, 0, 0]);
    B.add(hip, new THREE.CapsuleGeometry(0.05, 0.19, 4, 10), mPad, [0.21, -0.26, 0], [Math.PI / 2, 0, 0]);
    B.add(hip, rboxGeo(0.12, 0.3, 0.22, 0.04), mPad, [-0.02, -0.12, s * 0.02]);      // aba da coxa
    B.add(hip, rboxGeo(0.3, 0.08, 0.27, 0.03), mPad, [0.1, -0.77, 0]);               // ponta sobre o patins
    // patins de goleiro (carcaça baixa) e lâmina
    B.add(hip, rboxGeo(0.3, 0.07, 0.12, 0.025), mBlack, [0.06, -0.82, 0]);
    B.add(hip, rboxGeo(0.33, 0.03, 0.02, 0.008), mSteel, [0.06, -0.87, 0]);
    legs.push(hip);
  }
  const upper = new THREE.Group(); upper.position.y = 0.85; upper.rotation.z = -0.18; pose.add(upper);
  // calça larga, colete volumoso por baixo da camisa e ombros altos
  B.add(upper, new THREE.LatheGeometry([[0.2, -0.12], [0.25, -0.06], [0.258, 0.03], [0.236, 0.115], [0.215, 0.18]].map(p => new THREE.Vector2(p[0], p[1])), 20), mP, null, null, [0.82, 1, 1.22]);
  B.add(upper, new THREE.LatheGeometry([[0.27, 0.12], [0.3, 0.22], [0.335, 0.4], [0.355, 0.56], [0.34, 0.7], [0.27, 0.8], [0.12, 0.84], [0.08, 0.845]].map(p => new THREE.Vector2(p[0], p[1])), 22), mJ, null, null, [0.8, 1, 1.12]);
  B.add(upper, new THREE.CylinderGeometry(0.306, 0.302, 0.07, 22, 1, true), mT, [0, 0.27, 0], null, [0.81, 1, 1.13]);
  B.add(upper, new THREE.CylinderGeometry(0.32, 0.315, 0.035, 22, 1, true), mT, [0, 0.335, 0], null, [0.81, 1, 1.13]);
  for (const s of [-1, 1]) B.add(upper, new THREE.SphereGeometry(0.17, 16, 12), mJ, [0, 0.72, s * 0.27], null, [1, 0.8, 1.05]);
  const crest = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), decalMat(crestTexture(team, kit.trim)));
  crest.position.set(0.296, 0.5, 0); crest.rotation.y = Math.PI / 2; upper.add(crest);
  const numP = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), decalMat(numberTexture(num, kit.numFill, kit.numStroke)));
  numP.position.set(-0.296, 0.5, 0); numP.rotation.y = -Math.PI / 2; upper.add(numP);
  // máscara pintada, queixo, placa de trás e grade "olho de gato"
  const head = new THREE.Group(); head.position.set(0.05, 0.98, 0); upper.add(head);
  const mMask = new THREE.MeshPhongMaterial({ map: maskTexture(team, num, kit.helmet), shininess: 90, specular: 0x555555 });
  // casco com abertura na frente (a testa é uma peça à parte), para ver o rosto atrás da grade
  B.add(head, new THREE.SphereGeometry(0.15, 24, 16, Math.PI + 0.7, Math.PI * 2 - 1.4), mMask, null, null, [1.12, 1.08, 1]);
  B.add(head, new THREE.SphereGeometry(0.15, 12, 8, Math.PI - 0.72, 1.44, 0, 1.05), mMask, null, null, [1.12, 1.08, 1]);
  B.add(head, new THREE.SphereGeometry(0.1, 16, 12), mMask, [0.085, -0.11, 0], null, [1.05, 0.85, 1]);
  B.add(head, rboxGeo(0.05, 0.13, 0.16, 0.02), mDark, [-0.165, 0.0, 0]);
  B.add(head, new THREE.SphereGeometry(0.11, 14, 10), lam(0x111111), [0.06, -0.02, 0], null, [1, 1, 0.95]);   // rosto escuro atrás da grade
  for (let i = 0; i < 5; i++) {
    const y = -0.11 + i * 0.045, rr = 0.15 - Math.abs(i - 2) * 0.012;
    B.add(head, new THREE.TorusGeometry(rr, 0.0065, 5, 16, 1.7), mCage, [0.03, y, 0], [Math.PI / 2, 0, -0.85]);
  }
  for (const z of [-0.05, 0.0, 0.05]) B.add(head, new THREE.CylinderGeometry(0.006, 0.006, 0.2, 5), mCage, [0.175 - Math.abs(z) * 0.3, -0.02, z], [0, 0, 0.12]);
  // braços, pegador (luva) e blocker
  const arms = new THREE.Group(); upper.add(arms);
  const capsuleSeg = (a, b, r) => {
    const v = new THREE.Vector3().subVectors(b, a), len = v.length();
    const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 10);
    const q = new THREE.Quaternion().setFromUnitVectors(_Y, v.clone().normalize());
    g.applyQuaternion(q); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return g;
  };
  B.add(arms, capsuleSeg(new THREE.Vector3(0.02, 0.72, -0.38), new THREE.Vector3(0.2, 0.46, -0.5), 0.09), mJ);
  B.add(arms, capsuleSeg(new THREE.Vector3(0.2, 0.46, -0.5), new THREE.Vector3(0.36, 0.38, -0.53), 0.08), mJ);
  B.add(arms, capsuleSeg(new THREE.Vector3(0.02, 0.72, 0.38), new THREE.Vector3(0.2, 0.43, 0.5), 0.09), mJ);
  B.add(arms, capsuleSeg(new THREE.Vector3(0.2, 0.43, 0.5), new THREE.Vector3(0.36, 0.3, 0.53), 0.08), mJ);
  // pegador: punho, corpo largo com bolso colorido e rolos na borda
  B.add(arms, rboxGeo(0.13, 0.15, 0.17, 0.04), mPad, [0.36, 0.3, -0.55]);
  B.add(arms, new THREE.CylinderGeometry(0.19, 0.17, 0.085, 22), mPad, [0.45, 0.42, -0.56], [0, 0, Math.PI / 2]);
  B.add(arms, new THREE.CylinderGeometry(0.12, 0.12, 0.09, 20), mT, [0.462, 0.43, -0.56], [0, 0, Math.PI / 2]);
  B.add(arms, new THREE.TorusGeometry(0.18, 0.025, 6, 22, Math.PI * 1.25), mT, [0.45, 0.42, -0.56], [0, Math.PI / 2, -0.4]);
  B.add(arms, rboxGeo(0.05, 0.12, 0.03, 0.01), mDark, [0.5, 0.5, -0.56]);           // trava em "T"
  B.add(arms, rboxGeo(0.05, 0.03, 0.14, 0.01), mDark, [0.5, 0.56, -0.56]);
  // blocker: placa com desenho do time na frente e a mão atrás
  const blk = frontTexturedBox(0.27, 0.42, 0.06, 0.025, blockerTexture(team));
  blk.position.set(0.45, 0.27, 0.56); B.addMesh(arms, blk);
  B.add(arms, rboxGeo(0.11, 0.12, 0.14, 0.035), mT, [0.38, 0.27, 0.52]);
  // taco do goleiro: cabo, pá larga, lâmina com fita e manopla
  const stick = new THREE.Group(); stick.position.set(0.42, 0.22, 0.5); upper.add(stick);
  B.addMesh(stick, limb(new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(0.16, -0.5, -0.24), 0.038, mStick));
  B.addMesh(stick, limb(new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(0.02, 0.04, -0.03), 0.045, mTapeB));
  B.add(stick, rboxGeo(0.07, 0.38, 0.075, 0.015), mStick, [0.19, -0.66, -0.29]);
  B.add(stick, rboxGeo(0.44, 0.1, 0.035, 0.015), mStick, [0.39, -0.82, -0.32]);
  B.add(stick, rboxGeo(0.25, 0.104, 0.039, 0.012), mTape, [0.42, -0.82, -0.32]);
  B.build();
  shadowAll(root, shadows);
  return { root, pose, legs, upper, stick, arms, head, kind: 'goalie' };
}

function makePuckModel(shadows) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.045, 20), gloss(0x0c0c0c, 40));
  m.castShadow = shadows; g.add(m);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0655, 0.0655, 0.022, 20, 1, true), lam(0x1d1d1d));
  g.add(band);
  return g;
}

function makeRing(color) {
  const g = new THREE.Group();
  const r = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
  r.rotation.x = -Math.PI / 2; g.add(r);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 3), new THREE.MeshBasicMaterial({ color }));
  arrow.rotation.z = Math.PI; arrow.position.y = 2.35; g.add(arrow);
  g.position.y = 0.015; g.renderOrder = 2;
  return g;
}
