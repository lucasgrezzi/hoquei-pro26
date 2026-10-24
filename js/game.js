'use strict';
const CAMS = [
  { name: 'TV', h: 15, d: 23, look: 1.5, fov: 40, edge: 14 },
  { name: 'Próxima', h: 9, d: 15, look: 0.8, fov: 45, edge: 11 },
  { name: 'Alta', h: 32, d: 15, look: 0.5, fov: 40, edge: 16 },
  { name: 'Pro (atrás do jogador)', pro: true, fov: 60 },
];

class Game {
  constructor(renderer, opts, ui) {
    this.renderer = renderer; this.opts = opts; this.ui = ui;
    this.high = opts.high;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 300);
    const arena = buildArena(this.scene, renderer, this.high, [opts.home.primary, opts.home.secondary, opts.away.primary, opts.away.secondary]);
    this.crowd = arena.crowd; this.hype = [0.05, 0.05];
    this.refl = this.high ? new IceReflection(arena.ice, 0.8, [arena.stands, this.crowd.body, this.crowd.head, this.crowd.armL, this.crowd.armR]) : null;
    this.spray = new IceSpray(this.scene, this.high ? 700 : 300);
    this.marks = new IceMarks(arena.iceTex);
    this.jumbo = new Jumbotron(arena.jumbo, this.high); this.overhead = arena.overhead; this.flags = arena.flags;
    this.rules = { offside: opts.offside, icing: opts.icing };
    this.puck = new Puck(this.scene, this.high);
    // no modo solo o humano pode jogar em casa (humanSide 0) ou fora (1, na carreira); a dificuldade vale para a CPU
    const solo = opts.mode === 'solo', hs = opts.humanSide || 0;
    const cpu = i => solo && i !== hs;
    this.teams = [
      this.makeTeam(opts.home, true, 0, cpu(0) ? DIFFS[opts.diff] : DIFFS[1], cpu(0) ? DIFFS[opts.diff].adj : 0),
      this.makeTeam(opts.away, false, 1, cpu(1) ? DIFFS[opts.diff] : DIFFS[1], cpu(1) ? DIFFS[opts.diff].adj : 0),
    ];
    const [t0, t1] = this.teams;
    t0.opp = t1; t1.opp = t0; t0.dir = 1; t1.dir = -1;
    this.skaters = [...t0.skaters, ...t1.skaters];
    this.goalies = [t0.goalie, t1.goalie];
    this.humans = [];
    if (opts.mode === 'solo') this.addHuman(new Controller('solo', 0, '#ffd400'), this.teams[hs]);
    else if (opts.mode === 'versus') {
      this.addHuman(new Controller('p1', 0, '#ffd400'), t0);
      this.addHuman(new Controller('p2', 1, '#35d0ff'), t1);
    }
    this.period = 1; this.periodLen = opts.periodMin * 60; this.clock = this.periodLen; this.ot = false;
    this.camMode = CAMS[opts.cam] ? opts.cam : 0; this.camX = 0; this.camZ = 0; this.camYaw = 0; this.camPos = null;
    this.so = null; this.soWinner = null;
    this.time = 0; this.acc = 0; this.timeScale = 1; this.shake = 0; this.celebrate = 0; this.boardCd = 0;
    this.touches = []; this.prevA = [0, 0]; this.goals = []; this.paused = false;
    this.setupFaceoff({ x: 0, z: 0 });
    this.ui.initHud(this);
  }

  makeTeam(data, home, idx, diff, adj) {
    const kit = teamKit(data, home);
    const t = { data, kit, idx, home, diff, aimMul: adj ? diff.aim : 1, score: 0, human: null,
      stats: { sog: 0, att: 0, hits: 0, fow: 0, fo: 0, passes: 0, passOk: 0 } };
    t.skaters = data.roster.filter(p => p.pos !== 'G').map(p => {
      const d = Object.assign({}, p, { r: Object.assign({}, p.r) });
      for (const k in d.r) d.r[k] = clamp(d.r[k] + adj, 40, 99);
      return new Skater(this, t, d, kit, this.high);
    });
    const gd = data.roster.find(p => p.pos === 'G');
    const g = Object.assign({}, gd, { r: Object.assign({}, gd.r) });
    g.r.gk = clamp(g.r.gk + adj * 0.6, 40, 99);
    t.goalie = new Goalie(this, t, g, kit, this.high);
    return t;
  }

  addHuman(ctrl, team) {
    const h = { ctrl, team, skater: null, ring: makeRing(ctrl.color), foBonus: 0, inp: { mx: 0, mz: 0 } };
    this.scene.add(h.ring);
    team.human = h; this.humans.push(h);
    h.lock = (this.opts.lock && team.skaters.find(s => s.data.me)) || null;
    this.switchHuman(h, h.lock || team.skaters.find(s => s.role === 'C'));
  }

  switchHuman(h, sk) {
    if (!sk || h.skater === sk) return;
    if (h.lock && sk !== h.lock && !this.so) return;
    if (h.skater) { h.skater.human = null; h.skater.charge = -1; h.skater.passHold = -1; }
    h.skater = sk; sk.human = h; sk.faceTarget = null;
  }

  // jogador travado (carreira): pede o passe para o companheiro que está com o disco
  callForPass(h) {
    const o = this.puck.owner, me = h.skater;
    if (!o || o === me || o.team !== h.team || o.isGoalie || !o.passTo || (o.cd.pass || 0) > 0) return;
    o.passTo(me, 0.45); o.cd.pass = 0.6;
  }

  switchToNearest(h) {
    const p = this.puck.pos;
    let best = null, bd = 1e9;
    for (const s of h.team.skaters) {
      if (!s.active || s === h.skater) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    this.switchHuman(h, best);
  }

  // anima a torcida: team = índice do time (ou -1 para os dois)
  cheer(team, amount) {
    for (let i = 0; i < 2; i++) if (team < 0 || team === i) this.hype[i] = Math.max(this.hype[i], amount);
  }

  goalieOf(team) { return team.goalie; }
  allOf(team) { return [...team.skaters.filter(s => s.active), team.goalie]; }

  bestPassTarget(s, ax, az) {
    let fx = ax, fz = az;
    if (Math.hypot(fx, fz) < 0.2) { fx = Math.cos(s.h); fz = Math.sin(s.h); }
    const fl = Math.hypot(fx, fz); fx /= fl; fz /= fl;
    const opps = this.allOf(s.team.opp);
    let best = null, bs = -1e9;
    for (const m of s.team.skaters) {
      if (m === s || !m.active) continue;
      const dx = m.x - s.x, dz = m.z - s.z, d = Math.hypot(dx, dz);
      if (d < 1.5) continue;
      const cos = (dx * fx + dz * fz) / d;
      if (cos < 0.2) continue;
      const blocked = !AI.laneClear(s.x, s.z, m.x, m.z, opps, 0.9);
      const sc = cos * 2.2 - d * 0.025 - (blocked ? 0.6 : 0);
      if (sc > bs) { bs = sc; best = m; }
    }
    return best;
  }

  // ---------------- loop ----------------
  frame(dt) {
    dt = Math.min(dt, 0.05);
    if (!this.paused && this.state !== 'inter' && this.state !== 'over') {
      for (const h of this.humans) this.handleHuman(h);
      this.acc += dt * this.timeScale;
      const H = 1 / 120; let n = 0;
      while (this.acc >= H && n < 24) { this.step(H); this.acc -= H; n++; }
      if (n >= 24) this.acc = 0;
    } else {
      for (const h of this.humans) { const i = h.ctrl.poll(); if (i.pauseP && this.state !== 'inter' && this.state !== 'over') this.ui.togglePause(); }
    }
    this.updateVisuals(dt);
    this.jumbo.render(this.renderer, this.scene, this.refl);
    if (this.refl) this.refl.render(this.renderer, this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  handleHuman(h) {
    const inp = h.ctrl.poll(), sk = h.skater;
    if (this.proCam() || this.so) {
      // controles relativos à câmera: "cima" = para onde a câmera olha
      const fx = Math.cos(this.camYaw), fz = Math.sin(this.camYaw), mx = inp.mx, mz = inp.mz;
      inp.mx = -mx * fz - mz * fx; inp.mz = mx * fx - mz * fz;
    }
    h.inp = inp;
    if (inp.pauseP) { this.ui.togglePause(); return; }
    if (this.state === 'faceoff') {
      sk.intent.mx = sk.intent.mz = 0;
      if ((inp.passP || inp.shootP) && sk.role === 'C') h.foBonus = this.dropping ? 22 : -10;
      return;
    }
    sk.intent.mx = inp.mx; sk.intent.mz = inp.mz; sk.intent.sprint = inp.sprint; sk.faceTarget = null;
    if (!this.live()) { sk.charge = -1; sk.passHold = -1; return; }
    if (this.puck.owner === sk) {
      if (inp.passP) sk.passHold = 0;
      if (inp.passR && sk.passHold >= 0) { const pw = Math.min(1, sk.passHold / 0.5); sk.passHold = -1; sk.doPass(inp.mx, inp.mz, pw); }
      if (inp.shootP) sk.charge = 0;
      if (inp.shootR && sk.charge >= 0) { const c = sk.charge; sk.charge = -1; sk.doShoot(c, inp.mz); }
      if (inp.pokeP) sk.doDeke(inp.mx, inp.mz);
    } else {
      sk.passHold = -1;
      if (inp.passP) { if (h.lock) this.callForPass(h); else this.switchToNearest(h); }
      if (inp.shootP) { if (this.puck.passTarget === sk) sk.charge = 0; else sk.doCheck(); }
      if (inp.shootR) sk.charge = -1;
      if (inp.pokeP) sk.doPoke();
    }
  }

  live() { return this.state === 'play' || this.state === 'soPlay'; }

  step(h) {
    this.time += h;
    if (this.so) { this.stepShootout(h); return; }
    const st = this.state;
    if (st === 'faceoff') { this.updateFaceoff(h); for (const g of this.goalies) g.update(h); return; }
    if (st === 'play') { for (const t of this.teams) AI.update(this, t, h); }
    else for (const s of this.skaters) if (!s.human) { s.intent.mx = s.intent.mz = 0; s.faceTarget = null; }
    for (const s of this.skaters) if (s.active) s.update(h);
    for (const g of this.goalies) g.update(h);
    this.collide();
    this.stepPuck(h);
    if (this.state === 'play') {
      this.tryPickup();
      this.goalieCover(h);
      this.checkRules();
      if (this.state === 'play') {
        this.clock -= h;
        if (this.clock <= 0) { this.clock = 0; this.endPeriod(); }
      }
    } else if (this.state === 'stop') {
      this.stopT -= h; if (this.stopT <= 0) this.setupFaceoff(this.nextDot);
    } else if (this.state === 'goal') {
      this.goalT -= h; if (this.goalT <= 0) this.afterGoal();
    }
  }

  // ---------------- colisões ----------------
  collide() {
    const all = [...this.skaters.filter(s => s.active), ...this.goalies.filter(g => g.active)];
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j];
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.rad + b.rad;
        if (d >= min || d < 1e-4) continue;
        const nx = dx / d, nz = dz / d;
        if (a.team !== b.team) {
          if (a.checkT > 0 && !b.isGoalie && Math.cos(a.h) * nx + Math.sin(a.h) * nz > 0.2) this.hit(a, b, nx, nz);
          else if (b.checkT > 0 && !a.isGoalie && -(Math.cos(b.h) * nx + Math.sin(b.h) * nz) > 0.2) this.hit(b, a, -nx, -nz);
        }
        const ma = a.isGoalie ? 5 : 1, mb = b.isGoalie ? 5 : 1, pen = min - d;
        const wa = mb / (ma + mb), wb = ma / (ma + mb);
        a.x -= nx * pen * wa; a.z -= nz * pen * wa; b.x += nx * pen * wb; b.z += nz * pen * wb;
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv < 0 && !a.isGoalie && !b.isGoalie) {
          const j = -1.3 * rv / 2;
          a.vx -= j * nx; a.vz -= j * nz; b.vx += j * nx; b.vz += j * nz;
        } else if (rv < 0) {
          // goleiro é "imóvel": só o jogador de linha ricocheteia
          if (a.isGoalie) { b.vx -= 1.2 * rv * nx; b.vz -= 1.2 * rv * nz; }
          else { a.vx += 1.2 * rv * nx; a.vz += 1.2 * rv * nz; }
        }
      }
    }
    for (const b of all) {
      if (b.isGoalie) continue;
      const c = boardsCollide(b.x, b.z, b.rad);
      if (c) {
        b.x += c.nx * c.pen; b.z += c.nz * c.pen;
        const vn = b.vx * c.nx + b.vz * c.nz;
        if (vn < 0) {
          b.vx -= 1.2 * vn * c.nx; b.vz -= 1.2 * vn * c.nz;
          if (-vn > 6 && this.boardCd <= 0) { Sfx.boards(-vn / 4); this.boardCd = 0.15; }
        }
      }
      for (const s of [1, -1]) {
        const x0 = Math.min(s * GOAL_X, s * (GOAL_X + NET_D)), x1 = Math.max(s * GOAL_X, s * (GOAL_X + NET_D)), zw = GOAL_HW + 0.06;
        const cx = clamp(b.x, x0, x1), cz = clamp(b.z, -zw, zw);
        const dx = b.x - cx, dz = b.z - cz, d = Math.hypot(dx, dz);
        if (d >= b.rad) continue;
        if (d < 1e-4) { b.x = s * (GOAL_X - b.rad); continue; }
        const nx = dx / d, nz = dz / d, pen = b.rad - d;
        b.x += nx * pen; b.z += nz * pen;
        const vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= vn * nx; b.vz -= vn * nz; }
      }
    }
  }

  hit(a, b, nx, nz) {
    a.checkT = 0;
    const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
    const power = Math.max(0, rel) * (0.55 + a.r.chk / 110) + 1.5 + (a.speed > 7 ? 1 : 0);
    const bal = 3.2 + b.r.def * 0.022 + b.r.chk * 0.01;
    const near = !!boardsCollide(b.x, b.z, b.rad + 1.2);
    const big = power > bal || (near && power > bal * 0.75);
    b.vx += nx * power * 0.55; b.vz += nz * power * 0.55; a.vx *= 0.6; a.vz *= 0.6;
    b.stun = b.stunMax = big ? 1.5 : 0.35;
    if (this.puck.owner === b && (big || Math.random() < 0.5)) this.loosePuck(b, nx * 3, nz * 3);
    Sfx.hit(power / 2.5); if (near) Sfx.boards(power / 2);
    if (big) { this.shake = 0.35; Sfx.swell(0.3, 0.9); this.cheer(-1, 0.6); this.ui.toast('PANCADA! ' + a.name); }
    a.team.stats.hits++; a.stats.hits++;
  }

  loosePuck(o, vx, vz) {
    const p = this.puck; if (p.owner !== o) return;
    p.owner = null;
    const b = o.blade(), c = clampToRink(b.x, b.z, PUCK_R + 0.02);
    p.pos.set(c.x, 0, c.z);
    p.vel.set(o.vx * 0.6 + vx + (Math.random() - 0.5) * 3, 0, o.vz * 0.6 + vz + (Math.random() - 0.5) * 3);
    o.pickupCd = 0.5; p.lastTouch = o; o.charge = -1;
  }

  // ---------------- disco ----------------
  stepPuck(h) {
    const p = this.puck, P = p.pos, V = p.vel;
    if (this.boardCd > 0) this.boardCd -= h;
    if (p.held) {
      const g = p.held; P.set(g.x + Math.cos(g.h) * 0.35, 0.8, g.z + Math.sin(g.h) * 0.35 - 0.3); V.set(0, 0, 0); return;
    }
    const px = P.x, pz = P.z, py = P.y;
    if (p.owner) {
      const o = p.owner;
      if (o.stun > 0) this.loosePuck(o, 0, 0);
      else {
        const b = o.blade(), k = 1 - Math.exp(-h * 30);
        P.x += (b.x - P.x) * k; P.z += (b.z - P.z) * k; P.y = 0; V.set(o.vx, 0, o.vz);
      }
    }
    if (!p.owner) {
      P.x += V.x * h; P.y += V.y * h; P.z += V.z * h;
      if (P.y > 0 || V.y > 0) V.y -= G * h;
      if (P.y <= 0) { P.y = 0; if (V.y < -1.5) V.y = -V.y * 0.3; else V.y = 0; }
      if (P.y === 0) {
        // atrito do gelo + resistência do ar (mais forte em alta velocidade): o disco perde força mais rápido
        const sp = Math.hypot(V.x, V.z), dec = (1.0 + sp * 0.03) * h;
        if (sp > dec) { V.x -= V.x / sp * dec; V.z -= V.z / sp * dec; } else { V.x = V.z = 0; }
      }
    }
    if (p.shot) p.shot.t += h;
    if (p.passT > 0) { p.passT -= h; if (p.passT <= 0) p.passTarget = null; }
    if (p.inNet) { this.confineNet(h); return; }
    this.netPhysics(px, py, pz);
    if (p.inNet) return;
    const c = boardsCollide(P.x, P.z, PUCK_R);
    if (c) {
      P.x += c.nx * c.pen; P.z += c.nz * c.pen;
      const vn = V.x * c.nx + V.z * c.nz;
      if (vn < 0) {
        V.x -= 1.55 * vn * c.nx; V.z -= 1.55 * vn * c.nz; V.x *= 0.92; V.z *= 0.92;
        if (-vn > 3 && this.boardCd <= 0) { Sfx.boards(-vn / 8); this.boardCd = 0.1; }
        if (P.y > 1.07 && -vn > 8) this.shake = Math.max(this.shake, 0.1);
      }
    }
    if (!p.owner) { this.checkSaves(px, pz); this.checkBlocks(); }
  }

  netPhysics(px, py, pz) {
    const p = this.puck, P = p.pos, V = p.vel;
    for (const s of [1, -1]) {
      const lx = s * GOAL_X;
      const prevIn = px * s >= GOAL_X, nowIn = P.x * s >= GOAL_X;
      if (!prevIn && nowIn && Math.abs(P.z) < GOAL_HW - PUCK_R) {
        if (P.y < GOAL_H - PUCK_R) {
          p.inNet = s;
          if (this.dbg) { const k = p.owner ? 'carried' : !p.shot ? 'noshot' : p.shot.save === null ? 'uncovered' : 'beatRoll'; this.dbg[k] = (this.dbg[k] || 0) + 1; if (p.shot) this.dbg.dists.push(Math.round(Math.hypot(p.shot.x0 - s * GOAL_X, p.shot.z0))); }
          if (p.owner) p.owner = null;
          if (this.live()) this.goalScored(s);
          return;
        }
        if (P.y < GOAL_H + 0.06) { // travessão
          V.x = -V.x * 0.6; P.x = s * (GOAL_X - 0.02); V.y = Math.abs(V.y) * 0.5 + 1;
          Sfx.post(); this.ui.toast('NO TRAVESSÃO!'); continue;
        }
      }
      if (P.y < GOAL_H) {
        for (const zs of [1, -1]) { // traves
          const dx = P.x - lx, dz = P.z - zs * GOAL_HW, d = Math.hypot(dx, dz), rr = 0.035 + PUCK_R;
          if (d < rr && d > 1e-5) {
            const nx = dx / d, nz = dz / d;
            P.x = lx + nx * rr; P.z = zs * GOAL_HW + nz * rr;
            const vn = V.x * nx + V.z * nz;
            if (vn < 0) {
              V.x -= 1.6 * vn * nx; V.z -= 1.6 * vn * nz;
              if (-vn > 4) { Sfx.post(); this.ui.toast('NA TRAVE!'); Sfx.swell(0.35, 1); this.cheer(-1, 0.7); }
            }
          }
        }
      }
      // corpo do gol por fora
      const ax = P.x * s;
      if (ax > GOAL_X && ax < GOAL_X + NET_D + PUCK_R && Math.abs(P.z) < GOAL_HW + 0.05 + PUCK_R && P.y < GOAL_H) {
        const pax = px * s;
        if (pax >= GOAL_X + NET_D) { P.x = s * (GOAL_X + NET_D + PUCK_R); V.x = -V.x * 0.3; }
        else if (Math.abs(pz) >= GOAL_HW + 0.05) { P.z = Math.sign(pz) * (GOAL_HW + 0.05 + PUCK_R); V.z = -V.z * 0.3; }
        else if (py >= GOAL_H) { P.y = GOAL_H; V.y = Math.abs(V.y) * 0.2; }
        else if (pax <= GOAL_X) { P.x = s * (GOAL_X - PUCK_R); V.x = -V.x * 0.4; }
      }
    }
  }

  confineNet(h) {
    const p = this.puck, P = p.pos, V = p.vel, s = p.inNet;
    P.x = s * clamp(P.x * s, GOAL_X + 0.05, GOAL_X + NET_D - 0.15);
    P.z = clamp(P.z, -GOAL_HW + 0.08, GOAL_HW - 0.08);
    if (P.y > 0) V.y -= G * h;
    P.y = clamp(P.y, 0, GOAL_H - 0.1);
    V.multiplyScalar(Math.exp(-6 * h));
  }

  saveChance(g, sh, dz, w) {
    const V = this.puck.vel, spd = V.length(), s = g.netSide();
    const dist = Math.hypot(sh.x0 - s * GOAL_X, sh.z0);
    let pr = 0.92 + (g.r.gk - 80) * 0.012;
    pr += clamp((dist - 8) * 0.012, -0.1, 0.12);
    pr -= Math.max(0, spd - 28) * 0.006;
    pr -= Math.abs(dz) / (w + 0.3) * 0.12;
    pr -= Math.min(0.2, Math.max(0, Math.hypot(g.x - g.idealX, g.z - g.idealZ) - 0.3) * 0.35);
    for (const o of this.skaters) {
      if (!o.active || o === sh.by) continue;
      const dg = Math.hypot(o.x - g.x, o.z - g.z);
      if (dg > 0.8 && dg < 6 && ptSegDist(o.x, o.z, sh.x0, sh.z0, g.x, g.z) < 0.6) { pr -= 0.08; break; }
    }
    if (sh.oneTimer) pr -= 0.08;
    // shootout: mano a mano; o drible tira o goleiro da posição
    if (this.so) pr -= 0.08;
    if (sh.deke) pr -= 0.13;
    return clamp(pr, 0.35, 0.98);
  }

  checkSaves(px, pz) {
    const p = this.puck, P = p.pos, V = p.vel;
    for (const g of this.goalies) {
      if (!g.active) continue;
      const s = g.netSide();
      if (V.x * s <= 0) continue;
      const a0 = px * s, a1 = P.x * s, ga = g.x * s;
      if (!(a0 < ga && a1 >= ga) || a0 > GOAL_X) continue;
      const dz = P.z - g.z, w = 0.5 + g.bf * 0.45, hmax = 1.6 - g.bf * 0.6;
      if (Math.abs(dz) > w + 0.3 || P.y > hmax) continue;
      const sh = p.shot;
      if (!sh || sh.team === g.team) { this.goalieStop(g); return; }
      if (sh.save === null) sh.save = Math.random() < this.saveChance(g, sh, dz, w);
      if (sh.save) { this.goalieSave(g); return; }
    }
  }

  goalieStop(g) {
    const p = this.puck, s = g.netSide();
    p.vel.multiplyScalar(0.1); p.vel.y = 0;
    p.pos.x = g.x - s * 0.4; p.pos.y = 0;
    p.lastTouch = g; p.passTarget = null; this.touch(g);
    Sfx.pad();
  }

  goalieSave(g) {
    const p = this.puck, P = p.pos, V = p.vel, sh = p.shot, s = g.netSide();
    if (this.so) this.so.saved = true; // shootout não entra nas estatísticas
    else { sh.team.stats.sog++; sh.by.stats.sog++; g.stats.sa++; g.stats.sv++; }
    const spd = V.length();
    g.saveAnim = 0.4; g.saveHigh = P.y > 0.55; g.saveSide = Math.sign(-(P.x - g.x) * Math.sin(g.h) + (P.z - g.z) * Math.cos(g.h)) || 1;
    p.shot = null; p.lastTouch = g; this.touch(g);
    Sfx.swell(0.24, 0.8); this.cheer(g.team.idx, 0.5); this.cheer(sh.team.idx, 0.35);
    if ((P.y > 0.55 && P.y < 1.5 && Math.random() < 0.6) || spd < 13) {
      p.held = g; V.set(0, 0, 0); Sfx.glove();
      this.ui.toast('DEFESA de ' + g.name);
      this.stopPlay(null, this.endDot(s, P.z), 0.9);
    } else {
      const out = -s, rs = spd * (0.16 + Math.random() * 0.14), ang = (Math.random() * 2 - 1) * 1.15;
      V.set(out * Math.cos(ang) * rs, Math.random() * 1.5, Math.sin(ang) * rs);
      P.x = g.x + out * 0.3; P.y = Math.min(P.y, 0.3);
      Sfx.pad(); this.ui.toast('DEFESA! Rebote');
    }
  }

  checkBlocks() {
    const p = this.puck, sh = p.shot, P = p.pos, V = p.vel;
    if (!sh || sh.t < 0.06 || P.y > 1.3) return;
    for (const sk of this.skaters) {
      if (!sk.active || sk.team === sh.team || sh.blocked.has(sk)) continue;
      if (Math.hypot(P.x - sk.x, P.z - sk.z) > sk.rad + 0.05) continue;
      sh.blocked.add(sk);
      if (Math.random() < 0.55 + (sk.r.def - 75) / 100) {
        V.x *= -0.25; V.z = V.z * 0.3 + (Math.random() - 0.5) * 6; V.y = Math.random() * 2;
        p.shot = null; p.lastTouch = sk; this.touch(sk);
        Sfx.hit(0.6); this.ui.toast('CHUTE BLOQUEADO — ' + sk.name);
        return;
      }
    }
  }

  tryPickup() {
    const p = this.puck;
    if (p.owner || p.held || p.inNet || p.pos.y > 0.5) return;
    let best = null, bd = 1e9;
    for (const sk of this.skaters) {
      if (!sk.active || sk.stun > 0 || sk.pickupCd > 0) continue;
      const b = sk.blade(), d = Math.hypot(p.pos.x - b.x, p.pos.z - b.z);
      let reach = 0.5 + sk.r.hands * 0.0035;
      if (p.passTarget === sk) reach += 0.3;
      if (sk.human) reach += 0.15;
      if (d < reach && d < bd) { best = sk; bd = d; }
    }
    if (!best) return;
    const rel = Math.hypot(p.vel.x - best.vx, p.vel.z - best.vz);
    let chance = 1;
    if (rel > 9) {
      if (p.passTarget === best) chance = 0.97;
      else if (p.lastTouch && p.lastTouch.team === best.team) chance = 0.85;
      else chance = Math.max(0.12, 1 - (rel - 9) / 12);
    }
    if (Math.random() < chance) this.giveOwner(best);
    else { best.pickupCd = 0.35; p.vel.x *= 0.8; p.vel.z *= 0.8; }
  }

  giveOwner(sk) {
    const p = this.puck, prev = p.lastTouch, wasPass = !!p.passTarget;
    p.owner = sk; p.vel.set(0, 0, 0); p.pos.y = 0; p.shot = null; p.passTarget = null;
    p.lastTouch = sk; this.touch(sk);
    if (wasPass && prev && prev.team === sk.team && prev !== sk) sk.team.stats.passOk++;
    const h = sk.team.human;
    if (h && h.skater !== sk) this.switchHuman(h, sk);
    sk.aiT = 0;
    if (sk.human && sk.charge >= 0) {
      const c = Math.max(0.6, sk.charge); sk.charge = -1;
      sk.doShoot(c, sk.human.inp.mz, true);
      this.ui.toast('ONE-TIMER!');
    }
  }

  touch(sk) {
    if (this.touches[this.touches.length - 1] !== sk) this.touches.push(sk);
    if (this.touches.length > 8) this.touches.shift();
    this.puck.icingTeam = null;
  }

  onRelease(sk, kind) {
    this.puck.icingTeam = sk.x * sk.team.dir < 0 ? sk.team : null; this.puck.icingKind = kind;
  }

  goalieCover(h) {
    const p = this.puck, P = p.pos;
    for (const g of this.goalies) {
      const s = g.netSide();
      if (!p.owner && !p.held && !p.inNet && P.y < 0.4 && Math.hypot(P.x - g.x, P.z - g.z) < 1.0 &&
        Math.hypot(p.vel.x, p.vel.z) < 4 && (s * GOAL_X - P.x) * s > -0.2) {
        g.coverT += h;
        if (g.coverT > 0.45) {
          g.coverT = 0; p.held = g; p.lastTouch = g; this.touch(g);
          this.ui.toast(g.name + ' segura o disco');
          this.stopPlay(null, this.endDot(s, P.z), 0.8);
          return;
        }
      } else g.coverT = 0;
    }
  }

  // ---------------- regras ----------------
  checkRules() {
    const p = this.puck;
    for (const t of this.teams) {
      const a = p.pos.x * t.dir, pa = this.prevA[t.idx];
      this.prevA[t.idx] = a;
      if (!this.rules.offside || p.inNet) continue;
      if (pa <= BLUE_X && a > BLUE_X) {
        const lt = p.owner || p.lastTouch;
        if (lt && lt.team === t) {
          const off = t.skaters.find(s => s.active && s !== p.owner && s.x * t.dir > BLUE_X + 0.35);
          if (off) {
            this.stopPlay('IMPEDIMENTO', { x: t.dir * DOT_NEU_X, z: (p.pos.z >= 0 ? 1 : -1) * DOT_Z }, 1.8, off.name + ' entrou na zona antes do disco');
            return;
          }
        }
      }
    }
    if (this.rules.icing && p.icingTeam && !p.owner && !p.inNet && !p.held) {
      const t = p.icingTeam, a = p.pos.x * t.dir;
      if (a > GOAL_X + 0.3 && (Math.abs(p.pos.z) > GOAL_HW + 0.1 || a > GOAL_X + NET_D)) {
        this.stopPlay('ICING', { x: -t.dir * DOT_END_X, z: (p.pos.z >= 0 ? 1 : -1) * DOT_Z }, 1.8, 'Disco lançado de trás da linha vermelha');
      }
    }
  }

  endDot(side, z) { return { x: side * DOT_END_X, z: (z >= 0 ? 1 : -1) * DOT_Z }; }

  stopPlay(msg, dot, delay = 1.8, sub) {
    if (this.so) { this.soEnd(false); return; }
    if (this.dbg) { const k = msg === 'ICING' ? 'ICING_' + this.puck.icingKind : msg; this.dbg[k] = (this.dbg[k] || 0) + 1; }
    this.state = 'stop'; this.stopT = delay; this.nextDot = dot;
    const p = this.puck; p.owner = null; p.passTarget = null; p.shot = null; p.icingTeam = null;
    for (const s of this.skaters) { s.charge = -1; s.passHold = -1; }
    Sfx.whistle(!!msg);
    if (msg) this.ui.banner(msg, sub || '', 1800);
  }

  setupFaceoff(dot) {
    this.state = 'faceoff'; this.foT = 0; this.dropping = false; this.dropT = 0; this.foDot = dot;
    this.puck.reset(dot.x, dot.z, 1.3);
    this.touches = [];
    const spots = { C: [-0.75, 0], LW: [-1.8, -4.3], RW: [-1.8, 4.3], LD: [-6.5, -3.4], RD: [-6.5, 3.4] };
    for (const t of this.teams) {
      for (const s of t.skaters) {
        if (!s.active) continue;
        const [a, zr] = spots[s.role];
        let x = dot.x + a * t.dir; const z = dot.z + zr * t.dir;
        if (x * t.dir < -GOAL_X + 1.5) x = t.dir * (-GOAL_X + 1.5);
        const c = clampToRink(x, z, 1.2);
        Object.assign(s, { x: c.x, z: c.z, vx: 0, vz: 0, h: t.dir > 0 ? 0 : Math.PI, stun: 0, charge: -1, passHold: -1, pickupCd: 0, fall: 0, checkT: 0, faceTarget: null });
        s.intent.mx = s.intent.mz = 0;
      }
      t.goalie.placeHome();
      this.prevA[t.idx] = dot.x * t.dir;
    }
    for (const h of this.humans) { this.switchHuman(h, h.team.skaters.find(s => s.role === 'C')); h.foBonus = 0; }
    const ft = this.camTarget();
    this.camYaw = ft && ft.team ? (ft.team.dir > 0 ? 0 : Math.PI) : 0;
    this.camPos = null; this.camLook = null;
  }

  updateFaceoff(h) {
    this.foT += h;
    if (!this.dropping && this.foT > 1.2) { this.dropping = true; this.dropT = 0; }
    if (this.dropping) {
      this.dropT += h;
      this.puck.pos.y = Math.max(0, 1.3 * (1 - this.dropT / 0.3));
      if (this.dropT >= 0.3) this.resolveFaceoff();
    }
  }

  resolveFaceoff() {
    const cs = this.teams.map(t => t.skaters.find(s => s.role === 'C' && s.active));
    const sc = cs.map((c, i) => c.r.fo * 0.3 + Math.random() * 30 + (this.teams[i].human ? this.teams[i].human.foBonus : 0));
    const wi = sc[0] >= sc[1] ? 0 : 1, w = cs[wi], t = this.teams[wi];
    t.stats.fow++; this.teams.forEach(x => x.stats.fo++);
    const c = clampToRink(this.foDot.x - t.dir * 5, this.foDot.z + (Math.random() - 0.5) * 5, 1);
    const P = this.puck.pos; P.y = 0;
    const d = Math.hypot(c.x - P.x, c.z - P.z) || 1;
    this.puck.vel.set((c.x - P.x) / d * 6.5, 0, (c.z - P.z) / d * 6.5);
    this.puck.lastTouch = w; this.touch(w);
    cs.forEach(s => { s.pickupCd = 0.25; });
    this.state = 'play';
    Sfx.stick(0.5);
  }

  goalScored(side) {
    if (this.so) { this.soEnd(true); return; }
    const p = this.puck, T = this.teams.find(t => t.dir === side), D = T.opp;
    T.score++; T.stats.sog++; D.goalie.stats.sa++;
    let scorer = null; const assists = [];
    for (let i = this.touches.length - 1; i >= 0; i--) {
      const s = this.touches[i];
      if (s.team === T && !s.isGoalie) {
        if (!scorer) scorer = s;
        else if (s !== scorer && !assists.includes(s) && assists.length < 2) assists.push(s);
      } else if (scorer) break;
    }
    if (scorer) { scorer.stats.g++; if (p.shot) scorer.stats.sog++; }
    assists.forEach(a => a.stats.a++);
    this.goals.push({ team: T, scorer, assists, period: this.period, clock: this.clock });
    p.shot = null; p.passTarget = null;
    this.state = 'goal'; this.goalT = 4.5; this.celebrate = 4; this.celebrant = scorer;
    Sfx.horn(); Sfx.swell(0.75, 4);
    this.hype[T.idx] = 1; this.hype[D.idx] = 0.05;
    this.ui.goal(this, T, scorer, assists);
  }

  afterGoal() {
    if (this.ot) { this.finishGame(); return; }
    this.setupFaceoff({ x: 0, z: 0 });
  }

  endPeriod() {
    Sfx.buzzer();
    const p = this.puck; p.owner = null;
    const [a, b] = this.teams;
    if (this.ot && a.score === b.score) { this.startShootout(); return; }
    if ((this.period >= 3 && a.score !== b.score) || this.ot) { this.finishGame(); return; }
    this.state = 'inter';
    this.ui.intermission(this);
  }

  nextPeriod() {
    this.period++;
    if (this.period === 4) {
      this.ot = true; this.clock = Math.min(this.periodLen, 300);
      for (const t of this.teams) {
        const me = t.skaters.find(s => s.data.me && (s.role === 'LW' || s.role === 'RW'));
        for (const s of t.skaters) if (s.role === 'LW' || s.role === 'RW' ? s !== me : me && s.role === (me.role === 'LW' ? 'LD' : 'RD')) s.setActive(false);
      }
    } else this.clock = this.periodLen;
    for (const t of this.teams) t.dir *= -1;
    this.setupFaceoff({ x: 0, z: 0 });
  }

  finishGame() { this.state = 'over'; this.ui.final(this); }

  // ---------------- visual ----------------
  updateVisuals(dt) {
    for (const s of this.skaters) if (s.active) s.updateModel(dt);
    for (const g of this.goalies) g.updateModel(dt);
    this.puck.updateMesh();
    for (const h of this.humans) {
      const s = h.skater;
      h.ring.position.set(s.x, 0.015, s.z);
      h.ring.children[1].position.y = 2.35 + Math.sin(this.time * 6) * 0.08;
    }
    if (this.celebrate > 0) this.celebrate -= dt;
    for (let i = 0; i < 2; i++) this.hype[i] = Math.max(0.05, this.hype[i] - dt * (this.celebrate > 0 ? 0.08 : 0.35));
    this.crowd.update(this.time, dt, this.hype, false, !CAMS[this.camMode].pro && this.camMode !== 2 && !this.so);
    this.spray.update(dt, this.camera);
    this.marks.update(dt, this.skaters);
    this.jumbo.update(dt, this);
    this.updateCamera(dt);
    this.ui.update(this, dt);
  }

  proCam() { return CAMS[this.camMode].pro && this.humans.length <= 1; }

  camTarget() {
    if (this.humans.length === 1) return this.humans[0].skater;
    return this.puck.owner || null;
  }

  updateProCamera(dt) {
    const t = this.camTarget(), p = this.puck.pos;
    // foco: o seu jogador, puxado um pouco para o disco para enquadrar a jogada
    let tx = t ? t.x : p.x, tz = t ? t.z : p.z;
    if (t) { tx = tx * 0.7 + p.x * 0.3; tz = tz * 0.7 + p.z * 0.3; }
    // direção fixa: sempre olhando para o gol que o time do jogador ataca (só gira na troca de lado)
    const team = this.humans.length === 1 ? this.humans[0].team : null;
    const yaw = team && team.dir < 0 ? Math.PI : 0;
    this.camYaw += angDiff(yaw, this.camYaw) * Math.min(1, dt * 2.5);
    const fx = Math.cos(this.camYaw), fz = Math.sin(this.camYaw);
    const D = 18, H = 11, MAXX = HALF_L + 8;
    if (!this.camPos) this.camPos = new THREE.Vector3(tx - fx * D, H, tz * 0.5);
    // segue rápido ao longo da pista e mais suave no lado a lado
    this.camPos.x += (tx - fx * D - this.camPos.x) * Math.min(1, dt * 5);
    this.camPos.z += (tz * 0.5 - this.camPos.z) * Math.min(1, dt * 2.5);
    // distância mínima garantida: num contra-ataque a câmera nunca deixa o jogador passar por baixo dela
    const along = (tx - this.camPos.x) * fx;
    if (along < D * 0.85) this.camPos.x = tx - fx * D * 0.85;
    if (along > D * 1.2) this.camPos.x = tx - fx * D * 1.2;
    // no fundo da pista não dá para recuar (arquibancada): compensa subindo a câmera
    let y = H;
    if (Math.abs(this.camPos.x) > MAXX) { y += (Math.abs(this.camPos.x) - MAXX) * 0.8; this.camPos.x = Math.sign(this.camPos.x) * MAXX; }
    this.camPos.y += (y - this.camPos.y) * Math.min(1, dt * 5);
    if (!this.camLook) this.camLook = new THREE.Vector3(tx + fx * 8, 0, tz * 0.7);
    this.camLook.x += (tx + fx * 8 - this.camLook.x) * Math.min(1, dt * 6);
    this.camLook.z += (tz * 0.7 - this.camLook.z) * Math.min(1, dt * 3);
    const cam = this.camera, aspect = innerWidth / innerHeight;
    if (cam.fov !== 55 || cam.aspect !== aspect) { cam.fov = 55; cam.aspect = aspect; cam.updateProjectionMatrix(); }
    let sx = 0;
    if (this.shake > 0) { sx = (Math.random() - 0.5) * this.shake; this.shake = Math.max(0, this.shake - dt); }
    cam.position.set(this.camPos.x + sx, this.camPos.y, this.camPos.z);
    cam.lookAt(this.camLook.x, 0, this.camLook.z);
  }

  updateCamera(dt) {
    this.updateCameraPos(dt);
    // teto e telão somem quando a câmera fica acima deles (Alta)
    this.overhead.visible = this.camera.position.y < 20;
    // o telão some sozinho sempre que entraria na área de jogo da tela
    this.jumbo.fade(this.camera, dt);
    this.flags.update(this.time);
  }

  updateCameraPos(dt) {
    if (this.so) return this.updateShootoutCamera(dt);
    if (CAMS[this.camMode].pro) {
      if (this.proCam() || !this.humans.length) return this.updateProCamera(dt);
    }
    const cfg = CAMS[this.camMode].pro ? CAMS[0] : CAMS[this.camMode], p = this.puck.pos;
    const ctrl = this.humans[0] && this.humans[0].skater;
    const fx = ctrl ? p.x * 0.8 + ctrl.x * 0.2 : p.x;
    const aspect = innerWidth / innerHeight, f = clamp(1.7 / aspect, 1, 1.9);
    const tx = clamp(fx, -HALF_L + cfg.edge / f, HALF_L - cfg.edge / f);
    const k = Math.min(1, dt * 3);
    this.camX += (tx - this.camX) * k; this.camZ += (p.z - this.camZ) * Math.min(1, dt * 2);
    let sx = 0, sy = 0;
    if (this.shake > 0) { sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; this.shake = Math.max(0, this.shake - dt); }
    const cam = this.camera;
    if (cam.fov !== cfg.fov || cam.aspect !== aspect) { cam.fov = cfg.fov; cam.aspect = aspect; cam.updateProjectionMatrix(); }
    cam.position.set(this.camX + sx, cfg.h * f + sy, cfg.d * f + this.camZ * 0.35);
    cam.lookAt(this.camX, 0, this.camZ * 0.5 - cfg.look);
  }

  cycleCamera() { this.camMode = (this.camMode + 1) % CAMS.length; return CAMS[this.camMode].name; }

  dispose() {
    if (this.refl) this.refl.dispose();
    this.jumbo.dispose();
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
  }
}
