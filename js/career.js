'use strict';
// ===== Modo carreira (clubes): fase de grupos + playoffs melhor de 3 =====
// 8 times em 2 grupos de 4, turno e returno (6 rodadas). Os 2 melhores de cada grupo vão às semifinais
// (1ºA x 2ºB, 1ºB x 2ºA), depois a final. Vitória = 3 pts, vitória na prorrogação/pênaltis = 2, derrota na prorrogação/pênaltis = 1.

const CAREER_KEY = 'hoquei-career';
const ROUND_PAIRS = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];

function poisson(l) { let k = 0, p = Math.exp(-l), s = p; const u = Math.random(); while (u > s && k < 12) { k++; p *= l / k; s += p; } return k; }

// força de ataque contra defesa e goleiro do rival -> gols esperados
function expGoals(t, o) { return clamp(2.9 + (t.ovr.atk - o.ovr.def) * 0.07 + (t.ovr.spd - o.ovr.spd) * 0.02 - (o.ovr.gk - 81) * 0.06, 1.1, 5); }

// pênaltis simulados (desempate depois da prorrogação): devolve 0 se o primeiro time vence
function simShootout(a, b) {
  const pa = clamp(0.5 + (a.ovr.atk - b.ovr.gk) * 0.012, 0.25, 0.75);
  const pb = clamp(0.5 + (b.ovr.atk - a.ovr.gk) * 0.012, 0.25, 0.75);
  return Math.random() < pa / (pa + pb) ? 0 : 1;
}

function simGame(h, a) { return simMatch(TEAMS[h], TEAMS[a]); }

// simula uma partida entre dois times (objetos com .ovr): placar, prorrogação e shootout
function simMatch(H, A) {
  let hs = poisson(expGoals(H, A) * 1.04), as = poisson(expGoals(A, H)), ot = false, so = false;
  if (hs === as) {
    ot = true;
    if (Math.random() < 0.6) { if (Math.random() < 0.5 + (teamOverall(H) - teamOverall(A)) * 0.02) hs++; else as++; }
    else { so = true; if (simShootout(H, A) === 0) hs++; else as++; }
  }
  return { hs, as, ot, so };
}

const Career = {
  s: null,

  load() {
    try { this.s = JSON.parse(localStorage.getItem(CAREER_KEY) || 'null'); } catch (e) { this.s = null; }
    return this.s;
  },
  save() { try { localStorage.setItem(CAREER_KEY, JSON.stringify(this.s)); } catch (e) { /* sem storage */ } },
  clear() { this.s = null; try { localStorage.removeItem(CAREER_KEY); } catch (e) { /* sem storage */ } },

  newSeason(team, diff, periodMin) {
    // sorteio dos grupos: o seu time fica no grupo A
    const others = TEAMS.map((_, i) => i).filter(i => i !== team).sort(() => Math.random() - 0.5);
    const groups = [[team, ...others.slice(0, 3)], others.slice(3, 7)];
    const table = {};
    TEAMS.forEach((_, i) => { table[i] = { gp: 0, w: 0, otw: 0, otl: 0, l: 0, gf: 0, ga: 0, pts: 0 }; });
    const sched = [];
    for (let r = 0; r < 6; r++) {
      const round = [];
      for (const g of groups) for (const [x, y] of ROUND_PAIRS[r % 3]) round.push(r < 3 ? { h: g[x], a: g[y], res: null } : { h: g[y], a: g[x], res: null });
      sched.push(round);
    }
    this.s = { team, diff, periodMin, season: (this.s && this.s.season || 0) + 1, groups, table, sched, round: 0, phase: 'groups', semis: null, final: null, champion: null, last: [] };
    this.save();
  },

  standings(g) {
    const T = this.s.table;
    return this.s.groups[g].slice().sort((x, y) => T[y].pts - T[x].pts || (T[y].w - T[x].w) || ((T[y].gf - T[y].ga) - (T[x].gf - T[x].ga)) || T[y].gf - T[x].gf);
  },

  // próxima partida do time do jogador (ou null se ele não joga nesta fase)
  nextMatch() {
    const s = this.s, u = s.team;
    if (s.phase === 'groups') return s.sched[s.round].find(m => m.h === u || m.a === u);
    if (s.phase === 'semis' || s.phase === 'final') {
      const sr = this.active().find(x => x.winner == null && (x.a === u || x.b === u));
      if (!sr) return null;
      const n = sr.games.length; // jogos 1 e 3 na casa do melhor colocado
      return n === 1 ? { h: sr.b, a: sr.a, series: sr } : { h: sr.a, a: sr.b, series: sr };
    }
    return null;
  },

  record(m, res) {
    const s = this.s;
    s.last.push({ h: m.h, a: m.a, ...res, phase: s.phase });
    if (s.phase === 'groups') {
      m.res = res;
      const T = s.table, H = T[m.h], A = T[m.a];
      H.gp++; A.gp++; H.gf += res.hs; H.ga += res.as; A.gf += res.as; A.ga += res.hs;
      const [W, L] = res.hs > res.as ? [H, A] : [A, H];
      if (res.ot) { W.otw++; W.pts += 2; L.otl++; L.pts += 1; } else { W.w++; W.pts += 3; L.l++; }
    } else {
      const sr = m.series; sr.games.push({ h: m.h, a: m.a, ...res });
      const wi = (res.hs > res.as ? m.h : m.a) === sr.a ? 0 : 1;
      sr.wins[wi]++;
      if (sr.wins[wi] === 2) sr.winner = wi ? sr.b : sr.a;
    }
  },

  // registra o jogo do usuário (ou simula) e avança o calendário até a próxima partida dele
  active() { const s = this.s; return s.phase === 'semis' ? s.semis : s.phase === 'final' ? [s.final] : []; },

  advance(userRes, inner) {
    const s = this.s; if (!inner) s.last = [];
    const m = this.nextMatch();
    if (m) this.record(m, userRes || simGame(m.h, m.a));
    if (s.phase === 'groups') {
      for (const o of s.sched[s.round]) if (!o.res) this.record(o, simGame(o.h, o.a));
      s.round++;
      if (s.round === 6) this.startPlayoffs();
    } else {
      // um jogo em cada série ainda aberta
      for (const sr of this.active()) if (sr.winner == null && sr !== (m && m.series)) {
        const n = sr.games.length, h = n === 1 ? sr.b : sr.a, a = n === 1 ? sr.a : sr.b;
        this.record({ h, a, series: sr }, simGame(h, a));
      }
      if (this.active().every(x => x.winner != null)) this.nextPhase();
    }
    // se o seu time não está mais vivo, simula até o fim
    while (s.phase !== 'done' && !this.nextMatch()) this.advance(null, true);
    this.save();
  },

  startPlayoffs() {
    const s = this.s, A = this.standings(0), B = this.standings(1);
    s.seeds = { [A[0]]: '1ºA', [A[1]]: '2ºA', [B[0]]: '1ºB', [B[1]]: '2ºB' };
    s.semis = [{ a: A[0], b: B[1], wins: [0, 0], games: [], winner: null, name: 'Semifinal 1' },
      { a: B[0], b: A[1], wins: [0, 0], games: [], winner: null, name: 'Semifinal 2' }];
    s.phase = 'semis';
  },

  nextPhase() {
    const s = this.s;
    if (s.phase === 'semis') {
      // na final, o mando é de quem fez mais pontos na fase de grupos
      let [x, y] = s.semis.map(sr => sr.winner);
      if (s.table[y].pts > s.table[x].pts) [x, y] = [y, x];
      s.final = { a: x, b: y, wins: [0, 0], games: [], winner: null, name: 'Final' };
      s.phase = 'final';
    } else if (s.phase === 'final') {
      s.champion = s.final.winner; s.phase = 'done';
    }
  },

  phaseLabel() {
    const s = this.s, m = this.nextMatch();
    if (s.phase === 'groups') return `Fase de grupos · Rodada ${s.round + 1} de 6`;
    if (s.phase === 'done') return 'Temporada encerrada';
    const sr = m && m.series;
    return sr ? `${s.phase === 'final' ? 'FINAL' : 'Semifinal'} · Jogo ${sr.games.length + 1} (melhor de 3) · Série ${sr.wins[sr.a === s.team ? 0 : 1]}–${sr.wins[sr.a === s.team ? 1 : 0]}` : '';
  },
};

// ===== Tela da carreira =====
const CareerUI = {
  pick: 0, diff: 1, periodMin: 3,

  open() {
    Sfx.init();
    $('menu').classList.add('hidden');
    $('career').classList.remove('hidden');
    Career.load();
    this.render();
  },
  close() { $('career').classList.add('hidden'); $('menu').classList.remove('hidden'); },

  logo(i, size = 44) {
    const t = TEAMS[i];
    return `<i class="clogo" style="--c1:${t.primary};--c2:${t.secondary};width:${size}px;height:${size}px;font-size:${size * 0.28}px">${t.id}</i>`;
  },
  name(i) { return `${TEAMS[i].city} <b>${TEAMS[i].name}</b>`; },

  render() {
    const el = $('career'), s = Career.s;
    if (!s) return this.renderSetup(el);
    if (s.phase === 'done') return this.renderEnd(el);
    this.renderHub(el);
  },

  renderSetup(el) {
    const sel = (k, vals) => {
      const cur = vals.findIndex(v => v[0] === this[k]);
      return `<div class="sel"><button data-k="${k}" data-d="-1">◀</button><b>${vals[cur][1]}</b><button data-k="${k}" data-d="1">▶</button></div>`;
    };
    const t = TEAMS[this.pick];
    el.innerHTML = `<div class="panel wide car">
      <h2>MODO CARREIRA · CLUBES</h2>
      <p class="muted">Escolha o seu clube. São 2 grupos de 4 (turno e returno), semifinais e final em melhor de 3.</p>
      <div class="car-pick">${TEAMS.map((x, i) => `<button class="car-team${i === this.pick ? ' on' : ''}" data-pick="${i}" style="--c1:${x.primary}">${this.logo(i, 54)}<span>${x.name}</span><em>${teamOverall(x)}</em></button>`).join('')}</div>
      <div class="car-sel">${this.logo(this.pick, 70)}<div><div class="muted">${t.city}</div><div class="car-big">${t.name}</div>
        <div class="muted small">ATA ${t.ovr.atk} · DEF ${t.ovr.def} · GOL ${t.ovr.gk} · VEL ${t.ovr.spd}</div></div></div>
      <div class="car-opts">
        <div class="opt"><span>Dificuldade</span>${sel('diff', DIFFS.map((d, i) => [i, d.name]))}</div>
        <div class="opt"><span>Duração do período</span>${sel('periodMin', [[2, '2 min'], [3, '3 min'], [5, '5 min'], [10, '10 min'], [20, '20 min (real)']])}</div>
      </div>
      <div class="btns"><button class="primary big" data-act="start">COMEÇAR TEMPORADA</button><button data-act="back">Voltar</button></div>
    </div>`;
    el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { this.pick = Number(b.dataset.pick); this.render(); });
    el.querySelectorAll('button[data-k]').forEach(b => b.onclick = () => {
      const vals = b.dataset.k === 'diff' ? DIFFS.map((_, i) => i) : [2, 3, 5, 10, 20];
      const i = vals.indexOf(this[b.dataset.k]);
      this[b.dataset.k] = vals[(i + Number(b.dataset.d) + vals.length) % vals.length]; this.render();
    });
    this.bind(el);
  },

  table(g) {
    const s = Career.s, T = s.table, rows = Career.standings(g);
    return `<table class="tbl"><tr><th colspan="2">Grupo ${'AB'[g]}</th><th>J</th><th>V</th><th>VP</th><th>DP</th><th>D</th><th>SG</th><th>PTS</th></tr>` +
      rows.map((i, k) => { const r = T[i]; return `<tr class="${i === s.team ? 'me' : ''}${k < 2 ? ' q' : ''}"><td>${k + 1}</td><td class="tn">${this.logo(i, 22)} ${TEAMS[i].name}</td>` +
        `<td>${r.gp}</td><td>${r.w}</td><td>${r.otw}</td><td>${r.otl}</td><td>${r.l}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`; }).join('') + '</table>';
  },

  seriesBox(sr) {
    if (!sr) return '<div class="series empty">A definir</div>';
    const s = Career.s, row = (i, w) => `<div class="${i === s.team ? 'me' : ''}${sr.winner === i ? ' win' : ''}">${this.logo(i, 22)} <span>${TEAMS[i].name}</span><b>${w}</b></div>`;
    return `<div class="series"><em>${sr.name}</em>${row(sr.a, sr.wins[0])}${row(sr.b, sr.wins[1])}</div>`;
  },

  resultLine(r) {
    const tag = r.so ? ' <span class="muted">(pên.)</span>' : r.ot ? ' <span class="muted">(PR)</span>' : '';
    const me = r.h === Career.s.team || r.a === Career.s.team;
    return `<li class="${me ? 'me' : ''}">${TEAMS[r.h].id} <b>${r.hs} – ${r.as}</b> ${TEAMS[r.a].id}${tag}</li>`;
  },

  renderHub(el) {
    const s = Career.s, m = Career.nextMatch(), u = s.team;
    const home = m.h === u;
    const playoffs = s.phase !== 'groups';
    el.innerHTML = `<div class="panel wide car">
      <div class="car-head">${this.logo(u, 46)}<div><div class="muted small">TEMPORADA ${s.season} · ${DIFFS[s.diff].name.toUpperCase()}</div><div class="car-big">${TEAMS[u].city} ${TEAMS[u].name}</div></div></div>
      <div class="next">
        <div class="ph">${Career.phaseLabel()}</div>
        <div class="vsrow"><div>${this.logo(m.h, 64)}<span>${this.name(m.h)}</span></div><strong>x</strong><div>${this.logo(m.a, 64)}<span>${this.name(m.a)}</span></div></div>
        <div class="muted small">${home ? 'Você joga em CASA (torcida a favor)' : 'Você joga FORA de casa'}</div>
        <div class="btns"><button class="primary big" data-act="play">JOGAR PARTIDA</button><button data-act="sim">Simular</button></div>
      </div>
      ${s.last.length ? `<h3>Últimos resultados</h3><ul class="results">${s.last.map(r => this.resultLine(r)).join('')}</ul>` : ''}
      ${playoffs ? `<h3>Playoffs</h3><div class="bracket"><div>${s.semis.map(sr => this.seriesBox(sr)).join('')}</div><div>${this.seriesBox(s.final)}</div></div>` : ''}
      <div class="tables">${this.table(0)}${this.table(1)}</div>
      <div class="muted small">Os 2 primeiros de cada grupo (em destaque) vão aos playoffs. V = vitória (3 pts) · VP/DP = vitória/derrota na prorrogação ou pênaltis (2/1 pts).</div>
      <div class="btns"><button data-act="back">Menu principal</button><button data-act="quit">Abandonar carreira</button></div>
    </div>`;
    this.bind(el);
  },

  renderEnd(el) {
    const s = Career.s, u = s.team, won = s.champion === u;
    let how = 'Eliminado na fase de grupos';
    if (s.semis && s.semis.some(sr => sr.a === u || sr.b === u)) how = 'Eliminado na semifinal';
    if (s.final && (s.final.a === u || s.final.b === u)) how = won ? 'CAMPEÃO!' : 'Vice-campeão';
    el.innerHTML = `<div class="panel wide car">
      <h2>${won ? '🏆 CAMPEÃO DA LIGA BRASILEIRA!' : 'FIM DA TEMPORADA ' + s.season}</h2>
      <div class="champ">${this.logo(s.champion, 110)}<div class="muted">Campeão</div><div class="car-big">${this.name(s.champion)}</div></div>
      <p>${TEAMS[u].name}: <b>${how}</b></p>
      <h3>Playoffs</h3><div class="bracket"><div>${(s.semis || []).map(sr => this.seriesBox(sr)).join('')}</div><div>${this.seriesBox(s.final)}</div></div>
      <div class="tables">${this.table(0)}${this.table(1)}</div>
      <div class="btns"><button class="primary big" data-act="again">NOVA TEMPORADA</button><button data-act="new">Trocar de clube</button><button data-act="back">Menu principal</button></div>
    </div>`;
    this.bind(el);
  },

  bind(el) {
    el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      Sfx.init();
      const a = b.dataset.act, s = Career.s;
      if (a === 'back') this.close();
      if (a === 'start') { Career.newSeason(this.pick, this.diff, this.periodMin); this.render(); }
      if (a === 'sim') { Career.advance(); this.render(); }
      if (a === 'play') this.play();
      if (a === 'quit' && confirm('Abandonar a carreira? O progresso desta temporada será perdido.')) { Career.clear(); this.render(); }
      if (a === 'again') { Career.newSeason(s.team, s.diff, s.periodMin); this.render(); }
      if (a === 'new') { this.pick = s.team; Career.clear(); this.render(); }
    });
  },

  play() {
    const s = Career.s, m = Career.nextMatch();
    $('career').classList.add('hidden');
    startGame({ home: TEAMS[m.h], away: TEAMS[m.a], mode: 'solo', humanSide: m.h === s.team ? 0 : 1, diff: s.diff, periodMin: s.periodMin,
      offside: settings.offside, icing: settings.icing, high: settings.high, cam: settings.cam, career: true }, false);
    UI.banner(`${TEAMS[m.h].name} x ${TEAMS[m.a].name}`, Career.phaseLabel(), 2600);
  },

  // chamado pelo relatório final da partida
  finish(game, so) {
    const [a, b] = game.teams;
    const res = { hs: a.score + (so === 0 ? 1 : 0), as: b.score + (so === 1 ? 1 : 0), ot: game.ot || so !== null, so: so !== null };
    Career.advance(res);
    $('hud').classList.add('hidden');
    startDemo();
    $('career').classList.remove('hidden');
    this.render();
  },
};
