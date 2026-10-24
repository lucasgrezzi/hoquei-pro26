'use strict';
// ===== Carreira de jogador: crie o seu atleta, escolha um time da Liga Pro e evolua até 99 =====
// Temporada regular com os 32 times (todos jogam em cada rodada); os 8 melhores de cada conferência vão aos playoffs
// (4 fases em melhor de 3, 5 ou 7). O desempenho em cada jogo vira XP, que você troca por pontos de atributo.
// Pontuação no estilo da NHL: vitória = 2 pts, derrota na prorrogação/shootout = 1.

const PRO_KEY = 'hoquei-pro';
const ATTRS = [['spd', 'Velocidade'], ['shot', 'Chute'], ['pass', 'Passe'], ['hands', 'Mãos / drible'], ['chk', 'Físico'], ['def', 'Defesa'], ['fo', 'Faceoff']];
const ARCH = [
  { id: 'sniper', name: 'Atirador', d: 'Chute forte e preciso', fwd: true, r: { spd: 68, shot: 76, pass: 62, hands: 68, chk: 55, def: 52, fo: 56 } },
  { id: 'play', name: 'Armador', d: 'Visão de jogo e passe', fwd: true, r: { spd: 69, shot: 63, pass: 76, hands: 72, chk: 53, def: 58, fo: 62 } },
  { id: 'speed', name: 'Velocista', d: 'Explosão e drible', fwd: true, r: { spd: 78, shot: 65, pass: 65, hands: 71, chk: 50, def: 55, fo: 55 } },
  { id: 'power', name: 'Power forward', d: 'Força física e chute', fwd: true, r: { spd: 64, shot: 70, pass: 61, hands: 62, chk: 76, def: 62, fo: 64 } },
  { id: 'offd', name: 'Defensor ofensivo', d: 'Sai jogando e chuta da azul', fwd: false, r: { spd: 70, shot: 68, pass: 72, hands: 64, chk: 60, def: 68, fo: 45 } },
  { id: 'stayd', name: 'Defensor xerife', d: 'Marcação e pancadas', fwd: false, r: { spd: 62, shot: 58, pass: 62, hands: 55, chk: 76, def: 76, fo: 45 } },
];
// peso de cada atributo no overall, por função (soma 1, então tudo 99 = overall 99)
const OVR_W = {
  C: { spd: 0.16, shot: 0.18, pass: 0.18, hands: 0.18, chk: 0.06, def: 0.10, fo: 0.14 },
  W: { spd: 0.19, shot: 0.24, pass: 0.16, hands: 0.20, chk: 0.08, def: 0.08, fo: 0.05 },
  D: { spd: 0.15, shot: 0.10, pass: 0.17, hands: 0.10, chk: 0.20, def: 0.28, fo: 0 },
};
const PO_NAMES = ['Primeira rodada', 'Semifinal de conferência', 'Final de conferência', 'Final da Copa'];
const CONF_NAMES = ['Conferência Leste', 'Conferência Oeste'];
const HOME_PAT = { 3: [0, 1, 0], 5: [0, 0, 1, 1, 0], 7: [0, 0, 1, 1, 0, 1, 0] }; // 0 = mando do melhor colocado
const DIFF_XP = [0.8, 1, 1.25];

const posGroup = p => (p === 'C' ? 'C' : p === 'LW' || p === 'RW' ? 'W' : 'D');
function proOverall(pl) { const w = OVR_W[posGroup(pl.pos)]; let s = 0; for (const k in w) s += pl.attr[k] * w[k]; return Math.min(99, Math.round(s)); }
const upCost = v => (v < 70 ? 10 : v < 80 ? 15 : v < 90 ? 25 : 40);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortName = pl => (pl.first ? pl.first[0].toUpperCase() + '. ' : '') + (pl.last || 'Jogador');

// tabela de todos contra todos (método do círculo): n-1 rodadas de n/2 jogos
function circleRounds(n) {
  const ids = [...Array(n).keys()], rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) { const a = ids[i], b = ids[n - 1 - i]; pairs.push((r + i) % 2 ? [a, b] : [b, a]); }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop());
  }
  return rounds;
}
const CIRCLE = circleRounds(32);

const Pro = {
  s: null,

  load() {
    try { this.s = JSON.parse(localStorage.getItem(PRO_KEY) || 'null'); } catch (e) { this.s = null; }
    return this.s;
  },
  save() { try { localStorage.setItem(PRO_KEY, JSON.stringify(this.s)); } catch (e) { /* sem storage */ } },
  clear() { this.s = null; try { localStorage.removeItem(PRO_KEY); } catch (e) { /* sem storage */ } },

  create(d) {
    const arch = ARCH.find(a => a.id === d.arch);
    const player = { first: d.first, last: d.last, num: d.num, pos: d.pos, hand: d.hand, arch: d.arch, look: Object.assign({}, d.look),
      attr: Object.assign({}, arch.r), xp: 150, xpTotal: 0, age: 19 };
    this.s = { player, opts: { diff: d.diff, periodMin: d.periodMin, len: d.len, bestOf: d.bestOf }, season: 0, hist: [], trophies: [] };
    this.newSeason(d.team);
  },

  newSeason(team) {
    const s = this.s;
    if (s.season > 0) s.player.age++;
    s.season++; s.team = team;
    s.perm = [...Array(32).keys()].sort(() => Math.random() - 0.5);
    s.table = LIGA.map(() => ({ gp: 0, w: 0, l: 0, otl: 0, gf: 0, ga: 0, pts: 0 }));
    Object.assign(s, { round: 0, phase: 'season', po: null, champion: null, last: [], lastGame: null, closed: false,
      st: { gp: 0, g: 0, a: 0, sog: 0, hits: 0, xp: 0 }, pst: { gp: 0, g: 0, a: 0, sog: 0, hits: 0, xp: 0 } });
    this.save();
  },

  // jogos da rodada k (a tabela se repete com o mando invertido a cada volta)
  roundPairs(k) {
    const s = this.s, flip = Math.floor(k / 31) % 2 === 1;
    return CIRCLE[k % 31].map(([x, y]) => (flip ? [s.perm[y], s.perm[x]] : [s.perm[x], s.perm[y]]));
  },

  standings(conf) {
    const T = this.s.table;
    return LIGA.map((_, i) => i).filter(i => LIGA[i].conf === conf)
      .sort((x, y) => T[y].pts - T[x].pts || T[y].w - T[x].w || (T[y].gf - T[y].ga) - (T[x].gf - T[x].ga) || T[y].gf - T[x].gf);
  },

  // força usada na simulação: o seu atleta melhora (ou piora) o time conforme o overall dele
  strength(i) {
    const t = LIGA[i], s = this.s;
    if (i !== s.team) return t;
    const b = (proOverall(s.player) - 75) * 0.2, d = posGroup(s.player.pos) === 'D';
    return { ovr: { atk: t.ovr.atk + b * (d ? 0.5 : 1), def: t.ovr.def + b * (d ? 1 : 0.4), gk: t.ovr.gk, spd: t.ovr.spd + b * 0.3 } };
  },
  sim(h, a) { return simMatch(this.strength(h), this.strength(a)); },

  curSeries() { const po = this.s.po; return po ? po.rounds[po.round] : []; },
  seriesGame(sr) { const away = HOME_PAT[this.s.opts.bestOf][sr.n]; return { h: away ? sr.b : sr.a, a: away ? sr.a : sr.b, series: sr }; },

  nextMatch() {
    const s = this.s, u = s.team;
    if (s.phase === 'season') { const p = this.roundPairs(s.round).find(([h, a]) => h === u || a === u); return { h: p[0], a: p[1] }; }
    if (s.phase === 'playoffs') {
      const sr = this.curSeries().find(x => x.winner == null && (x.a === u || x.b === u));
      return sr ? this.seriesGame(sr) : null;
    }
    return null;
  },

  record(m, res) {
    const s = this.s;
    s.last.push({ h: m.h, a: m.a, hs: res.hs, as: res.as, ot: res.ot, so: res.so });
    if (s.phase === 'season') {
      const H = s.table[m.h], A = s.table[m.a];
      H.gp++; A.gp++; H.gf += res.hs; H.ga += res.as; A.gf += res.as; A.ga += res.hs;
      const [W, L] = res.hs > res.as ? [H, A] : [A, H];
      W.w++; W.pts += 2;
      if (res.ot) { L.otl++; L.pts++; } else L.l++;
    } else {
      const sr = m.series, wi = (res.hs > res.as ? m.h : m.a) === sr.a ? 0 : 1;
      sr.n++; sr.wins[wi]++;
      if (sr.wins[wi] === (s.opts.bestOf + 1) / 2) sr.winner = wi ? sr.b : sr.a;
    }
  },

  // registra o jogo do seu time e simula o resto da rodada; se o seu time sair, simula até o fim
  advance(userRes, inner) {
    const s = this.s; if (!inner) s.last = [];
    const m = this.nextMatch();
    if (m) this.record(m, userRes || this.sim(m.h, m.a));
    if (s.phase === 'season') {
      for (const [h, a] of this.roundPairs(s.round)) if (!(m && m.h === h && m.a === a)) this.record({ h, a }, this.sim(h, a));
      s.round++;
      if (s.round >= s.opts.len) this.startPlayoffs();
    } else if (s.phase === 'playoffs') {
      for (const sr of this.curSeries()) if (sr.winner == null && sr !== (m && m.series)) { const g = this.seriesGame(sr); this.record(g, this.sim(g.h, g.a)); }
      if (this.curSeries().every(x => x.winner != null)) this.nextRound();
    }
    while (s.phase !== 'done' && !this.nextMatch()) this.advance(null, true);
    this.save();
  },

  startPlayoffs() {
    const s = this.s, first = [];
    s.seeds = {};
    for (const c of [0, 1]) {
      const q = this.standings(c).slice(0, 8);
      q.forEach((t, k) => { s.seeds[t] = k + 1; });
      for (const [x, y] of [[0, 7], [3, 4], [1, 6], [2, 5]]) first.push(this.series(q[x], q[y]));
    }
    s.po = { round: 0, rounds: [first] };
    s.phase = 'playoffs';
  },
  series(x, y) {
    const T = this.s.table, better = T[y].pts > T[x].pts || (T[y].pts === T[x].pts && T[y].w > T[x].w);
    return better ? { a: y, b: x, wins: [0, 0], n: 0, winner: null } : { a: x, b: y, wins: [0, 0], n: 0, winner: null };
  },
  nextRound() {
    const s = this.s, po = s.po, prev = po.rounds[po.round];
    if (prev.length === 1) { s.champion = prev[0].winner; s.phase = 'done'; return; }
    const next = [];
    for (let k = 0; k < prev.length; k += 2) next.push(this.series(prev[k].winner, prev[k + 1].winner));
    po.rounds.push(next); po.round++;
  },

  phaseLabel() {
    const s = this.s;
    if (s.phase === 'season') return `Temporada regular · Jogo ${s.round + 1} de ${s.opts.len}`;
    if (s.phase === 'done') return 'Temporada encerrada';
    const m = this.nextMatch(), sr = m && m.series;
    if (!sr) return PO_NAMES[s.po.round];
    const me = sr.a === s.team ? 0 : 1;
    return `${PO_NAMES[s.po.round]} · Jogo ${sr.n + 1} (melhor de ${s.opts.bestOf}) · Série ${sr.wins[me]}–${sr.wins[1 - me]}`;
  },

  // ----- desempenho do atleta -----
  // linha estatística simulada (quando o jogo é simulado), coerente com os gols do time
  simLine(teamGoals) {
    const pl = this.s.player, A = pl.attr, d = posGroup(pl.pos) === 'D';
    const g = Math.min(teamGoals, poisson(clamp((d ? 0.06 : 0.13) + (A.shot - 60) * (d ? 0.004 : 0.009), 0.03, 0.75)));
    const a = Math.min(teamGoals - g, poisson(clamp((d ? 0.16 : 0.17) + (A.pass - 60) * 0.009, 0.05, 0.9)));
    return { g, a, sog: g + poisson(clamp(1.4 + (A.shot - 60) * 0.04 + (d ? -0.3 : 0.4), 0.5, 5)), hits: poisson(clamp(0.8 + (A.chk - 55) * 0.05, 0.2, 4)) };
  },

  // aplica o jogo do atleta: estatísticas, nota e XP
  applyGame(line, res, mine, sim) {
    const s = this.s, pl = s.player, po = s.phase === 'playoffs';
    const won = mine === 0 ? res.hs > res.as : res.as > res.hs;
    const mult = DIFF_XP[s.opts.diff] * (po ? 1.2 : 1) * (sim ? 0.5 : 1);
    const xp = Math.round((40 + line.g * 50 + line.a * 35 + line.sog * 6 + line.hits * 5 + (won ? (res.ot ? 20 : 30) : res.ot ? 10 : 0)) * mult);
    const rating = clamp(5.8 + line.g * 1.1 + line.a * 0.7 + line.sog * 0.12 + line.hits * 0.08 + (won ? 0.5 : -0.2), 3, 10);
    const st = po ? s.pst : s.st;
    st.gp++; st.g += line.g; st.a += line.a; st.sog += line.sog; st.hits += line.hits; st.xp += xp;
    pl.xp += xp; pl.xpTotal += xp;
    const m = this.nextMatch();
    s.lastGame = Object.assign({ opp: mine === 0 ? m.a : m.h, home: mine === 0, my: mine === 0 ? res.hs : res.as, their: mine === 0 ? res.as : res.hs,
      won, ot: res.ot, so: res.so, xp, rating: Math.round(rating * 10) / 10, sim, po }, line);
  },

  // jogo simulado (botão Simular): placar + linha do atleta
  simUserGame() {
    const m = this.nextMatch(), mine = m.h === this.s.team ? 0 : 1, res = this.sim(m.h, m.a);
    const won = mine === 0 ? res.hs > res.as : res.as > res.hs;
    const goals = (mine === 0 ? res.hs : res.as) - (res.so && won ? 1 : 0);
    this.applyGame(this.simLine(goals), res, mine, true);
    this.advance(res);
  },

  upgrade(k) {
    const pl = this.s.player, v = pl.attr[k], c = upCost(v);
    if (v >= 99 || pl.xp < c) return false;
    pl.attr[k]++; pl.xp -= c; return true;
  },
  // gasta o XP nos atributos que mais rendem overall por ponto de XP
  autoUpgrade() {
    const pl = this.s.player, w = OVR_W[posGroup(pl.pos)];
    for (;;) {
      let best = null, bv = 0;
      for (const [k] of ATTRS) { const v = pl.attr[k]; if (v >= 99 || !w[k] || upCost(v) > pl.xp) continue; const val = w[k] / upCost(v); if (val > bv) { bv = val; best = k; } }
      if (!best) break;
      this.upgrade(best);
    }
  },

  // fim de temporada: prêmios e histórico (uma vez só)
  closeSeason() {
    const s = this.s; if (s.closed) return;
    const st = s.st, pts = st.g + st.a, len = s.opts.len, d = posGroup(s.player.pos) === 'D';
    const rnd = mulberry32(hashStr('lideres' + s.season + s.team));
    s.leaders = { g: Math.max(3, Math.round(len * (0.55 + rnd() * 0.12))), pts: Math.max(5, Math.round(len * (1.12 + rnd() * 0.2))) };
    const aw = [];
    const inPo = s.po && s.po.rounds[0].some(x => x.a === s.team || x.b === s.team);
    if (st.g >= s.leaders.g) aw.push('Artilheiro da liga');
    if (pts >= s.leaders.pts) aw.push(inPo ? 'MVP da temporada' : 'Líder em pontos');
    if (d && pts >= len * 0.75) aw.push('Melhor defensor');
    if (s.season === 1 && pts >= len * 0.6) aw.push('Novato do ano');
    if (s.champion === s.team) { aw.push('Campeão da Copa'); if (s.pst.g + s.pst.a >= s.pst.gp * 0.9) aw.push('MVP dos playoffs'); }
    let result = 'Fora dos playoffs';
    if (inPo) {
      const out = s.po.rounds.findIndex(r => r.some(x => (x.a === s.team || x.b === s.team) && x.winner !== s.team));
      result = s.champion === s.team ? 'Campeão da Copa' : PO_NAMES[out] === 'Final da Copa' ? 'Vice-campeão' : 'Eliminado: ' + PO_NAMES[out].toLowerCase();
    }
    s.awards = aw; s.result = result;
    s.hist.push({ season: s.season, team: s.team, age: s.player.age, gp: st.gp + s.pst.gp, g: st.g + s.pst.g, a: st.a + s.pst.a, ovr: proOverall(s.player), result, awards: aw });
    s.trophies.push(...aw.map(a => ({ a, season: s.season })));
    s.closed = true;
    this.save();
  },
};

// ===== prévia 3D do atleta (renderer próprio, só enquanto a tela está aberta) =====
const ProPreview = {
  init() {
    if (this.r) return;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'pv';
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2)); this.r.setSize(320, 400, false);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4658, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(3, 5, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 0.45); rim.position.set(-4, 3, -3); this.scene.add(rim);
    const ice = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshLambertMaterial({ color: 0xe6eef6 }));
    ice.rotation.x = -Math.PI / 2; this.scene.add(ice);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.06, 1.14, 48), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.002; this.scene.add(this.ring);
    this.cam = new THREE.PerspectiveCamera(30, 320 / 400, 0.1, 50);
    this.rot = -Math.PI / 2 + 0.55; this.zoom = 0; this.zoomT = 0; this.key = '';
    let drag = null;
    this.canvas.addEventListener('pointerdown', e => { drag = e.clientX; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', e => { if (drag === null) return; this.rot += (e.clientX - drag) * 0.012; drag = e.clientX; this.idle = 0; });
    this.canvas.addEventListener('pointerup', () => { drag = null; });
    this.idle = 0;
  },

  set(pl, team) {
    this.init();
    const k = JSON.stringify([pl.first, pl.last, pl.num, pl.hand, pl.look, team.id]);
    if (k === this.key) return;
    this.key = k;
    if (this.model) {
      this.scene.remove(this.model.root);
      this.model.root.traverse(o => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        if (o.material.map && o.material.transparent) { o.material.map.dispose(); o.material.dispose(); }
      });
    }
    this.model = makeSkaterModel(teamKit(team, true), pl.num, pl.hand, true, shortName(pl), pl.look); // qualidade alta (tecido) na prévia
    this.scene.add(this.model.root);
    this.ring.material.color.set(team.primary);
  },

  mount(slot) {
    this.init();
    slot.appendChild(this.canvas);
    if (this.running) return;
    this.running = true;
    let prev = performance.now();
    const tick = now => {
      if (!this.canvas.isConnected) { this.running = false; return; }
      const dt = clamp((now - prev) / 1000, 0, 0.05); prev = now; // o 1º quadro do rAF pode vir com horário anterior
      this.idle += dt;
      if (this.idle > 2.5) this.rot += dt * 0.5;
      this.zoomT += (this.zoom - this.zoomT) * Math.min(1, dt * 5);
      if (this.model) {
        this.model.root.rotation.y = this.rot;
        this.model.root.updateMatrixWorld(true);
        const hp = this.model.head.getWorldPosition(new THREE.Vector3());
        const z = this.zoomT, ty = lerp(0.95, hp.y + 0.03, z);
        this.cam.position.set(0, lerp(1.25, hp.y + 0.08, z), lerp(4.6, 1.5, z));
        this.cam.lookAt(0, ty, 0);
      }
      this.r.render(this.scene, this.cam);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
};

// ===== telas =====
const ProUI = {
  mode: 'create', tab: 'evo', draft: null,

  open() {
    Sfx.init();
    $('menu').classList.add('hidden');
    $('pro').classList.remove('hidden');
    Pro.load();
    this.mode = Pro.s ? 'hub' : 'create';
    if (!Pro.s) this.newDraft();
    this.render();
  },
  close() { $('pro').classList.add('hidden'); $('menu').classList.remove('hidden'); renderMenu(); },

  newDraft() {
    this.draft = { first: 'Lucas', last: 'Silva', num: 17, pos: 'C', hand: -1, arch: 'sniper', team: 0,
      look: { skin: 1, hair: 1, tall: 1, wide: 1, tape: 0 }, diff: 1, periodMin: 3, len: 20, bestOf: 3 };
  },

  logo(i, size = 44) {
    const t = LIGA[i];
    return `<i class="clogo" style="--c1:${t.primary};--c2:${t.secondary};width:${size}px;height:${size}px;font-size:${size * 0.28}px">${t.id}</i>`;
  },
  tname(i) { return `${LIGA[i].city} <b>${LIGA[i].name}</b>`; },

  render() {
    const el = $('pro'), sc = el.querySelector('.pro') ? el.querySelector('.pro').scrollTop : 0;
    if (this.mode === 'create' || this.mode === 'edit') this.renderCreate(el);
    else if (this.mode === 'transfer') this.renderTransfer(el);
    else if (Pro.s.phase === 'done') { Pro.closeSeason(); this.renderEnd(el); }
    else this.renderHub(el);
    const p = el.querySelector('.pro'); if (p && this.keepScroll) p.scrollTop = sc;
    this.keepScroll = false;
  },

  // seletor ◀ valor ▶
  sel(k, vals, cur) {
    const i = Math.max(0, vals.findIndex(v => v[0] === cur));
    return `<div class="sel"><button data-sel="${k}" data-d="-1">◀</button><b>${vals[i][1]}</b><button data-sel="${k}" data-d="1">▶</button></div>`;
  },
  optVals: {
    diff: DIFFS.map((d, i) => [i, d.name]),
    periodMin: [[2, '2 min'], [3, '3 min'], [5, '5 min'], [10, '10 min'], [20, '20 min (real)']],
    len: [[10, '10 jogos'], [20, '20 jogos'], [41, '41 jogos'], [82, '82 jogos (NHL)']],
    bestOf: [[3, 'Melhor de 3'], [5, 'Melhor de 5'], [7, 'Melhor de 7 (NHL)']],
    hand: [[-1, 'Canhoto'], [1, 'Destro']],
    tape: [[0, 'Branca'], [1, 'Preta']],
  },

  attrBars(attr, pos) {
    const w = OVR_W[posGroup(pos)];
    return ATTRS.map(([k, n]) => `<div class="pa"><span>${n}${w[k] ? '' : ' <em>(não conta)</em>'}</span><div class="bar"><i style="width:${attr[k]}%"></i></div><b>${attr[k]}</b></div>`).join('');
  },

  renderCreate(el) {
    const d = this.draft, edit = this.mode === 'edit', team = LIGA[edit ? Pro.s.team : d.team];
    const archs = ARCH.filter(a => a.fwd === (posGroup(d.pos) !== 'D'));
    const arch = ARCH.find(a => a.id === d.arch);
    const pv = { pos: d.pos, attr: edit ? Pro.s.player.attr : arch.r };
    const L = d.look, cm = Math.round(183 * L.tall), build = L.wide < 0.97 ? 'Magro' : L.wide < 1.05 ? 'Médio' : 'Forte';
    const sw = (k, list) => list.map((c, i) => `<button class="sw${L[k] === i ? ' on' : ''}" data-look="${k}" data-v="${i}" style="background:${c}"></button>`).join('');
    const teamGrid = c => LIGA.map((t, i) => t.conf !== c ? '' :
      `<button class="pt${i === d.team ? ' on' : ''}" data-team="${i}" style="--c1:${t.primary}" title="${t.city} ${t.name}">${this.logo(i, 34)}<span>${t.name}</span><em>${teamOverall(t)}</em></button>`).join('');
    el.innerHTML = `<div class="panel wide car pro">
      <h2>${edit ? 'EDITAR JOGADOR' : 'CARREIRA · CRIAR JOGADOR'}</h2>
      <div class="pro-grid">
        <div class="pro-left">
          <div id="pvSlot" class="pv-slot" style="--c1:${team.primary}"></div>
          <div class="pv-tools"><button data-zoom="0" class="${ProPreview.zoom ? '' : 'on'}">Corpo</button><button data-zoom="1" class="${ProPreview.zoom ? 'on' : ''}">Rosto</button></div>
          <div class="muted small">Arraste para girar</div>
          <div class="pcard"><div class="po">${proOverall(pv)}<small>GERAL</small></div><div><b id="pvName">${esc(shortName(d))}</b><div class="muted small">#${d.num} · ${ROLE_FULL[d.pos]} · ${edit ? '' : arch.name + ' · '}${team.name}</div></div></div>
        </div>
        <div class="pro-right">
          <h3>Identidade</h3>
          <div class="pf"><label>Nome<input id="pfFirst" maxlength="14" value="${esc(d.first)}"></label><label>Sobrenome<input id="pfLast" maxlength="14" value="${esc(d.last)}"></label>
            <label>Número<input id="pfNum" type="number" min="1" max="98" value="${d.num}"></label></div>
          ${edit ? '' : `<div class="opt"><span>Posição</span><div class="seg">${['C', 'LW', 'RW', 'LD', 'RD'].map(p => `<button data-pos="${p}" class="${d.pos === p ? 'on' : ''}">${ROLE_FULL[p]}${p === 'LD' ? ' (E)' : p === 'RD' ? ' (D)' : ''}</button>`).join('')}</div></div>`}
          <div class="opt"><span>Empunhadura do taco</span>${this.sel('hand', this.optVals.hand, d.hand)}</div>
          <h3>Visual</h3>
          <div class="opt"><span>Tom de pele</span><div class="sws">${sw('skin', SKIN)}</div></div>
          <div class="opt"><span>Cabelo e sobrancelhas</span><div class="sws">${sw('hair', HAIR)}</div></div>
          <div class="opt"><span>Altura <b>${(cm / 100).toFixed(2).replace('.', ',')} m</b></span><input type="range" data-range="tall" min="0.93" max="1.07" step="0.01" value="${L.tall}"></div>
          <div class="opt"><span>Porte físico <b>${build}</b></span><input type="range" data-range="wide" min="0.9" max="1.12" step="0.01" value="${L.wide}"></div>
          <div class="opt"><span>Fita do taco</span>${this.sel('tape', this.optVals.tape, L.tape)}</div>
          ${edit ? '' : `<h3>Estilo de jogo</h3>
          <div class="archs">${archs.map(a => `<button data-arch="${a.id}" class="${a.id === d.arch ? 'on' : ''}"><b>${a.name}</b><span>${a.d}</span></button>`).join('')}</div>`}
          <div class="pas">${this.attrBars(pv.attr, d.pos)}</div>
          ${edit ? '' : `<h3>Time</h3>
          <div class="muted small">${CONF_NAMES[0]}</div><div class="pteams">${teamGrid(0)}</div>
          <div class="muted small">${CONF_NAMES[1]}</div><div class="pteams">${teamGrid(1)}</div>
          <div class="psel">${this.logo(d.team, 50)}<div><div class="muted small">${team.city}</div><div class="car-big">${team.name}</div>
            <div class="muted small">ATA ${team.ovr.atk} · DEF ${team.ovr.def} · GOL ${team.ovr.gk} · VEL ${team.ovr.spd}</div></div></div>
          <h3>Temporada</h3>
          <div class="car-opts">
            <div class="opt"><span>Dificuldade</span>${this.sel('diff', this.optVals.diff, d.diff)}</div>
            <div class="opt"><span>Duração do período</span>${this.sel('periodMin', this.optVals.periodMin, d.periodMin)}</div>
            <div class="opt"><span>Temporada regular</span>${this.sel('len', this.optVals.len, d.len)}</div>
            <div class="opt"><span>Séries dos playoffs</span>${this.sel('bestOf', this.optVals.bestOf, d.bestOf)}</div>
          </div>
          <div class="muted small">Dificuldade maior rende mais XP (Novato ×0,8 · All-Star ×1,25).</div>`}
        </div>
      </div>
      <div class="btns">${edit ? '<button class="primary big" data-act="saveEdit">SALVAR</button><button data-act="cancelEdit">Cancelar</button>'
        : '<button class="primary big" data-act="create">COMEÇAR CARREIRA</button><button data-act="back">Voltar</button>'}</div>
    </div>`;
    ProPreview.set(d, team);
    ProPreview.mount($('pvSlot'));
    const rerender = () => { this.keepScroll = true; this.render(); };
    // campos de texto atualizam a prévia sem redesenhar a tela (para não perder o foco)
    const txt = () => {
      d.first = $('pfFirst').value.trim(); d.last = $('pfLast').value.trim();
      d.num = clamp(Math.round(Number($('pfNum').value) || 1), 1, 98);
      $('pvName').textContent = shortName(d);
      clearTimeout(this.txtT); this.txtT = setTimeout(() => ProPreview.set(d, team), 250);
    };
    ['pfFirst', 'pfLast', 'pfNum'].forEach(id => { $(id).oninput = txt; });
    $('pfNum').onchange = () => { txt(); rerender(); };
    el.querySelectorAll('[data-pos]').forEach(b => b.onclick = () => {
      d.pos = b.dataset.pos;
      if (ARCH.find(a => a.id === d.arch).fwd !== (posGroup(d.pos) !== 'D')) d.arch = ARCH.find(a => a.fwd === (posGroup(d.pos) !== 'D')).id;
      rerender();
    });
    el.querySelectorAll('[data-arch]').forEach(b => b.onclick = () => { d.arch = b.dataset.arch; rerender(); });
    el.querySelectorAll('[data-team]').forEach(b => b.onclick = () => { d.team = Number(b.dataset.team); rerender(); });
    el.querySelectorAll('[data-look]').forEach(b => b.onclick = () => { L[b.dataset.look] = Number(b.dataset.v); rerender(); });
    el.querySelectorAll('[data-range]').forEach(r => {
      r.oninput = () => { L[r.dataset.range] = Number(r.value); ProPreview.set(d, team); };
      r.onchange = rerender;
    });
    el.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => { ProPreview.zoom = Number(b.dataset.zoom); rerender(); });
    el.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => {
      const k = b.dataset.sel, vals = this.optVals[k].map(v => v[0]), obj = k === 'tape' ? L : d;
      const i = Math.max(0, vals.indexOf(obj[k]));
      obj[k] = vals[(i + Number(b.dataset.d) + vals.length) % vals.length]; rerender();
    });
    this.bind(el);
  },

  renderHub(el) {
    const s = Pro.s, pl = s.player, u = s.team, m = Pro.nextMatch(), home = m.h === u, ovr = proOverall(pl);
    const tabs = [['evo', 'Evolução'], ['tab', s.phase === 'playoffs' ? 'Playoffs' : 'Classificação'], ['est', 'Estatísticas']];
    let body = '';
    if (this.tab === 'evo') body = this.evoTab();
    else if (this.tab === 'tab') body = (s.phase === 'playoffs' ? this.bracket() : '') + `<div class="tables">${this.confTable(0)}${this.confTable(1)}</div>
      <div class="muted small">Os 8 primeiros de cada conferência (em destaque) vão aos playoffs. V = 2 pts · DP = derrota na prorrogação ou shootout (1 pt).</div>`;
    else body = this.statsTab();
    el.innerHTML = `<div class="panel wide car pro">
      <div class="phead">
        <div class="po big">${ovr}<small>GERAL</small></div>
        <div class="ph-info"><div class="car-big">${esc(pl.first)} ${esc(pl.last)}</div>
          <div class="muted">#${pl.num} · ${ROLE_FULL[pl.pos]} · ${ARCH.find(a => a.id === pl.arch).name} · ${pl.age} anos</div>
          <div class="muted small">TEMPORADA ${s.season} · ${DIFFS[s.opts.diff].name.toUpperCase()}</div></div>
        <div class="ph-team">${this.logo(u, 56)}<span>${this.tname(u)}</span></div>
      </div>
      <div class="xpbar"><span>XP disponível</span><b>${pl.xp}</b>${pl.xp >= 10 && ovr < 99 ? '<button data-tab="evo" class="hot">Evoluir atributos</button>' : ''}</div>
      ${this.lastGameBox()}
      <div class="next">
        <div class="ph">${Pro.phaseLabel()}</div>
        <div class="vsrow"><div>${this.logo(m.h, 60)}<span>${this.tname(m.h)}</span></div><strong>x</strong><div>${this.logo(m.a, 60)}<span>${this.tname(m.a)}</span></div></div>
        <div class="muted small">${home ? 'Em CASA' : 'FORA de casa'} · você controla só o seu jogador (J/Espaço pede o passe)</div>
        <div class="btns"><button class="primary big" data-act="play">JOGAR PARTIDA</button><button data-act="sim">Simular jogo</button>${s.phase === 'season' ? '<button data-act="sim5">Simular 5</button>' : ''}</div>
      </div>
      <div class="ptabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${body}
      <div class="btns"><button data-act="edit">Editar jogador</button><button data-act="back">Menu principal</button><button data-act="quit">Abandonar carreira</button></div>
    </div>`;
    this.bind(el);
  },

  lastGameBox() {
    const g = Pro.s.lastGame; if (!g) return '';
    const tag = g.so ? ' (SO)' : g.ot ? ' (PR)' : '';
    return `<div class="lastg ${g.won ? 'w' : 'l'}"><div><em>${g.sim ? 'Jogo simulado' : 'Último jogo'}</em>
      <b>${g.won ? 'Vitória' : 'Derrota'} ${g.my}–${g.their}${tag}</b> <span class="muted">${g.home ? 'x' : '@'} ${LIGA[g.opp].name}</span></div>
      <div class="lg-line">${g.g} G · ${g.a} A · ${g.sog} chutes · ${g.hits} pancadas</div>
      <div class="lg-rate">Nota <b>${g.rating.toFixed(1).replace('.', ',')}</b></div><div class="lg-xp">+${g.xp} XP</div></div>`;
  },

  evoTab() {
    const pl = Pro.s.player, w = OVR_W[posGroup(pl.pos)];
    return `<div class="evo">${ATTRS.map(([k, n]) => {
      const v = pl.attr[k], c = upCost(v), can = v < 99 && pl.xp >= c;
      return `<div class="ev"><span>${n}${w[k] ? ` <em>${Math.round(w[k] * 100)}%</em>` : ' <em>não conta</em>'}</span><div class="bar"><i style="width:${v}%"></i></div><b>${v}</b>
        <button data-up="${k}" ${can ? '' : 'disabled'}>${v >= 99 ? 'MÁX' : `+1 · ${c} XP`}</button></div>`;
    }).join('')}</div>
    <div class="btns"><button data-act="auto" ${pl.xp >= 10 ? '' : 'disabled'}>Distribuir automaticamente</button></div>
    <div class="muted small">A % mostra quanto cada atributo pesa no seu overall. Custo por ponto: 10 XP até 69 · 15 até 79 · 25 até 89 · 40 até 99.
      Você ganha XP em todo jogo (gols, assistências, chutes, pancadas e vitória); jogando de verdade rende o dobro de simular.</div>`;
  },

  confTable(c) {
    const s = Pro.s, T = s.table, rows = Pro.standings(c);
    return `<table class="tbl"><tr><th colspan="2">${CONF_NAMES[c]}</th><th>J</th><th>V</th><th>D</th><th>DP</th><th>SG</th><th>PTS</th></tr>` +
      rows.map((i, k) => { const r = T[i]; return `<tr class="${i === s.team ? 'me' : ''}${k < 8 ? ' q' : ''}"><td>${k + 1}</td><td class="tn">${this.logo(i, 20)} ${LIGA[i].name}</td>` +
        `<td>${r.gp}</td><td>${r.w}</td><td>${r.l}</td><td>${r.otl}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`; }).join('') + '</table>';
  },

  seriesBox(sr) {
    const s = Pro.s, row = (i, w) => `<div class="${i === s.team ? 'me' : ''}${sr.winner === i ? ' win' : ''}">${this.logo(i, 20)} <span>${LIGA[i].name}</span><b>${w}</b></div>`;
    return `<div class="series">${row(sr.a, sr.wins[0])}${row(sr.b, sr.wins[1])}</div>`;
  },
  bracket() {
    const po = Pro.s.po; if (!po) return '';
    return `<div class="pbracket">${po.rounds.map((r, k) => `<div><em>${PO_NAMES[k]}</em>${r.map(sr => this.seriesBox(sr)).join('')}</div>`).join('')}</div>`;
  },

  statsTab() {
    const s = Pro.s, row = (n, st) => `<tr><td class="tn">${n}</td><td>${st.gp}</td><td>${st.g}</td><td>${st.a}</td><td><b>${st.g + st.a}</b></td><td>${st.sog}</td><td>${st.hits}</td></tr>`;
    const hist = s.hist.length ? `<h3>Histórico</h3><table class="tbl"><tr><th>Temp.</th><th>Time</th><th>J</th><th>G</th><th>A</th><th>PTS</th><th>GER</th><th>Resultado</th></tr>` +
      s.hist.map(h => `<tr><td>${h.season}</td><td class="tn">${this.logo(h.team, 20)} ${LIGA[h.team].name}</td><td>${h.gp}</td><td>${h.g}</td><td>${h.a}</td><td><b>${h.g + h.a}</b></td><td>${h.ovr}</td><td>${h.result}</td></tr>`).join('') + '</table>' : '';
    const tro = s.trophies.length ? `<h3>Prêmios</h3><div class="troph">${s.trophies.map(t => `<span>🏆 ${t.a} <em>T${t.season}</em></span>`).join('')}</div>` : '';
    return `<h3>Temporada ${s.season}</h3><table class="tbl"><tr><th></th><th>J</th><th>G</th><th>A</th><th>PTS</th><th>Chutes</th><th>Pancadas</th></tr>
      ${row('Temporada regular', s.st)}${s.pst.gp ? row('Playoffs', s.pst) : ''}</table>${hist}${tro}`;
  },

  renderEnd(el) {
    const s = Pro.s, pl = s.player, champ = s.champion, st = s.st;
    el.innerHTML = `<div class="panel wide car pro">
      <h2>${champ === s.team ? '🏆 CAMPEÃO DA COPA!' : 'FIM DA TEMPORADA ' + s.season}</h2>
      <div class="champ">${this.logo(champ, 100)}<div class="muted">Campeão</div><div class="car-big">${this.tname(champ)}</div></div>
      <p>${LIGA[s.team].name}: <b>${s.result}</b></p>
      <div class="phead"><div class="po big">${proOverall(pl)}<small>GERAL</small></div><div class="ph-info"><div class="car-big">${esc(pl.first)} ${esc(pl.last)}</div>
        <div class="muted">Temporada regular: ${st.gp} J · ${st.g} G · ${st.a} A · <b>${st.g + st.a} PTS</b>${s.pst.gp ? ` · Playoffs: ${s.pst.g} G · ${s.pst.a} A` : ''}</div>
        <div class="muted small">Líderes da liga: ${s.leaders.g} gols · ${s.leaders.pts} pontos</div></div></div>
      ${s.awards.length ? `<div class="troph big">${s.awards.map(a => `<span>🏆 ${a}</span>`).join('')}</div>` : '<p class="muted">Nenhum prêmio individual nesta temporada.</p>'}
      ${this.bracket()}
      <div class="btns"><button class="primary big" data-act="again">PRÓXIMA TEMPORADA</button><button data-act="transfer">Trocar de time</button><button data-act="back">Menu principal</button></div>
      <div class="btns"><button data-act="quit">Aposentar (apagar carreira)</button></div>
    </div>`;
    this.bind(el);
  },

  renderTransfer(el) {
    const s = Pro.s, pick = this.pick;
    const grid = c => LIGA.map((t, i) => t.conf !== c || i === s.team ? '' :
      `<button class="pt${i === pick ? ' on' : ''}" data-pick="${i}" style="--c1:${t.primary}">${this.logo(i, 34)}<span>${t.name}</span><em>${teamOverall(t)}</em></button>`).join('');
    el.innerHTML = `<div class="panel wide car pro">
      <h2>TROCAR DE TIME</h2><p class="muted">Escolha o clube da próxima temporada. Seus atributos e o seu XP vão junto.</p>
      <div class="muted small">${CONF_NAMES[0]}</div><div class="pteams">${grid(0)}</div>
      <div class="muted small">${CONF_NAMES[1]}</div><div class="pteams">${grid(1)}</div>
      <div class="btns"><button class="primary big" data-act="sign" ${pick == null ? 'disabled' : ''}>ASSINAR${pick != null ? ' COM ' + LIGA[pick].name.toUpperCase() : ''}</button><button data-act="cancelT">Voltar</button></div>
    </div>`;
    el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { this.pick = Number(b.dataset.pick); this.keepScroll = true; this.render(); });
    this.bind(el);
  },

  bind(el) {
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.keepScroll = true; this.render(); });
    el.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { if (Pro.upgrade(b.dataset.up)) { Pro.save(); Sfx.stick(0.4); } this.keepScroll = true; this.render(); });
    el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      Sfx.init();
      const a = b.dataset.act, s = Pro.s;
      if (a === 'back') this.close();
      if (a === 'create') {
        const d = this.draft; if (!d.last) d.last = 'Jogador';
        Pro.create(d); this.mode = 'hub'; this.tab = 'evo'; this.render();
      }
      if (a === 'edit') {
        const p = s.player;
        this.draft = { first: p.first, last: p.last, num: p.num, pos: p.pos, hand: p.hand, arch: p.arch, team: s.team, look: Object.assign({}, p.look) };
        this.mode = 'edit'; this.render();
      }
      if (a === 'saveEdit') {
        const d = this.draft;
        Object.assign(s.player, { first: d.first, last: d.last || 'Jogador', num: d.num, hand: d.hand, look: d.look });
        Pro.save(); this.mode = 'hub'; this.render();
      }
      if (a === 'cancelEdit') { this.mode = 'hub'; this.render(); }
      if (a === 'auto') { Pro.autoUpgrade(); Pro.save(); this.keepScroll = true; this.render(); }
      if (a === 'sim') { Pro.simUserGame(); this.render(); }
      if (a === 'sim5') { for (let i = 0; i < 5 && s.phase === 'season'; i++) Pro.simUserGame(); this.render(); }
      if (a === 'play') this.play();
      if (a === 'quit' && confirm('Apagar a carreira deste jogador? Todo o progresso será perdido.')) { Pro.clear(); this.newDraft(); this.mode = 'create'; this.render(); }
      if (a === 'again') { Pro.newSeason(s.team); this.tab = 'evo'; this.render(); }
      if (a === 'transfer') { this.pick = null; this.mode = 'transfer'; this.render(); }
      if (a === 'cancelT') { this.mode = 'hub'; this.render(); }
      if (a === 'sign' && this.pick != null) { Pro.newSeason(this.pick); this.mode = 'hub'; this.tab = 'evo'; this.render(); }
    });
  },

  // time do jogador com o atleta no lugar do titular da mesma posição
  teamWithPlayer() {
    const s = Pro.s, pl = s.player, t = LIGA[s.team];
    const me = { name: shortName(pl), num: pl.num, pos: pl.pos, hand: pl.hand, look: pl.look, me: true, r: Object.assign({ gk: 50 }, pl.attr) };
    const used = new Set([pl.num]);
    const roster = t.roster.map(p => {
      if (p.pos === pl.pos) return me;
      let num = p.num; while (used.has(num)) num = num % 98 + 1;
      used.add(num); return Object.assign({}, p, { num });
    });
    return Object.assign({}, t, { roster });
  },

  play() {
    const s = Pro.s, m = Pro.nextMatch(), mine = m.h === s.team ? 0 : 1;
    const H = mine === 0 ? this.teamWithPlayer() : LIGA[m.h], A = mine === 1 ? this.teamWithPlayer() : LIGA[m.a];
    $('pro').classList.add('hidden'); $('menu').classList.add('hidden');
    startGame({ home: H, away: A, mode: 'solo', humanSide: mine, diff: s.opts.diff, periodMin: s.opts.periodMin,
      offside: settings.offside, icing: settings.icing, high: settings.high, cam: settings.cam, pro: true, lock: true }, false);
    UI.banner(`${H.name} x ${A.name}`, Pro.phaseLabel(), 2600);
  },

  // chamado pelo relatório final da partida
  finish(game, so) {
    const [a, b] = game.teams, mine = game.humans[0].team.idx;
    const me = game.teams[mine].skaters.find(x => x.data.me);
    const res = { hs: a.score + (so === 0 ? 1 : 0), as: b.score + (so === 1 ? 1 : 0), ot: game.ot || so !== null, so: so !== null };
    const line = me ? { g: me.stats.g, a: me.stats.a, sog: me.stats.sog, hits: me.stats.hits } : { g: 0, a: 0, sog: 0, hits: 0 };
    Pro.applyGame(line, res, mine, false);
    Pro.advance(res);
    $('hud').classList.add('hidden');
    startDemo();
    $('pro').classList.remove('hidden');
    this.mode = 'hub'; this.tab = 'evo';
    this.render();
  },
};
