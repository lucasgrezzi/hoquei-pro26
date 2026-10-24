'use strict';
let SHOT_ID = 0;

class Puck {
  constructor(scene, shadows) {
    this.mesh = makePuckModel(shadows); scene.add(this.mesh);
    this.shadow = makeBlobShadow(0.3); scene.add(this.shadow);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.reset(0, 0);
  }
  reset(x, z, y = 0) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0);
    this.owner = null; this.held = null; this.inNet = 0; this.shot = null;
    this.passTarget = null; this.passT = 0; this.lastTouch = null; this.icingTeam = null;
  }
  updateMesh() {
    this.mesh.position.set(this.pos.x, this.pos.y + 0.0225, this.pos.z);
    this.shadow.position.set(this.pos.x, 0.012, this.pos.z);
    const s = Math.max(0.4, 1 - this.pos.y * 0.25); this.shadow.scale.set(s, s, s);
  }
}

class Skater {
  constructor(game, team, data, kit, shadows) {
    this.game = game; this.team = team; this.data = data;
    this.role = data.pos; this.r = data.r; this.name = data.name; this.num = data.num; this.hand = data.hand;
    this.isGoalie = false; this.rad = SKATER_R;
    this.x = 0; this.z = 0; this.vx = 0; this.vz = 0; this.h = 0; this.hv = 0;
    this.stamina = 1; this.stun = 0; this.stunMax = 0;
    this.checkT = 0; this.pokeT = 0; this.dekeT = 0; this.swing = 0; this.sprayCd = 0;
    this.cd = { check: 0, poke: 0, deke: 0 }; this.pickupCd = 0;
    this.charge = -1; this.passHold = -1;
    this.intent = { mx: 0, mz: 0, sprint: false };
    this.faceTarget = null; this.human = null; this.active = true;
    this.aiT = Math.random() * 0.3; this.phase = Math.random() * 6; this.fall = 0;
    this.thrust = 0; this.brakeT = 0; this.brakeV = 0; this.crossV = 0; this.backV = 0;
    this.stats = { g: 0, a: 0, sog: 0, hits: 0 };
    this.model = makeSkaterModel(kit, this.num, this.hand, shadows, this.name, data.look);
    this.mesh = this.model.root; game.scene.add(this.mesh);
    this.shadow = makeBlobShadow(1.0); game.scene.add(this.shadow);
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  hasPuck() { return this.game.puck.owner === this; }
  setActive(on) { this.active = on; this.mesh.visible = on; this.shadow.visible = on; if (!on) { this.x = 0; this.z = -HALF_W - 4; } }

  blade() {
    const c = Math.cos(this.h), s = Math.sin(this.h);
    const side = this.dekeT > 0 ? -this.hand : this.hand;
    const wob = this.hasPuck() ? Math.sin(this.phase * 1.3) * 0.12 : 0;
    const f = 0.85, rz = 0.3 * side + wob;
    return { x: this.x + c * f - s * rz, z: this.z + s * f + c * rz };
  }

  update(dt) {
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] -= dt;
    if (this.pickupCd > 0) this.pickupCd -= dt;
    if (this.checkT > 0) this.checkT -= dt;
    if (this.pokeT > 0) this.pokeT -= dt;
    if (this.dekeT > 0) this.dekeT -= dt;
    if (this.sprayCd > 0) this.sprayCd -= dt;
    if (this.stun > 0) this.stun -= dt;
    const puck = this.game.puck;
    if (this.charge >= 0) {
      if (!this.hasPuck() && puck.passTarget !== this) this.charge = -1;
      else this.charge = Math.min(1, this.charge + dt / 0.85);
    }
    if (this.passHold >= 0) this.passHold = Math.min(0.6, this.passHold + dt);

    let mx = this.intent.mx, mz = this.intent.mz, ml = Math.hypot(mx, mz);
    if (this.stun > 0) { mx = mz = ml = 0; }
    if (ml > 1) { mx /= ml; mz /= ml; ml = 1; }
    const sp = this.speed;
    let maxS = 5.6 + this.r.spd * 0.033;
    const sprint = this.intent.sprint && ml > 0.3 && this.stamina > 0.05;
    if (sprint) { maxS *= 1.17; this.stamina = Math.max(0, this.stamina - dt * 0.1); }
    else this.stamina = Math.min(1, this.stamina + dt * (sp < 3 ? 0.09 : 0.045));
    maxS *= 0.8 + 0.2 * this.stamina;
    if (this.hasPuck()) maxS *= 0.94;
    if (this.charge > 0.1) maxS *= 0.85;
    if (ml > 0.05) {
      const dx = mx / ml, dz = mz / ml;
      if (this.faceTarget && Math.cos(this.h) * dx + Math.sin(this.h) * dz < -0.2) maxS *= 0.72; // patinando de costas
      const ts = maxS * ml;
      const ax = dx * ts - this.vx, az = dz * ts - this.vz, al = Math.hypot(ax, az);
      let acc = 6.2 + this.r.spd * 0.035;
      if (sp > 2.5 && (this.vx * dx + this.vz * dz) / sp < -0.3) {
        acc = 14; this.brakeT = 0.35; // freada (hockey stop)
        const fx = this.game.spray;
        if (fx && sp > 4 && Math.random() < dt * 40) {
          fx.emit(this.x + this.vx * 0.06, 0.05, this.z + this.vz * 0.06, this.vx * 0.9, 2.2, this.vz * 0.9, 2.5, 3, 0.55);
        }
        if (this.sprayCd <= 0 && sp > 5) { Sfx.spray(); this.sprayCd = 0.6; }
      }
      if (al > 0) { const k = Math.min(1, acc * dt / al); this.vx += ax * k; this.vz += az * k; }
    } else {
      const dec = (this.stun > 0 ? 4 : 1.4) * dt;
      if (sp > dec) { this.vx -= this.vx / sp * dec; this.vz -= this.vz / sp * dec; } else { this.vx = this.vz = 0; }
    }
    this.x += this.vx * dt; this.z += this.vz * dt;

    let th = this.h;
    if (this.faceTarget) th = Math.atan2(this.faceTarget.z - this.z, this.faceTarget.x - this.x);
    else if (ml > 0.05) th = Math.atan2(mz, mx);
    else if (sp > 1) th = Math.atan2(this.vz, this.vx);
    if (this.stun <= 0) {
      let d = angDiff(th, this.h); const rate = (sp > 6 ? 6 : 9) * dt;
      d = clamp(d, -rate, rate); this.hv = d / dt; this.h += d;
    } else this.hv = 0;
    if (this.brakeT > 0) this.brakeT -= dt;
    this.thrust += ((ml > 0.05 ? ml * (sprint ? 1 : 0.85) : 0) - this.thrust) * Math.min(1, dt * 6);
    this.phase += dt * (2 + sp * 1.1) * (0.45 + 0.55 * this.thrust);
  }

  updateModel(dt) {
    const m = this.model;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = -this.h;
    this.shadow.position.set(this.x, 0.012, this.z);
    const sp = this.speed, k8 = Math.min(1, dt * 8);
    const fx = Math.cos(this.h), fz = Math.sin(this.h);
    const fwdV = this.vx * fx + this.vz * fz;
    // estados de patinação (suavizados)
    this.brakeV += ((this.brakeT > 0 && sp > 2 ? 1 : 0) - this.brakeV) * Math.min(1, dt * 12);
    this.backV += ((sp > 1.2 && fwdV < -0.4 * sp ? 1 : 0) - this.backV) * k8;
    const turn = clamp(this.hv * sp / 22, -1, 1);
    this.crossV += (turn - this.crossV) * k8;
    const drive = clamp(this.thrust * 1.15, 0, 1);
    const stride = Math.min(1, sp / 7) * (0.2 + 0.8 * drive) * (1 - this.brakeV);
    const glide = 1 - drive;
    let ext = 0;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const ph = Math.sin(this.phase + i * Math.PI);
      const push = Math.max(0, ph) * stride, rec = Math.max(0, -ph) * stride;
      // passada para frente: empurra para fora/trás e estica; recolhe por baixo do corpo
      let out = 0.07 + 0.42 * push;
      let hipA = 0.5 - 0.55 * push + 0.25 * rec + 0.08 * glide;
      let kneeA = -(0.9 - 0.55 * push + 0.35 * rec + 0.15 * glide);
      // crossover: na curva a perna de fora cruza por cima da de dentro
      const cr = Math.abs(this.crossV);
      if (cr > 0.15 && side === -Math.sign(this.crossV)) out -= 0.75 * cr * Math.max(0, -ph);
      if (cr > 0.15 && side === Math.sign(this.crossV)) out += 0.25 * cr * Math.max(0, ph);
      // de costas: "C-cuts" (empurra para o lado, sem balançar para frente)
      const b = this.backV;
      if (b > 0.01) {
        const cc = Math.max(0, ph) * Math.min(1, sp / 5);
        out = lerp(out, 0.1 + 0.4 * cc, b); hipA = lerp(hipA, 0.6 + 0.15 * cc, b); kneeA = lerp(kneeA, -1.05 + 0.2 * cc, b);
      }
      // freada: base larga, joelhos bem flexionados
      const br = this.brakeV;
      if (br > 0.01) { out = lerp(out, 0.38, br); hipA = lerp(hipA, 0.75, br); kneeA = lerp(kneeA, -1.3, br); }
      m.legs[i].rotation.x = -side * out;
      m.legs[i].rotation.z = hipA;
      m.knees[i].rotation.z = kneeA;
      ext = Math.max(ext, (THIGH_L * Math.cos(hipA) + SHIN_L * Math.cos(hipA + kneeA)) * Math.cos(out));
    }
    m.pose.position.y = ext - HIP_Y;
    // tronco: inclinação, balanço dos ombros na passada e torção no chute
    const lean = LEAN - 0.14 * Math.min(1, sp / 7) * drive + 0.28 * this.brakeV + 0.12 * this.backV;
    m.upper.rotation.z += (lean + Math.sin(this.phase * 2) * 0.03 * stride - m.upper.rotation.z) * Math.min(1, dt * 10);
    let twist = Math.sin(this.phase) * 0.14 * stride;
    if (this.charge >= 0 && this.hasPuck()) twist = -0.55 * this.charge * this.hand;
    if (this.swing > 0) twist = 0.35 * this.swing * this.hand;
    if (this.brakeV > 0.01) twist = lerp(twist, 0.6 * this.hand, this.brakeV);
    m.upper.rotation.y += (twist - m.upper.rotation.y) * Math.min(1, dt * 12);
    const roll = clamp(this.hv * 0.05 * Math.min(1, sp / 6), -0.4, 0.4);
    const fallT = this.stun > 0 ? (this.stunMax > 1 ? 1.45 : 0.3) : 0;
    this.fall += (fallT - this.fall) * Math.min(1, dt * (fallT > this.fall ? 10 : 3));
    m.pose.rotation.x += (roll - m.pose.rotation.x) * k8;
    m.pose.rotation.z = this.fall;
    // cabeça acompanha o disco
    const P = this.game.puck.pos;
    const look = clamp(angDiff(Math.atan2(P.z - this.z, P.x - this.x), this.h), -0.9, 0.9);
    m.head.rotation.y += (-look - m.head.rotation.y) * Math.min(1, dt * 6);
    // taco
    const game = this.game;
    let st = Math.sin(this.phase * 1.3) * 0.05 * (this.hasPuck() ? 1 : 0.3), sy = 0;
    if (this.hasPuck()) { st += Math.sin(this.phase * 2.6) * 0.05; sy = Math.sin(this.phase * 1.3) * 0.25; } // stickhandling
    if (this.charge >= 0) st = this.hasPuck() ? -1.9 * this.charge : -0.7;
    if (this.swing > 0) { st = 0.9 * this.swing; this.swing = Math.max(0, this.swing - dt * 4); }
    if (this.dekeT > 0) sy = 0.6 * Math.sin(this.dekeT / 0.5 * Math.PI) * this.hand;
    if (game.state === 'goal' || (game.state === 'soEnd' && game.so.scored)) {
      if (game.celebrant === this) { st = 2.4 + Math.sin(game.time * 9) * 0.25; m.pose.rotation.x = Math.sin(game.time * 4) * 0.15; }
      else if (game.celebrant && game.celebrant.team === this.team) st = 1.1;
    }
    m.stick.rotation.z += (st - m.stick.rotation.z) * Math.min(1, dt * 22);
    m.stick.rotation.y += (sy - m.stick.rotation.y) * Math.min(1, dt * 18);
    const pokeOut = this.pokeT > 0 ? 0.45 : 0;
    m.stick.position.x += (m.stickBase.x + pokeOut - m.stick.position.x) * Math.min(1, dt * 25);
    updateArms(m);
  }

  // ---------- ações ----------
  release(vx, vy, vz, kind) {
    const p = this.game.puck, b = this.blade();
    p.owner = null;
    const c = clampToRink(b.x, b.z, PUCK_R + 0.02);
    p.pos.set(c.x, Math.max(0.01, p.pos.y), c.z); p.vel.set(vx, vy, vz);
    p.lastTouch = this; this.pickupCd = 0.35;
    this.game.onRelease(this, kind);
  }

  passTo(tgt, power) {
    const p = this.game.puck; if (p.owner !== this) return;
    const b = this.blade(), tb = tgt.blade();
    const d = Math.hypot(tb.x - b.x, tb.z - b.z);
    const spd = Math.min(23, 10 + d * 0.45 + power * 5);
    const t = d / spd;
    const tx = tb.x + tgt.vx * t * 0.9, tz = tb.z + tgt.vz * t * 0.9;
    let ang = Math.atan2(tz - b.z, tx - b.x);
    ang += gauss() * (1.05 - this.r.pass / 100) * 0.12 * this.team.aimMul;
    this.release(Math.cos(ang) * spd, 0, Math.sin(ang) * spd, 'pass');
    p.passTarget = tgt; p.passT = Math.min(2.5, t + 0.8);
    this.team.stats.passes++;
    Sfx.pass();
    if (this.human) this.game.switchHuman(this.human, tgt);
  }

  doPass(ax, az, power) {
    if (!this.hasPuck()) return;
    const tgt = this.game.bestPassTarget(this, ax, az);
    if (tgt) return this.passTo(tgt, power);
    let fx = ax, fz = az;
    if (Math.hypot(fx, fz) < 0.2) { fx = Math.cos(this.h); fz = Math.sin(this.h); }
    const l = Math.hypot(fx, fz), spd = 12 + power * 6;
    this.release(fx / l * spd, 0, fz / l * spd, 'pass'); Sfx.pass();
  }

  dumpTo(tx, tz, spd = 18) {
    if (!this.hasPuck()) return;
    const b = this.blade(), d = Math.hypot(tx - b.x, tz - b.z) || 1;
    this.release((tx - b.x) / d * spd, 2.2, (tz - b.z) / d * spd, 'dump');
    this.swing = 1; Sfx.stick(0.8);
  }

  doShoot(power, aimZ, oneTimer) {
    const p = this.game.puck; if (p.owner !== this) return;
    const dir = this.team.dir, nx = dir * GOAL_X, b = this.blade();
    const fx = Math.cos(this.h), fz = Math.sin(this.h);
    const dx = nx - b.x, dz = -b.z, dn = Math.hypot(dx, dz);
    const slap = power > 0.4;
    this.swing = 1;
    if ((fx * dx + fz * dz) / dn < -0.15 || b.x * dir > GOAL_X - 0.2) {
      // de costas para o gol: isola o disco na direção em que está virado
      const spd = 11 + power * 8;
      this.release(fx * spd, 1.2 + power * 2, fz * spd, 'clear'); Sfx.stick(0.6 + power * 0.4); return;
    }
    const g = this.game.goalieOf(this.team.opp);
    let tz;
    if (aimZ != null && Math.abs(aimZ) > 0.25) tz = Math.sign(aimZ) * 0.72;
    else tz = g.z > 0.08 ? -0.65 : g.z < -0.08 ? 0.65 : (Math.random() < 0.5 ? -0.65 : 0.65);
    let ty = slap ? 0.12 + Math.random() * 0.85 : 0.08 + Math.random() * 1.0;
    const acc = this.r.shot / 100;
    let err = (1.15 - acc) * 0.9 * (slap ? 0.8 + power * 0.6 : 0.8) * (0.6 + Math.min(1.4, dn / 15)) * (0.8 + Math.min(0.6, this.speed / 15));
    if (oneTimer) err *= 1.15;
    err *= this.team.aimMul;
    tz += gauss() * err * 0.5; ty += gauss() * err * 0.3; ty = clamp(ty, 0.03, 2.4);
    const spd = slap ? 26 + power * 8 + this.r.shot * 0.05 : 18 + this.r.shot * 0.09 + power * 4;
    const D = Math.hypot(nx - b.x, tz - b.z), t = D / spd;
    const vy = (ty - 0.03) / t + 0.5 * G * t;
    this.release((nx - b.x) / D * spd, vy, (tz - b.z) / D * spd, 'shot');
    p.shot = { by: this, team: this.team, t: 0, x0: b.x, z0: b.z, ty, slap, oneTimer: !!oneTimer, save: null, blocked: new Set(), id: ++SHOT_ID,
      deke: this.cd.deke > 0.55 && dn < 6 }; // chute logo depois de um drible, de perto
    this.team.stats.att++;
    Sfx.stick(slap ? 1.5 : 0.9);
    if (slap && this.game.spray) this.game.spray.emit(b.x, 0.05, b.z, (nx - b.x) / D * 3, 2.5, (tz - b.z) / D * 3, 3, 14, 0.5);
    if (dn < 18) { Sfx.swell(0.16, 0.6); this.game.cheer(this.team.idx, 0.4); }
  }

  doCheck() {
    if (this.cd.check > 0 || this.stun > 0) return;
    this.cd.check = 1.1; this.checkT = 0.35;
    this.vx += Math.cos(this.h) * 2.5; this.vz += Math.sin(this.h) * 2.5;
  }

  doPoke() {
    if (this.cd.poke > 0 || this.stun > 0) return;
    this.cd.poke = 0.7; this.pokeT = 0.25;
    const game = this.game, p = game.puck;
    const fx = Math.cos(this.h), fz = Math.sin(this.h);
    const ax = this.x + fx * 0.5, az = this.z + fz * 0.5, bx2 = this.x + fx * 1.9, bz2 = this.z + fz * 1.9;
    const o = p.owner;
    if (o && o.team !== this.team) {
      const b = o.blade();
      if (ptSegDist(b.x, b.z, ax, az, bx2, bz2) < 0.6) {
        const chance = 0.5 + (this.r.def - o.r.hands) / 120 - (o.dekeT > 0 ? 0.4 : 0);
        if (Math.random() < chance) {
          game.loosePuck(o, fx * 4 + (Math.random() - 0.5) * 3, fz * 4 + (Math.random() - 0.5) * 3);
          p.lastTouch = this; game.touch(this); Sfx.stick(0.5);
        }
      }
    } else if (!o && !p.held && p.pos.y < 0.3 && ptSegDist(p.pos.x, p.pos.z, ax, az, bx2, bz2) < 0.5) {
      p.vel.x += fx * 6; p.vel.z += fz * 6; p.lastTouch = this; game.touch(this); Sfx.stick(0.4);
    }
  }

  doDeke(mx, mz) {
    if (this.cd.deke > 0 || !this.hasPuck()) return;
    this.cd.deke = 1.3; this.dekeT = 0.5;
    let lx = -Math.sin(this.h), lz = Math.cos(this.h);
    if (lx * mx + lz * mz < 0) { lx = -lx; lz = -lz; }
    this.vx += lx * 2.2; this.vz += lz * 2.2;
    Sfx.stick(0.3);
  }
}

class Goalie {
  constructor(game, team, data, kit, shadows) {
    this.game = game; this.team = team; this.data = data;
    this.role = 'G'; this.r = data.r; this.name = data.name; this.num = data.num;
    this.isGoalie = true; this.rad = GOALIE_R; this.active = true;
    this.x = 0; this.z = 0; this.vx = 0; this.vz = 0; this.h = 0;
    this.tx = 0; this.tz = 0; this.idealX = 0; this.idealZ = 0; this.bf = 0; this.coverT = 0; this.saveAnim = 0;
    this.stats = { sa: 0, sv: 0 };
    this.model = makeGoalieModel(kit, this.num, shadows, this.name);
    this.mesh = this.model.root; game.scene.add(this.mesh);
    this.shadow = makeBlobShadow(1.3); game.scene.add(this.shadow);
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  netSide() { return -this.team.dir; }
  placeHome() {
    const s = this.netSide();
    this.x = this.tx = this.idealX = s * (GOAL_X - 0.6); this.z = this.tz = this.idealZ = 0;
    this.h = s > 0 ? Math.PI : 0; this.bf = 0;
  }
  update(dt) {
    const p = this.game.puck, s = this.netSide(), NX = s * GOAL_X;
    const px = p.pos.x, pz = p.pos.z;
    const out = (NX - px) * s;
    let ix, iz;
    if (out < 0.3) { ix = NX - s * 0.35; iz = Math.sign(pz || 1) * 0.7; }
    else {
      const ang = Math.atan2(pz, out), dist = Math.hypot(out, pz);
      const depth = clamp(0.25 + dist * 0.05, 0.35, 1.25);
      ix = NX - s * Math.cos(ang) * depth; iz = clamp(Math.sin(ang) * depth, -1.3, 1.3);
    }
    this.idealX = ix; this.idealZ = iz;
    const k = 1 - Math.exp(-dt * (7 + this.r.gk * 0.1));
    this.tx += (ix - this.tx) * k; this.tz += (iz - this.tz) * k;
    const dx = this.tx - this.x, dz = this.tz - this.z, d = Math.hypot(dx, dz);
    const ms = 3.6 + this.r.gk * 0.035, mv = Math.min(d, ms * dt);
    const ox = this.x, oz = this.z;
    if (d > 1e-4) { this.x += dx / d * mv; this.z += dz / d * mv; }
    this.vx = (this.x - ox) / dt; this.vz = (this.z - oz) / dt;
    const th = Math.atan2(pz - this.z, px - this.x);
    this.h += clamp(angDiff(th, this.h), -8 * dt, 8 * dt);
    let want = 0;
    const sh = p.shot;
    if (sh && sh.team !== this.team && p.vel.x * s > 0) want = sh.ty < 0.65 ? 1 : 0.2; // chute alto: fica em pé
    else if (!p.owner && out > 0 && Math.hypot(px - this.x, pz - this.z) < 2.5 && p.pos.y < 0.3) want = 1;
    else if (p.owner && p.owner.team !== this.team && Math.hypot(px - NX, pz) < 5) want = 0.35;
    this.bf += (want - this.bf) * Math.min(1, dt * (want > this.bf ? 14 : 4));
    if (this.saveAnim > 0) this.saveAnim -= dt;
  }
  updateModel(dt) {
    const m = this.model;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = -this.h;
    this.shadow.position.set(this.x, 0.012, this.z);
    const b = this.bf;
    m.legs[0].rotation.x = 1.35 * b; m.legs[1].rotation.x = -1.35 * b;
    m.legs[0].position.y = m.legs[1].position.y = 0.8 - 0.42 * b;
    m.upper.position.y = 0.85 - 0.45 * b;
    // desliza de lado inclinando o corpo; respira na posição de base
    const lat = clamp((-this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h)) * 0.06, -0.25, 0.25);
    m.pose.rotation.x += (lat - m.pose.rotation.x) * Math.min(1, dt * 8);
    m.upper.rotation.z = -0.18 - 0.1 * (1 - b) + Math.sin(this.game.time * 2.2) * 0.015;
    let ax = 0;
    if (this.saveAnim > 0) ax = this.saveHigh ? this.saveSide * 0.7 * Math.sin(this.saveAnim / 0.4 * Math.PI) : Math.sin(this.saveAnim * 20) * 0.25;
    m.arms.rotation.x += (ax - m.arms.rotation.x) * Math.min(1, dt * 20);
    const P = this.game.puck.pos;
    m.head.rotation.y = -clamp(angDiff(Math.atan2(P.z - this.z, P.x - this.x), this.h), -0.8, 0.8);
  }
}
