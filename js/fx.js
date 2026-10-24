'use strict';
// ===== Efeitos visuais: reflexo do gelo, spray de gelo, marcas de patins e telão =====

// Reflexo planar no gelo (renderiza a cena por uma câmera espelhada e projeta no gelo).
class IceReflection {
  constructor(ice, strength, hide = []) {
    this.ice = ice; this.hide = hide; this.vis = [];
    this.rt = new THREE.WebGLRenderTarget(512, 512);
    this.cam = new THREE.PerspectiveCamera();
    this.texMat = new THREE.Matrix4();
    this.size = new THREE.Vector2(); this.v = new THREE.Vector3(); this.up = new THREE.Vector3();
    // só reflete o que está perto do gelo (jogadores, tabelas, vidro); arquibancada e teto ficam de fora
    this.clip = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 4.2)];
    this.clearCol = new THREE.Color();
    const self = this;
    ice.material.onBeforeCompile = sh => {
      sh.uniforms.reflMap = { value: self.rt.texture };
      sh.uniforms.texMat = { value: self.texMat };
      sh.uniforms.reflStr = { value: strength };
      self.u = sh.uniforms;
      sh.vertexShader = 'uniform mat4 texMat;\nvarying vec4 vRefl;\n' + sh.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n  vRefl = texMat * modelMatrix * vec4(transformed, 1.0);');
      sh.fragmentShader = 'uniform sampler2D reflMap;\nuniform float reflStr;\nvarying vec4 vRefl;\n' + sh.fragmentShader.replace('#include <output_fragment>',
        '#include <output_fragment>\n  { vec4 rc = texture2DProj(reflMap, vRefl);\n' +
        // o alfa do reflexo é a máscara: onde nada foi refletido o gelo fica intacto; fresnel reforça em ângulo rasante
        '    float fr = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.0);\n' +
        '    gl_FragColor.rgb = mix(gl_FragColor.rgb, rc.rgb * 1.08, clamp(rc.a, 0.0, 1.0) * reflStr * (0.55 + 0.45 * fr)); }');
    };
    ice.material.needsUpdate = true;
  }
  render(renderer, scene, camera) {
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(256, Math.floor(this.size.x / 2)), h = Math.max(256, Math.floor(this.size.y / 2));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    const c = this.cam;
    camera.getWorldDirection(this.v);
    const p = camera.position;
    c.position.set(p.x, -p.y, p.z);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion); this.up.y = -this.up.y;
    c.up.copy(this.up);
    c.lookAt(p.x + this.v.x, -(p.y + this.v.y), p.z + this.v.z);
    c.updateMatrixWorld();
    c.projectionMatrix.copy(camera.projectionMatrix);
    this.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.texMat.multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
    const auto = renderer.shadowMap.autoUpdate, bg = scene.background, clip = renderer.clippingPlanes;
    const clearA = renderer.getClearAlpha(); renderer.getClearColor(this.clearCol);
    renderer.shadowMap.autoUpdate = false;
    this.hide.forEach((m, i) => { this.vis[i] = m.visible; m.visible = false; });
    this.ice.visible = false; scene.background = null; renderer.clippingPlanes = this.clip;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(scene, c);
    renderer.setRenderTarget(null);
    renderer.setClearColor(this.clearCol, clearA);
    this.hide.forEach((m, i) => { m.visible = this.vis[i]; });
    this.ice.visible = true; scene.background = bg; renderer.clippingPlanes = clip;
    renderer.shadowMap.autoUpdate = auto;
  }
  dispose() { this.rt.dispose(); }
}

// Partículas de gelo (spray das freadas e dos chutes).
class IceSpray {
  constructor(scene, n = 600) {
    this.n = n; this.next = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n).fill(1); this.alpha = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 500 } }, transparent: true, depthWrite: false,
      vertexShader: 'uniform float scale; attribute float alpha; varying float vA;\n' +
        'void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 0.09 * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA;\nvoid main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5 || vA <= 0.0) discard; gl_FragColor = vec4(0.92, 0.96, 1.0, vA * (1.0 - d * 1.6)); }',
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 3;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, spread, count, life = 0.6) {
    for (let k = 0; k < count; k++) {
      const i = this.next; this.next = (this.next + 1) % this.n;
      this.pos[i * 3] = x + (Math.random() - 0.5) * 0.2; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.2;
      this.vel[i * 3] = vx + (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 1] = vy * (0.4 + Math.random() * 0.8);
      this.vel[i * 3 + 2] = vz + (Math.random() - 0.5) * spread;
      this.life[i] = this.max[i] = life * (0.6 + Math.random() * 0.6);
    }
  }
  update(dt, camera) {
    this.mat.uniforms.scale.value = innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const j = i * 3;
      V[j + 1] -= 6 * dt;
      V[j] *= 1 - dt * 2.5; V[j + 2] *= 1 - dt * 2.5;
      P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt;
      if (P[j + 1] < 0.02) { P[j + 1] = 0.02; V[j + 1] = 0; V[j] *= 0.6; V[j + 2] *= 0.6; }
      this.alpha[i] = Math.max(0, this.life[i] / this.max[i]) * 0.85;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.alpha.needsUpdate = true;
  }
}

// Marcas de patins: riscos desenhados direto na textura do gelo ao longo da partida.
class IceMarks {
  constructor(tex) {
    this.tex = tex; this.g = tex.image.getContext('2d'); this.S = 20;
    this.last = new Map(); this.t = 0; this.dirty = false;
  }
  X(x) { return (x + HALF_L) * this.S; }
  Z(z) { return (z + HALF_W) * this.S; }
  line(x1, z1, x2, z2, w, a, col = '120,140,160') {
    const g = this.g;
    g.strokeStyle = `rgba(${col},${a})`; g.lineWidth = w;
    g.beginPath(); g.moveTo(this.X(x1), this.Z(z1)); g.lineTo(this.X(x2), this.Z(z2)); g.stroke();
    this.dirty = true;
  }
  update(dt, bodies) {
    for (const s of bodies) {
      if (!s.active) continue;
      const prev = this.last.get(s);
      if (!prev) { this.last.set(s, { x: s.x, z: s.z }); continue; }
      const d = Math.hypot(s.x - prev.x, s.z - prev.z);
      if (d > 3) { prev.x = s.x; prev.z = s.z; continue; } // teleporte (faceoff)
      if (d < 0.5) continue;
      const lx = -Math.sin(s.h) * 0.12, lz = Math.cos(s.h) * 0.12;
      const braking = s.brakeV > 0.3;
      for (const sg of [-1, 1]) this.line(prev.x + lx * sg, prev.z + lz * sg, s.x + lx * sg, s.z + lz * sg, braking ? 4 : 1, braking ? 0.1 : 0.05, braking ? '210,225,240' : '120,140,160');
      prev.x = s.x; prev.z = s.z;
    }
    this.t += dt;
    if (this.dirty && this.t > 0.5) { this.tex.needsUpdate = true; this.t = 0; this.dirty = false; }
  }
}

// Telão central: transmissão ao vivo (câmera de TV em close renderizada numa textura) + faixa de placar.
class Jumbotron {
  constructor(j, high) {
    this.j = j; this.every = high ? 2 : 4; this.frame = 0;
    this.rt = new THREE.WebGLRenderTarget(high ? 768 : 448, high ? 432 : 252);
    this.cam = new THREE.PerspectiveCamera(24, 16 / 9, 0.5, 200);
    this.fx = 0; this.fz = 0;
    j.screenMat.map = this.rt.texture; j.screenMat.color.set(0xffffff); j.screenMat.needsUpdate = true;
    // faixa de placar
    this.c = makeCanvas(1024, 134); this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c);
    j.stripMat.map = this.tex; j.stripMat.color.set(0xffffff); j.stripMat.needsUpdate = true;
    // tela de "GOL!" que pisca no lugar da transmissão
    this.gc = makeCanvas(512, 288); this.gtex = new THREE.CanvasTexture(this.gc);
    this.t = 1; this.key = ''; this.goalOn = false;
  }
  update(dt, game) {
    // câmera de TV: segue o disco de longe com zoom (fica do lado da câmera principal)
    const p = game.puck.pos, k = Math.min(1, dt * 2.5);
    this.fx += (p.x - this.fx) * k; this.fz += (p.z - this.fz) * k;
    this.cam.position.set(this.fx * 0.8, 10, HALF_W + 7);
    this.cam.lookAt(this.fx, 0.7, this.fz * 0.85);
    this.t += dt; if (this.t < 0.25) return; this.t = 0;
    const [a, b] = game.teams;
    const goal = game.state === 'goal', blink = Math.floor(game.time * 4) % 2;
    const key = [a.score, b.score, Math.ceil(game.clock), game.period, goal, blink].join('|');
    if (key === this.key) return; this.key = key;
    // no gol a tela alterna entre o replay ao vivo e o "GOL!" na cor do time
    const showGoal = goal && blink;
    if (showGoal) {
      const T = game.goals.length ? game.goals[game.goals.length - 1].team : a, g = this.gc.getContext('2d');
      g.fillStyle = T.data.primary; g.fillRect(0, 0, 512, 288);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 130px Arial Black, Arial'; g.fillText('GOL!', 256, 130);
      g.font = '900 36px Arial Black, Arial'; g.fillText(T.data.name.toUpperCase(), 256, 230, 480);
      this.gtex.needsUpdate = true;
    }
    if (showGoal !== this.goalOn) {
      this.goalOn = showGoal; this.j.screenMat.map = showGoal ? this.gtex : this.rt.texture; this.j.screenMat.needsUpdate = true;
    }
    const g = this.g;
    g.fillStyle = '#05070c'; g.fillRect(0, 0, 1024, 134);
    g.textBaseline = 'middle';
    // selo "AO VIVO"
    g.fillStyle = '#d0021b'; g.fillRect(14, 37, 150, 60);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(40, 67, 9, 0, 6.29); g.fill();
    g.font = '900 30px Arial Black, Arial'; g.textAlign = 'left'; g.fillText('AO VIVO', 56, 69);
    for (const [t, x] of [[a, 190], [b, 470]]) {
      g.fillStyle = t.data.primary; g.fillRect(x, 22, 170, 90);
      g.fillStyle = '#fff'; g.font = '900 52px Arial Black, Arial'; g.textAlign = 'center'; g.fillText(t.data.id, x + 85, 69);
      g.font = '900 78px Arial Black, Arial'; g.fillText(String(t.score), x + 225, 72);
    }
    g.fillStyle = '#ffd400'; g.font = '700 46px Arial'; g.textAlign = 'center';
    g.fillText(`${game.ot ? 'PR' : game.period + 'º'}  ${fmtClock(game.clock)}`, 880, 69);
    this.tex.needsUpdate = true;
  }
  render(renderer, scene, refl) {
    if (++this.frame % this.every) return;
    const auto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    // as telas não podem aparecer na própria transmissão (loop de textura) e o reflexo é da câmera principal
    this.j.screens.forEach(m => { m.visible = false; });
    const rs = refl && refl.u ? refl.u.reflStr.value : 0;
    if (refl && refl.u) refl.u.reflStr.value = 0;
    renderer.setRenderTarget(this.rt); renderer.render(scene, this.cam); renderer.setRenderTarget(null);
    if (refl && refl.u) refl.u.reflStr.value = rs;
    this.j.screens.forEach(m => { m.visible = true; });
    renderer.shadowMap.autoUpdate = auto;
  }
  fade(camera, dt) {
    const grp = this.j.group, v = this.v || (this.v = new THREE.Vector3());
    if (!this.mats) {
      this.mats = []; this.alpha = 1;
      grp.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        if (this.mats.includes(m)) return;
        m.userData.op0 = m.opacity; m.userData.tr0 = m.transparent; this.mats.push(m);
      }); });
    }
    // projeta os cantos da caixa do telão: se algum cair na parte de baixo da tela (onde está o jogo), esconde
    let block = false;
    if (grp.parent && grp.parent.visible) {
      const b = this.j.box;
      for (let k = 0; k < 8 && !block; k++) {
        v.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).project(camera);
        if (v.z < 1 && Math.abs(v.x) < 1.15 && v.y < 0.8 && v.y > -1.2) block = true;
      }
    }
    const target = block ? 0 : 1, prev = this.alpha;
    this.alpha += (target - this.alpha) * Math.min(1, dt * 6);
    if (Math.abs(target - this.alpha) < 0.01) this.alpha = target;
    if (this.alpha === prev) return;
    const tr = this.alpha < 1;
    this.mats.forEach(m => {
      m.opacity = m.userData.op0 * this.alpha;
      const t = m.userData.tr0 || tr;
      if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; }
    });
    grp.visible = this.alpha > 0;
  }
  dispose() { this.rt.dispose(); }
}
