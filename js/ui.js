'use strict';
const $ = id => document.getElementById(id);
const fmtClock = t => { t = Math.max(0, Math.ceil(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
const perLabel = g => g.so ? 'SO' : g.ot ? 'PR' : g.period + 'º';

// UI vazia usada pelo jogo de demonstração atrás do menu
const NullUI = { initHud() {}, update() {}, banner() {}, toast() {}, goal() {}, intermission(g) { g.nextPeriod(); }, final() {}, togglePause() {} };

const UI = {
  t: 0, bannerTimer: null, onExit: null, onRestart: null, game: null,

  initHud(game) {
    this.game = game;
    $('hud').classList.remove('hidden');
    game.teams.forEach((t, i) => {
      const el = $('sbT' + i);
      el.querySelector('.sb-sw').style.background = t.kit.jersey === '#f2f2f2' ? t.data.primary : t.kit.jersey;
      el.querySelector('.sb-abbr').textContent = t.data.id;
    });
    const cards = $('cards'); cards.innerHTML = '';
    game.humans.forEach((h, i) => {
      const d = document.createElement('div'); d.className = 'card'; d.style.borderColor = h.ctrl.color;
      d.innerHTML = `<div class="c-top"><span class="c-tag" style="background:${h.ctrl.color}">P${i + 1}</span><span class="c-name"></span></div>
        <div class="c-bar"><i class="c-sta"></i></div><div class="c-bar c-shot"><i class="c-pow"></i></div>`;
      if (i === 1) d.classList.add('right');
      cards.appendChild(d); h.card = d;
    });
    this.mm = $('minimap').getContext('2d');
    this.update(game, 1);
  },

  update(game, dt) {
    this.t += dt;
    for (const h of game.humans) {
      const s = h.skater, c = h.card; if (!c) continue;
      c.querySelector('.c-name').textContent = `#${s.num} ${s.name} · ${ROLE_NAME[s.role]}`;
      c.querySelector('.c-sta').style.width = (s.stamina * 100).toFixed(0) + '%';
      const pw = s.charge >= 0 ? s.charge : s.passHold >= 0 ? s.passHold / 0.5 : 0;
      const pe = c.querySelector('.c-pow');
      pe.style.width = (Math.min(1, pw) * 100).toFixed(0) + '%';
      pe.style.background = s.charge > 0.4 ? '#ff5a3c' : s.charge >= 0 ? '#ffd400' : '#58c4ff';
      c.querySelector('.c-shot').style.opacity = pw > 0 ? 1 : 0.25;
    }
    if (this.t < 0.1) return;
    this.t = 0;
    game.teams.forEach((t, i) => { $('sbT' + i).querySelector('.sb-score').textContent = t.score; });
    $('sbPer').textContent = perLabel(game);
    $('sbClock').textContent = fmtClock(game.clock);
    $('sbSub').textContent = game.so ? 'SHOOTOUT   ' + game.soTally() : `CHUTES A GOL  ${game.teams[0].stats.sog} · ${game.teams[1].stats.sog}`;
    this.drawMinimap(game);
  },

  drawMinimap(game) {
    const g = this.mm, W = 244, H = 104, S = (W - 4) / (HALF_L * 2), X = x => 2 + (x + HALF_L) * S, Z = z => 2 + (z + HALF_W) * S;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(235,242,248,0.85)'; roundRectPath(g, 2, 2, HALF_L * 2 * S, HALF_W * 2 * S, CORNER_R * S); g.fill();
    g.fillStyle = '#c8102e'; g.fillRect(X(0) - 1, 2, 2, HALF_W * 2 * S);
    g.fillStyle = '#0b3fa8'; g.fillRect(X(BLUE_X) - 1, 2, 2, HALF_W * 2 * S); g.fillRect(X(-BLUE_X) - 1, 2, 2, HALF_W * 2 * S);
    g.fillStyle = '#c8102e'; g.fillRect(X(GOAL_X), Z(-HALF_W + 1), 1, (HALF_W * 2 - 2) * S); g.fillRect(X(-GOAL_X), Z(-HALF_W + 1), 1, (HALF_W * 2 - 2) * S);
    for (const t of game.teams) {
      const col = t.kit.jersey === '#f2f2f2' ? '#ffffff' : t.kit.jersey;
      for (const s of [...t.skaters, t.goalie]) {
        if (!s.active) continue;
        g.beginPath(); g.arc(X(s.x), Z(s.z), s.isGoalie ? 4 : 3.5, 0, 6.28);
        g.fillStyle = col; g.fill(); g.lineWidth = 1.5; g.strokeStyle = s.human ? s.human.ctrl.color : t.data.primary; g.stroke();
      }
    }
    const p = game.puck.pos;
    g.beginPath(); g.arc(X(p.x), Z(p.z), 2.2, 0, 6.28); g.fillStyle = '#000'; g.fill();
  },

  banner(main, sub, ms = 1800) {
    const b = $('banner');
    b.querySelector('.b-main').textContent = main;
    b.querySelector('.b-sub').textContent = sub || '';
    b.classList.remove('hidden'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), ms);
  },

  toast(text) {
    const box = $('toasts'), d = document.createElement('div');
    d.className = 'toast'; d.textContent = text; box.appendChild(d);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => d.remove(), 1800);
  },

  goal(game, T, scorer, assists) {
    const sub = scorer ? `${scorer.name} (${scorer.stats.g})` + (assists.length ? ' · Assist.: ' + assists.map(a => a.name).join(', ') : ' · sem assistência') : 'Gol contra';
    this.banner('GOL! ' + T.data.city.toUpperCase(), sub, 4200);
    $('banner').style.setProperty('--team', T.data.primary);
  },

  statsTable(game) {
    const [a, b] = game.teams;
    const pct = t => t.stats.passes ? Math.round(t.stats.passOk / t.stats.passes * 100) + '%' : '-';
    const fo = t => t.stats.fo ? Math.round(t.stats.fow / t.stats.fo * 100) + '%' : '-';
    const rows = [['Gols', a.score, b.score], ['Chutes a gol', a.stats.sog, b.stats.sog], ['Finalizações', a.stats.att, b.stats.att],
      ['Faceoffs vencidos', fo(a), fo(b)], ['Pancadas', a.stats.hits, b.stats.hits], ['Passes certos', pct(a), pct(b)]];
    return `<table class="st"><tr><th>${a.data.id}</th><th></th><th>${b.data.id}</th></tr>` +
      rows.map(r => `<tr><td>${r[1]}</td><td class="lbl">${r[0]}</td><td>${r[2]}</td></tr>`).join('') + '</table>';
  },

  goalsList(game) {
    if (!game.goals.length) return '<p class="muted">Nenhum gol ainda.</p>';
    return '<ul class="goals">' + game.goals.map(g => `<li><b style="color:${g.team.data.primary === '#1a1a1a' ? '#d4a017' : g.team.data.primary}">${g.team.data.id}</b> ${g.scorer ? g.scorer.name : 'Gol contra'}` +
      `<span class="muted"> ${g.period > 3 ? 'PR' : g.period + 'º'} ${fmtClock(game.periodLen - g.clock)}</span></li>`).join('') + '</ul>';
  },

  intermission(game) {
    const r = $('report');
    r.querySelector('h2').textContent = `FIM DO ${game.period}º PERÍODO`;
    r.querySelector('.score').innerHTML = this.scoreLine(game);
    r.querySelector('.body').innerHTML = this.statsTable(game) + this.goalsList(game);
    const btns = r.querySelector('.btns'); btns.innerHTML = '';
    const next = game.period === 3 ? 'PRORROGAÇÃO (3 contra 3)' : `${game.period + 1}º PERÍODO`;
    this.button(btns, next, () => { r.classList.add('hidden'); game.nextPeriod(); }, true);
    this.button(btns, 'Sair para o menu', () => { r.classList.add('hidden'); this.onExit(); });
    r.classList.remove('hidden');
  },

  final(game) {
    const r = $('report'), [a, b] = game.teams;
    // empate só acaba em shootout; a proteção garante que a carreira nunca registre empate
    const so = game.soWinner != null ? game.soWinner : (game.opts.career || game.opts.pro) && a.score === b.score ? simShootout(a.data, b.data) : null;
    const w = so !== null ? game.teams[so] : a.score === b.score ? null : (a.score > b.score ? a : b);
    r.querySelector('h2').textContent = w ? `VITÓRIA: ${w.data.city.toUpperCase()} ${w.data.name.toUpperCase()}` + (so !== null ? ' (SHOOTOUT)' : game.ot ? ' (PR)' : '') : 'EMPATE';
    r.querySelector('.score').innerHTML = this.scoreLine(game);
    const players = [...a.skaters, ...b.skaters].map(s => ({ s, pts: s.stats.g * 3 + s.stats.a * 2 + s.stats.sog * 0.3 + s.stats.hits * 0.2 }));
    for (const t of game.teams) { const g = t.goalie; players.push({ s: g, pts: g.stats.sv * 0.35 - (g.stats.sa - g.stats.sv) * 0.8 }); }
    players.sort((x, y) => y.pts - x.pts);
    const stars = players.slice(0, 3).map((p, i) => {
      const s = p.s, line = s.isGoalie ? `${s.stats.sv} defesas em ${s.stats.sa} chutes` : `${s.stats.g} G · ${s.stats.a} A · ${s.stats.sog} chutes`;
      return `<li><span class="star">${'★'.repeat(3 - i)}</span> <b>${s.name}</b> <span class="muted">${s.team.data.id} · ${line}</span></li>`;
    }).join('');
    r.querySelector('.body').innerHTML = (game.so ? `<p class="so-line">Shootout: <b>${game.soTally()}</b></p>` : '') + `<h3>Estrelas do jogo</h3><ul class="stars">${stars}</ul>` + this.statsTable(game) + this.goalsList(game);
    const btns = r.querySelector('.btns'); btns.innerHTML = '';
    if (game.opts.pro) this.button(btns, 'Continuar carreira', () => { r.classList.add('hidden'); ProUI.finish(game, so); }, true);
    else if (game.opts.career) this.button(btns, 'Continuar carreira', () => { r.classList.add('hidden'); CareerUI.finish(game, so); }, true);
    else {
      this.button(btns, 'Jogar de novo', () => { r.classList.add('hidden'); this.onRestart(); }, true);
      this.button(btns, 'Menu principal', () => { r.classList.add('hidden'); this.onExit(); });
    }
    r.classList.remove('hidden');
    Sfx.swell(0.5, 3);
  },

  scoreLine(game) {
    const [a, b] = game.teams;
    return `<span>${a.data.city} <b>${a.data.name}</b></span><strong>${a.score} – ${b.score}</strong><span>${b.data.city} <b>${b.data.name}</b></span>`;
  },

  button(parent, text, fn, primary) {
    const b = document.createElement('button'); b.textContent = text; if (primary) b.className = 'primary';
    b.onclick = () => { Sfx.init(); fn(); }; parent.appendChild(b); return b;
  },

  togglePause() {
    const g = this.game; if (!g) return;
    g.paused = !g.paused;
    $('pause').classList.toggle('hidden', !g.paused);
    if (g.paused) $('pauseCam').textContent = 'Câmera: ' + CAMS[g.camMode].name;
  },
};
