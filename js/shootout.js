'use strict';
// ===== Shootout (disputa depois da prorrogação empatada, regra da NHL) =====
// 3 cobranças por time, alternadas; se continuar empatado, morte súbita. Cada cobrança: o batedor sai do meio
// do rinque com o disco, sozinho contra o goleiro, sem direito a rebote. Todas no gol do lado +x.

Object.assign(Game.prototype, {
  startShootout() {
    // o time da casa escolhe bater por último; batedores em ordem de qualidade de chute + mãos
    this.so = { first: 1, turn: 0, res: [[], []], t: 0, rel: 0,
      lists: this.teams.map(t => t.skaters.slice().sort((a, b) => (b.r.shot + b.r.hands + (b.data.me ? 999 : 0)) - (a.r.shot + a.r.hands + (a.data.me ? 999 : 0)))) };
    this.soWinner = null;
    this.timeScale = 1;
    Sfx.whistle(true);
    this.setupAttempt(true);
  },

  setupAttempt(first) {
    const so = this.so, ti = so.turn % 2 === 0 ? so.first : 1 - so.first;
    const T = this.teams[ti], D = T.opp, k = so.res[ti].length;
    const sh = so.lists[ti][k % so.lists[ti].length];
    Object.assign(so, { team: ti, t: first ? -1.2 : 0, rel: 0, saved: false, scored: false, shooter: sh, goalie: D.goalie });
    T.dir = 1; D.dir = -1;
    for (const s of this.skaters) if (s !== sh) s.setActive(false);
    sh.setActive(true);
    Object.assign(sh, { x: -1.4, z: 0, vx: 0, vz: 0, h: 0, stun: 0, charge: -1, passHold: -1, pickupCd: 0, fall: 0, checkT: 0, dekeT: 0, swing: 0, faceTarget: null, stamina: 1 });
    sh.intent.mx = sh.intent.mz = 0; sh.intent.sprint = false; sh.cd.deke = 0;
    const show = (g, on) => { g.active = on; g.mesh.visible = g.shadow.visible = on; };
    show(D.goalie, true); D.goalie.placeHome(); D.goalie.saveAnim = 0;
    show(T.goalie, false); T.goalie.x = -GOAL_X; T.goalie.z = -HALF_W - 6;
    this.puck.reset(0, 0);
    if (T.human) this.switchHuman(T.human, sh);
    for (const h of this.humans) h.ring.visible = h.team === T;
    // plano da CPU: chutar de média distância ou driblar o goleiro de perto
    so.ai = { plan: Math.random() < 0.5 ? 'deke' : 'shot', lane: (Math.random() * 2 - 1) * 2.4, shootAt: 6 + Math.random() * 3.5, dekeAt: -1, side: Math.random() < 0.5 ? -1 : 1 };
    this.camYaw = 0; this.soCam = null; this.celebrant = null;
    this.state = 'soSetup';
    const round = k < 3 ? `Cobrança ${k + 1} de 3` : 'Morte súbita';
    const who = `${T.data.name}: #${sh.num} ${sh.name}  x  ${D.goalie.name}`;
    this.ui.banner(first ? 'SHOOTOUT!' : round, first ? `${round} · ${who}` : who, first ? 3000 : 2000);
    $('banner').style.setProperty('--team', T.data.primary);
    if (T.human && first) this.ui.toast('W avança · L dribla · K chuta (A/D miram o canto)');
  },

  stepShootout(h) {
    const so = this.so, sh = so.shooter, g = so.goalie, p = this.puck;
    so.t += h;
    if (this.state === 'soSetup') {
      g.update(h);
      if (so.t > 1.4) { this.state = 'soPlay'; so.t = 0; this.giveOwner(sh); Sfx.whistle(false); }
      return;
    }
    if (this.state === 'soPlay' && !sh.human) this.shootoutAI(sh);
    if (this.state === 'soEnd' && !sh.human) { sh.intent.mx = sh.intent.mz = 0; }
    sh.update(h); g.update(h);
    this.collide();
    this.stepPuck(h);
    if (this.state === 'soEnd') { if (so.t > 2.6) this.nextAttempt(); return; }
    if (this.state !== 'soPlay') return;
    // fim da cobrança: demorou demais ou levou o disco para trás do gol
    if (p.owner === sh) {
      if (so.t > 14 || sh.x > GOAL_X + 0.3) this.soEnd(false, 'SEM FINALIZAÇÃO');
      return;
    }
    if (p.inNet) return;
    so.rel += h;
    const spd = Math.hypot(p.vel.x, p.vel.z);
    if (p.pos.x > GOAL_X + 0.1) return this.soEnd(false, 'PARA FORA!');
    if ((so.rel > 0.45 && !p.shot) || spd < 1.2 || so.rel > 3 || p.vel.x < -2) this.soEnd(false, so.saved ? 'DEFESA!' : 'ERROU!');
  },

  // CPU batendo: patina em zigue-zague até o gol, depois chuta ou dribla
  shootoutAI(sk) {
    const a = this.so.ai, p = this.puck, g = this.so.goalie;
    if (p.owner !== sk) { sk.intent.mx = 0.5; sk.intent.mz = 0; sk.intent.sprint = false; return; }
    const dx = GOAL_X - sk.x;
    const wz = a.lane * clamp((dx - 4) / 18, 0, 1) + Math.sin(this.so.t * 1.7) * 0.7 * clamp(dx / 12, 0, 1);
    sk.intent.mx = 1; sk.intent.mz = clamp((wz - sk.z) * 0.4, -0.8, 0.8); sk.intent.sprint = dx > 14;
    const aim = g.z > 0.06 ? -1 : g.z < -0.06 ? 1 : a.side;
    if (a.plan === 'shot' && dx < a.shootAt) sk.doShoot(Math.random() < 0.3 ? 0.65 : 0.2, aim);
    else if (a.plan === 'deke') {
      if (a.dekeAt < 0 && dx < 5.2) { sk.doDeke(0, a.side); a.dekeAt = this.so.t; }
      else if (a.dekeAt >= 0 && (this.so.t - a.dekeAt > 0.45 || dx < 2.6)) sk.doShoot(0.15, -a.side);
    }
  },

  soEnd(scored, msg) {
    const so = this.so; if (this.state === 'soEnd') return;
    const p = this.puck, T = this.teams[so.team], D = T.opp;
    this.state = 'soEnd'; so.t = 0; so.scored = scored;
    so.res[so.team].push(scored);
    p.owner = null; p.shot = null; p.passTarget = null;
    const tally = this.soTally();
    if (scored) {
      Sfx.horn(); Sfx.swell(0.7, 2.5); this.cheer(T.idx, 1); this.hype[D.idx] = 0.05;
      this.celebrate = 2.4; this.celebrant = so.shooter;
      this.ui.banner('GOL! ' + so.shooter.name, tally, 2500);
      $('banner').style.setProperty('--team', T.data.primary);
    } else {
      Sfx.whistle(false); Sfx.swell(0.35, 1.2); this.cheer(D.idx, 0.8);
      this.ui.banner(so.saved ? 'DEFESA de ' + so.goalie.name + '!' : msg || 'ERROU!', tally, 2500);
      $('banner').style.setProperty('--team', D.data.primary);
    }
  },

  soTally() {
    const f = r => r.map(x => (x ? '●' : '○')).join(' ') || '–';
    return `${this.teams[0].data.id} ${f(this.so.res[0])}   ·   ${this.teams[1].data.id} ${f(this.so.res[1])}`;
  },

  // vencedor já definido? (inclui quando um time não consegue mais alcançar o outro)
  soDecided() {
    const [a, b] = this.so.res, ga = a.filter(Boolean).length, gb = b.filter(Boolean).length;
    if (a.length <= 3 && b.length <= 3) {
      if (ga > gb + (3 - b.length)) return 0;
      if (gb > ga + (3 - a.length)) return 1;
      if (a.length === 3 && b.length === 3 && ga !== gb) return ga > gb ? 0 : 1;
      return null;
    }
    return a.length === b.length && ga !== gb ? (ga > gb ? 0 : 1) : null;
  },

  nextAttempt() {
    const w = this.soDecided();
    if (w !== null) { this.soWinner = w; this.finishGame(); return; }
    this.so.turn++;
    this.setupAttempt(false);
  },

  // câmera atrás do batedor, olhando para o gol (os controles ficam relativos a ela)
  updateShootoutCamera(dt) {
    const sh = this.so.shooter, cam = this.camera, aspect = innerWidth / innerHeight;
    const tx = Math.min(sh.x - 9, GOAL_X - 11), tz = sh.z * 0.45;
    if (!this.soCam) this.soCam = new THREE.Vector3(tx, 4.4, tz);
    const k = Math.min(1, dt * 3);
    this.soCam.x += (tx - this.soCam.x) * k; this.soCam.z += (tz - this.soCam.z) * k;
    if (cam.fov !== 50 || cam.aspect !== aspect) { cam.fov = 50; cam.aspect = aspect; cam.updateProjectionMatrix(); }
    cam.position.copy(this.soCam);
    cam.lookAt(Math.max(sh.x + 8, GOAL_X - 4), 0.7, sh.z * 0.3);
  },
});
