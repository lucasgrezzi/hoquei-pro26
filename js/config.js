'use strict';
// ===== Dimensões oficiais (padrão NHL, em metros) =====
const HALF_L = 30.48, HALF_W = 12.95, CORNER_R = 8.53;
const GOAL_X = 27.13;              // linha do gol (3,35 m da tabela de fundo)
const BLUE_X = 7.62;               // linhas azuis (zona neutra de 15,24 m)
const GOAL_HW = 0.915, GOAL_H = 1.22, NET_D = 1.0;
const DOT_END_X = 21.03, DOT_Z = 6.71, DOT_NEU_X = 6.1;
const CIRCLE_R = 4.57, CREASE_R = 1.83;
const PUCK_R = 0.038, SKATER_R = 0.42, GOALIE_R = 0.55;
const G = 9.8;

const ROLES = ['C', 'LW', 'RW', 'LD', 'RD'];
const SIDE = { C: 0, LW: -1, RW: 1, LD: -1, RD: 1 };
const ROLE_NAME = { C: 'C', LW: 'AE', RW: 'AD', LD: 'DE', RD: 'DD', G: 'G' };
const ROLE_FULL = { C: 'Centro', LW: 'Ala esquerda', RW: 'Ala direita', LD: 'Defensor', RD: 'Defensor', G: 'Goleiro' };

// Times fictícios
const TEAMS = [
  { id: 'SPL', city: 'São Paulo', name: 'Lobos', primary: '#c8102e', secondary: '#111111', accent: '#ffffff', pants: '#111111', ovr: { atk: 85, def: 81, gk: 83, spd: 83 } },
  { id: 'RIO', city: 'Rio de Janeiro', name: 'Tubarões', primary: '#0b4ea2', secondary: '#ffffff', accent: '#f2b705', pants: '#0a2a5c', ovr: { atk: 87, def: 77, gk: 80, spd: 87 } },
  { id: 'CUR', city: 'Curitiba', name: 'Pinheiros', primary: '#0f6b3a', secondary: '#ffffff', accent: '#c9a227', pants: '#0b3d22', ovr: { atk: 79, def: 86, gk: 85, spd: 78 } },
  { id: 'POA', city: 'Porto Alegre', name: 'Gaudérios', primary: '#1b2a5c', secondary: '#d4202a', accent: '#ffffff', pants: '#121a38', ovr: { atk: 81, def: 83, gk: 81, spd: 80 } },
  { id: 'BHM', city: 'Belo Horizonte', name: 'Mineiros', primary: '#1a1a1a', secondary: '#d4a017', accent: '#ffffff', pants: '#1a1a1a', ovr: { atk: 83, def: 82, gk: 79, spd: 81 } },
  { id: 'FLN', city: 'Florianópolis', name: 'Marés', primary: '#0094b3', secondary: '#f26b1d', accent: '#ffffff', pants: '#05475a', ovr: { atk: 80, def: 78, gk: 87, spd: 85 } },
  { id: 'GRA', city: 'Gramado', name: 'Nevascas', primary: '#5b2c8f', secondary: '#e8e8e8', accent: '#9fd3ff', pants: '#2e1550', ovr: { atk: 78, def: 85, gk: 82, spd: 77 } },
  { id: 'MAO', city: 'Manaus', name: 'Onças', primary: '#f4c300', secondary: '#14532d', accent: '#111111', pants: '#14532d', ovr: { atk: 84, def: 76, gk: 78, spd: 89 } },
];

// Liga Pro: os 32 times no formato da NHL, com outra cidade e outras cores (conf 0 = Leste, 1 = Oeste)
const LIGA = [
  ['BAY', 'Bayport', 'Bruins', 0, '#1f3d2b', '#e0b33a', '#ffffff', '#122218', [84, 86, 85, 81]],
  ['BRK', 'Brookfield', 'Sabres', 0, '#7a1f2b', '#c0c6cc', '#ffffff', '#4a121a', [80, 79, 80, 84]],
  ['DEL', 'Delmont', 'Red Wings', 0, '#14365d', '#ffffff', '#c8102e', '#0c2240', [82, 80, 79, 82]],
  ['FAI', 'Fairhaven', 'Panthers', 0, '#007c80', '#111111', '#f2c14e', '#0c3335', [88, 85, 86, 85]],
  ['VAL', 'Valmont', 'Canadiens', 0, '#4b2a85', '#ffffff', '#d4202a', '#2a174d', [84, 79, 82, 87]],
  ['OAK', 'Oakridge', 'Senators', 0, '#e3611c', '#151515', '#ffffff', '#151515', [84, 80, 80, 84]],
  ['TID', 'Tidewater', 'Lightning', 0, '#f2c200', '#141414', '#ffffff', '#141414', [87, 82, 87, 82]],
  ['THO', 'Thornhill', 'Maple Leafs', 0, '#0d7a3e', '#ffffff', '#0b2e1a', '#0b2e1a', [89, 81, 83, 85]],
  ['CRL', 'Carlisle', 'Hurricanes', 0, '#1d4fbf', '#121212', '#ffffff', '#121212', [85, 88, 83, 88]],
  ['CFX', 'Colfax', 'Blue Jackets', 0, '#b01e2e', '#d9dde2', '#0f1b33', '#0f1b33', [82, 79, 79, 85]],
  ['NBY', 'Newbury', 'Devils', 0, '#151515', '#7ac143', '#ffffff', '#151515', [86, 84, 82, 87]],
  ['LHI', 'Long Harbor', 'Islanders', 0, '#0f6a5a', '#f28c28', '#ffffff', '#0a3d34', [80, 83, 85, 80]],
  ['KBR', 'Kingsbridge', 'Rangers', 0, '#9e1b32', '#f0c44c', '#ffffff', '#5a0f1d', [84, 82, 86, 82]],
  ['FIL', 'Fillmore', 'Flyers', 0, '#2b8fd6', '#111111', '#ffffff', '#111111', [81, 80, 78, 84]],
  ['PIN', 'Pinecrest', 'Penguins', 0, '#13294b', '#6cc4ee', '#ffffff', '#13294b', [85, 78, 78, 80]],
  ['WBY', 'Westbury', 'Capitals', 0, '#d9a520', '#1a2550', '#ffffff', '#1a2550', [86, 84, 83, 82]],
  ['SMT', 'Saltmont', 'Mammoth', 1, '#5c3a21', '#a9d6ef', '#ffffff', '#2e1c10', [83, 80, 81, 85]],
  ['LKS', 'Lakeshore', 'Blackhawks', 1, '#24543a', '#f0b323', '#ffffff', '#14301f', [80, 77, 79, 83]],
  ['CWA', 'Coldwater', 'Avalanche', 1, '#00808a', '#c4ccd4', '#0b1c2c', '#0b1c2c', [89, 84, 83, 88]],
  ['DAL', 'Dalton', 'Stars', 1, '#c41e3a', '#c0c6cc', '#111111', '#111111', [87, 86, 86, 83]],
  ['MNK', 'Minnetka', 'Wild', 1, '#e86a1c', '#1f3b2b', '#f4e3b5', '#1f3b2b', [84, 83, 84, 82]],
  ['NSP', 'Nashport', 'Predators', 1, '#6b2fa0', '#c9ced6', '#ffd23f', '#3a1660', [81, 80, 82, 81]],
  ['SLB', 'St. Laurent', 'Blues', 1, '#f07a1a', '#0a3a7a', '#ffffff', '#0a3a7a', [84, 82, 81, 82]],
  ['WIN', 'Winfield', 'Jets', 1, '#c1121f', '#ffffff', '#1b1b1b', '#7a0b13', [86, 85, 89, 84]],
  ['ASH', 'Ashford', 'Ducks', 1, '#5e2a84', '#18a3a3', '#ffffff', '#341649', [81, 77, 79, 85]],
  ['CAL', 'Calder', 'Flames', 1, '#174a9c', '#ff8a1f', '#ffffff', '#0f2f63', [80, 82, 81, 80]],
  ['EDG', 'Edgemont', 'Oilers', 1, '#d0202f', '#0c1f44', '#ffffff', '#0c1f44', [91, 82, 80, 88]],
  ['LPK', 'Las Palmas', 'Kings', 1, '#e1b12c', '#3b1f63', '#ffffff', '#3b1f63', [83, 86, 82, 81]],
  ['SMR', 'San Marco', 'Sharks', 1, '#a3162f', '#141414', '#e9e9e9', '#141414', [78, 76, 77, 83]],
  ['SVK', 'Seaview', 'Kraken', 1, '#3c4650', '#b6e33a', '#ffffff', '#232a30', [81, 81, 80, 83]],
  ['VPC', 'Vanport', 'Canucks', 1, '#f2a900', '#6b1e2e', '#ffffff', '#6b1e2e', [84, 82, 85, 83]],
  ['VSP', 'Vesper', 'Golden Knights', 1, '#a9b3bd', '#14305e', '#ffffff', '#14305e', [86, 85, 84, 84]],
].map(([id, city, name, conf, primary, secondary, accent, pants, o]) =>
  ({ id, city, name, conf, primary, secondary, accent, pants, ovr: { atk: o[0], def: o[1], gk: o[2], spd: o[3] } }));

const FIRST = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'V'];
const LAST = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Almeida', 'Ferreira', 'Rodrigues',
  'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Ribeiro', 'Barbosa', 'Teixeira', 'Moreira', 'Cardoso', 'Nunes', 'Mendes',
  'Freitas', 'Vieira', 'Castro', 'Pinto', 'Moura', 'Araújo', 'Correia', 'Dias', 'Batista', 'Campos', 'Monteiro',
  'Lopes', 'Machado', 'Fonseca', 'Rezende', 'Tavares', 'Andrade', 'Peixoto', 'Brandão', 'Schmidt', 'Becker',
  'Nakamura', 'Kowalski', 'Lindqvist', 'Petrov', 'Tremblay', 'Gagnon', 'Novak', 'Koskinen'];

const DIFFS = [
  { name: 'Novato', think: 0.45, adj: -10, aim: 1.35, pressure: 0.55 },
  { name: 'Profissional', think: 0.28, adj: 0, aim: 1.0, pressure: 0.8 },
  { name: 'All-Star', think: 0.16, adj: 6, aim: 0.8, pressure: 1.0 },
];

// ===== Utilitários =====
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 2; }
function ptSegDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function buildRoster(team) {
  const rnd = mulberry32(hashStr(team.id));
  const pick = a => a[Math.floor(rnd() * a.length)];
  const used = new Set(), nums = new Set();
  const o = team.ovr;
  const v = (base, spread = 6) => clamp(Math.round(base + (rnd() * 2 - 1) * spread), 45, 99);
  return ['C', 'LW', 'RW', 'LD', 'RD', 'G'].map(pos => {
    let name; do { name = pick(FIRST) + '. ' + pick(LAST); } while (used.has(name)); used.add(name);
    let num; do { num = pos === 'G' ? pick([1, 29, 30, 31, 35, 40, 70, 88]) : 2 + Math.floor(rnd() * 96); } while (nums.has(num)); nums.add(num);
    const fwd = pos === 'C' || pos === 'LW' || pos === 'RW';
    return {
      name, num, pos, hand: rnd() < 0.62 ? -1 : 1,
      r: {
        spd: v(o.spd), shot: v(fwd ? o.atk + 2 : o.atk - 8), pass: v(fwd ? o.atk : o.atk - 3), hands: v(fwd ? o.atk : o.atk - 6),
        chk: v(fwd ? o.def - 6 : o.def + 3), def: v(fwd ? o.def - 5 : o.def + 4), fo: v(pos === 'C' ? o.atk + 3 : o.atk - 10), gk: v(o.gk, 3),
      },
    };
  });
}
TEAMS.forEach(t => { t.roster = buildRoster(t); });
LIGA.forEach(t => { t.roster = buildRoster(t); });
const ALL_TEAMS = [...TEAMS, ...LIGA]; // jogo rápido: times brasileiros + Liga Pro

function teamOverall(t) { return Math.round((t.ovr.atk + t.ovr.def + t.ovr.gk + t.ovr.spd) / 4); }

function teamKit(t, home) {
  const team = { id: t.id, primary: t.primary, secondary: t.secondary, accent: t.accent };
  if (home) return { jersey: t.primary, trim: t.secondary, pants: t.pants, helmet: t.primary, numFill: t.secondary, numStroke: t.accent, team };
  return { jersey: '#f2f2f2', trim: t.primary, pants: t.pants, helmet: '#f2f2f2', numFill: t.primary, numStroke: t.secondary, team };
}
