'use strict';
// ===== IA de time: posicionamento tático, pressão, passe, chute e respeito às regras =====
const AI = {
  update(game, team, dt) {
    const p = game.puck, owner = p.owner, dir = team.dir;
    let poss;
    if (owner) poss = owner.team === team ? 'off' : 'def';
    else if (p.held) poss = p.held.team === team ? 'off' : 'def';
    else if (p.passTarget) poss = p.passTarget.team === team ? 'off' : 'def';
    else poss = 'loose';
    const puckA = p.pos.x * dir, puckZ = p.pos.z;
    const sks = team.skaters.filter(s => s.active);

    // quem vai na bola (disco solto) ou pressiona o portador
    let chaser = null;
    if ((poss === 'loose' || poss === 'def') && !p.held && !p.inNet) {
      const tx = owner ? owner.x : p.pos.x + p.vel.x * 0.35, tz = owner ? owner.z : p.pos.z + p.vel.z * 0.35;
      let best = 1e9, bestS = null;
      for (const s of sks) {
        if (s.stun > 0) continue;
        let d = Math.hypot(s.x - tx, s.z - tz);
        // defensores evitam ser o primeiro a pressionar no ataque adversário
        if (poss === 'def' && (s.role === 'LD' || s.role === 'RD') && puckA > -BLUE_X) d += 4;
        if (d < best) { best = d; bestS = s; }
      }
      if (bestS && !bestS.human) chaser = bestS;
    }
    const receiver = p.passTarget && p.passTarget.team === team && !owner ? p.passTarget : null;

    for (const s of sks) {
      if (s.human) continue;
      s.faceTarget = null; s.intent.sprint = false;
      if (game.state !== 'play') { s.intent.mx = s.intent.mz = 0; continue; }
      if (owner === s) { this.carrier(game, s, dt); continue; }
      if (s === receiver) { this.receive(game, s); continue; }
      if (s === chaser) {
        if (poss === 'def' && owner) this.pressure(game, s, owner, dt);
        else this.chase(game, s);
        continue;
      }
      const sp = this.spot(s, poss, puckA, puckZ);
      this.goTo(s, sp.x, sp.z, 0.6);
      // defensores encaram o disco quando ele está à frente (patinam de costas)
      if (poss !== 'off' && (s.role === 'LD' || s.role === 'RD') && p.pos.x * dir > s.x * dir + 1)
        s.faceTarget = { x: p.pos.x, z: p.pos.z };
    }
  },

  goTo(s, tx, tz, urgency) {
    let dx = tx - s.x, dz = tz - s.z;
    const d = Math.hypot(dx, dz);
    // separação entre companheiros
    for (const o of s.team.skaters) {
      if (o === s || !o.active) continue;
      const ox = s.x - o.x, oz = s.z - o.z, od = Math.hypot(ox, oz);
      if (od < 3 && od > 0.01) { dx += ox / od * (3 - od) * 0.9; dz += oz / od * (3 - od) * 0.9; }
    }
    const l = Math.hypot(dx, dz);
    if (d < 0.35 || l < 0.01) { s.intent.mx = 0; s.intent.mz = 0; return; }
    const m = Math.min(1, Math.sqrt(10 * d) / 8.5);
    s.intent.mx = dx / l * m; s.intent.mz = dz / l * m;
    s.intent.sprint = d > 10 && s.stamina > 0.45 && urgency > 0.5;
  },

  spot(s, poss, puckA, puckZ) {
    const dir = s.team.dir, side = SIDE[s.role];
    const isD = s.role === 'LD' || s.role === 'RD', isC = s.role === 'C';
    const pzr = puckZ * dir;
    let a, zr;
    const off = poss === 'off' || (poss === 'loose' && puckA > 0);
    if (off) {
      if (puckA > BLUE_X) {
        if (isD) { a = BLUE_X + 1.8; zr = side * 6.5 + pzr * 0.15; }
        else if (isC) { a = GOAL_X - 8; zr = pzr * 0.25; }
        else if (side * pzr > 0) { a = clamp(puckA + 1, BLUE_X + 5, GOAL_X - 3); zr = side * 7.5; }
        else { a = GOAL_X - 4.5; zr = side * 2.5; }
      } else {
        if (isD) { a = puckA - 7; zr = side * 5.5; }
        else if (isC) { a = puckA + 4; zr = pzr * 0.4; }
        else { a = puckA + 6; zr = side * 8; }
        a = Math.min(a, BLUE_X - 0.8); // não ficar em impedimento
      }
    } else {
      if (puckA < -BLUE_X) {
        if (isD) { a = -GOAL_X + 3.2; zr = side * 2.4 + pzr * 0.2; }
        else if (isC) { a = -GOAL_X + 7; zr = pzr * 0.35; }
        else { a = -BLUE_X - 2.5; zr = side * 7.5; }
      } else {
        if (isD) { a = Math.min(puckA - 9, BLUE_X - 1); zr = side * 4.5 + pzr * 0.2; }
        else if (isC) { a = puckA - 4; zr = pzr * 0.5; }
        else { a = puckA - 3; zr = side * 7.5; }
        a = Math.max(a, -GOAL_X + 3);
      }
      if (poss === 'loose') a = Math.min(a, BLUE_X - 0.8);
    }
    const c = clampToRink(a * dir, clamp(zr * dir, -HALF_W + 1.2, HALF_W - 1.2), 1.2);
    return c;
  },

  chase(game, s) {
    const p = game.puck;
    const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z), t = Math.min(1, d / 8);
    this.goTo(s, p.pos.x + p.vel.x * t * 0.7, p.pos.z + p.vel.z * t * 0.7, 1);
    s.intent.sprint = d > 5 && s.stamina > 0.25;
    if (d < 3) s.faceTarget = { x: p.pos.x, z: p.pos.z };
  },

  receive(game, s) {
    const P = game.puck.pos, V = game.puck.vel;
    const vv = V.x * V.x + V.z * V.z;
    let t = vv > 0.01 ? ((s.x - P.x) * V.x + (s.z - P.z) * V.z) / vv : 0;
    t = clamp(t, 0, 1.2);
    const tx = P.x + V.x * t, tz = P.z + V.z * t;
    const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
    if (d > 0.3) { const m = Math.min(1, d / 2); s.intent.mx = dx / d * m; s.intent.mz = dz / d * m; } else { s.intent.mx = s.intent.mz = 0; }
    s.faceTarget = { x: P.x, z: P.z };
  },

  pressure(game, s, carrier, dt) {
    const dir = s.team.dir, ownX = -dir * GOAL_X;
    const cx = carrier.x + carrier.vx * 0.25, cz = carrier.z + carrier.vz * 0.25;
    const nx = ownX - cx, nz = -cz, nd = Math.hypot(nx, nz) || 1;
    const d = Math.hypot(carrier.x - s.x, carrier.z - s.z);
    this.goTo(s, cx + nx / nd * 0.9, cz + nz / nd * 0.9, 1);
    s.intent.sprint = d > 4 && s.stamina > 0.3;
    if (d < 6) s.faceTarget = { x: carrier.x, z: carrier.z };
    s.aiT -= dt;
    if (s.aiT <= 0) {
      const diff = s.team.diff;
      s.aiT = diff.think * (0.7 + Math.random() * 0.6);
      if (d < 2.1) {
        const r = Math.random() / diff.pressure;
        if (r < 0.32) s.doPoke();
        else if (r < 0.5 && carrier.speed + s.speed > 4) s.doCheck();
      }
    }
  },

  spotValue(x, z, team) {
    const dir = team.dir, a = x * dir, dn = Math.hypot(dir * GOAL_X - x, z);
    let v = a / GOAL_X * 0.5;
    if (a > BLUE_X && a < GOAL_X - 0.5 && dn < 14) v += (14 - dn) / 14;
    return v;
  },

  laneClear(x1, z1, x2, z2, opps, w) {
    for (const o of opps) if (o.active && ptSegDist(o.x, o.z, x1, z1, x2, z2) < w) return false;
    return true;
  },

  bestPass(game, s) {
    const dir = s.team.dir, opps = game.allOf(s.team.opp);
    let best = null;
    for (const m of s.team.skaters) {
      if (m === s || !m.active || m.stun > 0) continue;
      const d = Math.hypot(m.x - s.x, m.z - s.z);
      if (d < 3 || d > 30) continue;
      if (!this.laneClear(s.x, s.z, m.x, m.z, opps, 1.1)) continue;
      if (m.x * dir > BLUE_X && s.x * dir < BLUE_X && game.rules.offside) continue;
      let open = 1e9; for (const o of opps) open = Math.min(open, Math.hypot(o.x - m.x, o.z - m.z));
      const score = this.spotValue(m.x, m.z, s.team) + Math.min(open, 5) * 0.08;
      if (!best || score > best.score) best = { mate: m, score };
    }
    return best;
  },

  carrier(game, s, dt) {
    const dir = s.team.dir, a = s.x * dir, netX = dir * GOAL_X, dn = Math.hypot(netX - s.x, s.z);
    const opps = game.allOf(s.team.opp).filter(o => !o.isGoalie);
    let near = null, nd = 1e9;
    for (const o of opps) { const d = Math.hypot(o.x - s.x, o.z - s.z); if (d < nd) { nd = d; near = o; } }
    const mateOffside = s.team.skaters.some(o => o !== s && o.active && o.x * dir > BLUE_X + 0.2);

    let tx, tz;
    if (a < BLUE_X - 3.5) { tx = dir * (BLUE_X + 4); tz = s.z * 0.7; }
    else if (a < BLUE_X + 0.5 && mateOffside && game.rules.offside) { tx = dir * (BLUE_X - 3); tz = s.z + (s.z > 0 ? -2 : 2); }
    else if (a < GOAL_X - 6) { tx = dir * (GOAL_X - 5); tz = Math.sign(s.z || 1) * 1.8; }
    else { tx = dir * (GOAL_X - 9); tz = -s.z * 0.6; }
    // desvia de adversários à frente
    const fx = tx - s.x, fz = tz - s.z, fl = Math.hypot(fx, fz) || 1;
    for (const o of opps) {
      const ox = o.x - s.x, oz = o.z - s.z, od = Math.hypot(ox, oz);
      if (od < 5 && od > 0.01 && (ox * fx + oz * fz) / (od * fl) > 0.3) {
        const sgn = (fx * oz - fz * ox) > 0 ? -1 : 1;
        tx += -fz / fl * sgn * (5 - od) * 0.9; tz += fx / fl * sgn * (5 - od) * 0.9;
      }
    }
    const c = clampToRink(tx, tz, 1.5);
    this.goTo(s, c.x, c.z, 1);
    s.intent.sprint = nd > 4 && s.stamina > 0.35;

    s.aiT -= dt;
    if (s.aiT > 0) return;
    const diff = s.team.diff;
    s.aiT = diff.think * (0.6 + Math.random() * 0.8);

    const angleOk = Math.abs(s.z) < Math.max(2.5, (GOAL_X - a) * 0.9);
    const lane = this.laneClear(s.x, s.z, netX, 0, opps, 0.7);
    if (a < GOAL_X - 0.8 && dn < 17 && angleOk) {
      let q = (17 - dn) / 17 * 1.2 + (lane ? 0.25 : -0.2) - (nd < 1.5 ? 0.15 : 0);
      if (dn < 7) q += 0.3;
      if (q > 0.55 + Math.random() * 0.35) { s.doShoot(dn > 12 ? 0.55 + Math.random() * 0.45 : Math.random() * 0.35, null); return; }
    }
    const pressure = nd < 3;
    const best = this.bestPass(game, s);
    const self = this.spotValue(s.x, s.z, s.team);
    if (best && ((pressure && Math.random() < 0.5) || (best.score > self + 0.5 && Math.random() < 0.25) || (a > GOAL_X - 1 && Math.random() < 0.5))) {
      s.passTo(best.mate, 0.3 + Math.random() * 0.3); return;
    }
    if (pressure && a > 0.5 && a < BLUE_X + 1 && Math.random() < 0.3) {
      s.dumpTo(dir * (HALF_L - 3), (s.z > 0 ? 1 : -1) * 9); return;
    }
    if (pressure && a < -BLUE_X - 3 && Math.random() < 0.35) {
      s.dumpTo(dir * (-BLUE_X + 1), Math.sign(s.z || 1) * (HALF_W - 0.6), 12.5); return; // tira pela tabela, sem isolar até o outro fundo
    }
    if (nd < 2 && Math.random() < 0.3) s.doDeke(s.intent.mx, s.intent.mz);
  },
};
