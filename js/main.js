'use strict';
// ===== Menu, configurações e loop principal =====
const DEFAULTS = { home: 0, away: 1, mode: 'solo', diff: 1, periodMin: 3, offside: true, icing: true, high: true, cam: 0 };
let settings = Object.assign({}, DEFAULTS);
try { Object.assign(settings, JSON.parse(localStorage.getItem('hoquei-settings') || '{}')); } catch (e) { /* sem storage */ }
const save = () => { try { localStorage.setItem('hoquei-settings', JSON.stringify(settings)); } catch (e) { /* sem storage */ } };

let renderer = null, rendererHigh = null, game = null, demo = false, last = performance.now();
function makeRenderer(high) {
  if (renderer && rendererHigh === high) return;
  if (renderer) { renderer.dispose(); renderer.domElement.remove(); }
  renderer = new THREE.WebGLRenderer({ antialias: high, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 2 : 1));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('app').appendChild(renderer.domElement);
  rendererHigh = high;
}

function startGame(opts, isDemo) {
  if (game) game.dispose();
  makeRenderer(opts.high);
  demo = isDemo; Sfx.suppress = isDemo;
  game = new Game(renderer, opts, isDemo ? NullUI : UI);
  if (isDemo) { game.timeScale = 1; $('hud').classList.add('hidden'); }
}

function startDemo() {
  const a = Math.floor(Math.random() * ALL_TEAMS.length);
  let b = Math.floor(Math.random() * (ALL_TEAMS.length - 1)); if (b >= a) b++;
  startGame({ home: ALL_TEAMS[a], away: ALL_TEAMS[b], mode: 'cpu', diff: 1, periodMin: 20, offside: true, icing: true, high: settings.high, cam: 0 }, true);
}

function playFromSettings() {
  Sfx.init();
  $('menu').classList.add('hidden');
  startGame({ home: ALL_TEAMS[settings.home], away: ALL_TEAMS[settings.away], mode: settings.mode, diff: settings.diff, periodMin: settings.periodMin,
    offside: settings.offside, icing: settings.icing, high: settings.high, cam: settings.cam }, false);
  UI.banner(`${ALL_TEAMS[settings.home].name} x ${ALL_TEAMS[settings.away].name}`, 'Boa partida!', 2200);
}

function backToMenu() {
  const career = game && game.opts.career, pro = game && game.opts.pro;
  $('pause').classList.add('hidden'); $('report').classList.add('hidden'); $('controls').classList.add('hidden');
  $('hud').classList.add('hidden');
  // saindo de um jogo da carreira volta para a tela da carreira (a partida não conta)
  if (pro) { startDemo(); ProUI.open(); return; }
  if (career) { startDemo(); CareerUI.open(); return; }
  $('menu').classList.remove('hidden');
  renderMenu();
  startDemo();
}
UI.onExit = backToMenu;
UI.onRestart = playFromSettings;

// ---------- menu ----------
const OPTIONS = [
  { key: 'mode', label: 'Modo', values: [['solo', '1 jogador vs CPU'], ['versus', '2 jogadores (local)'], ['cpu', 'Assistir CPU x CPU']] },
  { key: 'diff', label: 'Dificuldade', values: DIFFS.map((d, i) => [i, d.name]) },
  { key: 'periodMin', label: 'Duração do período', values: [[2, '2 min'], [3, '3 min'], [5, '5 min'], [10, '10 min'], [20, '20 min (real)']] },
  { key: 'offside', label: 'Impedimento', values: [[true, 'Ligado'], [false, 'Desligado']] },
  { key: 'icing', label: 'Icing', values: [[true, 'Ligado'], [false, 'Desligado']] },
  { key: 'cam', label: 'Câmera', values: CAMS.map((c, i) => [i, c.name]) },
  { key: 'high', label: 'Gráficos', values: [[true, 'Alto (sombras, antialias)'], [false, 'Leve (PCs fracos)']] },
];

function teamCard(idx, which) {
  const t = ALL_TEAMS[idx], o = t.ovr;
  const bar = (l, v) => `<div class="tb"><span>${l}</span><div><i style="width:${(v - 50) * 2}%"></i></div><b>${v}</b></div>`;
  return `<div class="team-card" style="--c1:${t.primary};--c2:${t.secondary}">
    <div class="tc-side">${which === 'home' ? 'CASA' : 'VISITANTE'}</div>
    <div class="tc-nav"><button data-team="${which}" data-d="-1">◀</button>
      <div class="tc-logo"><span>${t.id}</span></div>
      <button data-team="${which}" data-d="1">▶</button></div>
    <div class="tc-city">${t.city}</div><div class="tc-name">${t.name}</div>
    <div class="tc-ovr">GERAL <b>${teamOverall(t)}</b></div>
    ${bar('ATA', o.atk)}${bar('DEF', o.def)}${bar('GOL', o.gk)}${bar('VEL', o.spd)}
  </div>`;
}

function renderMenu() {
  $('teams').innerHTML = teamCard(settings.home, 'home') + '<div class="vs">VS</div>' + teamCard(settings.away, 'away');
  $('teams').querySelectorAll('button[data-team]').forEach(b => b.onclick = () => {
    const k = b.dataset.team, other = k === 'home' ? settings.away : settings.home;
    let v = settings[k];
    do { v = (v + Number(b.dataset.d) + ALL_TEAMS.length) % ALL_TEAMS.length; } while (v === other);
    settings[k] = v; save(); renderMenu();
  });
  $('opts').innerHTML = OPTIONS.map(o => {
    const cur = o.values.findIndex(v => v[0] === settings[o.key]);
    return `<div class="opt"><span>${o.label}</span><div class="sel"><button data-k="${o.key}" data-d="-1">◀</button><b>${o.values[Math.max(0, cur)][1]}</b><button data-k="${o.key}" data-d="1">▶</button></div></div>`;
  }).join('');
  $('opts').querySelectorAll('button[data-k]').forEach(b => b.onclick = () => {
    const o = OPTIONS.find(x => x.key === b.dataset.k);
    let i = o.values.findIndex(v => v[0] === settings[o.key]); if (i < 0) i = 0;
    i = (i + Number(b.dataset.d) + o.values.length) % o.values.length;
    settings[o.key] = o.values[i][0]; save(); renderMenu();
  });
  $('diffNote').style.visibility = settings.mode === 'solo' ? 'visible' : 'hidden';
}

$('btnPlay').onclick = playFromSettings;
$('btnCareer').onclick = () => CareerUI.open();
$('btnPro').onclick = () => ProUI.open();
$('btnControls').onclick = () => { Sfx.init(); $('controls').classList.remove('hidden'); };
$('btnCloseControls').onclick = () => $('controls').classList.add('hidden');
$('pauseResume').onclick = () => UI.togglePause();
$('pauseCam').onclick = () => { if (game) { game.cycleCamera(); settings.cam = game.camMode; save(); $('pauseCam').textContent = 'Câmera: ' + CAMS[game.camMode].name; } };
$('pauseSound').onclick = () => { $('pauseSound').textContent = Sfx.toggleMute() ? 'Som: desligado' : 'Som: ligado'; };
$('pauseControls').onclick = () => $('controls').classList.remove('hidden');
$('pauseQuit').onclick = backToMenu;

window.addEventListener('keydown', e => {
  if (!game || demo) {
    if (e.code === 'Enter' && !$('menu').classList.contains('hidden')) playFromSettings();
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (!$('controls').classList.contains('hidden')) { $('controls').classList.add('hidden'); return; }
    if (game.state !== 'inter' && game.state !== 'over') UI.togglePause();
  }
  if (e.code === 'KeyC') { game.cycleCamera(); settings.cam = game.camMode; save(); UI.toast('Câmera: ' + CAMS[game.camMode].name); }
  if (e.code === 'KeyM') UI.toast(Sfx.toggleMute() ? 'Som desligado' : 'Som ligado');
});
window.addEventListener('pointerdown', () => Sfx.init(), { once: true });
window.addEventListener('resize', () => { if (renderer) renderer.setSize(innerWidth, innerHeight); });

// ---------- loop ----------
let padPrev = false;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (game) {
    try { game.frame(dt); }
    catch (err) { console.error(err); window.__lastError = String(err && err.stack || err); }
  }
  // controle no menu: A = jogar
  if (demo && !$('menu').classList.contains('hidden')) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0], a = !!(gp && gp.buttons[0] && gp.buttons[0].pressed);
    if (a && !padPrev) playFromSettings();
    padPrev = a;
  }
  requestAnimationFrame(loop);
}

renderMenu();
startDemo();
requestAnimationFrame(loop);

// Modo de autoteste: index.html?auto  (CPU x CPU acelerado, para checar erros)
if (location.search.includes('auto')) {
  $('menu').classList.add('hidden');
  startGame({ home: TEAMS[0], away: TEAMS[1], mode: 'cpu', diff: 1, periodMin: 3, offside: true, icing: true, high: false, cam: 0 }, false);
  game.dbg = { dists: [] };
  const t0 = performance.now();
  for (let i = 0; i < 300000 && game.state !== 'over'; i++) {
    try { game.step(1 / 120); if (game.state === 'inter') game.nextPeriod(); }
    catch (err) { window.__lastError = String(err.stack || err); break; }
  }
  const [a, b] = game.teams;
  const out = { err: window.__lastError || null, ms: Math.round(performance.now() - t0), period: game.period, clock: game.clock.toFixed(1), state: game.state,
    score: [a.score, b.score], dbg: game.dbg, sog: [a.stats.sog, b.stats.sog], att: [a.stats.att, b.stats.att], hits: [a.stats.hits, b.stats.hits],
    sv: [b.goalie.stats.sv + '/' + b.goalie.stats.sa, a.goalie.stats.sv + '/' + a.goalie.stats.sa],
    fo: [a.stats.fow, b.stats.fow], passes: [a.stats.passOk + '/' + a.stats.passes, b.stats.passOk + '/' + b.stats.passes] };
  const pre = document.createElement('pre'); pre.id = 'autotest'; pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
}

// Modo de captura: index.html?shot=<câmera>  (usado para conferir o visual)
const shotM = location.search.match(/shot=(\d)/);
if (shotM) {
  $('menu').classList.add('hidden');
  startGame({ home: TEAMS[0], away: TEAMS[1], mode: 'solo', diff: 1, periodMin: 5, offside: true, icing: true, high: true, cam: Number(shotM[1]) }, false);
  for (let i = 0; i < 120 * 7; i++) game.step(1 / 120);
  if (location.search.includes('hype')) { game.hype = [1, 0.05]; game.celebrate = 5; game.time += 0.1; }
  // &so=segundos: começa um shootout e avança esse tempo (a CPU bate primeiro)
  const soM = location.search.match(/[?&]so=([\d.]+)/);
  if (soM) { game.startShootout(); for (let i = 0; i < 120 * Number(soM[1]); i++) { game.step(1 / 120); if (i % 4 === 0) game.updateVisuals(1 / 30); } }
  // &vitrine: congela e arruma jogadores para conferir os modelos de perto (use junto com &view)
  if (location.search.includes('vitrine')) {
    const [A, B] = game.teams, keep = [A.skaters[0], A.skaters[1], B.skaters[0]];
    for (const s of game.skaters) s.setActive(keep.includes(s));
    const place = (o, x, z, h, extra) => Object.assign(o, { x, z, h, vx: 0, vz: 0, stun: 0, fall: 0, charge: -1, swing: 0, dekeT: 0, brakeT: 0 }, extra || {});
    place(keep[0], -1.1, 0.2, Math.PI / 2 - 0.6);                        // de frente (3/4)
    place(keep[1], 1.3, 0, -Math.PI / 2 - 0.3);                          // de costas
    place(keep[2], 3.6, -1.2, Math.PI / 2 + 0.5, { vx: -2.5, vz: 5.5, thrust: 1, phase: 1.2 }); // patinando
    game.puck.reset(-0.2, 1.2); game.puck.owner = null;
    const g = B.goalie; g.x = -1.5; g.z = -3.2; g.h = Math.PI / 2 - 0.4; const bfm = location.search.match(/bf=([d.]+)/); g.bf = bfm ? Number(bfm[1]) : 0.3;
    A.goalie.mesh.visible = false;
    game.humans.forEach(h => { h.ring.visible = false; });
    game.paused = true; $('hud').classList.add('hidden');
    for (let i = 0; i < 40; i++) game.updateVisuals(1 / 30);
  }
  // &view=x,y,z,alvoX,alvoY,alvoZ: câmera livre para conferir a arena
  const vm = location.search.match(/view=([-\d.,]+)/);
  if (vm) { const v = vm[1].split(',').map(Number); game.updateCamera = function () { this.camera.position.set(v[0], v[1], v[2]); this.camera.lookAt(v[3], v[4], v[5]); this.flags.update(this.time); }; }
  game.frame(0.05);
  const inf = document.createElement('pre'); inf.id = 'autotest'; inf.style.display = 'none';
  inf.textContent = JSON.stringify({ err: window.__lastError || null, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries });
  document.body.appendChild(inf);
}

// Teste da carreira: index.html?carreira=N  (nova temporada com o 1º time, simula N partidas e abre a tela)
const carM = location.search.match(/carreira=(\d+)/);
if (carM) {
  try {
    Career.newSeason(0, 1, 3);
    for (let i = 0; i < Number(carM[1]) && Career.s.phase !== 'done'; i++) Career.advance();
    CareerUI.open();
    const s = Career.s;
    const pre = document.createElement('pre'); pre.id = 'autotest'; pre.style.display = 'none';
    pre.textContent = JSON.stringify({ err: null, phase: s.phase, round: s.round, champion: s.champion, semis: s.semis, final: s.final });
    document.body.appendChild(pre);
  } catch (err) { const pre = document.createElement('pre'); pre.id = 'autotest'; pre.textContent = String(err.stack || err); document.body.appendChild(pre); }
}
if (location.search.includes('carreiraNova')) { Career.clear(); CareerUI.open(); }
// Teste de uma partida da carreira jogando fora de casa: index.html?carreiraJogo
if (location.search.includes('carreiraJogo')) {
  const out = {};
  try {
    Career.newSeason(0, 1, 2);
    while (Career.nextMatch().h === 0) Career.advance();
    CareerUI.play();
    out.humanTeam = game.humans[0].team.data.id; out.away = game.teams[1].data.id;
    for (let i = 0; i < 120 * 20; i++) game.step(1 / 120);
    game.frame(0.05);
    game.finishGame();
    out.title = $('report').querySelector('h2').textContent;
    const btn = [...$('report').querySelectorAll('button')].find(b => b.textContent === 'Continuar carreira');
    btn.click();
    out.round = Career.s.round; out.last = Career.s.last.length; out.careerVisible = !$('career').classList.contains('hidden');
  } catch (err) { out.err = String(err.stack || err); }
  const pre = document.createElement('pre'); pre.id = 'autotest'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
}
// Teste do shootout: index.html?soTeste  (40 disputas CPU x CPU; mede a taxa de gols por tipo de cobrança)
if (location.search.includes('soTeste')) {
  const out = { err: null, n: 0, att: 0, goals: 0, plan: {}, rounds: [] };
  try {
    $('menu').classList.add('hidden');
    startGame({ home: TEAMS[0], away: TEAMS[1], mode: 'cpu', diff: 1, periodMin: 3, offside: true, icing: true, high: false, cam: 0 }, false);
    for (let n = 0; n < 40; n++) {
      game.startShootout();
      let plan = null;
      for (let i = 0; i < 120 * 400 && game.state !== 'over'; i++) {
        if (game.state === 'soPlay' && game.so.t === 0) plan = game.so.ai.plan;
        const before = game.state;
        game.step(1 / 120);
        if (before !== 'soEnd' && game.state === 'soEnd') {
          out.att++; if (game.so.scored) out.goals++; else if (game.so.saved) out.saved = (out.saved || 0) + 1; else out.other = (out.other || 0) + 1;
          const k = plan || '?'; out.plan[k] = out.plan[k] || [0, 0]; out.plan[k][0]++; if (game.so.scored) out.plan[k][1]++;
        }
      }
      out.n++; out.rounds.push(game.so.res[0].length + game.so.res[1].length + (game.soWinner === null ? 'X' : ''));
    }
  } catch (err) { out.err = String(err.stack || err); }
  out.pct = Math.round(out.goals / out.att * 100) + '%';
  const pre = document.createElement('pre'); pre.id = 'autotest'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
}
// Teste do shootout com o humano batendo (teclas simuladas): index.html?soHumano
if (location.search.includes('soHumano')) {
  const out = { err: null, human: [0, 0], cpu: [0, 0], ends: {}, winners: [] };
  try {
    $('menu').classList.add('hidden');
    startGame({ home: TEAMS[0], away: TEAMS[1], mode: 'solo', diff: 1, periodMin: 3, offside: true, icing: true, high: false, cam: 3 }, false);
    const h = game.humans[0];
    for (let n = 0; n < 15; n++) {
      game.startShootout();
      let st = 0, plan = 0;
      for (let i = 0; i < 120 * 300 && game.state !== 'over'; i++) {
        const so = game.so, mine = so.shooter.human === h;
        Keys.down.clear();
        if (mine && game.state === 'soPlay') {
          if (so.t < 0.01) { st = 0; plan = Math.random() < 0.5; }
          const x = so.shooter.x;
          Keys.down.add('KeyW');
          // mira: segura o lado oposto ao goleiro só no instante do chute (e do drible)
          const side = so.goalie.z > 0.05 ? 'KeyA' : so.goalie.z < -0.05 ? 'KeyD' : (plan ? 'KeyD' : 'KeyA');
          if (plan && x > 20.5 && st === 0) { Keys.down.add('KeyL'); Keys.down.add(side); st = 1; }
          else if (x > (plan ? 22.6 : 19) && st < 2) { Keys.down.add('KeyK'); st = 2; }
          else if (st === 2) { Keys.down.add(side); st = 3; } // solta o K segurando a direção
        }
        if (game.state !== 'soSetup') game.handleHuman(h);
        const before = game.state;
        game.step(1 / 120);
        if (before !== 'soEnd' && game.state === 'soEnd') {
          const k = mine ? out.human : out.cpu; k[0]++; if (so.scored) k[1]++;
          const e = so.scored ? 'gol' : so.saved ? 'defesa' : 'outro'; out.ends[e] = (out.ends[e] || 0) + 1;
          if (mine && !so.scored && (out.nd = (out.nd || 0) + 1) < 4) (out.dbg = out.dbg || []).push( { x: so.shooter.x.toFixed(1), z: so.shooter.z.toFixed(1), t: so.t, rel: so.rel, own: !!game.puck.owner, px: game.puck.pos.x.toFixed(1), vx: game.puck.vel.x.toFixed(1), msg: $('banner').querySelector('.b-main').textContent, h: so.shooter.h.toFixed(2), st });
        }
      }
      out.winners.push(game.soWinner);
    }
  } catch (err) { out.err = String(err.stack || err); }
  Keys.down.clear();
  const pre = document.createElement('pre'); pre.id = 'autotest'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
}
// Teste: prorrogação empatada -> shootout -> relatório -> carreira: index.html?soFinal
if (location.search.includes('soFinal')) {
  const out = {};
  try {
    Career.newSeason(2, 1, 2);
    CareerUI.play();
    game.period = 4; game.ot = true; game.clock = 0.02; game.state = 'play';
    for (let i = 0; i < 120 * 300 && game.state !== 'over'; i++) { if (game.so && game.so.shooter.human) { game.so.shooter.human = null; } game.step(1 / 120); }
    out.state = game.state; out.soWinner = game.soWinner; out.tally = game.soTally();
    out.title = $('report').querySelector('h2').textContent;
    out.soLine = ($('report').querySelector('.so-line') || {}).textContent;
    [...$('report').querySelectorAll('button')].find(b => b.textContent === 'Continuar carreira').click();
    out.last = Career.s.last.find(r => r.h === 2 || r.a === 2);
  } catch (err) { out.err = String(err.stack || err); }
  const pre = document.createElement('pre'); pre.id = 'autotest'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
}
// Testes da carreira de jogador:
//   ?proNova (tela de criação) · ?proHub=N (simula N jogos e abre o painel) · ?proTemporada (2 temporadas simuladas)
//   ?proJogo[=LW] (uma partida com o atleta travado, prorrogação incluída)
const proOut = o => { const pre = document.createElement('pre'); pre.id = 'autotest'; pre.textContent = JSON.stringify(o); document.body.appendChild(pre); };
const proDraft = pos => { ProUI.newDraft(); Object.assign(ProUI.draft, { pos: pos || 'C', arch: pos === 'LD' || pos === 'RD' ? 'offd' : 'sniper', team: 7 }); return ProUI.draft; };
if (location.search.includes('proNova')) {
  Pro.clear(); ProUI.open();
  if (location.search.includes('rosto')) { ProPreview.zoom = 1; ProUI.render(); }
}
const proHubM = location.search.match(/proHub=(\d+)/);
if (proHubM) {
  const out = {};
  try {
    Pro.create(proDraft());
    for (let i = 0; i < Number(proHubM[1]) && Pro.s.phase !== 'done'; i++) Pro.simUserGame();
    out.xp = Pro.s.player.xp; out.ovr0 = proOverall(Pro.s.player);
    if (location.search.includes('gasta')) Pro.autoUpgrade();
    out.ovr1 = proOverall(Pro.s.player); out.attr = Pro.s.player.attr; out.st = Pro.s.st; out.phase = Pro.s.phase;
    const tm = location.search.match(/tab=(\w+)/); if (tm) ProUI.tab = tm[1];
    ProUI.open();
  } catch (err) { out.err = String(err.stack || err); }
  proOut(out);
}
if (location.search.includes('proTemporada')) {
  const out = { seasons: [] };
  try {
    Pro.create(Object.assign(proDraft(), { len: 41, bestOf: 7 }));
    for (let n = 0; n < 2; n++) {
      let games = 0;
      while (Pro.s.phase !== 'done' && games < 400) { Pro.simUserGame(); Pro.autoUpgrade(); games++; }
      Pro.closeSeason();
      const s = Pro.s, T = s.table, gp = T.reduce((x, r) => x + r.gp, 0);
      out.seasons.push({ games, phase: s.phase, champion: LIGA[s.champion].id, result: s.result, awards: s.awards, st: s.st, pst: s.pst, ovr: proOverall(s.player),
        tableGp: gp / 32, rounds: s.po.rounds.map(r => r.length), pts: Pro.standings(0).slice(0, 3).map(i => LIGA[i].id + ':' + T[i].pts) });
      if (n === 0) Pro.newSeason(3);
    }
    ProUI.open();
  } catch (err) { out.err = String(err.stack || err); }
  proOut(out);
}
const proJogoM = location.search.match(/proJogo(?:=(\w+))?/);
if (proJogoM) {
  const out = {};
  try {
    Pro.create(proDraft(proJogoM[1]));
    ProUI.play();
    const h = game.humans[0], me = h.team.skaters.find(s => s.data.me);
    out.locked = h.skater === me; out.myName = me.name; out.myNum = me.num; out.teamNums = h.team.skaters.map(s => s.num);
    let switched = 0;
    for (let i = 0; i < 120 * 40; i++) { game.step(1 / 120); if (h.skater !== me) switched++; if (i % 600 === 0) { Keys.down.add('KeyJ'); game.handleHuman(h); Keys.down.delete('KeyJ'); game.handleHuman(h); } }
    out.switched = switched;
    // pula para a prorrogação empatada
    game.teams[0].score = game.teams[1].score = 1; game.period = 3; game.nextPeriod();
    out.otActive = h.team.skaters.filter(s => s.active).map(s => s.role); out.meActive = me.active;
    for (let i = 0; i < 120 * 10; i++) game.step(1 / 120);
    game.frame(0.05);
    me.stats.g = 2; me.stats.a = 1; me.stats.sog = 5;
    game.finishGame();
    out.title = $('report').querySelector('h2').textContent;
    [...$('report').querySelectorAll('button')].find(b => b.textContent === 'Continuar carreira').click();
    out.lastGame = Pro.s.lastGame; out.round = Pro.s.round; out.visible = !$('pro').classList.contains('hidden');
  } catch (err) { out.err = String(err.stack || err); }
  out.err = out.err || window.__lastError || null;
  proOut(out);
}
// ?proVer: abre uma partida da carreira de jogador e tira um print depois de alguns segundos
if (location.search.includes('proVer')) {
  Pro.create(Object.assign(proDraft('RW'), { look: { skin: 4, hair: 4, tall: 1.06, wide: 1.1, tape: 1 }, num: 9, last: 'Grezzi' }));
  ProUI.play();
  for (let i = 0; i < 120 * 6; i++) game.step(1 / 120);
  for (let i = 0; i < 20; i++) game.frame(1 / 30);
}
