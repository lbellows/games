'use strict';
/* =====================================================================
   SHINING TACTICS  --  a turn-based tactical RPG in the Shining Force mold
   ===================================================================== */

/* ---------------------------------------------------------- utilities */
const irnd  = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const rnd   = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mdist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const lerp  = (a, b, t) => a + (b - a) * t;
const ease  = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/* ------------------------------------------------------------- layout */
const TILE = 36, MAPW = 24, MAPH = 16;
const VIEWW = MAPW * TILE;          // 864
const VIEWH = MAPH * TILE;          // 576
const PANELH = 112;
const CW = VIEWW, CH = VIEWH + PANELH;

/* ------------------------------------------------------------ terrain */
const TERRAIN = {
  '.': { name: 'Plain',    cost: 1,  def: 0,   c1: '#4b9440', c2: '#59a94c', art: 'grass'  },
  '=': { name: 'Road',     cost: 1,  def: 0,   c1: '#ab9268', c2: '#bda278', art: 'road'   },
  'f': { name: 'Forest',   cost: 2,  def: .30, c1: '#2e6633', c2: '#3b7b3e', art: 'forest' },
  'h': { name: 'Hill',     cost: 2,  def: .20, c1: '#78873e', c2: '#8b9b4a', art: 'hill'   },
  'm': { name: 'Mountain', cost: 3,  def: .40, c1: '#756b60', c2: '#8a7f70', art: 'mtn'    },
  '~': { name: 'Water',    cost: 99, def: 0,   c1: '#2c589b', c2: '#376cbb', art: 'water'  },
  '#': { name: 'Wall',     cost: 99, def: 0,   c1: '#4a4750', c2: '#5c5964', art: 'wall'   },
  '_': { name: 'Floor',    cost: 1,  def: .05, c1: '#877f70', c2: '#98907f', art: 'floor'  },
  'b': { name: 'Bridge',   cost: 1,  def: 0,   c1: '#96774c', c2: '#a88758', art: 'bridge' },
  ':': { name: 'Sand',     cost: 2,  def: 0,   c1: '#c4b078', c2: '#d3c088', art: 'sand'   },
};
const passable = ch => (TERRAIN[ch] || TERRAIN['.']).cost < 99;

/* ------------------------------------------------------- sprite looks */
const SPRITES = {
  max:      { skin:'#f2c58c', hair:'#3a86d6', cloth:'#2f5fc4', trim:'#e8e0c0', wep:'sword' },
  knight:   { skin:'#f2c58c', hair:'#c8992f', cloth:'#93312f', trim:'#ced2da', wep:'lance', mount:true },
  archer:   { skin:'#f2c58c', hair:'#c26b2f', cloth:'#2f7a4a', trim:'#d9c78f', wep:'bow' },
  healer:   { skin:'#f2c58c', hair:'#f0e0a0', cloth:'#e2e6f0', trim:'#8fb3e0', wep:'staff' },
  mage:     { skin:'#f2c58c', hair:'#8b3fa0', cloth:'#b03fa0', trim:'#f0d060', wep:'staff' },
  warrior:  { skin:'#e0b070', hair:'#5a3a20', cloth:'#8a6a3a', trim:'#bfc0c4', wep:'axe' },
  goblin:   { skin:'#79b23f', hair:'#39591f', cloth:'#7a4a2a', trim:'#a08050', wep:'club' },
  dwarf:    { skin:'#c99a6a', hair:'#3a2a5a', cloth:'#4a3a6a', trim:'#909098', wep:'axe' },
  skeleton: { skin:'#e6e2d0', hair:'#c6c2b0', cloth:'#6a6a72', trim:'#9a9aa2', wep:'sword', bone:true },
  zombie:   { skin:'#8fa07a', hair:'#4a4a3a', cloth:'#5a5040', trim:'#7a7060', wep:'claw' },
  darkmage: { skin:'#241c2c', hair:'#241c2c', cloth:'#4a2a6a', trim:'#c04ad0', wep:'staff', hood:true },
  darkelf:  { skin:'#b494c2', hair:'#e6e6f4', cloth:'#3a2a5a', trim:'#8a6ac0', wep:'bow' },
  hound:    { skin:'#8a2f2f', hair:'#5a1f1f', cloth:'#8a2f2f', trim:'#e0a030', wep:'claw', beast:true },
  kane:     { skin:'#332b3c', hair:'#241c2c', cloth:'#2a2a3a', trim:'#c03030', wep:'sword', horn:true },
};

/* ------------------------------------------------------------- spells */
const SPELLS = {
  heal:  { name:'Heal',  kind:'heal', col:'#7fe0a0',
           lv:[ {mp:3,pow:16,rng:2,area:0}, {mp:6,pow:28,rng:2,area:0},
                {mp:9,pow:45,rng:3,area:0}, {mp:14,pow:70,rng:3,area:0} ] },
  aura:  { name:'Aura',  kind:'heal', col:'#b9f0d8',
           lv:[ {mp:8,pow:14,rng:1,area:1}, {mp:16,pow:26,rng:2,area:1} ] },
  boost: { name:'Boost', kind:'buff', col:'#ffd76a',
           lv:[ {mp:6,pow:0,rng:2,area:1} ] },
  blaze: { name:'Blaze', kind:'dmg',  col:'#ff8a3a',
           lv:[ {mp:3,pow:14,rng:2,area:0}, {mp:6,pow:24,rng:3,area:0},
                {mp:10,pow:34,rng:3,area:1}, {mp:15,pow:50,rng:3,area:1} ] },
  freeze:{ name:'Freeze',kind:'dmg',  col:'#7ad4ff',
           lv:[ {mp:6,pow:20,rng:3,area:0}, {mp:12,pow:32,rng:3,area:1} ] },
  bolt:  { name:'Bolt',  kind:'dmg',  col:'#f3f36a',
           lv:[ {mp:10,pow:26,rng:4,area:1}, {mp:20,pow:42,rng:4,area:2} ] },
};

/* -------------------------------------------------------------- items */
const ITEMS = {
  herb:   { name:'Medical Herb', kind:'heal',  pow:22, rng:1 },
  seed:   { name:'Healing Seed', kind:'healA', pow:16, rng:1 },
  potion: { name:'Blue Potion',  kind:'mp',    pow:14, rng:1 },
  power:  { name:'Power Water',  kind:'buff',  pow:0,  rng:0 },
};

/* ------------------------------------------------------------ classes */
const CLASSES = {
  SWDM: { name:'Swordsman', mov:6, rng:[1,1], sp:'max',      spells:[],
          growth:{hp:[3,5],mp:[0,0],atk:[2,3],def:[1,3],agi:[1,3]} },
  KNTE: { name:'Knight',    mov:8, rng:[1,1], sp:'knight',   spells:[],
          growth:{hp:[3,6],mp:[0,0],atk:[2,3],def:[2,3],agi:[1,2]} },
  ARCH: { name:'Archer',    mov:6, rng:[1,2], sp:'archer',   spells:[],
          growth:{hp:[2,4],mp:[0,0],atk:[2,3],def:[1,2],agi:[2,3]} },
  HEAL: { name:'Healer',    mov:5, rng:[1,1], sp:'healer',
          spells:[{id:'heal',at:[1,4,9,14]},{id:'aura',at:[6,13]},{id:'boost',at:[8]}],
          growth:{hp:[2,4],mp:[2,4],atk:[1,2],def:[1,2],agi:[1,3]} },
  MAGE: { name:'Mage',      mov:5, rng:[1,1], sp:'mage',
          spells:[{id:'blaze',at:[1,4,8,13]},{id:'freeze',at:[5,11]},{id:'bolt',at:[9,16]}],
          growth:{hp:[2,3],mp:[2,4],atk:[1,2],def:[1,2],agi:[1,3]} },
  WARR: { name:'Warrior',   mov:5, rng:[1,1], sp:'warrior',  spells:[],
          growth:{hp:[4,6],mp:[0,0],atk:[2,4],def:[2,3],agi:[0,2]} },
  /* --- enemy classes --- */
  GOBL: { name:'Goblin',    mov:5, rng:[1,1], sp:'goblin',   spells:[], ai:'melee' },
  DWRF: { name:'Dark Dwarf',mov:5, rng:[1,1], sp:'dwarf',    spells:[], ai:'melee' },
  SKEL: { name:'Skeleton',  mov:5, rng:[1,1], sp:'skeleton', spells:[], ai:'melee' },
  ZOMB: { name:'Zombie',    mov:4, rng:[1,1], sp:'zombie',   spells:[], ai:'melee' },
  DMAG: { name:'Dark Mage', mov:5, rng:[1,1], sp:'darkmage', spells:[], ai:'mage' },
  DELF: { name:'Dark Elf',  mov:6, rng:[1,2], sp:'darkelf',  spells:[], ai:'melee' },
  HOND: { name:'Hellhound', mov:7, rng:[1,1], sp:'hound',    spells:[], ai:'melee' },
  DKNT: { name:'Dark Knight',mov:6,rng:[1,1], sp:'kane',     spells:[], ai:'melee' },
};

/* --------------------------------------------------------- the force  */
const ROSTER = [
  { key:'max',  name:'Max',  cls:'SWDM', lv:3, hp:26, mp:0,  atk:14, def:10, agi:11,
    kit:[['herb',2]], leader:true },
  { key:'ken',  name:'Ken',  cls:'KNTE', lv:3, hp:31, mp:0,  atk:15, def:12, agi:9,
    kit:[['herb',1]] },
  { key:'tao',  name:'Tao',  cls:'MAGE', lv:3, hp:18, mp:20, atk:8,  def:6,  agi:10,
    kit:[['potion',1]] },
  { key:'lowe', name:'Lowe', cls:'HEAL', lv:3, hp:20, mp:22, atk:9,  def:8,  agi:10,
    kit:[['herb',1],['seed',1]] },
  { key:'hans', name:'Hans', cls:'ARCH', lv:4, hp:24, mp:0,  atk:14, def:9,  agi:14,
    kit:[['herb',2]] },
  { key:'luke', name:'Luke', cls:'WARR', lv:5, hp:38, mp:0,  atk:18, def:14, agi:7,
    kit:[['herb',2],['power',1]] },
];

/* ===================================================================== */
/*                              CHAPTERS                                 */
/* ===================================================================== */

const CHAPTERS = [
{
  title: 'Chapter 1 — Ambush on the Guardiana Road',
  goal:  'Defeat every enemy',
  win:   'all',
  brief: ['Runefaust raiders have cut the road north of Guardiana.',
          'Max, take the Force and clear them out.',
          '',
          'Watch the bridge — the river narrows there, and so does the fight.'],
  join:  null,
  rows: [
    '..ff....hh......ff......',
    '.ff..f...hh....f..ff....',
    '.f.....===........f.....',
    '.......===.....ff.......',
    '..hh...===..............',
    '..hh...===...ff.....hh..',
    '.......===...ff.....hh..',
    '~~~~~~~bbb~~~~~~........',
    '~~~~~~~bbb~~~~~~........',
    '.......===..............',
    '..ff...===....ff........',
    '..ff...===....ff...hh...',
    '.......===..........hh..',
    '.ff....===.....ff.......',
    '.ff....===.....ff.......',
    '.......===..............',
  ],
  allies: [[7,14],[9,14],[7,15],[9,15],[8,13],[6,13]],
  enemies: [
    { cls:'GOBL', lv:3, hp:20, atk:11, def:6,  agi:8,  at:[7,5],  aggro:7 },
    { cls:'GOBL', lv:3, hp:20, atk:11, def:6,  agi:8,  at:[9,5],  aggro:7 },
    { cls:'GOBL', lv:3, hp:20, atk:11, def:7,  agi:9,  at:[13,5], aggro:8 },
    { cls:'GOBL', lv:4, hp:22, atk:12, def:7,  agi:9,  at:[19,6], aggro:9 },
    { cls:'GOBL', lv:4, hp:22, atk:12, def:7,  agi:9,  at:[20,5], aggro:9 },
    { cls:'DWRF', lv:5, hp:28, atk:14, def:10, agi:7,  at:[8,2],  aggro:99, name:'Raid Leader' },
    { cls:'DWRF', lv:4, hp:26, atk:13, def:9,  agi:7,  at:[2,4],  aggro:6 },
    { cls:'DWRF', lv:4, hp:26, atk:13, def:9,  agi:7,  at:[17,1], aggro:7 },
  ],
},
{
  title: 'Chapter 2 — The Ruined Chapel',
  goal:  'Defeat every enemy',
  win:   'all',
  brief: ['The old chapel on the moor stirs with the walking dead.',
          'Dark mages nest inside the nave. Burn them out.',
          '',
          'Hans the archer joins the Force.'],
  join:  'hans',
  rows: [
    'mmmm####____####mmmmmmmm',
    'mmm#____________#mmmmmmm',
    'mm#______________#mmmmmm',
    'mm#___####__####__#mmmmm',
    'mm#___#mm#__#mm#__#mmmmm',
    'mm#________________mmmmm',
    '.h#________________#hh..',
    '.hh#..____....____.#hh..',
    '..h#..____....____.#h...',
    '...####...........###...',
    '..ff................ff..',
    '..ff.....hhhh.......ff..',
    '.........hhhh...........',
    '..ff................ff..',
    '..ff...f......f.....ff..',
    '........................',
  ],
  allies: [[10,15],[12,15],[9,14],[13,14],[11,15],[11,14]],
  enemies: [
    { cls:'SKEL', lv:6, hp:26, atk:14, def:9,  agi:10, at:[8,10], aggro:8 },
    { cls:'SKEL', lv:6, hp:26, atk:14, def:9,  agi:10, at:[15,10],aggro:8 },
    { cls:'SKEL', lv:6, hp:26, atk:14, def:9,  agi:11, at:[11,9], aggro:9 },
    { cls:'SKEL', lv:7, hp:28, atk:15, def:10, agi:11, at:[12,9], aggro:9 },
    { cls:'ZOMB', lv:6, hp:38, atk:15, def:11, agi:4,  at:[6,8],  aggro:6 },
    { cls:'ZOMB', lv:6, hp:38, atk:15, def:11, agi:4,  at:[17,8], aggro:6 },
    { cls:'ZOMB', lv:7, hp:42, atk:16, def:12, agi:4,  at:[11,7], aggro:7 },
    { cls:'DMAG', lv:7, hp:22, atk:9,  def:7,  agi:11, at:[7,5],  aggro:99, spell:'blaze', slv:2 },
    { cls:'DMAG', lv:7, hp:22, atk:9,  def:7,  agi:11, at:[16,5], aggro:99, spell:'blaze', slv:2 },
    { cls:'DMAG', lv:8, hp:26, atk:10, def:8,  agi:12, at:[11,2], aggro:8,  spell:'freeze',slv:1,
      name:'Necromancer' },
  ],
},
{
  title: 'Chapter 3 — The Gate of Runefaust',
  goal:  'Defeat Kane, the Dark Knight',
  win:   'boss',
  brief: ['Kane holds the gate with the vanguard of Runefaust.',
          'Cut him down and the road to the capital is open.',
          '',
          'Luke the warrior joins the Force.'],
  join:  'luke',
  rows: [
    '##########____##########',
    '#________#____#________#',
    '#________#____#________#',
    '#________######________#',
    '#______________________#',
    '#__####________####____#',
    '#__####________####____#',
    '#______________________#',
    '##########____##########',
    '........======..........',
    '..hh....======....hh....',
    '..hh....======....hh....',
    '........======..........',
    '..ff....======....ff....',
    '..ff....======....ff....',
    '........======..........',
  ],
  allies: [[10,15],[11,15],[12,15],[13,15],[10,14],[13,14]],
  enemies: [
    { cls:'HOND', lv:10, hp:30, atk:17, def:10, agi:16, at:[3,11],  aggro:9 },
    { cls:'HOND', lv:10, hp:30, atk:17, def:10, agi:16, at:[20,11], aggro:9 },
    { cls:'HOND', lv:11, hp:32, atk:18, def:11, agi:17, at:[10,9],  aggro:10 },
    { cls:'DELF', lv:10, hp:28, atk:16, def:10, agi:15, at:[2,10],  aggro:8 },
    { cls:'DELF', lv:10, hp:28, atk:16, def:10, agi:15, at:[21,10], aggro:8 },
    { cls:'DELF', lv:11, hp:30, atk:17, def:11, agi:15, at:[13,9],  aggro:10 },
    { cls:'DWRF', lv:11, hp:36, atk:19, def:14, agi:9,  at:[11,7],  aggro:8, name:'Gate Guard' },
    { cls:'DWRF', lv:11, hp:36, atk:19, def:14, agi:9,  at:[12,7],  aggro:8, name:'Gate Guard' },
    { cls:'DMAG', lv:11, hp:28, atk:11, def:9,  agi:13, at:[2,6],   aggro:99, spell:'blaze', slv:3 },
    { cls:'DMAG', lv:11, hp:28, atk:11, def:9,  agi:13, at:[21,6],  aggro:99, spell:'blaze', slv:3 },
    { cls:'DKNT', lv:15, hp:96, atk:25, def:15, agi:13, at:[11,4],  aggro:9,
      name:'Kane', boss:true },
  ],
},
];

/* ===================================================================== */
/*                            GAME STATE                                 */
/* ===================================================================== */

const G = {
  phase:  'title',        // title | brief | battle | gameover | ending
  mode:   'idle',         // battle sub-mode
  chapter: 0,
  map:    null,
  units:  [],
  order:  [],             // turn order queue for the current round
  round:  1,
  active: null,           // unit whose turn it is
  cursor: { x: 11, y: 13 },
  hover:  null,
  reach:  null,           // {cost, prev} from computeReach
  threat: null,           // Set of "x,y" strings attackable after moving
  hoverThreat: null,      // cached danger zone for the enemy under the pointer
  preMove: null,          // {x,y} for cancel
  menu:   null,
  targets: null,          // array of {x,y} valid targets
  pending: null,          // pending spell/item choice
  log:    [],
  fx:     [],             // floating map effects
  scene:  null,           // battle-scene overlay object
  banner: null,
  queue:  [],             // scheduled steps {delay, fn}
  wait:   0,
  walk:   null,
  flash:  0,
  time:   0,
  force:  [],             // persistent roster units
  deaths: [],
  result: null,
};

function say(t) { G.log.push(t); if (G.log.length > 40) G.log.shift(); }
function seq(fn, delay) { G.queue.push({ fn, delay: delay === undefined ? 0 : delay }); }
function busy() { return G.queue.length > 0 || G.wait > 0 || G.walk || G.scene; }

/* ------------------------------------------------------------ the map */
function buildMap(ch) {
  const rows = [];
  for (let y = 0; y < MAPH; y++) {
    let r = ch.rows[y] || '';
    if (r.length < MAPW) r = r + '.'.repeat(MAPW - r.length);
    rows.push(r.slice(0, MAPW));
  }
  return rows;
}
function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) return '#';
  return G.map[y][x];
}
function terrainAt(x, y) { return TERRAIN[tileAt(x, y)] || TERRAIN['.']; }
function unitAt(x, y) {
  for (const u of G.units) if (u.alive && u.x === x && u.y === y) return u;
  return null;
}
function foesOf(u) { return G.units.filter(o => o.alive && o.side !== u.side); }
function friendsOf(u) { return G.units.filter(o => o.alive && o.side === u.side); }

/* ------------------------------------------------------------- units  */
let UID = 1;
function makeUnit(def, side) {
  const cls = CLASSES[def.cls];
  const u = {
    id: UID++, side,
    name: def.name || cls.name,
    key: def.key || null,
    cls: def.cls, clsName: cls.name,
    lv: def.lv, exp: 0,
    mhp: def.hp, hp: def.hp,
    mmp: def.mp || 0, mp: def.mp || 0,
    atk: def.atk, def: def.def, agi: def.agi,
    mov: cls.mov, rng: cls.rng.slice(),
    sp: cls.sp,
    x: 0, y: 0, face: side === 'ally' ? 1 : -1,
    alive: true, acted: false, moved: false,
    items: [], boost: 0,
    leader: !!def.leader, boss: !!def.boss,
    ai: cls.ai || null, aggro: def.aggro === undefined ? 8 : def.aggro,
    aiSpell: def.spell || null, aiSlv: def.slv || 1,
    bob: Math.random() * 6.28,
  };
  return u;
}
function grantKit(u, kit) {
  u.items = [];
  for (const [id, n] of (kit || [])) u.items.push({ id, n });
}
function spellsOf(u) {
  const cls = CLASSES[u.cls];
  const out = [];
  for (const s of (cls.spells || [])) {
    let max = 0;
    for (const at of s.at) if (u.lv >= at) max++;
    if (max > 0) out.push({ id: s.id, max });
  }
  return out;
}
function atkOf(u) { return u.atk + (u.boost > 0 ? Math.round(u.atk * .25) : 0); }
function defOf(u) { return u.def + (u.boost > 0 ? Math.round(u.def * .25) : 0); }

/* --------------------------------------------------------- pathfinding */
/* Dijkstra over move cost. Foes block; friends are passable but cannot be
   stopped upon (Shining Force rules).                                    */
function computeReach(u) {
  const cost = new Map(), prev = new Map();
  const key = (x, y) => y * MAPW + x;
  cost.set(key(u.x, u.y), 0);
  const frontier = [{ x: u.x, y: u.y, c: 0 }];
  while (frontier.length) {
    frontier.sort((a, b) => a.c - b.c);
    const cur = frontier.shift();
    if (cur.c > (cost.get(key(cur.x, cur.y)) ?? 1e9)) continue;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= MAPW || ny >= MAPH) continue;
      const t = terrainAt(nx, ny);
      if (t.cost >= 99) continue;
      const occ = unitAt(nx, ny);
      if (occ && occ.side !== u.side) continue;          // foes block
      const nc = cur.c + t.cost;
      if (nc > u.mov) continue;
      if (nc < (cost.get(key(nx, ny)) ?? 1e9)) {
        cost.set(key(nx, ny), nc);
        prev.set(key(nx, ny), { x: cur.x, y: cur.y });
        frontier.push({ x: nx, y: ny, c: nc });
      }
    }
  }
  const tiles = [];
  for (const [k, c] of cost) {
    const x = k % MAPW, y = (k - x) / MAPW;
    const occ = unitAt(x, y);
    if (occ && occ.id !== u.id) continue;                // cannot stop on anyone
    tiles.push({ x, y, c });
  }
  return { cost, prev, tiles, has: (x, y) => tiles.some(t => t.x === x && t.y === y) };
}
function pathTo(reach, x, y) {
  const key = (a, b) => b * MAPW + a;
  const path = [{ x, y }];
  let cur = { x, y };
  let guard = 0;
  while (reach.prev.has(key(cur.x, cur.y)) && guard++ < 400) {
    cur = reach.prev.get(key(cur.x, cur.y));
    path.unshift({ x: cur.x, y: cur.y });
  }
  return path;
}
/* multi-source distance field (ignores units) used by the AI */
function distField(sources) {
  const d = new Int32Array(MAPW * MAPH).fill(1e6);
  const q = [];
  for (const s of sources) { d[s.y * MAPW + s.x] = 0; q.push({ x: s.x, y: s.y, c: 0 }); }
  while (q.length) {
    q.sort((a, b) => a.c - b.c);
    const cur = q.shift();
    if (cur.c > d[cur.y * MAPW + cur.x]) continue;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= MAPW || ny >= MAPH) continue;
      const t = terrainAt(nx, ny);
      if (t.cost >= 99) continue;
      const nc = cur.c + t.cost;
      if (nc < d[ny * MAPW + nx]) { d[ny * MAPW + nx] = nc; q.push({ x: nx, y: ny, c: nc }); }
    }
  }
  return d;
}
/* tiles within a spell/attack range, as {x,y} list */
function rangeTiles(cx, cy, min, max) {
  const out = [];
  for (let y = cy - max; y <= cy + max; y++)
    for (let x = cx - max; x <= cx + max; x++) {
      if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) continue;
      const d = Math.abs(x - cx) + Math.abs(y - cy);
      if (d >= min && d <= max) out.push({ x, y });
    }
  return out;
}
function inRange(a, b, rng) { const d = mdist(a, b); return d >= rng[0] && d <= rng[1]; }

/* ===================================================================== */
/*                              COMBAT                                   */
/* ===================================================================== */

function landDef(u) { return terrainAt(u.x, u.y).def; }

function hitChance(a, d) {
  let miss = .05 + Math.max(0, d.agi - a.agi) * .008;
  return 1 - clamp(miss, .02, .22);
}
function rollPhys(a, d) {
  const res = { miss: false, crit: false, dmg: 0 };
  if (Math.random() > hitChance(a, d)) { res.miss = true; return res; }
  const dv = defOf(d) * (1 + landDef(d));
  let base = atkOf(a) - dv;
  if (base < 1) base = Math.max(1, Math.floor(atkOf(a) * .12));
  let dmg = Math.round(base * rnd(.88, 1.14));
  if (Math.random() < .055 + a.agi * .0022) { res.crit = true; dmg = Math.round(dmg * 1.9); }
  res.dmg = Math.max(1, dmg);
  return res;
}
function magicDmg(pow, target) {
  let d = Math.round(pow * rnd(.86, 1.16) - defOf(target) * .18);
  return Math.max(1, d);
}

/* --------------------------------------------------------------- exp  */
function expFor(a, d, killed) {
  if (a.side !== 'ally') return 0;
  const diff = d.lv - a.lv;
  let e = killed ? 26 + diff * 5 : 9 + diff * 3;
  return clamp(Math.round(e), 1, 49);
}
function gainExp(u, amt, silent) {
  if (u.side !== 'ally' || amt <= 0 || !u.alive) return;
  u.exp += amt;
  if (!silent) floatText(u.x, u.y, '+' + amt + ' EXP', '#ffe27a', -18);
  while (u.exp >= 100 && u.lv < 20) {
    u.exp -= 100; u.lv++;
    const g = CLASSES[u.cls].growth;
    const gains = {
      hp: irnd(g.hp[0], g.hp[1]), mp: irnd(g.mp[0], g.mp[1]),
      atk: irnd(g.atk[0], g.atk[1]), def: irnd(g.def[0], g.def[1]),
      agi: irnd(g.agi[0], g.agi[1]),
    };
    u.mhp += gains.hp; u.hp += gains.hp;
    u.mmp += gains.mp; u.mp += gains.mp;
    u.atk += gains.atk; u.def += gains.def; u.agi += gains.agi;
    say(u.name + ' reached level ' + u.lv + '!  HP+' + gains.hp +
        (gains.mp ? ' MP+' + gains.mp : '') + ' ATK+' + gains.atk +
        ' DEF+' + gains.def + ' AGI+' + gains.agi);
    banner(u.name + '  —  LEVEL ' + u.lv + '!', '#ffe27a');
    sfx('level');
  }
}
function banner(text, col) { G.banner = { text, col: col || '#fff', t: 0, life: 1.5 }; }
function floatText(x, y, text, col, dy) {
  G.fx.push({ kind: 'text', x, y, text, col, t: 0, life: 1.1, dy: dy || 0 });
}
function burst(x, y, col, r) {
  G.fx.push({ kind: 'burst', x, y, col, t: 0, life: .55, r: r || 20 });
}

/* ------------------------------------------------------- battle scene */
function startBattleScene(a, d, acts, after) {
  G.scene = {
    a, d, acts, i: 0, t: 0, state: 'in',
    aHP: a.hp, dHP: d.hp, aMax: a.mhp, dMax: d.mhp,
    aShow: a.hp, dShow: d.hp, shake: 0, flash: 0, txt: null, after,
  };
  sfx('open');
}
function updateScene(dt) {
  const s = G.scene; if (!s) return;
  s.t += dt;
  s.shake = Math.max(0, s.shake - dt * 60);
  s.flash = Math.max(0, s.flash - dt * 4);
  s.aShow += (s.a.hp - s.aShow) * Math.min(1, dt * 8);
  s.dShow += (s.d.hp - s.dShow) * Math.min(1, dt * 8);

  if (s.state === 'in') { if (s.t > .28) { s.state = 'act'; s.t = 0; } return; }
  if (s.state === 'act') {
    const act = s.acts[s.i];
    if (!act) { s.state = 'out'; s.t = 0; return; }
    if (!act.applied && s.t > .34) {
      act.applied = true;
      const tgt = act.by === 'a' ? s.d : s.a;
      const src = act.by === 'a' ? s.a : s.d;
      if (act.miss) { s.txt = { t: 'MISS', col: '#dddddd', side: act.by === 'a' ? 'd' : 'a' }; sfx('miss'); }
      else {
        tgt.hp = Math.max(0, tgt.hp - act.dmg);
        s.txt = { t: (act.crit ? 'CRITICAL! ' : '') + act.dmg,
                  col: act.crit ? '#ffd24a' : '#ff6a6a', side: act.by === 'a' ? 'd' : 'a' };
        s.shake = act.crit ? 10 : 6; s.flash = 1;
        sfx(act.crit ? 'crit' : 'hit');
        if (act.label) say(act.label);
        if (tgt.hp <= 0) act.kill = true;
        if (src.side === 'ally') gainExp(src, expFor(src, tgt, tgt.hp <= 0), true);
      }
    }
    if (s.t > 1.0) { s.i++; s.t = 0; s.txt = null; if (!s.acts[s.i]) { s.state = 'out'; } }
    return;
  }
  if (s.state === 'out') {
    if (s.t > .3) { const f = s.after; G.scene = null; if (f) f(); }
  }
}

/* --------------------------------------------------------- attacking  */
function doAttack(a, d, after) {
  a.face = d.x >= a.x ? 1 : -1;
  d.face = a.x >= d.x ? 1 : -1;
  const acts = [];
  const r1 = rollPhys(a, d);
  acts.push({ by: 'a', ...r1, label: r1.miss ? a.name + ' missed.' :
              a.name + ' hits ' + d.name + ' for ' + r1.dmg + (r1.crit ? ' (critical!)' : '') });
  let dHP = d.hp - (r1.miss ? 0 : r1.dmg);

  /* double attack chance for the swift */
  if (dHP > 0 && !r1.miss && a.agi > d.agi && Math.random() < .07 + (a.agi - d.agi) * .012) {
    const r2 = rollPhys(a, d);
    acts.push({ by: 'a', ...r2, label: a.name + ' strikes twice!' });
    dHP -= r2.miss ? 0 : r2.dmg;
  }
  /* counterattack — only if the defender can reach back */
  if (dHP > 0 && inRange(d, a, d.rng) && Math.random() < .24) {
    const rc = rollPhys(d, a);
    if (!rc.miss) rc.dmg = Math.max(1, Math.round(rc.dmg * .8));
    acts.push({ by: 'd', ...rc, label: d.name + ' counterattacks!' });
  }
  startBattleScene(a, d, acts, () => { resolveDeaths(); if (after) after(); });
}

/* ---------------------------------------------------------- spellwork */
function spellTargets(u, id, lv) {
  const sp = SPELLS[id], L = sp.lv[lv - 1];
  const tiles = rangeTiles(u.x, u.y, sp.kind === 'heal' || sp.kind === 'buff' ? 0 : 1, L.rng);
  const want = (sp.kind === 'dmg') ? 'foe' : 'friend';
  return tiles.filter(t => {
    const o = unitAt(t.x, t.y);
    if (!o) return false;
    return want === 'foe' ? o.side !== u.side : o.side === u.side;
  });
}
function areaTiles(cx, cy, area) {
  if (area === 0) return [{ x: cx, y: cy }];
  return rangeTiles(cx, cy, 0, area);
}
function castSpell(u, id, lv, tx, ty, after) {
  const sp = SPELLS[id], L = sp.lv[lv - 1];
  u.mp = Math.max(0, u.mp - L.mp);
  u.face = tx >= u.x ? 1 : -1;
  const tiles = areaTiles(tx, ty, L.area);
  say(u.name + ' casts ' + sp.name + ' ' + lv + '!');
  sfx(sp.kind === 'dmg' ? 'magic' : 'heal');
  for (const t of tiles) burst(t.x, t.y, sp.col, 22);
  seq(() => {
    let exp = 0, touched = 0;
    for (const t of tiles) {
      const o = unitAt(t.x, t.y);
      if (!o || !o.alive) continue;
      if (sp.kind === 'dmg') {
        if (o.side === u.side) continue;
        const dmg = magicDmg(L.pow, o);
        o.hp = Math.max(0, o.hp - dmg);
        floatText(o.x, o.y, String(dmg), '#ff6a6a');
        exp += expFor(u, o, o.hp <= 0); touched++;
      } else if (sp.kind === 'heal') {
        if (o.side !== u.side) continue;
        const before = o.hp;
        o.hp = Math.min(o.mhp, o.hp + L.pow);
        const got = o.hp - before;
        floatText(o.x, o.y, '+' + got, '#7fe0a0');
        if (got > 0) { exp += 12; touched++; }
      } else {
        if (o.side !== u.side) continue;
        o.boost = 4;
        floatText(o.x, o.y, 'BOOST', '#ffd76a');
        exp += 8; touched++;
      }
    }
    if (touched) gainExp(u, clamp(Math.max(12, exp), 0, 49));
    resolveDeaths();
  }, .4);
  seq(() => { if (after) after(); }, .55);
}

/* ------------------------------------------------------------- items  */
function itemTargets(u, id) {
  const it = ITEMS[id];
  if (it.rng === 0) return [{ x: u.x, y: u.y }];
  const tiles = rangeTiles(u.x, u.y, 0, it.rng);
  return tiles.filter(t => { const o = unitAt(t.x, t.y); return o && o.side === u.side; });
}
function useItem(u, idx, tx, ty, after) {
  const slot = u.items[idx]; if (!slot) { if (after) after(); return; }
  const it = ITEMS[slot.id];
  slot.n--; if (slot.n <= 0) u.items.splice(idx, 1);
  say(u.name + ' uses ' + it.name + '.');
  sfx('heal');
  const apply = (o) => {
    if (!o || !o.alive) return;
    if (it.kind === 'heal' || it.kind === 'healA') {
      const b = o.hp; o.hp = Math.min(o.mhp, o.hp + it.pow);
      floatText(o.x, o.y, '+' + (o.hp - b), '#7fe0a0'); burst(o.x, o.y, '#7fe0a0', 18);
    } else if (it.kind === 'mp') {
      const b = o.mp; o.mp = Math.min(o.mmp, o.mp + it.pow);
      floatText(o.x, o.y, '+' + (o.mp - b) + ' MP', '#8ac8ff'); burst(o.x, o.y, '#8ac8ff', 18);
    } else if (it.kind === 'buff') {
      o.boost = 4; floatText(o.x, o.y, 'BOOST', '#ffd76a'); burst(o.x, o.y, '#ffd76a', 18);
    }
  };
  if (it.kind === 'healA') for (const t of rangeTiles(tx, ty, 0, 1)) {
    const o = unitAt(t.x, t.y); if (o && o.side === u.side) apply(o);
  }
  else apply(unitAt(tx, ty));
  G.wait = .5;
  seq(() => { if (after) after(); }, 0);
}

/* --------------------------------------------------------- casualties */
function resolveDeaths() {
  for (const u of G.units) {
    if (u.alive && u.hp <= 0) {
      u.alive = false;
      burst(u.x, u.y, u.side === 'ally' ? '#8ac8ff' : '#ff7a5a', 26);
      floatText(u.x, u.y, 'DEFEATED', '#ffffff', -6);
      say(u.name + ' is defeated!');
      sfx('die');
      if (u.side === 'ally') G.deaths.push(u.key);
    }
  }
}
function checkEnd() {
  const ch = CHAPTERS[G.chapter];
  const leader = G.units.find(u => u.leader);
  if (leader && !leader.alive) { G.result = 'lose'; return true; }
  if (!G.units.some(u => u.alive && u.side === 'ally')) { G.result = 'lose'; return true; }
  if (ch.win === 'boss') {
    const boss = G.units.find(u => u.boss);
    if (boss && !boss.alive) { G.result = 'win'; return true; }
  }
  if (!G.units.some(u => u.alive && u.side === 'enemy')) { G.result = 'win'; return true; }
  return false;
}

/* ===================================================================== */
/*                            TURN FLOW                                  */
/* ===================================================================== */

function startChapter(i) {
  const ch = CHAPTERS[i];
  G.chapter = i;
  G.map = buildMap(ch);
  G.units = [];
  G.deaths = [];
  G.log = [];
  G.fx = []; G.queue = []; G.scene = null; G.wait = 0; G.walk = null;
  G.round = 1; G.result = null;

  /* the Force */
  ch.allies.forEach((pos, n) => {
    const u = G.force[n];
    if (!u) return;
    u.x = pos[0]; u.y = pos[1];
    u.alive = true; u.acted = false; u.boost = 0; u.face = 1;
    G.units.push(u);
  });
  /* the enemy */
  for (const e of ch.enemies) {
    const u = makeUnit(e, 'enemy');
    u.x = e.at[0]; u.y = e.at[1]; u.face = -1;
    G.units.push(u);
  }
  G.phase = 'battle';
  say('— ' + ch.title + ' —');
  say('Objective: ' + ch.goal);
  banner(ch.title, '#ffe27a');
  newRound();
}

function newRound() {
  G.order = G.units.filter(u => u.alive)
    .map(u => ({ u, r: u.agi * rnd(.75, 1.55) }))
    .sort((a, b) => b.r - a.r).map(o => o.u);
  for (const u of G.units) u.acted = false;
  nextTurn(true);
}

function nextTurn(first) {
  if (!first && checkEnd()) return finishBattle();
  G.menu = null; G.targets = null; G.pending = null; G.preMove = null;
  while (G.order.length && !G.order[0].alive) G.order.shift();
  if (!G.order.length) { G.round++; return newRound(); }
  const u = G.order.shift();
  G.active = u;
  if (u.boost > 0) u.boost--;
  G.cursor = { x: u.x, y: u.y };
  if (u.side === 'ally') {
    G.mode = 'move';
    G.reach = computeReach(u);
    G.threat = threatTiles(u, G.reach);
    G.preMove = { x: u.x, y: u.y };
  } else {
    G.mode = 'enemy';
    G.reach = null; G.threat = null;
    G.wait = .3;
    seq(() => aiAct(u), 0);
  }
}
function endTurn() {
  const u = G.active;
  if (u) u.acted = true;
  G.mode = 'idle';
  G.menu = null; G.targets = null; G.pending = null;
  seq(() => nextTurn(false), .12);
}
function finishBattle() {
  G.mode = 'idle'; G.menu = null; G.active = null;
  if (G.result === 'win') {
    seq(() => {
      say('Victory!');
      banner('VICTORY', '#8ef0a0');
      sfx('fanfare');
    }, .1);
    seq(() => {
      G.phase = (G.chapter >= CHAPTERS.length - 1) ? 'ending' : 'brief';
      if (G.phase === 'brief') { G.chapter++; prepBrief(); }
    }, 2.0);
  } else {
    seq(() => { banner('DEFEAT', '#ff7a6a'); sfx('defeat'); }, .1);
    seq(() => { G.phase = 'gameover'; }, 1.8);
  }
}

/* tiles from which the active unit could strike someone */
function threatTiles(u, reach) {
  const s = new Set();
  for (const t of reach.tiles)
    for (const p of rangeTiles(t.x, t.y, u.rng[0], u.rng[1])) s.add(p.x + ',' + p.y);
  return s;
}

/* ===================================================================== */
/*                          PLAYER  INPUT                                */
/* ===================================================================== */

function attackableFrom(u, x, y) {
  return foesOf(u).filter(f => {
    const d = Math.abs(f.x - x) + Math.abs(f.y - y);
    return d >= u.rng[0] && d <= u.rng[1];
  });
}

function walkTo(u, path, done) {
  if (path.length <= 1) { u.x = path[0].x; u.y = path[0].y; done(); return; }
  G.walk = { u, path, i: 0, t: 0, done };
  sfx('step');
}

function confirmTile(x, y) {
  const u = G.active;
  if (!u || u.side !== 'ally') return;
  if (G.mode === 'move') {
    if (!G.reach.has(x, y)) { sfx('deny'); return; }
    const path = pathTo(G.reach, x, y);
    G.mode = 'idle';
    walkTo(u, path, () => openMainMenu(u));
    return;
  }
  if (G.mode === 'target') {
    const ok = G.targets.some(t => t.x === x && t.y === y);
    if (!ok) { sfx('deny'); return; }
    const p = G.pending;
    G.mode = 'idle'; G.targets = null; G.menu = null;
    if (p.kind === 'attack') {
      const foe = unitAt(x, y);
      doAttack(u, foe, () => { endTurn(); });
    } else if (p.kind === 'spell') {
      castSpell(u, p.id, p.lv, x, y, () => endTurn());
    } else if (p.kind === 'item') {
      useItem(u, p.idx, x, y, () => endTurn());
    }
  }
}

function openMainMenu(u) {
  G.mode = 'menu';
  const items = [];
  const foes = attackableFrom(u, u.x, u.y);
  items.push({ label: 'Attack', enabled: foes.length > 0, act: () => {
    G.pending = { kind: 'attack' };
    G.targets = foes.map(f => ({ x: f.x, y: f.y }));
    G.mode = 'target'; G.menu = null;
    G.cursor = { x: G.targets[0].x, y: G.targets[0].y };
  } });
  const sps = spellsOf(u);
  if (sps.length) items.push({ label: 'Magic', enabled: u.mp > 0, act: () => openSpellMenu(u, sps) });
  if (u.items.length) items.push({ label: 'Item', enabled: true, act: () => openItemMenu(u) });
  items.push({ label: 'Stay', enabled: true, act: () => { say(u.name + ' holds position.'); endTurn(); } });
  G.menu = mkMenu(items, u, () => {          /* cancel = undo the move */
    if (!G.preMove) return;
    u.x = G.preMove.x; u.y = G.preMove.y;
    G.mode = 'move';
    G.reach = computeReach(u);
    G.threat = threatTiles(u, G.reach);
    G.menu = null;
    G.cursor = { x: u.x, y: u.y };
  });
}
function openSpellMenu(u, sps) {
  const items = sps.map(s => {
    const sp = SPELLS[s.id];
    const cheapest = sp.lv[0].mp;
    return { label: sp.name, note: 'MP' + cheapest + '+', enabled: u.mp >= cheapest,
      act: () => openSpellLevel(u, s) };
  });
  G.menu = mkMenu(items, u, () => openMainMenu(u));
}
function openSpellLevel(u, s) {
  const sp = SPELLS[s.id];
  const items = [];
  for (let i = 0; i < s.max; i++) {
    const L = sp.lv[i];
    items.push({ label: sp.name + ' ' + (i + 1), note: 'MP' + L.mp, enabled: u.mp >= L.mp,
      act: () => {
        const t = spellTargets(u, s.id, i + 1);
        if (!t.length) { sfx('deny'); say('No valid target for ' + sp.name + '.'); return; }
        G.pending = { kind: 'spell', id: s.id, lv: i + 1, area: L.area };
        G.targets = t; G.mode = 'target'; G.menu = null;
        G.cursor = { x: t[0].x, y: t[0].y };
      } });
  }
  G.menu = mkMenu(items, u, () => openSpellMenu(u, spellsOf(u)));
}
function openItemMenu(u) {
  const items = u.items.map((slot, idx) => {
    const it = ITEMS[slot.id];
    return { label: it.name, note: 'x' + slot.n, enabled: true, act: () => {
      const t = itemTargets(u, slot.id);
      if (!t.length) { sfx('deny'); return; }
      G.pending = { kind: 'item', idx, area: it.kind === 'healA' ? 1 : 0 };
      G.targets = t; G.mode = 'target'; G.menu = null;
      G.cursor = { x: u.x, y: u.y };
    } };
  });
  G.menu = mkMenu(items, u, () => openMainMenu(u));
}
function mkMenu(items, u, back) {
  let w = 96;
  for (const it of items) w = Math.max(w, 30 + it.label.length * 9 + (it.note ? it.note.length * 8 + 12 : 0));
  const h = items.length * 22 + 12;
  let x = u.x * TILE + TILE + 6, y = u.y * TILE - 6;
  if (x + w > VIEWW - 6) x = u.x * TILE - w - 6;
  if (x < 6) x = 6;
  y = clamp(y, 6, VIEWH - h - 6);
  let idx = items.findIndex(i => i.enabled); if (idx < 0) idx = 0;
  return { items, idx, x, y, w, h, back };
}
function menuPick() {
  const m = G.menu; if (!m) return;
  const it = m.items[m.idx];
  if (!it || !it.enabled) { sfx('deny'); return; }
  sfx('ok'); it.act();
}
function menuMove(d) {
  const m = G.menu; if (!m) return;
  for (let k = 0; k < m.items.length; k++) {
    m.idx = (m.idx + d + m.items.length) % m.items.length;
    if (m.items[m.idx].enabled) break;
  }
  sfx('move');
}
function cancel() {
  if (G.menu && G.menu.back) { sfx('back'); G.menu.back(); return; }
  if (G.mode === 'target') {
    sfx('back'); G.targets = null; G.pending = null; openMainMenu(G.active); return;
  }
}

/* ===================================================================== */
/*                             ENEMY  AI                                 */
/* ===================================================================== */

function estDamage(a, d, defTile) {
  const t = defTile ? terrainAt(defTile.x, defTile.y) : terrainAt(d.x, d.y);
  let base = atkOf(a) - defOf(d) * (1 + t.def);
  if (base < 1) base = Math.max(1, Math.floor(atkOf(a) * .12));
  return base;
}

function aiAct(u) {
  if (!u.alive) return endTurn();
  const foes = foesOf(u);
  if (!foes.length) return endTurn();
  const reach = computeReach(u);
  const field = distField(foes.map(f => ({ x: f.x, y: f.y })));
  const here = field[u.y * MAPW + u.x];
  let best = null;

  /* --- physical strikes --- */
  for (const t of reach.tiles) {
    const tDef = terrainAt(t.x, t.y).def;
    for (const f of foes) {
      const d = Math.abs(t.x - f.x) + Math.abs(t.y - f.y);
      if (d < u.rng[0] || d > u.rng[1]) continue;
      const est = estDamage(u, f);
      let score = est * 2.2;
      if (est >= f.hp) score += 70;
      score += (f.mhp - f.hp) * .25;
      score += tDef * 24;
      if (f.leader) score += 14;
      if (f.cls === 'HEAL' || f.cls === 'MAGE' || f.cls === 'ARCH') score += 12;
      if (d >= f.rng[0] && d <= f.rng[1]) score -= estDamage(f, u, t) * .5;
      score += Math.random() * 4;
      if (!best || score > best.score)
        best = { score, tile: t, foe: f, kind: 'attack' };
    }
  }

  /* --- spellcasting --- */
  if (u.aiSpell && SPELLS[u.aiSpell]) {
    const sp = SPELLS[u.aiSpell];
    const lv = clamp(u.aiSlv, 1, sp.lv.length);
    const L = sp.lv[lv - 1];
    if (u.mp >= L.mp) {
      for (const t of reach.tiles) {
        for (const f of foes) {
          const d = Math.abs(t.x - f.x) + Math.abs(t.y - f.y);
          if (d < 1 || d > L.rng) continue;
          let total = 0, kills = 0;
          for (const a of areaTiles(f.x, f.y, L.area)) {
            const o = unitAt(a.x, a.y);
            if (!o || !o.alive || o.side === u.side) continue;
            const dm = Math.max(1, Math.round(L.pow - o.def * .18));
            total += Math.min(dm, o.hp);
            if (dm >= o.hp) kills++;
          }
          if (total <= 0) continue;
          let score = total * 2.6 + kills * 70 + terrainAt(t.x, t.y).def * 24;
          /* mages like to stay out of reach */
          let risk = 0;
          for (const o of foes) {
            const od = Math.abs(t.x - o.x) + Math.abs(t.y - o.y);
            if (od <= o.rng[1] + o.mov * .5) risk += 8;
          }
          score -= risk;
          score += Math.random() * 4;
          if (!best || score > best.score)
            best = { score, tile: t, foe: f, kind: 'spell', lv };
        }
      }
    }
  }

  const go = (tile, then) => {
    const path = pathTo(reach, tile.x, tile.y);
    walkTo(u, path, then);
  };

  if (best) {
    go(best.tile, () => {
      if (best.kind === 'attack') {
        G.wait = .18;
        seq(() => doAttack(u, best.foe, () => endTurn()), 0);
      } else {
        castSpell(u, u.aiSpell, best.lv, best.foe.x, best.foe.y, () => endTurn());
      }
    });
    return;
  }

  /* --- no strike available: advance, or hold ground --- */
  if (here > u.aggro) { G.wait = .15; seq(() => endTurn(), 0); return; }
  let bestTile = null, bestVal = 1e9;
  for (const t of reach.tiles) {
    const v = field[t.y * MAPW + t.x] * 10 - terrainAt(t.x, t.y).def * 6 + Math.random();
    if (v < bestVal) { bestVal = v; bestTile = t; }
  }
  if (bestTile && (bestTile.x !== u.x || bestTile.y !== u.y)) go(bestTile, () => endTurn());
  else { G.wait = .15; seq(() => endTurn(), 0); }
}

/* ===================================================================== */
/*                             RENDERING                                 */
/* ===================================================================== */

const cvs = document.getElementById('screen');
const ctx = cvs.getContext('2d');
cvs.width = CW; cvs.height = CH;

const FONT = (s, b) => (b ? 'bold ' : '') + s + "px 'Courier New',monospace";
function h2(x, y, n) { const s = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453; return s - Math.floor(s); }
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
function txt(s, x, y, col, size, bold, align) {
  ctx.font = FONT(size || 13, bold); ctx.fillStyle = col; ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y); ctx.textAlign = 'left';
}
function shadowTxt(s, x, y, col, size, bold, align) {
  txt(s, x + 1, y + 1, 'rgba(0,0,0,.75)', size, bold, align);
  txt(s, x, y, col, size, bold, align);
}
function bar(x, y, w, h, pct, col, bg) {
  ctx.fillStyle = bg || '#20202a'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * clamp(pct, 0, 1)), h - 2);
  ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
}

/* ------------------------------------------------------------- tiles  */
function drawTile(x, y) {
  const ch = tileAt(x, y), t = TERRAIN[ch] || TERRAIN['.'];
  const px = x * TILE, py = y * TILE;
  ctx.fillStyle = t.c1;
  ctx.fillRect(px, py, TILE, TILE);
  if ((x + y) & 1) { ctx.fillStyle = 'rgba(255,255,255,.055)'; ctx.fillRect(px, py, TILE, TILE); }
  const a = t.art;
  if (a === 'grass') {
    ctx.fillStyle = 'rgba(0,0,0,.10)';
    for (let i = 0; i < 3; i++) {
      const bx = px + h2(x, y, i) * 30 + 3, by = py + h2(x, y, i + 9) * 28 + 5;
      ctx.fillRect(bx, by, 2, 4);
    }
  } else if (a === 'forest') {
    for (let i = 0; i < 3; i++) {
      const bx = px + 6 + h2(x, y, i) * 22, by = py + 8 + h2(x, y, i + 4) * 18, r = 6 + h2(x, y, i + 7) * 3;
      ctx.fillStyle = '#1f4a24'; ctx.beginPath(); ctx.arc(bx, by + 2, r, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#3f8a42'; ctx.beginPath(); ctx.arc(bx - 1, by, r - 1, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#57a557'; ctx.beginPath(); ctx.arc(bx - 2.5, by - 2, (r - 1) * .5, 0, 6.29); ctx.fill();
    }
  } else if (a === 'hill') {
    ctx.fillStyle = '#6b7a35'; ctx.beginPath();
    ctx.ellipse(px + 18, py + 26, 15, 9, 0, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#96a655'; ctx.beginPath();
    ctx.ellipse(px + 17, py + 22, 12, 8, 0, 0, 6.29); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.beginPath();
    ctx.ellipse(px + 14, py + 19, 6, 3.4, 0, 0, 6.29); ctx.fill();
  } else if (a === 'mtn') {
    ctx.fillStyle = '#5d5449'; ctx.beginPath();
    ctx.moveTo(px + 2, py + 33); ctx.lineTo(px + 18, py + 4); ctx.lineTo(px + 34, py + 33); ctx.fill();
    ctx.fillStyle = '#8b8073'; ctx.beginPath();
    ctx.moveTo(px + 8, py + 33); ctx.lineTo(px + 18, py + 6); ctx.lineTo(px + 24, py + 20); ctx.fill();
    ctx.fillStyle = '#d8d4cc'; ctx.beginPath();
    ctx.moveTo(px + 13, py + 13); ctx.lineTo(px + 18, py + 5); ctx.lineTo(px + 23, py + 13); ctx.fill();
  } else if (a === 'water') {
    const w = Math.sin(G.time * 1.6 + x * .7 + y * .4);
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.fillRect(px + 5 + w * 3, py + 9, 12, 2);
    ctx.fillRect(px + 17 - w * 3, py + 22, 10, 2);
    ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.fillRect(px, py + 30, TILE, 3);
  } else if (a === 'wall') {
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    for (let r = 0; r < 3; r++) ctx.fillRect(px, py + r * 12 + 11, TILE, 2);
    for (let r = 0; r < 3; r++) { const o = (r & 1) ? 0 : 18; ctx.fillRect(px + o, py + r * 12, 2, 12); }
    ctx.fillStyle = 'rgba(255,255,255,.09)'; ctx.fillRect(px, py, TILE, 3);
  } else if (a === 'floor') {
    ctx.strokeStyle = 'rgba(0,0,0,.20)'; ctx.lineWidth = 1;
    ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
    ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(px + 3, py + 3, TILE - 6, 2);
  } else if (a === 'road') {
    ctx.fillStyle = 'rgba(0,0,0,.13)';
    for (let i = 0; i < 5; i++) ctx.fillRect(px + h2(x, y, i) * 32, py + h2(x, y, i + 3) * 32, 3, 2);
  } else if (a === 'bridge') {
    ctx.fillStyle = 'rgba(0,0,0,.30)';
    for (let i = 0; i < 4; i++) ctx.fillRect(px, py + i * 9 + 4, TILE, 2);
    ctx.fillStyle = '#6f5433'; ctx.fillRect(px, py, 2, TILE); ctx.fillRect(px + TILE - 2, py, 2, TILE);
  } else if (a === 'sand') {
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    for (let i = 0; i < 5; i++) ctx.fillRect(px + h2(x, y, i) * 32, py + h2(x, y, i + 5) * 32, 2, 2);
  }
  ctx.strokeStyle = 'rgba(0,0,0,.10)'; ctx.lineWidth = 1;
  ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
}

/* ----------------------------------------------------------- sprites  */
function drawFig(g, sp, flip, walk, scale) {
  g.save();
  g.scale(scale, scale);
  if (flip < 0) g.scale(-1, 1);
  const sw = Math.sin(walk) * 2;

  if (sp.beast) {
    g.fillStyle = sp.hair;
    g.fillRect(-7, -7, 3, 7); g.fillRect(5, -7, 3, 7);
    g.fillRect(-4 + sw, -6, 3, 6); g.fillRect(2 - sw, -6, 3, 6);
    g.fillStyle = sp.skin;
    g.beginPath(); g.ellipse(0, -12, 10, 6, 0, 0, 6.29); g.fill();
    g.beginPath(); g.ellipse(9, -16, 5.5, 4.5, 0, 0, 6.29); g.fill();
    g.fillStyle = sp.hair;
    g.beginPath(); g.moveTo(6, -20); g.lineTo(8, -25); g.lineTo(10, -20); g.fill();
    g.beginPath(); g.moveTo(-10, -14); g.lineTo(-16, -20); g.lineTo(-9, -11); g.fill();
    g.fillStyle = sp.trim;
    g.beginPath(); g.arc(11, -17, 1.6, 0, 6.29); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(12, -14); g.lineTo(14, -12); g.lineTo(11, -12.5); g.fill();
    g.restore(); return;
  }

  if (sp.mount) {                                   /* horse under rider */
    g.fillStyle = '#4a3524';
    g.fillRect(-8, -8, 3, 8); g.fillRect(6, -8, 3, 8);
    g.fillRect(-4 + sw, -7, 3, 7); g.fillRect(3 - sw, -7, 3, 7);
    g.fillStyle = '#6b4c33';
    g.beginPath(); g.ellipse(0, -13, 11, 6.5, 0, 0, 6.29); g.fill();
    g.beginPath(); g.ellipse(10, -19, 4, 5.5, -.4, 0, 6.29); g.fill();
    g.fillStyle = '#3a2a1c';
    g.beginPath(); g.moveTo(-11, -16); g.lineTo(-17, -22); g.lineTo(-10, -12); g.fill();
    g.fillStyle = '#241a10'; g.beginPath(); g.arc(12, -21, 1.3, 0, 6.29); g.fill();
    g.translate(-1, -16);
  }

  /* legs */
  g.fillStyle = '#3a3550';
  if (!sp.mount) { g.fillRect(-5, -8 + sw * .4, 4, 8); g.fillRect(1, -8 - sw * .4, 4, 8); }
  /* torso */
  g.fillStyle = sp.cloth;
  g.beginPath();
  g.moveTo(-6, -8); g.lineTo(-7, -19); g.lineTo(7, -19); g.lineTo(6, -8); g.closePath(); g.fill();
  g.fillStyle = sp.trim; g.fillRect(-6, -11, 12, 2.5);
  if (sp.hood) {
    g.fillStyle = sp.cloth;
    g.beginPath(); g.moveTo(-8, -8); g.lineTo(-6, -24); g.lineTo(6, -24); g.lineTo(8, -8); g.closePath(); g.fill();
  }
  /* arms */
  g.fillStyle = sp.skin;
  g.fillRect(-9, -18, 3.5, 8); g.fillRect(5.5, -18, 3.5, 8);
  /* head */
  if (sp.hood) {
    g.fillStyle = '#100c16';
    g.beginPath(); g.ellipse(0, -25, 5.6, 6.2, 0, 0, 6.29); g.fill();
    g.fillStyle = sp.cloth;
    g.beginPath(); g.arc(0, -26, 6.4, Math.PI, 0); g.fill();
    g.fillStyle = sp.trim;
    g.beginPath(); g.arc(-2, -25, 1.2, 0, 6.29); g.fill();
    g.beginPath(); g.arc(2.4, -25, 1.2, 0, 6.29); g.fill();
  } else {
    g.fillStyle = sp.skin;
    g.beginPath(); g.arc(0, -24, 6, 0, 6.29); g.fill();
    g.fillStyle = sp.hair;
    g.beginPath(); g.arc(0, -25.5, 6.1, Math.PI * 1.02, Math.PI * 2.0); g.fill();
    g.fillRect(-6.1, -26, 2.2, 5);
    g.fillStyle = sp.bone ? '#221e18' : '#221822';
    g.fillRect(-3.2, -25, 2, 2.4); g.fillRect(1.4, -25, 2, 2.4);
    if (sp.bone) {
      g.fillStyle = '#221e18';
      g.fillRect(-2.4, -21.2, 4.8, 1.2);
      g.fillStyle = sp.skin;
      g.fillRect(-1.2, -21.2, 1, 1.2); g.fillRect(.8, -21.2, 1, 1.2);
    }
  }
  if (sp.horn) {
    g.fillStyle = sp.trim;
    g.beginPath(); g.moveTo(-6, -28); g.lineTo(-9, -34); g.lineTo(-3, -29); g.fill();
    g.beginPath(); g.moveTo(6, -28); g.lineTo(9, -34); g.lineTo(3, -29); g.fill();
  }
  /* weapon in the right hand */
  const w = sp.wep;
  g.save(); g.translate(8, -15);
  if (w === 'sword') {
    g.fillStyle = '#4a3a28'; g.fillRect(-1.5, -2, 3, 6);
    g.fillStyle = sp.trim; g.fillRect(-3.5, -3.5, 7, 2);
    g.fillStyle = '#dfe6ef'; g.fillRect(-1.2, -19, 2.6, 16);
    g.fillStyle = '#ffffff'; g.fillRect(-1.2, -19, 1, 16);
  } else if (w === 'lance') {
    g.fillStyle = '#5a4530'; g.fillRect(-1, -22, 2, 30);
    g.fillStyle = '#e2e8f0';
    g.beginPath(); g.moveTo(-3, -21); g.lineTo(0, -30); g.lineTo(3, -21); g.fill();
  } else if (w === 'axe') {
    g.fillStyle = '#6b4f30'; g.fillRect(-1.3, -18, 2.6, 26);
    g.beginPath();
    g.moveTo(1, -21); g.quadraticCurveTo(12.5, -18.5, 10.5, -14);
    g.quadraticCurveTo(12.5, -9.5, 1, -7);
    g.quadraticCurveTo(4, -14, 1, -21); g.closePath();
    g.fillStyle = sp.trim; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 1; g.stroke();
  } else if (w === 'bow') {
    g.strokeStyle = '#7a5a34'; g.lineWidth = 2.2;
    g.beginPath(); g.arc(0, -8, 11, -1.25, 1.25); g.stroke();
    g.strokeStyle = '#e8e0c8'; g.lineWidth = .9;
    g.beginPath(); g.moveTo(3.4, -18.4); g.lineTo(3.4, 2.4); g.stroke();
  } else if (w === 'staff') {
    g.fillStyle = '#6b4f30'; g.fillRect(-1.2, -20, 2.4, 28);
    g.fillStyle = sp.trim;
    g.beginPath(); g.arc(0, -22, 3.6, 0, 6.29); g.fill();
    g.fillStyle = 'rgba(255,255,255,.65)';
    g.beginPath(); g.arc(-1.1, -23.1, 1.2, 0, 6.29); g.fill();
  } else if (w === 'club') {
    g.fillStyle = '#7a5a34'; g.fillRect(-1.7, -10, 3.4, 18);
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1; g.strokeRect(-1.7, -10, 3.4, 18);
    g.fillStyle = '#a1804f';
    g.beginPath(); g.ellipse(0, -14, 4.8, 5.8, 0, 0, 6.29); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.28)';
    g.beginPath(); g.ellipse(-1.6, -15.6, 1.7, 2.1, 0, 0, 6.29); g.fill();
  } else if (w === 'claw') {
    g.fillStyle = '#e8e8f0';
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.moveTo(0, -4 + i * 3); g.lineTo(6, -6 + i * 3); g.lineTo(0, -1.5 + i * 3); g.fill();
    }
  }
  g.restore();
  g.restore();
}

function drawUnit(u, cx, cy, scale, walkPhase) {
  const sp = SPRITES[u.sp] || SPRITES.max;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(0, 0, 11 * scale, 4.4 * scale, 0, 0, 6.29); ctx.fill();
  drawFig(ctx, sp, u.face, walkPhase, scale);
  ctx.restore();
}

function drawUnitOnMap(u) {
  let px = u.x * TILE + TILE / 2, py = u.y * TILE + TILE - 5;
  let phase = 0;
  if (G.walk && G.walk.u === u) {
    const w = G.walk, a = w.path[w.i], b = w.path[Math.min(w.i + 1, w.path.length - 1)];
    px = lerp(a.x, b.x, w.t) * TILE + TILE / 2;
    py = lerp(a.y, b.y, w.t) * TILE + TILE - 5;
    phase = G.time * 14;
  }
  const isActive = G.active === u && !busy();
  if (isActive) py -= Math.abs(Math.sin(G.time * 4)) * 3;
  ctx.save();
  if (u.acted && u.side === 'ally' && G.active !== u) ctx.globalAlpha = .55;
  /* team ring */
  ctx.fillStyle = u.side === 'ally' ? 'rgba(90,160,255,.42)' : 'rgba(255,90,80,.42)';
  ctx.beginPath(); ctx.ellipse(px, u.y * TILE + TILE - 5, 13, 5.4, 0, 0, 6.29); ctx.fill();
  ctx.strokeStyle = u.side === 'ally' ? 'rgba(150,205,255,.85)' : 'rgba(255,140,120,.85)';
  ctx.lineWidth = 1.4; ctx.stroke();
  if (isActive) {
    ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(px, u.y * TILE + TILE - 5, 15, 6.4, 0, 0, 6.29); ctx.stroke();
  }
  drawUnit(u, px, py, 1, phase);
  /* HP bar */
  bar(px - 13, u.y * TILE + 2, 26, 4, u.hp / u.mhp,
      u.side === 'ally' ? '#4fd66a' : '#e05a4a');
  if (u.boss) { shadowTxt('☠', px, u.y * TILE + 1, '#ff9a6a', 12, true, 'center'); }
  if (u.boost > 0) { shadowTxt('↑', px + 15, u.y * TILE + 14, '#ffd76a', 13, true, 'center'); }
  ctx.restore();
}

/* --------------------------------------------------------- overlays  */
function drawOverlays() {
  const u = G.active;
  if (G.mode === 'move' && G.reach && u) {
    const inReach = new Set(G.reach.tiles.map(t => t.x + ',' + t.y));
    if (G.threat) {
      ctx.fillStyle = 'rgba(220,60,50,.20)';
      for (const k of G.threat) {
        const [x, y] = k.split(',').map(Number);
        if (inReach.has(k)) continue;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    const pulse = .16 + Math.sin(G.time * 3) * .05;
    ctx.fillStyle = 'rgba(70,150,255,' + (pulse + .12) + ')';
    for (const t of G.reach.tiles) ctx.fillRect(t.x * TILE, t.y * TILE, TILE, TILE);
    ctx.strokeStyle = 'rgba(140,200,255,.65)'; ctx.lineWidth = 1;
    for (const t of G.reach.tiles) {
      const k = (a, b) => inReach.has(a + ',' + b);
      const x = t.x * TILE, y = t.y * TILE;
      ctx.beginPath();
      if (!k(t.x, t.y - 1)) { ctx.moveTo(x, y + .5); ctx.lineTo(x + TILE, y + .5); }
      if (!k(t.x, t.y + 1)) { ctx.moveTo(x, y + TILE - .5); ctx.lineTo(x + TILE, y + TILE - .5); }
      if (!k(t.x - 1, t.y)) { ctx.moveTo(x + .5, y); ctx.lineTo(x + .5, y + TILE); }
      if (!k(t.x + 1, t.y)) { ctx.moveTo(x + TILE - .5, y); ctx.lineTo(x + TILE - .5, y + TILE); }
      ctx.stroke();
    }
    /* path preview */
    if (G.reach.has(G.cursor.x, G.cursor.y)) {
      const p = pathTo(G.reach, G.cursor.x, G.cursor.y);
      ctx.strokeStyle = 'rgba(255,240,180,.9)'; ctx.lineWidth = 3;
      ctx.lineJoin = 'round'; ctx.beginPath();
      p.forEach((n, i) => {
        const cx = n.x * TILE + TILE / 2, cy = n.y * TILE + TILE / 2;
        i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy);
      });
      ctx.stroke();
      const last = p[p.length - 1];
      ctx.fillStyle = 'rgba(255,240,180,.9)';
      ctx.beginPath(); ctx.arc(last.x * TILE + TILE / 2, last.y * TILE + TILE / 2, 4, 0, 6.29); ctx.fill();
    }
  }
  if (G.mode === 'target' && G.targets) {
    const p = .5 + Math.sin(G.time * 6) * .25;
    const heal = G.pending && (G.pending.kind === 'item' ||
      (G.pending.kind === 'spell' && SPELLS[G.pending.id].kind !== 'dmg'));
    ctx.fillStyle = heal ? 'rgba(80,230,150,' + (p * .4) + ')' : 'rgba(255,70,60,' + (p * .45) + ')';
    for (const t of G.targets) ctx.fillRect(t.x * TILE, t.y * TILE, TILE, TILE);
    if (G.pending && G.pending.area) {
      ctx.fillStyle = 'rgba(255,220,120,.28)';
      for (const t of areaTiles(G.cursor.x, G.cursor.y, G.pending.area))
        ctx.fillRect(t.x * TILE, t.y * TILE, TILE, TILE);
    }
  }
  /* danger zone of the enemy under the pointer */
  if (G.mode === 'move' || G.mode === 'menu') {
    const h = G.hover || G.cursor;
    const e = h ? unitAt(h.x, h.y) : null;
    if (e && e.alive && e.side === 'enemy') {
      const key = e.id + ':' + e.x + ':' + e.y;
      if (!G.hoverThreat || G.hoverThreat.key !== key) {
        const r = computeReach(e), set = new Set();
        for (const t of r.tiles)
          for (const p of rangeTiles(t.x, t.y, e.rng[0], e.rng[1])) set.add(p.x + ',' + p.y);
        G.hoverThreat = { key, keys: [...set] };
      }
      const inZone = new Set(G.hoverThreat.keys);
      ctx.fillStyle = 'rgba(226,64,52,.26)';
      for (const k of G.hoverThreat.keys) {
        const [x, y] = k.split(',').map(Number);
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
      ctx.strokeStyle = 'rgba(255,120,100,.95)'; ctx.lineWidth = 2;
      for (const k of G.hoverThreat.keys) {
        const [x, y] = k.split(',').map(Number);
        const px = x * TILE, py = y * TILE;
        const has = (a2, b2) => inZone.has(a2 + ',' + b2);
        ctx.beginPath();
        if (!has(x, y - 1)) { ctx.moveTo(px, py + 1); ctx.lineTo(px + TILE, py + 1); }
        if (!has(x, y + 1)) { ctx.moveTo(px, py + TILE - 1); ctx.lineTo(px + TILE, py + TILE - 1); }
        if (!has(x - 1, y)) { ctx.moveTo(px + 1, py); ctx.lineTo(px + 1, py + TILE); }
        if (!has(x + 1, y)) { ctx.moveTo(px + TILE - 1, py); ctx.lineTo(px + TILE - 1, py + TILE); }
        ctx.stroke();
      }
      shadowTxt(e.name + "'s reach", e.x * TILE + TILE / 2, e.y * TILE - 6, '#ff9a8a', 11, true, 'center');
    } else G.hoverThreat = null;
  }

  /* cursor brackets */
  if (G.phase === 'battle' && (G.mode === 'move' || G.mode === 'target')) {
    const x = G.cursor.x * TILE, y = G.cursor.y * TILE;
    const o = 2 + Math.sin(G.time * 5) * 1.2;
    ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    const L = 10;
    const corner = (cx, cy, dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy + dy * L); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * L, cy); ctx.stroke();
    };
    corner(x - o, y - o, 1, 1); corner(x + TILE + o, y - o, -1, 1);
    corner(x - o, y + TILE + o, 1, -1); corner(x + TILE + o, y + TILE + o, -1, -1);
  }
}

/* ---------------------------------------------------------------- fx */
function drawFX() {
  for (const f of G.fx) {
    const p = f.t / f.life;
    if (f.kind === 'text') {
      ctx.globalAlpha = clamp(1 - p * p, 0, 1);
      shadowTxt(f.text, f.x * TILE + TILE / 2, f.y * TILE + 12 + (f.dy || 0) - p * 22,
                f.col, 14, true, 'center');
      ctx.globalAlpha = 1;
    } else if (f.kind === 'burst') {
      ctx.globalAlpha = clamp(1 - p, 0, 1);
      ctx.strokeStyle = f.col; ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.beginPath();
      ctx.arc(f.x * TILE + TILE / 2, f.y * TILE + TILE / 2, f.r * (.3 + p * 1.1), 0, 6.29);
      ctx.stroke();
      ctx.fillStyle = f.col; ctx.globalAlpha = clamp(.5 - p * .5, 0, 1);
      ctx.beginPath();
      ctx.arc(f.x * TILE + TILE / 2, f.y * TILE + TILE / 2, f.r * (1 - p) * .7, 0, 6.29);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

/* ------------------------------------------------------- battle scene */
function drawScene() {
  const s = G.scene; if (!s) return;
  const px = 92, py = 104, pw = VIEWW - 184, ph = 250;
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, VIEWW, VIEWH);
  const sh = (Math.random() - .5) * s.shake;
  ctx.save(); ctx.translate(sh, sh * .5);

  const gnd = terrainAt(s.d.x, s.d.y);
  const grad = ctx.createLinearGradient(0, py, 0, py + ph);
  grad.addColorStop(0, '#101828'); grad.addColorStop(.55, '#1c2b3e'); grad.addColorStop(1, gnd.c1);
  ctx.fillStyle = grad; ctx.fillRect(px, py, pw, ph);
  /* distant hills */
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(px + 70 + i * 105, py + 168, 78, 34, 0, Math.PI, 0); ctx.fill();
  }
  ctx.fillStyle = gnd.c2; ctx.fillRect(px, py + 176, pw, ph - 176);
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(px, py + 176, pw, 4);
  if (s.flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + (s.flash * .35) + ')';
    ctx.fillRect(px, py, pw, ph);
  }
  ctx.strokeStyle = '#e8d9a8'; ctx.lineWidth = 3; ctx.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
  ctx.strokeStyle = '#4a3f2a'; ctx.lineWidth = 1; ctx.strokeRect(px + 4.5, py + 4.5, pw - 9, ph - 9);

  const act = s.acts[s.i];
  const lungeFor = who => {
    if (!act || s.state !== 'act' || act.by !== who) return 0;
    const t = clamp(s.t / .55, 0, 1);
    return Math.sin(t * Math.PI) * 46;
  };
  const hurtFor = who => {
    if (!act || !act.applied || act.miss || act.by === who) return 0;
    const t = clamp((s.t - .34) / .3, 0, 1);
    return t < 1 ? Math.sin(t * Math.PI * 3) * 7 : 0;
  };
  const groundY = py + 214;
  const ax = px + 128 + lungeFor('a') + hurtFor('a');
  const dx = px + pw - 128 - lungeFor('d') - hurtFor('d');

  const sideBar = (u, x, right, show) => {
    const w = 176, bx = right ? x - w : x;
    ctx.fillStyle = 'rgba(8,10,18,.82)'; rr(ctx, bx, py + 14, w, 42, 5); ctx.fill();
    ctx.strokeStyle = u.side === 'ally' ? '#6aa8ff' : '#ff7a68'; ctx.lineWidth = 1.5; ctx.stroke();
    shadowTxt(u.name, bx + 8, py + 31, '#fff', 13, true);
    shadowTxt('Lv' + u.lv, bx + w - 8, py + 31, '#ffe27a', 12, true, 'right');
    bar(bx + 8, py + 37, w - 16, 10, show / u.mhp, u.side === 'ally' ? '#4fd66a' : '#e05a4a');
    shadowTxt(Math.ceil(show) + '/' + u.mhp, bx + w / 2, py + 46, '#fff', 11, true, 'center');
  };
  sideBar(s.a, px + 22, false, s.aShow);
  sideBar(s.d, px + pw - 22, true, s.dShow);

  const oa = s.a.face, od = s.d.face;
  s.a.face = 1; s.d.face = -1;
  const walkA = (act && act.by === 'a' && s.state === 'act') ? s.t * 20 : 0;
  const walkD = (act && act.by === 'd' && s.state === 'act') ? s.t * 20 : 0;
  drawUnit(s.d, dx, groundY, 3.0, walkD);
  drawUnit(s.a, ax, groundY, 3.0, walkA);
  s.a.face = oa; s.d.face = od;

  if (s.txt) {
    const tx = s.txt.side === 'd' ? dx : ax;
    const t = clamp((s.t - .34) / .66, 0, 1);
    ctx.globalAlpha = clamp(1 - t * t, 0, 1);
    shadowTxt(String(s.txt.t), tx, groundY - 96 - t * 26, s.txt.col, 26, true, 'center');
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* --------------------------------------------------------------- menu */
function drawMenu() {
  const m = G.menu; if (!m) return;
  ctx.fillStyle = 'rgba(10,12,22,.94)'; rr(ctx, m.x, m.y, m.w, m.h, 6); ctx.fill();
  ctx.strokeStyle = '#e8d9a8'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1;
  rr(ctx, m.x + 3, m.y + 3, m.w - 6, m.h - 6, 4); ctx.stroke();
  m.items.forEach((it, i) => {
    const y = m.y + 8 + i * 22;
    if (i === m.idx) {
      ctx.fillStyle = 'rgba(80,140,235,.55)';
      rr(ctx, m.x + 5, y, m.w - 10, 20, 3); ctx.fill();
      shadowTxt('▶', m.x + 9, y + 15, '#ffe27a', 12, true);
    }
    txt(it.label, m.x + 24, y + 15, it.enabled ? '#f2f2f2' : '#75757f', 14, i === m.idx);
    if (it.note) txt(it.note, m.x + m.w - 10, y + 15, it.enabled ? '#9fd0ff' : '#6a6a74', 12, false, 'right');
  });
}

/* -------------------------------------------------------------- panel */
function panelUnit() {
  if (G.mode === 'target' && G.targets) { const o = unitAt(G.cursor.x, G.cursor.y); if (o) return o; }
  if (G.hover) { const o = unitAt(G.hover.x, G.hover.y); if (o) return o; }
  return G.active;
}
function drawPanel() {
  const y0 = VIEWH;
  ctx.fillStyle = '#171a26'; ctx.fillRect(0, y0, CW, PANELH);
  ctx.fillStyle = '#0e1119'; ctx.fillRect(0, y0, CW, 3);
  const box = (x, w, title) => {
    ctx.fillStyle = '#10131e'; rr(ctx, x, y0 + 8, w, PANELH - 16, 5); ctx.fill();
    ctx.strokeStyle = '#3c4358'; ctx.lineWidth = 1.5; ctx.stroke();
    if (title) txt(title, x + 10, y0 + 24, '#7b86a8', 11, true);
  };
  box(8, 292); box(308, 224); box(540, 316, 'BATTLE LOG');

  /* ---- unit card ---- */
  const u = panelUnit();
  if (u) {
    ctx.save();
    ctx.beginPath(); ctx.rect(10, y0 + 10, 288, PANELH - 20); ctx.clip();
    const of = u.face; u.face = 1;
    drawUnit(u, 46, y0 + 92, 1.55, 0);
    u.face = of;
    ctx.restore();
    txt(u.name, 84, y0 + 28, u.side === 'ally' ? '#9fd0ff' : '#ff9a8a', 15, true);
    txt(u.clsName + '  Lv' + u.lv, 84, y0 + 44, '#c9cee0', 12);
    txt('HP', 84, y0 + 62, '#8a92ab', 11, true);
    bar(104, y0 + 53, 92, 10, u.hp / u.mhp, u.side === 'ally' ? '#4fd66a' : '#e05a4a');
    txt(u.hp + '/' + u.mhp, 200, y0 + 62, '#e6e9f2', 11);
    if (u.mmp > 0) {
      txt('MP', 84, y0 + 78, '#8a92ab', 11, true);
      bar(104, y0 + 69, 92, 10, u.mp / u.mmp, '#4a8ee0');
      txt(u.mp + '/' + u.mmp, 200, y0 + 78, '#e6e9f2', 11);
    }
    const st = 'ATK ' + atkOf(u) + ' DEF ' + defOf(u) + ' AGI ' + u.agi + ' MOV ' + u.mov;
    txt(st, 84, y0 + 96, '#c9cee0', 12);
    if (u.side === 'ally') txt('EXP ' + u.exp + '/100', 240, y0 + 44, '#ffe27a', 11);
    if (u.boost > 0) txt('BOOST', 240, y0 + 28, '#ffd76a', 11, true);
  }

  /* ---- terrain / forecast ---- */
  const t = terrainAt(G.cursor.x, G.cursor.y);
  txt('TERRAIN', 318, y0 + 24, '#7b86a8', 11, true);
  txt(t.name, 318, y0 + 44, '#e6e9f2', 14, true);
  txt('Move cost ' + (t.cost >= 99 ? '—' : t.cost) + '    Land Effect ' + Math.round(t.def * 100) + '%',
      318, y0 + 60, '#c9cee0', 11);

  if (G.mode === 'target' && G.pending && G.pending.kind === 'attack') {
    const d = unitAt(G.cursor.x, G.cursor.y);
    if (d && G.active) {
      const est = Math.round(estDamage(G.active, d));
      txt('FORECAST', 318, y0 + 80, '#7b86a8', 11, true);
      txt('~' + est + ' dmg   ' + Math.round(hitChance(G.active, d) * 100) + '% hit', 318, y0 + 96,
          '#ffb0a0', 13, true);
      const k = est >= d.hp ? 'LETHAL' : (mdist(G.active, d) >= d.rng[0] && mdist(G.active, d) <= d.rng[1]
        ? 'may counter' : 'no counter');
      txt(k, 450, y0 + 96, est >= d.hp ? '#8ef0a0' : '#c9cee0', 12, true);
    }
  } else if (G.mode === 'target' && G.pending && G.pending.kind === 'spell') {
    const sp = SPELLS[G.pending.id], L = sp.lv[G.pending.lv - 1];
    txt('SPELL', 318, y0 + 80, '#7b86a8', 11, true);
    txt(sp.name + ' ' + G.pending.lv + '   ' + (sp.kind === 'dmg' ? '~' + L.pow + ' dmg' : '+' + L.pow + ' HP'),
        318, y0 + 96, sp.col, 13, true);
  } else {
    txt('ROUND ' + G.round, 318, y0 + 84, '#7b86a8', 11, true);
    const alive = G.units.filter(x => x.alive && x.side === 'enemy').length;
    txt('Enemies remaining: ' + alive, 318, y0 + 100, '#ffb0a0', 12);
  }

  /* ---- log ---- */
  const lines = G.log.slice(-5);
  lines.forEach((l, i) => {
    ctx.save();
    ctx.beginPath(); ctx.rect(546, y0 + 28, 304, 70); ctx.clip();
    txt(l, 550, y0 + 42 + i * 14, i === lines.length - 1 ? '#f4f0dc' : '#9aa2ba', 11.5);
    ctx.restore();
  });
}

/* ------------------------------------------------------ hud overlays */
function drawHUD() {
  const ch = CHAPTERS[G.chapter];
  ctx.fillStyle = 'rgba(8,10,18,.72)'; rr(ctx, 8, 8, 306, 40, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(232,217,168,.55)'; ctx.lineWidth = 1; ctx.stroke();
  shadowTxt(ch.title, 16, 24, '#ffe27a', 12, true);
  shadowTxt(ch.goal, 16, 40, '#d7dcea', 11);

  /* turn order strip */
  const up = [G.active].concat(G.order.filter(u => u.alive)).filter(Boolean).slice(0, 9);
  const sx = VIEWW - 12 - up.length * 30;
  ctx.fillStyle = 'rgba(8,10,18,.72)';
  rr(ctx, sx - 8, 8, up.length * 30 + 16, 42, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(232,217,168,.55)'; ctx.lineWidth = 1; ctx.stroke();
  up.forEach((u, i) => {
    const x = sx + i * 30;
    ctx.fillStyle = u.side === 'ally' ? '#2b4a7a' : '#7a2f2b';
    rr(ctx, x, 14, 26, 30, 3); ctx.fill();
    if (i === 0) { ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.save();
    ctx.beginPath(); ctx.rect(x, 14, 26, 30); ctx.clip();
    const of = u.face; u.face = 1;
    drawUnit(u, x + 13, 44, .92, 0);
    u.face = of;
    ctx.restore();
  });
  shadowTxt('NEXT', sx - 4, 58, '#7b86a8', 10, true);

}

/* banners float above everything, so a level-up during a battle scene still reads */
function drawBanner() {
  if (G.banner) {
    const b = G.banner;
    const p = b.t / b.life;
    const a = p < .15 ? p / .15 : p > .8 ? (1 - p) / .2 : 1;
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.fillStyle = 'rgba(8,10,18,.85)';
    const w = Math.max(280, b.text.length * 13 + 60);
    rr(ctx, VIEWW / 2 - w / 2, VIEWH / 2 - 96, w, 54, 6); ctx.fill();
    ctx.strokeStyle = b.col; ctx.lineWidth = 2; ctx.stroke();
    shadowTxt(b.text, VIEWW / 2, VIEWH / 2 - 60, b.col, 20, true, 'center');
    ctx.globalAlpha = 1;
  }
}

/* ===================================================================== */
/*                              SCREENS                                  */
/* ===================================================================== */

function backdrop(c1, c2) {
  const g = ctx.createLinearGradient(0, 0, 0, CH);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
}
function starfield() {
  for (let i = 0; i < 70; i++) {
    const x = h2(i, 3, 1) * CW, y = h2(i, 7, 2) * CH * .6;
    const a = .25 + .5 * Math.abs(Math.sin(G.time * 1.4 + i));
    ctx.fillStyle = 'rgba(255,255,235,' + a + ')';
    ctx.fillRect(x, y, 2, 2);
  }
}
function drawTitle() {
  backdrop('#0b1024', '#2a1a2e');
  starfield();
  /* horizon */
  ctx.fillStyle = '#182a2a'; ctx.beginPath();
  ctx.moveTo(0, CH); ctx.lineTo(0, 470);
  for (let x = 0; x <= CW; x += 40) ctx.lineTo(x, 470 - Math.sin(x * .01) * 30 - h2(x, 1, 1) * 18);
  ctx.lineTo(CW, CH); ctx.fill();
  ctx.fillStyle = '#0f1d1d'; ctx.beginPath();
  ctx.moveTo(0, CH); ctx.lineTo(0, 540);
  for (let x = 0; x <= CW; x += 30) ctx.lineTo(x, 540 - Math.sin(x * .014 + 2) * 22);
  ctx.lineTo(CW, CH); ctx.fill();

  shadowTxt('SHINING', CW / 2, 190, '#ffe27a', 78, true, 'center');
  shadowTxt('TACTICS', CW / 2, 258, '#e8e8f4', 60, true, 'center');
  ctx.strokeStyle = 'rgba(255,226,122,.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(CW / 2 - 250, 282); ctx.lineTo(CW / 2 + 250, 282); ctx.stroke();
  shadowTxt('A tale of the Force', CW / 2, 308, '#b9c2dc', 16, false, 'center');

  /* heroes on the ridge */
  const cast = ['max', 'knight', 'healer', 'mage', 'archer', 'warrior'];
  cast.forEach((k, i) => {
    const u = { sp: k, face: 1 };
    ctx.save();
    ctx.translate(CW / 2 - 195 + i * 78, 512 + Math.sin(G.time * 2 + i) * 2);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 7, 0, 0, 6.29); ctx.fill();
    drawFig(ctx, SPRITES[k], 1, G.time * 3 + i, 1.85);
    ctx.restore();
  });

  const a = .55 + .45 * Math.sin(G.time * 3);
  ctx.globalAlpha = a;
  shadowTxt('PRESS  ENTER  —  or click  —  TO BEGIN', CW / 2, 600, '#ffffff', 18, true, 'center');
  ctx.globalAlpha = 1;
  txt('Mouse: hover to aim, click to confirm, right-click to cancel', CW / 2, 640, '#8d97b5', 12, false, 'center');
  txt('Keys: arrows / WASD move  ·  Enter or Z confirm  ·  Esc or X cancel', CW / 2, 660, '#8d97b5', 12, false, 'center');
}

function drawBrief() {
  const ch = CHAPTERS[G.chapter];
  backdrop('#0d1226', '#231a2c');
  starfield();
  ctx.fillStyle = 'rgba(8,10,20,.6)'; ctx.fillRect(0, 44, CW, 172);
  shadowTxt(ch.title, CW / 2, 88, '#ffe27a', 26, true, 'center');
  shadowTxt('OBJECTIVE:  ' + ch.goal, CW / 2, 116, '#8ef0a0', 15, true, 'center');
  ch.brief.forEach((l, i) => txt(l, CW / 2, 148 + i * 20, '#d3d9ec', 14, false, 'center'));

  shadowTxt('THE FORCE', CW / 2, 244, '#e8d9a8', 16, true, 'center');
  G.force.forEach((u, i) => {
    const col = i % 3, row = (i / 3) | 0;
    const x = 42 + col * 264, y = 260 + row * 152, W = 250, H = 140;
    ctx.fillStyle = 'rgba(14,18,32,.9)'; rr(ctx, x, y, W, H, 6); ctx.fill();
    ctx.strokeStyle = '#4a5474'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip();
    const of = u.face; u.face = 1;
    drawUnit(u, x + 44, y + 104, 1.6, 0);
    u.face = of;
    ctx.restore();
    txt(u.name, x + 84, y + 26, '#9fd0ff', 16, true);
    txt(u.clsName, x + 84, y + 44, '#c9cee0', 12);
    txt('Lv ' + u.lv, x + W - 14, y + 26, '#ffe27a', 13, true, 'right');
    bar(x + 84, y + 52, 150, 9, 1, '#4fd66a');
    txt('HP ' + u.mhp, x + 88, y + 60, '#0a1a0e', 9, true);
    if (u.mmp > 0) {
      bar(x + 84, y + 65, 150, 9, 1, '#4a8ee0');
      txt('MP ' + u.mmp, x + 88, y + 73, '#04101e', 9, true);
    }
    const sy = y + (u.mmp > 0 ? 92 : 84);
    txt('ATK ' + u.atk + '   DEF ' + u.def, x + 84, sy, '#c9cee0', 11.5);
    txt('AGI ' + u.agi + '   MOV ' + u.mov, x + 84, sy + 15, '#c9cee0', 11.5);
    const inv = u.items.map(s => ITEMS[s.id].name + (s.n > 1 ? ' x' + s.n : '')).join(', ');
    txt(inv || '—', x + 12, y + H - 10, '#8d97b5', 10.5);
  });
  const a = .55 + .45 * Math.sin(G.time * 3);
  ctx.globalAlpha = a;
  shadowTxt('PRESS  ENTER  TO  DEPLOY', CW / 2, 664, '#ffffff', 18, true, 'center');
  ctx.globalAlpha = 1;
}

function drawGameOver() {
  backdrop('#180c10', '#2a0f14');
  shadowTxt('THE FORCE HAS FALLEN', CW / 2, 260, '#ff8a7a', 40, true, 'center');
  txt('Max was struck down, and the Force scattered into the hills.', CW / 2, 310, '#d3c9cc', 15, false, 'center');
  txt('But the tale is not finished.', CW / 2, 334, '#d3c9cc', 15, false, 'center');
  const a = .55 + .45 * Math.sin(G.time * 3);
  ctx.globalAlpha = a;
  shadowTxt('PRESS  ENTER  TO  TRY  THE  BATTLE  AGAIN', CW / 2, 420, '#ffffff', 18, true, 'center');
  ctx.globalAlpha = 1;
  txt('(your levels are kept)', CW / 2, 448, '#9a8f92', 12, false, 'center');
}

function drawEnding() {
  backdrop('#0a1226', '#1d2a3e');
  starfield();
  shadowTxt('VICTORY', CW / 2, 150, '#ffe27a', 56, true, 'center');
  const lines = [
    'Kane fell at the gate, and the vanguard of Runefaust broke.',
    'The road to the capital lay open under a clean morning sky.',
    '',
    'Max sheathed his sword. Behind him the Force came up the road,',
    'battered, loud, and alive — and the war was not over,',
    'but today, it had been enough.',
  ];
  lines.forEach((l, i) => txt(l, CW / 2, 220 + i * 26, '#dbe2f2', 16, false, 'center'));
  shadowTxt('THE FORCE', CW / 2, 402, '#e8d9a8', 18, true, 'center');
  G.force.forEach((u, i) => {
    const x = CW / 2 - (G.force.length - 1) * 62 + i * 124;
    ctx.save();
    ctx.translate(x, 520 + Math.sin(G.time * 2 + i) * 2);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 7, 0, 0, 6.29); ctx.fill();
    const of = u.face; u.face = 1;
    drawFig(ctx, SPRITES[u.sp], 1, G.time * 3 + i, 1.8);
    u.face = of;
    ctx.restore();
    txt(u.name + '  Lv' + u.lv, x, 548, '#9fd0ff', 12, true, 'center');
  });
  const a = .55 + .45 * Math.sin(G.time * 3);
  ctx.globalAlpha = a;
  shadowTxt('PRESS  ENTER  TO  RETURN  TO  TITLE', CW / 2, 640, '#ffffff', 16, true, 'center');
  ctx.globalAlpha = 1;
}

/* ===================================================================== */
/*                         PROGRESSION / SETUP                           */
/* ===================================================================== */

function levelTo(u, target) {
  const g = CLASSES[u.cls].growth;
  while (u.lv < target) {
    u.lv++;
    const hp = irnd(g.hp[0], g.hp[1]), mp = irnd(g.mp[0], g.mp[1]);
    u.mhp += hp; u.hp = u.mhp; u.mmp += mp; u.mp = u.mmp;
    u.atk += irnd(g.atk[0], g.atk[1]);
    u.def += irnd(g.def[0], g.def[1]);
    u.agi += irnd(g.agi[0], g.agi[1]);
  }
}
function newGame() {
  UID = 1;
  G.force = ROSTER.slice(0, 4).map(r => { const u = makeUnit(r, 'ally'); grantKit(u, r.kit); return u; });
  G.chapter = 0;
  prepBrief();
  G.phase = 'brief';
}
function prepBrief() {
  const ch = CHAPTERS[G.chapter];
  if (ch.join && !G.force.some(u => u.key === ch.join)) {
    const r = ROSTER.find(x => x.key === ch.join);
    const u = makeUnit(r, 'ally');
    grantKit(u, r.kit);
    const avg = Math.round(G.force.reduce((s, f) => s + f.lv, 0) / G.force.length);
    if (avg - 1 > u.lv) levelTo(u, avg - 1);
    G.force.push(u);
  }
  restoreForce();
}
function restoreForce() {
  for (const u of G.force) {
    u.alive = true; u.hp = u.mhp; u.mp = u.mmp; u.acted = false; u.boost = 0; u.exp = u.exp % 100;
    const r = ROSTER.find(x => x.key === u.key);
    if (r) grantKit(u, r.kit);
  }
}

/* ===================================================================== */
/*                               AUDIO                                   */
/* ===================================================================== */

let AC = null, MUTED = false;
function audioOn() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } }
function tone(f, dur, type, vol, to, delay) {
  if (!AC || MUTED) return;
  const t0 = AC.currentTime + (delay || 0);
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol || .06, t0 + .012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(t0); o.stop(t0 + dur + .02);
}
function sfx(k) {
  if (!AC) return;
  switch (k) {
    case 'move':  tone(520, .04, 'square', .035); break;
    case 'ok':    tone(700, .07, 'square', .05); tone(1050, .07, 'square', .03, null, .05); break;
    case 'back':  tone(400, .07, 'square', .04); tone(280, .07, 'square', .03, null, .05); break;
    case 'deny':  tone(150, .14, 'sawtooth', .05, 90); break;
    case 'step':  tone(180, .04, 'triangle', .04); break;
    case 'open':  tone(300, .12, 'sawtooth', .05, 700); break;
    case 'hit':   tone(220, .14, 'square', .07, 80); tone(90, .16, 'sawtooth', .05, 50); break;
    case 'crit':  tone(160, .26, 'sawtooth', .09, 900); tone(70, .3, 'square', .06, 40); break;
    case 'miss':  tone(320, .09, 'triangle', .04, 180); break;
    case 'magic': tone(380, .3, 'sawtooth', .06, 1300); tone(760, .3, 'triangle', .04, 2200); break;
    case 'heal':  tone(660, .22, 'triangle', .06, 1320); tone(990, .26, 'sine', .04); break;
    case 'die':   tone(320, .5, 'sawtooth', .07, 55); break;
    case 'level': [523, 659, 784, 1046].forEach((f, i) => tone(f, .18, 'square', .05, null, i * .09)); break;
    case 'fanfare': [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, .3, 'square', .055, null, i * .12)); break;
    case 'defeat': [392, 349, 294, 220].forEach((f, i) => tone(f, .4, 'triangle', .06, null, i * .18)); break;
  }
}

/* ===================================================================== */
/*                          UPDATE  &  LOOP                              */
/* ===================================================================== */

function update(dt) {
  G.time += dt;
  for (const f of G.fx) f.t += dt;
  G.fx = G.fx.filter(f => f.t < f.life);
  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.life) G.banner = null; }
  if (G.phase !== 'battle') return;

  if (G.walk) {
    const w = G.walk;
    w.t += dt * 7.2;
    while (w.t >= 1 && w.i < w.path.length - 1) {
      w.t -= 1; w.i++;
      w.u.x = w.path[w.i].x; w.u.y = w.path[w.i].y;
      if (w.i < w.path.length - 1) sfx('step');
    }
    if (w.i < w.path.length - 1) {
      const a = w.path[w.i], b = w.path[w.i + 1];
      if (b.x !== a.x) w.u.face = b.x > a.x ? 1 : -1;
    } else {
      const last = w.path[w.path.length - 1];
      w.u.x = last.x; w.u.y = last.y;
      const done = w.done; G.walk = null;
      if (done) done();
    }
    return;
  }
  if (G.scene) { updateScene(dt); return; }
  if (G.wait > 0) { G.wait -= dt; return; }
  if (G.queue.length) {
    const s = G.queue[0];
    if (s.delay > 0) { G.wait = s.delay; s.delay = 0; return; }
    G.queue.shift();
    s.fn();
  }
}

function draw() {
  ctx.clearRect(0, 0, CW, CH);
  if (G.phase === 'title')    return drawTitle();
  if (G.phase === 'brief')    return drawBrief();
  if (G.phase === 'gameover') return drawGameOver();
  if (G.phase === 'ending')   return drawEnding();

  for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) drawTile(x, y);
  drawOverlays();
  const sorted = G.units.filter(u => u.alive).slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
  for (const u of sorted) drawUnitOnMap(u);
  drawFX();
  drawHUD();
  drawScene();
  drawMenu();
  drawBanner();
  drawPanel();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

/* ===================================================================== */
/*                               INPUT                                   */
/* ===================================================================== */

function toTile(ev) {
  const r = cvs.getBoundingClientRect();
  const sx = CW / r.width, sy = CH / r.height;
  const mx = (ev.clientX - r.left) * sx, my = (ev.clientY - r.top) * sy;
  return { mx, my, x: Math.floor(mx / TILE), y: Math.floor(my / TILE), inMap: my < VIEWH };
}
function menuHit(m, mx, my) {
  if (!m) return -1;
  if (mx < m.x || mx > m.x + m.w || my < m.y + 4 || my > m.y + m.h - 4) return -1;
  const i = Math.floor((my - m.y - 8) / 22);
  return (i >= 0 && i < m.items.length) ? i : -1;
}
function advance() {                       /* Enter on the non-battle screens */
  audioOn();
  if (G.phase === 'title') { sfx('ok'); newGame(); return true; }
  if (G.phase === 'brief') { sfx('fanfare'); startChapter(G.chapter); return true; }
  if (G.phase === 'gameover') { sfx('ok'); restoreForce(); startChapter(G.chapter); return true; }
  if (G.phase === 'ending') { sfx('ok'); G.phase = 'title'; return true; }
  return false;
}
function hurry() {
  if (G.scene) { G.scene.t += .35; return true; }
  if (G.wait > 0) { G.wait = 0; return true; }
  return false;
}

cvs.addEventListener('mousemove', ev => {
  if (G.phase !== 'battle') return;
  const p = toTile(ev);
  const mi = menuHit(G.menu, p.mx, p.my);
  if (mi >= 0) { if (G.menu.items[mi].enabled && G.menu.idx !== mi) { G.menu.idx = mi; sfx('move'); } return; }
  if (!p.inMap) { G.hover = null; return; }
  G.hover = { x: p.x, y: p.y };
  if (G.mode === 'move' || G.mode === 'target') {
    if (G.cursor.x !== p.x || G.cursor.y !== p.y) { G.cursor = { x: p.x, y: p.y }; }
  }
});
cvs.addEventListener('mousedown', ev => {
  audioOn();
  if (ev.button === 2) { ev.preventDefault(); if (G.phase === 'battle' && !busy()) cancel(); return; }
  if (advance()) return;
  if (G.phase !== 'battle') return;
  if (busy()) { hurry(); return; }
  const p = toTile(ev);
  const mi = menuHit(G.menu, p.mx, p.my);
  if (mi >= 0) { G.menu.idx = mi; menuPick(); return; }
  if (G.menu) { return; }
  if (!p.inMap) return;
  G.cursor = { x: p.x, y: p.y };
  confirmTile(p.x, p.y);
});
cvs.addEventListener('contextmenu', ev => ev.preventDefault());

window.addEventListener('keydown', ev => {
  const k = ev.key;
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) ev.preventDefault();
  audioOn();
  if (k === 'm' || k === 'M') { MUTED = !MUTED; say(MUTED ? 'Sound off.' : 'Sound on.'); return; }
  if (k === 'Enter' || k === ' ' || k === 'z' || k === 'Z') {
    if (advance()) return;
    if (G.phase !== 'battle') return;
    if (busy()) { hurry(); return; }
    if (G.menu) { menuPick(); return; }
    confirmTile(G.cursor.x, G.cursor.y);
    return;
  }
  if (G.phase !== 'battle') return;
  if (k === 'Escape' || k === 'x' || k === 'X') { if (!busy()) cancel(); return; }
  const dirs = {
    ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
    ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
    ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
    ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
  };
  const dv = dirs[k];
  if (!dv) return;
  if (G.menu) { if (dv[1]) menuMove(dv[1]); return; }
  if (busy()) return;
  if (G.mode === 'target' && G.targets) {           /* hop between valid targets */
    let bi = -1, bd = 1e9;
    G.targets.forEach((t, i) => {
      const rel = { x: t.x - G.cursor.x, y: t.y - G.cursor.y };
      if (rel.x === 0 && rel.y === 0) return;
      if (dv[0] && Math.sign(rel.x) !== dv[0]) return;
      if (dv[1] && Math.sign(rel.y) !== dv[1]) return;
      const d = Math.abs(rel.x) + Math.abs(rel.y);
      if (d < bd) { bd = d; bi = i; }
    });
    if (bi >= 0) { G.cursor = { x: G.targets[bi].x, y: G.targets[bi].y }; sfx('move'); }
    return;
  }
  G.cursor = { x: clamp(G.cursor.x + dv[0], 0, MAPW - 1), y: clamp(G.cursor.y + dv[1], 0, MAPH - 1) };
  sfx('move');
});

/* --------------------------------------------------------------- go! */
G.phase = 'title';
requestAnimationFrame(frame);
