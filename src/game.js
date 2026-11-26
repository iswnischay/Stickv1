(() => {
'use strict';

/* ---------- constants ---------- */
const W = 1280, H = 640, GROUND = 560;
const HEAD_R = 12, GRAV = 2300, JUMP = 900, MOVE = 360;
const COYOTE = 0.1, JUMP_BUFFER = 0.12, CAST_BUFFER = 0.2;
const MANA_MAX = 100, MANA_REGEN = 6, MANA_ON_HIT = 5;
const PLATFORMS = [ { x: 170, y: 420, w: 240 }, { x: 870, y: 420, w: 240 }, { x: 520, y: 290, w: 240 } ];
const TYPE_BASE = { projectile: 2, beam: 3, burst: 3, zone: 4, dash: 2, shield: 4, rain: 4, strike: 4, orbit: 4, wave: 3, trap: 3, summon: 6 };
const EFFECT_COST = { blind: 3, pull: 2, push: 1, slow: 2, reflect: 4, homing: 2, curve: 2, pierce: 2 };
const SHAPES = ['orb', 'spear', 'blade', 'star'];
const BOT_LEVELS = {
  easy: { think: [0.55, 0.95], jitter: 70, head: 0.1 },
  normal: { think: [0.3, 0.55], jitter: 38, head: 0.25 },
  hard: { think: [0.14, 0.3], jitter: 14, head: 0.45 }
};
const REG_BUDGET = 80, ULT_BUDGET = 40, ULT_MAX = 100, ULT_REGEN = 1.5, ULT_PER_POINT = 8;
const ELEMENTS = {
  light: { name: 'Light', passive: 'Light beams dispel enemy zones they pass through.', themes: ['solar monk', 'lighthouse keeper', 'prism knight', 'firefly swarm'] },
  wind: { name: 'Wind', passive: 'Wind bursts that push bat slow projectiles (speed 5 or less) back.', themes: ['sky pirate', 'paper kite', 'storm spirit', 'feather ninja'] },
  fire: { name: 'Fire', passive: 'Fire projectiles melt ice projectiles they touch.', themes: ['volcano god', 'dragon tamer', 'fire juggler', 'phoenix'] },
  water: { name: 'Water', passive: 'Water puts out fire: water and fire projectiles or zones that touch cancel each other.', themes: ['deep-sea diver', 'rain shaman', 'pirate captain', 'koi spirit'] },
  earth: { name: 'Earth', passive: 'Earth shields block everything, even curving and antimatter attacks. Earth bursts launch foes upward.', themes: ['desert golem', 'mountain monk', 'sand sorcerer', 'crystal miner'] },
  darkness: { name: 'Darkness', passive: 'Shadow projectiles are nearly invisible until they get close.', themes: ['shadow assassin', 'eclipse witch', 'nightmare clown', 'ink demon'] },
  antimatter: { name: 'Antimatter', passive: 'Antimatter projectiles and beams erase enemy projectiles and pass through shields (except earth).', themes: ['rogue physicist', 'void knight', 'reality glitch', 'black-hole surfer'] },
  steel: { name: 'Steel', passive: 'Steel slashes (bursts) hit in front and can land head hits. Blocking with a steel shield returns 10 mana.', themes: ['samurai', 'knight errant', 'blade dancer', 'swordsmith'] },
  lightning: { name: 'Lightning', passive: 'Lightning hits on a fighter standing in a water zone score 1 bonus point.', themes: ['storm god', 'tesla inventor', 'thunder drummer', 'electric eel'] },
  ice: { name: 'Ice', passive: 'Every scoring ice hit chills the target and slows it briefly.', themes: ['frost giant', 'figure skater', 'glacier spirit', 'ice sculptor'] }
};
const EL_IDS = Object.keys(ELEMENTS);
const mv = (name, type, [damage, speed, size, count, duration], effects, cooldown, mana_overcharge, shape, flavor) =>
  ({ name, type, stats: { damage, speed, size, count, duration }, effects: effects.map(([t, s]) => ({ type: t, strength: s })), cooldown, mana_overcharge, visual: { shape }, flavor });
const DEFAULTS = {
  light: [mv('Light Lance', 'beam', [4, 7, 2, 1, 0], [], 3, 0, 'spear', 'A thin golden lance of light.'),
    mv('Flash', 'burst', [1, 5, 4, 1, 0], [['blind', 2]], 6, 0, 'star', 'A white pop of light that leaves anyone close seeing spots.'),
    mv('Light Step', 'dash', [0, 8, 1, 1, 0], [], 4, 0, 'orb', 'Blink in a puff of sparkles.'),
    mv('Mirror Shield', 'shield', [0, 1, 3, 1, 3], [['reflect', 2]], 7, 0, 'orb', 'A shimmering bubble that throws attacks straight back.'),
    mv('Judgement', 'strike', [7, 6, 8, 1, 0], [['blind', 2]], 1, 0, 'star', 'A pillar of sunlight slams down where the enemy stands.')],
  wind: [mv('Wind Blades', 'projectile', [2, 8, 1, 2, 0], [['curve', 1]], 2, 0, 'blade', 'Two crescent blades weave through the air.'),
    mv('Gust', 'burst', [0, 6, 5, 1, 0], [['push', 3]], 5, 0, 'orb', 'A shove of air that also bats slow projectiles back.'),
    mv('Cyclone Guard', 'orbit', [2, 6, 2, 3, 3], [['push', 1]], 7, 0, 'blade', 'Three wind blades circle you and shred anything close.'),
    mv('Storm Eye', 'zone', [3, 1, 7, 1, 4], [['pull', 4]], 8, 30, 'orb', 'A tornado that drags the enemy into its centre.'),
    mv('Hurricane', 'zone', [4, 3, 10, 1, 5], [['pull', 5]], 1, 0, 'orb', 'A screaming hurricane that swallows half the arena.')],
  fire: [mv('Fireball', 'projectile', [4, 6, 3, 1, 0], [], 3, 0, 'orb', 'A roaring ball of flame.'),
    mv('Fire Mine', 'trap', [4, 5, 4, 1, 2], [['push', 1]], 6, 0, 'star', 'A glowing rune that explodes when stepped on.'),
    mv('Blaze Step', 'dash', [2, 8, 1, 1, 0], [], 5, 0, 'orb', 'Rocket forward on a jet of flame.'),
    mv('Flame Pillar', 'strike', [4, 6, 4, 1, 0], [], 5, 0, 'orb', 'A column of fire erupts under the enemy.'),
    mv('Meteor Rain', 'rain', [4, 6, 4, 4, 0], [], 1, 0, 'orb', 'Burning meteors hammer the area around the enemy.')],
  water: [mv('Water Jet', 'beam', [3, 6, 3, 1, 0], [['push', 1]], 3, 0, 'spear', 'A high-pressure jet that shoves on impact.'),
    mv('Bubble Shield', 'shield', [0, 1, 4, 1, 3], [], 6, 0, 'orb', 'A wobbly bubble that soaks up attacks.'),
    mv('Tidal Wave', 'wave', [3, 5, 5, 1, 0], [['push', 2]], 5, 0, 'orb', 'A wave rolls along the ground. Jump it or get swept.'),
    mv('Whirlpool', 'zone', [2, 1, 5, 1, 3], [['pull', 2], ['slow', 1]], 7, 0, 'orb', 'A spinning pool that drags and slows.'),
    mv('Tsunami', 'wave', [6, 6, 10, 1, 0], [['push', 4]], 1, 0, 'orb', 'A towering wall of water crashes across the stage.')],
  earth: [mv('Boulder', 'projectile', [5, 4, 4, 1, 0], [], 4, 0, 'orb', 'A heavy rock lobbed in an arc.'),
    mv('Stone Wall', 'shield', [0, 1, 6, 1, 4], [], 7, 0, 'orb', 'A ring of stone that blocks anything.'),
    mv('Quicksand', 'trap', [1, 3, 5, 1, 3], [['slow', 3]], 6, 0, 'orb', 'Hidden sand that swallows ankles.'),
    mv('Fault Line', 'wave', [4, 5, 4, 1, 0], [], 5, 0, 'orb', 'Rock spikes burst up along the ground.'),
    mv('Earth Shatter', 'wave', [7, 4, 9, 1, 0], [['push', 3], ['slow', 2]], 1, 0, 'star', 'The ground splits open in a rolling avalanche of spikes.')],
  darkness: [mv('Shadow Bolt', 'projectile', [3, 7, 2, 1, 0], [['homing', 1]], 3, 0, 'spear', 'A near-invisible bolt that hunts its target.'),
    mv('Eclipse', 'burst', [1, 5, 4, 1, 0], [['blind', 2]], 6, 0, 'star', 'Snuff out the light around you.'),
    mv('Shade Step', 'dash', [1, 8, 1, 1, 0], [], 4, 0, 'orb', 'Melt into shadow and reappear.'),
    mv('Watcher', 'summon', [1, 5, 1, 1, 3], [], 8, 0, 'orb', 'A floating eye that spits shadow at the enemy.'),
    mv('Nightfall', 'zone', [4, 2, 9, 1, 4], [['blind', 2]], 1, 0, 'orb', 'Night swallows the arena and everyone inside goes blind.')],
  antimatter: [mv('Null Orb', 'projectile', [4, 5, 3, 1, 0], [], 4, 0, 'orb', 'An orb that deletes whatever it touches.'),
    mv('Annihilation Beam', 'beam', [5, 8, 1, 1, 0], [], 5, 0, 'spear', 'A thin line of nothing that cuts through shields.'),
    mv('Phase Shift', 'dash', [0, 9, 1, 1, 0], [], 5, 0, 'orb', 'Slip out of reality for an instant.'),
    mv('Void Ring', 'orbit', [3, 5, 2, 2, 3], [], 7, 0, 'orb', 'Two void orbs circle you, erasing what they touch.'),
    mv('Singularity', 'zone', [5, 1, 8, 1, 4], [['pull', 5]], 1, 0, 'orb', 'A tiny black hole that eats the battlefield.')],
  steel: [mv('Blade Slash', 'burst', [4, 7, 3, 1, 0], [], 2, 0, 'blade', 'A fast sword arc in front of you.'),
    mv('Thrown Swords', 'projectile', [3, 7, 2, 2, 0], [], 4, 0, 'spear', 'Two swords hurled side by side.'),
    mv('Lunge', 'dash', [3, 8, 1, 1, 0], [], 4, 0, 'orb', 'A stabbing charge that runs right through.'),
    mv('Parry', 'shield', [0, 1, 2, 1, 2], [['reflect', 1]], 6, 0, 'orb', 'A quick guard that knocks attacks back.'),
    mv('Thousand Blades', 'orbit', [3, 7, 3, 6, 4], [], 1, 0, 'blade', 'Six swords spin around you in a deadly ring.')],
  lightning: [mv('Bolt', 'beam', [4, 9, 1, 1, 0], [], 3, 0, 'spear', 'A crack of lightning straight at the enemy.'),
    mv('Spark Ball', 'projectile', [2, 6, 2, 1, 0], [['homing', 2]], 3, 0, 'star', 'A fizzing ball that chases its target.'),
    mv('Flash Step', 'dash', [1, 10, 1, 1, 0], [], 4, 0, 'orb', 'Move at the speed of a spark.'),
    mv('Tesla Coil', 'summon', [1, 6, 1, 1, 3], [], 8, 0, 'orb', 'A crackling coil that zaps the enemy on its own.'),
    mv('Thunderstorm', 'rain', [4, 8, 3, 4, 0], [['slow', 1]], 1, 0, 'star', 'A storm of lightning bolts pours from the sky.')],
  ice: [mv('Ice Shards', 'projectile', [3, 7, 2, 2, 0], [], 3, 0, 'spear', 'A pair of frozen spikes.'),
    mv('Frost Shield', 'shield', [0, 1, 4, 1, 3], [], 6, 0, 'orb', 'A dome of ice.'),
    mv('Frost Mine', 'trap', [3, 4, 4, 1, 2], [['slow', 2]], 6, 0, 'star', 'A frozen rune that bursts into spikes.'),
    mv('Blizzard', 'zone', [2, 2, 6, 1, 3], [['slow', 2]], 7, 0, 'orb', 'A drifting snowstorm.'),
    mv('Glacier Spikes', 'wave', [5, 5, 8, 1, 0], [['slow', 4]], 1, 0, 'star', 'A line of ice spikes races along the ground.')]
};
const DEFAULT_ULT_DESC = { light: 'A pillar of sunlight crashes down on the enemy and blinds them', wind: 'A hurricane that sucks in the whole arena', fire: 'Meteors rain from the sky around the enemy',
  water: 'A tsunami wave that floods the stage', earth: 'The ground shatters in a wave of rock spikes', darkness: 'Night falls and the enemy goes blind',
  antimatter: 'A black hole that pulls everything in', steel: 'A thousand swords spin around me', lightning: 'A thunderstorm of lightning bolts from the sky', ice: 'A line of glacier spikes races along the floor' };
for (const el of EL_IDS) DEFAULTS[el].forEach((m, i) => { m.element = el; if (i === 4) m.description = DEFAULT_ULT_DESC[el]; });

/* ---------- key bindings ---------- */
const ACTIONS = [['left', 'Move left'], ['right', 'Move right'], ['jump', 'Jump'], ['drop', 'Drop / fast fall'], ['m1', 'Move 1'], ['m2', 'Move 2'], ['m3', 'Move 3'], ['m4', 'Move 4'], ['m5', 'Ultimate']];
const DEFAULT_BINDS = {
  soloAuto: { left: ['KeyA'], right: ['KeyD'], jump: ['Space', 'KeyW'], drop: ['KeyS'], m1: ['Mouse0', 'KeyJ'], m2: ['Mouse2', 'KeyK'], m3: ['Mouse3', 'KeyL'], m4: ['Mouse4', 'KeyI'], m5: ['MouseLR', 'KeyO'] },
  solo: { left: ['KeyA'], right: ['KeyD'], jump: ['Space', 'KeyW'], drop: ['KeyS'], m1: ['Mouse0', 'Digit1'], m2: ['Mouse2', 'Digit2'], m3: ['KeyQ', 'Digit3'], m4: ['KeyE', 'Digit4'], m5: ['ShiftLeft', 'Digit5'] },
  duo1: { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW'], drop: ['KeyS'], m1: ['KeyC'], m2: ['KeyV'], m3: ['KeyB'], m4: ['KeyF'], m5: ['KeyG'] },
  pad: { jump: [0], drop: [13], m1: [2], m2: [3], m3: [1], m4: [5], m5: [4] },
  duo2: { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], drop: ['ArrowDown'], m1: ['Numpad1', 'KeyJ'], m2: ['Numpad2', 'KeyK'], m3: ['Numpad3', 'KeyL'], m4: ['Numpad4', 'KeyI'], m5: ['Numpad5', 'KeyO'] }
};
const deep = o => JSON.parse(JSON.stringify(o));
let binds = deep(DEFAULT_BINDS);
try { const s = localStorage.getItem('brawl-binds-v3'); if (s) { const b = JSON.parse(s); for (const k of Object.keys(DEFAULT_BINDS)) if (b[k]) binds[k] = Object.assign(deep(DEFAULT_BINDS[k]), b[k]); } } catch (e) {}
function saveBinds() { try { localStorage.setItem('brawl-binds-v3', JSON.stringify(binds)); } catch (e) {} }
const NAMES = { Mouse0x2: 'Double left click', Mouse2x2: 'Double right click', MouseLR: 'Left + right click', Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click', Mouse3: 'Side button (back)', Mouse4: 'Side button (front)',
  Semicolon: ';', Quote: '\'', Comma: ',', Period: '.', Slash: '/', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', Tab: 'Tab', Enter: 'Enter', CapsLock: 'Caps Lock' };
const SHORT = { Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'M4', Mouse4: 'M5', Mouse0x2: '2×L', Mouse2x2: '2×R', MouseLR: 'L+R', ShiftLeft: 'Shift', ShiftRight: 'Shift', Space: 'Space', ControlLeft: 'Ctrl', AltLeft: 'Alt', CapsLock: 'Caps' };
function keyName(c) { if (!c) return 'Not set'; if (NAMES[c]) return NAMES[c]; if (c.startsWith('Key')) return c.slice(3); if (c.startsWith('Digit')) return c.slice(5); if (c.startsWith('Numpad')) return 'Num ' + c.slice(6); return c; }
function keyShort(c) { if (!c) return '–'; if (SHORT[c]) return SHORT[c]; return keyName(c).replace('Num ', 'N'); }
const soloScheme = () => opts.aim === 'mouse' ? 'solo' : 'soloAuto';
function schemeFor(side) {
  if (opts.mode === 'online') return side === NET.side ? soloScheme() : null;
  return opts.mode === 'bot' ? (side === 0 ? soloScheme() : null) : (side === 0 ? 'duo1' : 'duo2');
}
const PAD_NAMES = ['A / ✕', 'B / ○', 'X / □', 'Y / △', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2', 'View / Create', 'Menu / Options', 'Left stick press', 'Right stick press', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home / PS'];
const PAD_SHORT = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', '↑', '↓', '←', '→', 'Home'];
const padName = i => PAD_NAMES[i] || `Button ${i}`;

/* ---------- colours from CSS tokens ---------- */
let C = {}, EC = {}, isDark = false;
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const g = n => cs.getPropertyValue(n).trim();
  C = { paper: g('--paper'), paper2: g('--paper-2'), grid: g('--grid'), ink: g('--ink'), soft: g('--ink-soft'), line: g('--line'),
    panel: g('--panel'), red: g('--red'), ground: g('--ground'), platform: g('--platform') };
  EC = {}; EL_IDS.forEach(id => { EC[id] = g('--el-' + id) || '#888888'; });
  const h = (C.paper || '#ffffff').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  isDark = ((n >> 16 & 255) * 0.3 + (n >> 8 & 255) * 0.59 + (n & 255) * 0.11) < 110;
}
readColors();
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors); } catch (e) {}
const elCol = el => EC[el] || (el === 'dust' ? C.soft : C.ink);
const glowCache = {};
function elGlow(el) {
  const hex = elCol(el); if (glowCache[hex]) return glowCache[hex];
  const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return (glowCache[hex] = `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.38)`);
}
const elName = el => (ELEMENTS[el] || { name: el }).name;

/* ---------- validation + costs ---------- */
function costs(m) {
  const s = m.stats;
  if (m.ult) { m.cooldown = 1; m.mana_overcharge = 0; }
  let b = TYPE_BASE[m.type] + s.damage * 2 + s.speed + s.size + (s.count - 1) * 3 + s.duration;
  m.effects.forEach(e => { b += EFFECT_COST[e.type] * e.strength; });
  b -= Math.max(0, m.cooldown - 3);
  b -= Math.round(m.mana_overcharge / 10 * 3);
  m.build_cost = Math.max(1, b);
  m.mana_cost = m.ult ? 0 : Math.round(5 + m.build_cost * 0.6 + m.mana_overcharge);
}
function normalize(r, element, i, errors, warnings) {
  let clamped = false;
  const ci = (v, min, max, def) => {
    if (v === undefined || v === null || v === '') return def;
    const n = Number(v);
    if (!Number.isFinite(n)) { clamped = true; return def; }
    const c = Math.max(min, Math.min(max, Math.round(n)));
    if (c !== n) clamped = true;
    return c;
  };
  if (typeof r !== 'object' || r === null) r = {};
  const name = String(r.name || `Move ${i + 1}`).slice(0, 26);
  let type = String(r.type || '').toLowerCase();
  if (!(type in TYPE_BASE)) {
    errors.push(`${name}: type “${r.type ?? ''}” isn’t a move type. Use one of: ${Object.keys(TYPE_BASE).join(', ')}.`);
    type = 'projectile';
  }
  if (r.element && String(r.element).toLowerCase() !== element) warnings.push(`${name}: element switched to ${element} to match the fighter.`);
  const s = (typeof r.stats === 'object' && r.stats) || {};
  const stats = { damage: ci(s.damage, 0, 10, 0), speed: ci(s.speed, 1, 10, 5), size: ci(s.size, 1, 10, 3), count: ci(s.count, 1, 6, 1), duration: ci(s.duration, 0, 5, 0) };
  let effects = [];
  const seen = new Set();
  (Array.isArray(r.effects) ? r.effects : []).forEach(e => {
    const t = String((e && e.type) || '').toLowerCase();
    if (!(t in EFFECT_COST)) { warnings.push(`${name}: unknown effect “${(e && e.type) || ''}” removed.`); return; }
    if (seen.has(t)) return;
    seen.add(t);
    effects.push({ type: t, strength: ci(e.strength, 1, 5, 1) });
  });
  if (effects.length > 2) { warnings.push(`${name}: only 2 effects are allowed, so the extras were removed.`); effects = effects.slice(0, 2); }
  const vis = (typeof r.visual === 'object' && r.visual) || {};
  const shape = SHAPES.includes(String(vis.shape)) ? String(vis.shape) : 'orb';
  const m = { ult: i === 4, name, element, type, stats, effects, cooldown: ci(r.cooldown, 1, 10, 3), mana_overcharge: ci(r.mana_overcharge, 0, 40, 0), visual: { shape },
    flavor: String(r.flavor || '').slice(0, 160), note: String(r.note || '').slice(0, 200), description: String(r.description || '').slice(0, 200) };
  if (clamped && i !== 4) warnings.push(`${name}: values outside the allowed ranges were clamped.`);
  costs(m);
  return m;
}
function toRaw(m) {
  const o = { name: m.name, element: m.element, type: m.type, stats: deep(m.stats), effects: deep(m.effects), cooldown: m.cooldown, mana_overcharge: m.mana_overcharge, visual: deep(m.visual) };
  if (m.flavor) o.flavor = m.flavor;
  if (m.note) o.note = m.note;
  if (m.description) o.description = m.description;
  return o;
}
function validate(raw, element) {
  const errors = [], warnings = [];
  if (!Array.isArray(raw)) return { valid: false, errors: ['The JSON must be a list of 5 moves (4 moves, then the ultimate), like [ { … }, { … } ].'], warnings, moves: [], total: 0, ultCost: 0 };
  if (raw.length !== 5) errors.push(`You need exactly 5 entries: 4 moves and 1 ultimate. This list has ${raw.length}.`);
  const moves = raw.slice(0, 5).map((r, i) => normalize(r, element, i, errors, warnings));
  const total = moves.slice(0, 4).reduce((a, m) => a + m.build_cost, 0);
  const ultCost = moves[4] ? moves[4].build_cost : 0;
  if (total > REG_BUDGET) errors.push(`Moves are over budget: ${total} of ${REG_BUDGET} build points.`);
  if (ultCost > ULT_BUDGET) errors.push(`The ultimate is over budget: ${ultCost} of ${ULT_BUDGET} build points.`);
  moves.forEach(m => { if (!m.ult && m.mana_cost > 60) errors.push(`${m.name} costs ${m.mana_cost} mana per cast. The limit is 60.`); });
  return { valid: errors.length === 0 && moves.length === 5, errors, warnings, moves, total, ultCost };
}
// Trims moves until they fit their budget, so an idea is toned down instead of rejected.
function fitBudget(raw, element, changeable) {
  const e = [], w = [];
  const moves = raw.map((r, i) => normalize(r, element, i, e, w));
  const regTotal = () => moves.slice(0, 4).reduce((a, m) => a + m.build_cost, 0);
  const touched = new Set();
  for (let guard = 0; guard < 600; guard++) {
    let target = changeable.find(i => !moves[i].ult && moves[i].mana_cost > 60);
    const manaFix = target !== undefined;
    if (!manaFix) {
      if (changeable.includes(4) && moves[4].build_cost > ULT_BUDGET) target = 4;
      else {
        const regs = changeable.filter(i => i < 4);
        if (!regs.length || regTotal() <= REG_BUDGET) break;
        target = regs.sort((a, b) => moves[b].build_cost - moves[a].build_cost)[0];
      }
    }
    const m = moves[target], s = m.stats;
    if (manaFix && m.mana_overcharge > 0) m.mana_overcharge = Math.max(0, m.mana_overcharge - 5);
    else if (!m.ult && m.cooldown < 7) m.cooldown++;
    else if (Math.max(s.speed, s.size) > 2) { if (s.speed >= s.size) s.speed--; else s.size--; }
    else if (s.damage > 1) s.damage--;
    else if (s.count > 1) s.count--;
    else if (s.duration > 1) s.duration--;
    else if (m.effects.some(x => x.strength > 1)) m.effects.sort((a, b) => b.strength - a.strength)[0].strength--;
    else if (!m.ult && m.cooldown < 10) m.cooldown++;
    else break;
    costs(m); touched.add(target);
  }
  return { raw: moves.map(toRaw), notes: [...touched].map(i => `${moves[i].name} was toned down a little to fit the budget.`) };
}
const effOf = (m, t) => { const e = m.effects.find(x => x.type === t); return e ? e.strength : 0; };

/* ---------- game state ---------- */
const opts = { mode: 'bot', roundLen: 120, level: 'normal', aim: 'auto' };
let plan = [null, null];
let fighters = [];
let projectiles = [], beams = [], zones = [], rings = [], particles = [], texts = [], strikes = [], waves = [], traps = [], summons = [], flashes = [], pending = [];
let state = 'menu', round = 0, timeLeft = 0, countdown = 0, banner = 0, bannerText = '', timeupT = 0;
let hitstop = 0, shake = 0, clock = 0, paused = false;
let capture = null; // { scheme, action, kind } while rebinding
const STANDALONE = !(window.claude && typeof window.claude.use === 'function');

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const screenEl = document.getElementById('screen');
const legendEl = document.getElementById('legend');
let scale = 1;
const mouse = { x: W / 2, y: H / 2, over: false };

function sideLabel(i) { if (opts.mode === 'online') return i === NET.side ? 'You' : 'Opponent'; return opts.mode === 'bot' ? (i === 0 ? 'You' : 'Bot') : (i === 0 ? 'Player 1' : 'Player 2'); }
let sideEls = ['fire', 'water'];
function randomOther(el) { const o = EL_IDS.filter(x => x !== el); return o[Math.floor(Math.random() * o.length)]; }

function makeFighter(slot, element) {
  return { slot, element, moves: [], isBot: opts.mode === 'bot' && slot === 1, scheme: schemeFor(slot),
    x: 0, y: GROUND, vx: 0, vy: 0, onGround: true, jumps: 0, face: 1, dropT: 0, lastAx: 0, coyote: 0, jumpBuf: 0, jumpCut: true,
    aimX: 0, aimY: 0, aimAng: 0, aimMode: 'auto', queued: null,
    ult: 0, mana: MANA_MAX, cds: [0, 0, 0, 0, 0], fail: [0, 0, 0, 0, 0], stun: 0, blind: 0, slow: 0, invuln: 0,
    shield: null, dash: null, castAnim: 0, runPhase: 0,
    score: 0, roundScore: [0, 0], heads: 0, bodies: 0, bonus: 0, stats: [], ai: { t: 0, jumpCd: 0, range: 340, ox: 0, oy: 0, head: false } };
}
function resetFighter(f, moves) {
  f.moves = moves; f.scheme = schemeFor(f.slot); f.isBot = opts.mode === 'bot' && f.slot === 1;
  f.x = f.slot === 0 ? 240 : W - 240; f.y = GROUND; f.vx = 0; f.vy = 0; f.onGround = true; f.jumps = 0; f.coyote = 0; f.jumpBuf = 0;
  f.face = f.slot === 0 ? 1 : -1; f.mana = MANA_MAX; f.ult = 0; f.cds = [0, 0, 0, 0, 0]; f.fail = [0, 0, 0, 0, 0]; f.queued = null;
  f.stun = 0; f.blind = 0; f.slow = 0; f.invuln = 0; f.shield = null; f.dash = null; f.castAnim = 0;
  f.stats = moves.map(() => ({ casts: 0, hits: 0, pts: 0 }));
}
const opp = f => fighters[1 - f.slot];

/* ---------- input ---------- */
const down = new Set(), pressed = new Set();
const fighting = () => state === 'fight' || state === 'countdown';
function allBoundCodes() { const s = new Set(); for (const k of Object.keys(binds)) for (const a of Object.keys(binds[k])) binds[k][a].forEach(c => s.add(c)); return s; }
addEventListener('keydown', e => {
  if (capture) {
    e.preventDefault();
    if (e.code === 'Escape') { capture = null; showControls(); return; }
    if (capture.kind === 'pad') return;
    setBind(capture.scheme, capture.action, e.code); return;
  }
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'TEXTAREA' || tag === 'INPUT') return;
  if (fighting()) {
    if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); togglePause(); return; }
    if (allBoundCodes().has(e.code) || e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  }
  if (!e.repeat) pressed.add(e.code);
  down.add(e.code);
});
addEventListener('keyup', e => { down.delete(e.code); });
addEventListener('blur', () => { down.clear(); pressed.clear(); });
function toWorld(e) { const r = cv.getBoundingClientRect(); const sx = (e.clientX - r.left) / r.width * W, sy = (e.clientY - r.top) / r.height * H; return { x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y }; }
cv.addEventListener('mousemove', e => { const p = toWorld(e); mouse.x = p.x; mouse.y = p.y; mouse.over = true; });
cv.addEventListener('mouseleave', () => { mouse.over = false; });
// Mouse gestures: single, double and left+right clicks become their own bindable buttons.
const MOUSE_DOUBLE_MS = 230, MOUSE_CHORD_MS = 70;
const mg = { pend: {}, isDown: {}, downAt: {} };
function relevantSchemes() { return opts.mode === 'pvp' ? ['duo1', 'duo2'] : [soloScheme()]; }
function mouseBound(code) { if (capture && capture.kind !== 'pad') return true; return relevantSchemes().some(sc => Object.values(binds[sc]).some(a => a.includes(code))); }
function emitMouse(code) {
  if (capture && capture.kind !== 'pad') { setBind(capture.scheme, capture.action, code); return; }
  if (fighting() || (NET.on && NET.role === 'guest')) { pressed.add(code); }
}
function cancelPend(b) { if (mg.pend[b]) { clearTimeout(mg.pend[b]); mg.pend[b] = null; } }
function onMouseDown(b) {
  if (b === 1 || b === 3 || b === 4) { emitMouse('Mouse' + b); return; }
  if (b !== 0 && b !== 2) return;
  const other = b === 0 ? 2 : 0, now = performance.now();
  mg.isDown[b] = true; mg.downAt[b] = now;
  const chord = mouseBound('MouseLR');
  if (chord && mg.isDown[other] && now - mg.downAt[other] < MOUSE_CHORD_MS + 40) { cancelPend(other); cancelPend(b); emitMouse('MouseLR'); return; }
  const dbl = mouseBound(`Mouse${b}x2`);
  if (dbl && mg.pend[b]) { cancelPend(b); emitMouse(`Mouse${b}x2`); return; }
  const delay = Math.max(dbl ? MOUSE_DOUBLE_MS : 0, chord ? MOUSE_CHORD_MS : 0);
  if (!delay) { emitMouse('Mouse' + b); return; }
  mg.pend[b] = setTimeout(() => { mg.pend[b] = null; emitMouse('Mouse' + b); }, delay);
}
addEventListener('mousedown', e => {
  const onCanvas = e.target === cv;
  if (capture && capture.kind !== 'pad') {
    if (e.target.closest && e.target.closest('button[data-action="rebind"]') && e.button === 0) return;
    e.preventDefault(); onMouseDown(e.button); return;
  }
  if (onCanvas && (fighting() || (NET.on && NET.role === 'guest' && state !== 'prep' && state !== 'half'))) { e.preventDefault(); onMouseDown(e.button); }
});
addEventListener('mouseup', e => { mg.isDown[e.button] = false; if (e.button === 3 || e.button === 4) e.preventDefault(); });
addEventListener('auxclick', e => { if (e.button === 3 || e.button === 4) e.preventDefault(); });
cv.addEventListener('contextmenu', e => e.preventDefault());
const consume = code => { if (pressed.has(code)) { pressed.delete(code); return true; } return false; };
const actDown = (sc, a) => binds[sc][a].some(c => down.has(c));
const actPressed = (sc, a) => { let hit = false; binds[sc][a].forEach(c => { if (consume(c)) hit = true; }); return hit; };

// gamepads (PlayStation and Xbox use the same standard layout): sticks and d-pad move, buttons are rebindable
const padPrev = {};
// Browsers only reveal a controller after its first button press, so confirm it when that happens.
function padToast(text) {
  let t = document.getElementById('pad-toast');
  if (!t) { t = document.createElement('div'); t.id = 'pad-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = text; t.classList.add('on'); clearTimeout(padToast.h); padToast.h = setTimeout(() => t.classList.remove('on'), 2600);
}
addEventListener('gamepadconnected', e => padToast(`Controller connected: ${String(e.gamepad.id || 'gamepad').split('(')[0].trim().slice(0, 40)}`));
addEventListener('gamepaddisconnected', () => padToast('Controller disconnected'));
function getPads() { try { return navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []; } catch (e) { return []; } }
function readPad(index) {
  const p = getPads()[index];
  if (!p) return null;
  const prev = padPrev[p.index] || [];
  const btn = i => !!(p.buttons[i] && p.buttons[i].pressed);
  const edge = i => btn(i) && !prev[i];
  const any = (list, fn) => (list || []).some(fn);
  const pb = binds.pad;
  const out = { ax: Math.abs(p.axes[0] || 0) > 0.3 ? Math.sign(p.axes[0]) : (btn(14) ? -1 : btn(15) ? 1 : 0),
    jump: any(pb.jump, edge), jumpHeld: any(pb.jump, btn), drop: (p.axes[1] || 0) > 0.6 || any(pb.drop, btn),
    moves: ['m1', 'm2', 'm3', 'm4', 'm5'].map(a => any(pb[a], edge)), pause: edge(9),
    aim: Math.hypot(p.axes[2] || 0, p.axes[3] || 0) > 0.45 ? { x: p.axes[2], y: p.axes[3] } : null };
  padPrev[p.index] = p.buttons.map(b => b.pressed);
  return out;
}
function pollPadCapture() {
  if (!capture || capture.kind !== 'pad') return;
  for (const p of getPads()) {
    const prev = padPrev[p.index] || [];
    for (let i = 0; i < p.buttons.length; i++) {
      if (p.buttons[i].pressed && !prev[i]) { padPrev[p.index] = p.buttons.map(b => b.pressed); setPadBind(capture.action, i); return; }
    }
    padPrev[p.index] = p.buttons.map(b => b.pressed);
  }
}
function padIndexFor(f) { return opts.mode === 'pvp' ? f.slot : 0; }
function readLocalInput(sc, padIndex) {
  const r = { ax: 0, wantJump: false, jumpHeld: false, drop: false, casts: [], pad: null, pause: false };
  if (sc) {
    r.ax = (actDown(sc, 'left') ? -1 : 0) + (actDown(sc, 'right') ? 1 : 0);
    r.wantJump = actPressed(sc, 'jump'); r.jumpHeld = actDown(sc, 'jump'); r.drop = actDown(sc, 'drop');
    for (let i = 0; i < 5; i++) if (actPressed(sc, 'm' + (i + 1))) r.casts.push(i);
  }
  const pad = readPad(padIndex);
  if (pad) {
    r.pad = pad;
    if (!r.ax) r.ax = pad.ax;
    r.wantJump = r.wantJump || pad.jump; r.jumpHeld = r.jumpHeld || pad.jumpHeld; r.drop = r.drop || pad.drop;
    pad.moves.forEach((p, i) => { if (p && !r.casts.includes(i)) r.casts.push(i); });
    r.pause = pad.pause;
  }
  return r;
}

/* ---------- helpers ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function addText(x, y, text, col, size = 26, el) {
  texts.push({ x, y, text, col, size, life: 0.9 });
  if (NET.on && NET.role === 'host') { NET.events.push([++NET.evId, Math.round(x), Math.round(y), text, col, size, el || '']); if (NET.events.length > 10) NET.events.shift(); }
}
function headPos(f) { return { x: f.x, y: f.y - 68 }; }
function chestY(f) { return f.y - 40; }
function circleHitsBody(cx, cy, r, f) {
  const nx = clamp(cx, f.x - 12, f.x + 12), ny = clamp(cy, f.y - 56, f.y);
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}
function distPointSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy;
  const t = L ? clamp(((px - x0) * dx + (py - y0) * dy) / L, 0, 1) : 0;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
function rayEnd(x0, y0, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  let t = 4000;
  if (c > 1e-6) t = Math.min(t, (W - x0) / c); else if (c < -1e-6) t = Math.min(t, -x0 / c);
  if (s > 1e-6) t = Math.min(t, (GROUND - y0) / s); else if (s < -1e-6) t = Math.min(t, -y0 / s);
  return { x: x0 + c * t, y: y0 + s * t, t };
}

function applyEffects(tgt, m, srcX) {
  const dir = Math.sign(tgt.x - srcX) || 1;
  const push = effOf(m, 'push'), pull = effOf(m, 'pull'), blind = effOf(m, 'blind'), slow = effOf(m, 'slow');
  if (push && m.type !== 'zone') { tgt.vx = dir * (220 + push * 150); tgt.vy = -220 - push * 60; tgt.onGround = false; tgt.stun = Math.max(tgt.stun, 0.22); }
  if (pull && m.type !== 'zone') { tgt.vx = -dir * (180 + pull * 110); tgt.stun = Math.max(tgt.stun, 0.18); }
  if (blind) { tgt.blind = Math.max(tgt.blind, 0.3 + blind * 0.45); addText(tgt.x, tgt.y - 110, 'blinded', C.soft, 20); }
  if (slow) { tgt.slow = Math.max(tgt.slow, 0.6 * slow); }
}

function registerHit(att, tgt, idx, isHead, m, srcX) {
  if (tgt.invuln > 0) return false;
  applyEffects(tgt, m, srcX);
  if (m.stats.damage <= 0) return true;
  let pts = isHead ? 2 : 1;
  if (att.element === 'lightning' && zones.some(z => z.el === 'water' && Math.hypot(tgt.x - z.x, chestY(tgt) - z.y) < z.r)) { pts += 1; addText(tgt.x, tgt.y - 120, 'shocked!', elCol('lightning'), 24); }
  if (att.element === 'ice') tgt.slow = Math.max(tgt.slow, 0.7);
  att.ult = Math.min(ULT_MAX, att.ult + pts * ULT_PER_POINT);
  att.score += pts; att.roundScore[round] += pts;
  if (isHead) att.heads++; else att.bodies++;
  if (idx >= 0 && att.stats[idx]) { att.stats[idx].hits++; att.stats[idx].pts += pts; } else att.bonus += pts;
  att.mana = Math.min(MANA_MAX, att.mana + MANA_ON_HIT);
  tgt.stun = Math.max(tgt.stun, 0.12 + m.stats.damage * 0.035);
  if (!effOf(m, 'push') && !effOf(m, 'pull')) { tgt.vx = (Math.sign(tgt.x - srcX) || att.face) * (60 + m.stats.damage * 28); tgt.vy = Math.min(tgt.vy, -120); }
  tgt.invuln = 0.12; tgt.hitDir = Math.sign(tgt.x - srcX) || att.face; tgt.hitHead = isHead;
  hitstop = isHead ? 0.09 : 0.05; cam.punch = Math.max(cam.punch, isHead ? 0.04 : 0.015);
  shake = isHead ? 10 : 5;
  const hp = isHead ? headPos(tgt) : { x: tgt.x, y: chestY(tgt) };
  addText(hp.x, hp.y - 26, isHead ? `+${pts} head!` : `+${pts}`, isHead ? C.red : C.ink, isHead ? 32 : 24, att.element);
  burstParticles(hp.x, hp.y, att.element, isHead ? 22 : 12);
  impactFx(hp.x, hp.y, att.element, isHead ? 1.4 : 1);
  return true;
}

/* ---------- casting ---------- */
function mkProj(f, m, i, x, y, ang, sp, r, o = {}) {
  const el = o.el || f.element;
  const p = { owner: f, move: m, idx: i, bx: x, by: y, x, y, ang, sp, r, t: 0, phase: o.phase || Math.random() * 6, life: o.life || 2.6,
    homing: o.homing ?? effOf(m, 'homing'), curve: o.curve ?? effOf(m, 'curve'), pierce: o.pierce ?? effOf(m, 'pierce') > 0, hitSet: new Set(),
    slow: sp <= 600, el, shape: m.visual.shape, g: 0, vx: 0, vy: 0 };
  if (o.gravity) { p.g = o.gravity; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; }
  return p;
}
const CAST_DUR = { strike: 0.42, rain: 0.42, summon: 0.45, wave: 0.38, burst: 0.32, zone: 0.34, trap: 0.34, orbit: 0.4, beam: 0.34, projectile: 0.26, shield: 0.3, dash: 0.2 };
const TYPE_IDS = Object.keys(TYPE_BASE);
function canCast(f, i) { const m = f.moves[i]; if (!m || f.blind > 0 || f.stun > 0 || f.dash) return false; return m.ult ? f.ult >= ULT_MAX : (f.cds[i] <= 0 && f.mana >= m.mana_cost); }
function tryCast(f, i) {
  const m = f.moves[i];
  if (!m) return false;
  if (!canCast(f, i)) {
    if (!m.ult && f.cds[i] > 0 && f.cds[i] <= CAST_BUFFER && f.mana >= m.mana_cost) f.queued = { i, t: CAST_BUFFER + 0.05 };
    else f.fail[i] = 0.3;
    return false;
  }
  f.queued = null;
  if (m.ult) { cam.focus = { x: f.x, t: 0.9 }; f.ult = 0; banner = 1.1; bannerText = m.name; shake = 14; hitstop = 0.12; slowmo = 0.45; cam.punch = 0.1; burstParticles(f.x, chestY(f), f.element, 40, 500); }
  else { f.mana -= m.mana_cost; f.cds[i] = m.cooldown; }
  f.stats[i].casts++; f.castType = m.type; f.castUlt = !!m.ult; f.castAnim = f.castDur = CAST_DUR[m.type] || 0.28;
  const st = m.stats, o = opp(f), ang = f.aimAng, cy = chestY(f);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  switch (m.type) {
    case 'projectile': {
      const sp = 200 + st.speed * 80, r = 6 + st.size * 2.2, earth = f.element === 'earth';
      const a0 = earth ? ang + (Math.cos(ang) >= 0 ? -0.28 : 0.28) : ang;
      for (let k = 0; k < st.count; k++) {
        const off = st.count === 1 ? 0 : (k - (st.count - 1) / 2) * 24;
        const bx = f.x + ca * 24 - sa * off, by = cy + sa * 24 + ca * off;
        pending.push({ t: k * (f.element === 'steel' ? 0.06 : 0.02), fn: () => projectiles.push(mkProj(f, m, i, bx, by, a0, earth ? sp * 1.1 : sp, r, { phase: k * 1.4, gravity: earth ? 700 : 0 })) });
      }
      break;
    }
    case 'rain': {
      const n = st.count * 2 + 1, spread = 60 + st.size * 16, tx = f.aimX;
      for (let k = 0; k < n; k++) pending.push({ t: k * 0.08, fn: () => { const x = clamp(tx + (Math.random() - 0.5) * spread * 2, 20, W - 20); projectiles.push(mkProj(f, m, i, x, -20 - Math.random() * 40, Math.PI / 2 + (Math.random() - 0.5) * 0.15, 420 + st.speed * 50, 6 + st.size * 1.6, { life: 2.2, homing: 0, curve: 0 })); } });
      addText(tx, 90, m.name, elCol(f.element), 20);
      break;
    }
    case 'strike': {
      const r = 34 + st.size * 9, tx = clamp(f.aimX, 30, W - 30), ty = clamp(f.aimY, 90, GROUND - 20);
      strikes.push({ owner: f, move: m, idx: i, x: tx, y: ty, r, t: 0, delay: Math.max(0.35, 1.15 - st.speed * 0.07), el: f.element });
      break;
    }
    case 'orbit':
      f.orbit = { t: 1.5 + st.duration, n: Math.max(2, st.count), r: 52 + st.size * 5, or: 6 + st.size * 1.4, spin: 2 + st.speed * 0.5, ang: 0, cd: 0, move: m, idx: i };
      break;
    case 'wave': {
      const dir = Math.sign(f.aimX - f.x) || f.face;
      waves.push({ owner: f, move: m, idx: i, x: f.x + dir * 24, y: f.onGround ? f.y : GROUND, dir, sp: 260 + st.speed * 55, h: 24 + st.size * 7, t: 0, hit: false, el: f.element });
      shake = Math.max(shake, 4);
      break;
    }
    case 'trap': {
      const tx = clamp(f.aimX, 30, W - 30);
      let ty = GROUND;
      for (const p of PLATFORMS) if (tx > p.x && tx < p.x + p.w && p.y >= f.aimY - 40 && p.y < ty) ty = p.y;
      traps.push({ owner: f, move: m, idx: i, x: tx, y: ty, r: 26 + st.size * 6, age: 0, life: 4 + st.duration * 2, el: f.element });
      break;
    }
    case 'summon':
      summons.push({ owner: f, move: m, idx: i, x: f.x, y: f.y - 100, life: Math.max(2.5, 2 + st.duration * 1.5), fireT: 0.5, rate: Math.max(0.45, 1.4 - st.speed * 0.09), shotR: 4 + st.size * 1.2, t: 0, el: f.element });
      break;
    case 'beam':
      beams.push({ owner: f, move: m, idx: i, ang, windup: 0.12, life: 0.22, thick: 6 + st.size * 3, x0: f.x + ca * 20, y0: cy + sa * 20, fired: false, el: f.element });
      break;
    case 'zone': {
      let dx = f.aimX - f.x, dy = f.aimY - cy, d = Math.hypot(dx, dy) || 1;
      const dist = clamp(d, 120, 380);
      const r = 40 + st.size * 13;
      zones.push({ owner: f, move: m, idx: i, x: clamp(f.x + dx / d * dist, 40, W - 40), y: clamp(cy + dy / d * dist, 90, GROUND - 24), r, life: Math.max(1, st.duration), max: Math.max(1, st.duration),
        drift: (Math.sign(dx) || f.face) * st.speed * 14, tick: 0, el: f.element, spin: 0 });
      break;
    }
    case 'burst': {
      const r = 50 + st.size * 15;
      rings.push({ x: f.x, y: cy, r, life: 0.35, max: 0.35, el: f.element });
      burstParticles(f.x, cy, f.element, 18, 380);
      const inFront = f.element !== 'steel' || (o.x - f.x) * f.face > -10;
      if (inFront && Math.hypot(o.x - f.x, chestY(o) - cy) < r + 10) {
        const hp = headPos(o);
        const head = f.element === 'steel' && Math.hypot(hp.x - f.x, hp.y - cy) < r * 0.75 && Math.abs(hp.y - cy) < 46;
        if (registerHit(f, o, i, head, m, f.x) && f.element === 'earth') { o.vy = -650; o.onGround = false; }
      }
      if (f.element === 'steel') rings[rings.length - 1].arc = f.face;
      if (f.element === 'wind' && effOf(m, 'push')) {
        projectiles.forEach(p => {
          if (p.owner !== f && p.slow && Math.hypot(p.x - f.x, p.y - cy) < r + p.r) {
            p.owner = f; p.idx = -1; p.ang += Math.PI; p.g = 0; p.bx = p.x; p.by = p.y; p.hitSet.clear(); p.life = 2;
            addText(p.x, p.y - 20, 'deflected!', C.wind, 22);
          }
        });
      }
      break;
    }
    case 'dash': {
      let dxv, dyv;
      if (f.aimMode === 'auto') { dxv = f.lastAx || f.face; dyv = 0; } else { dxv = ca; dyv = sa; if (f.onGround && dyv > 0) dyv = 0; const n = Math.hypot(dxv, dyv) || 1; dxv /= n; dyv /= n; }
      const dist = 120 + st.speed * 25;
      if (f.element === 'light') {
        const ox = f.x, oy = f.y;
        burstParticles(f.x, cy, 'light', 16);
        f.x = clamp(f.x + dxv * dist, 30, W - 30);
        f.y = clamp(f.y + dyv * dist, 100, GROUND);
        if (dyv) { f.vy = 0; f.onGround = f.y >= GROUND; }
        burstParticles(f.x, chestY(f), 'light', 16);
        f.invuln = Math.max(f.invuln, 0.25);
        if (st.damage > 0 && distPointSeg(o.x, chestY(o), ox, oy - 40, f.x, f.y - 40) < 40) registerHit(f, o, i, false, m, ox);
      } else {
        const dur = 0.14;
        f.dash = { t: dur, vx: dxv * dist / dur, vy: dyv * dist / dur, hit: false, m, i };
        f.invuln = Math.max(f.invuln, dur + 0.05);
      }
      break;
    }
    case 'shield':
      f.shield = { t: 0.5 + st.duration * 0.4, r: 46 + st.size * 4, reflect: effOf(m, 'reflect') > 0, rs: effOf(m, 'reflect') };
      break;
  }
  return true;
}

/* ---------- bot ---------- */
function botThink(f, dt) {
  const o = opp(f), ai = f.ai, lv = BOT_LEVELS[opts.level];
  ai.t -= dt; ai.jumpCd -= dt;
  const dx = o.x - f.x, adx = Math.abs(dx), dy = o.y - f.y;
  if (Math.random() < dt * 0.7) ai.range = 200 + Math.random() * 300;
  let ax = 0;
  if (adx > ai.range + 60) ax = Math.sign(dx); else if (adx < ai.range - 90) ax = -Math.sign(dx);
  if ((f.x < 80 && ax < 0) || (f.x > W - 80 && ax > 0)) ax = 0;
  let wantJump = false;
  if (f.onGround && ai.jumpCd <= 0 && (dy < -90 || Math.random() < dt * 0.45)) { wantJump = true; ai.jumpCd = 0.7; }
  else if (!f.onGround && f.jumps === 1 && f.vy > 0 && dy < -110 && Math.random() < dt * 3) wantJump = true;
  const drop = dy > 60 && Math.random() < dt * 2;
  const threat = projectiles.some(p => p.owner === o && Math.hypot(p.x - f.x, p.y - chestY(f)) < 240 && Math.cos(p.ang) * (f.x - p.x) > 0)
    || beams.some(b => b.owner === o && !b.fired);
  let cast = -1;
  if (ai.t <= 0) {
    ai.t = lv.think[0] + Math.random() * (lv.think[1] - lv.think[0]);
    ai.ox = (Math.random() - 0.5) * 2 * lv.jitter; ai.oy = (Math.random() - 0.5) * 2 * lv.jitter; ai.head = Math.random() < lv.head;
    const dist = Math.hypot(dx, dy), choices = [];
    f.moves.forEach((m, i) => {
      if (!canCast(f, i)) return;
      let s = 0;
      if (m.type === 'shield') s = threat ? 5 : 0;
      else if (m.type === 'dash') s = threat ? 3 : (adx > 620 ? 1.6 : 0.2);
      else if (m.type === 'projectile') s = (dist < 800 ? 2.4 : 0.8) + (effOf(m, 'homing') ? 0.8 : 0);
      else if (m.type === 'beam') s = dist < 900 ? 2.8 : 0.5;
      else if (m.type === 'burst') s = dist < 50 + m.stats.size * 15 ? 4 : 0;
      else if (m.type === 'zone') s = dist > 120 && dist < 420 ? 2.2 : 0.2;
      else if (m.type === 'rain' || m.type === 'strike') s = 2.3;
      else if (m.type === 'orbit') s = f.orbit ? 0 : dist < 170 ? 3.5 : threat ? 2.6 : 0.4;
      else if (m.type === 'wave') s = o.onGround && Math.abs(o.y - f.y) < 12 ? 2.6 : 0.2;
      else if (m.type === 'trap') s = dist < 320 ? 1.9 : 0.6;
      else if (m.type === 'summon') s = summons.some(x => x.owner === f) ? 0 : 2.4;
      if (m.mana_cost > 40 && f.mana < 75) s *= 0.4;
      if (m.ult && s > 1) s += 2;
      if (s > 0) choices.push([i, s + Math.random()]);
    });
    choices.sort((a, b) => b[1] - a[1]);
    if (choices.length && choices[0][1] > 1.6) cast = choices[0][0];
  }
  return { ax, wantJump, jumpHeld: true, drop, cast };
}

/* ---------- update ---------- */
function updateAim(f, pad) {
  const o = opp(f), cy = chestY(f);
  if (f.remote) {
    const a = f.remoteAim;
    if (a && a.kind === 'stick') { f.aimX = f.x + a.x * 4; f.aimY = cy + a.y * 4; f.aimMode = 'stick'; }
    else if (a && a.kind === 'mouse') { f.aimX = a.x; f.aimY = a.y; f.aimMode = 'mouse'; }
    else { f.aimX = o.x; f.aimY = chestY(o); f.aimMode = 'auto'; }
  } else if (f.isBot) {
    const ty = (f.ai.head ? headPos(o).y : chestY(o)) + f.ai.oy;
    f.aimX = o.x + f.ai.ox; f.aimY = ty; f.aimMode = 'auto';
  } else if (pad && pad.aim) {
    f.aimX = f.x + pad.aim.x * 400; f.aimY = cy + pad.aim.y * 400; f.aimMode = 'stick';
  } else if (f.scheme === 'solo') {
    f.aimX = mouse.x; f.aimY = mouse.y; f.aimMode = 'mouse';
  } else {
    f.aimX = o.x; f.aimY = chestY(o); f.aimMode = 'auto';
  }
  f.aimAng = Math.atan2(f.aimY - cy, f.aimX - f.x);
}

function controlFighter(f, dt) {
  let ax = 0, wantJump = false, jumpHeld = false, drop = false, casts = [], pad = null;
  if (f.isBot) { const b = botThink(f, dt); ({ ax, wantJump, jumpHeld, drop } = b); if (b.cast >= 0) casts.push(b.cast); }
  else if (f.remote) ({ ax, wantJump, jumpHeld, drop, casts } = netRemoteInput(f));
  else {
    const r = readLocalInput(f.scheme, padIndexFor(f));
    ({ ax, wantJump, jumpHeld, drop, casts, pad } = r);
    if (r.pause && opts.mode !== 'online') togglePause();
  }
  updateAim(f, pad);
  f.lastAx = ax;
  if (wantJump) f.jumpBuf = JUMP_BUFFER;
  if (f.stun > 0) { ax = 0; casts = []; }
  if (!f.dash) {
    if (f.stun > 0) f.vx *= Math.max(0, 1 - dt * 3);
    else { const sp = MOVE * (f.slow > 0 ? 0.5 : 1); f.vx += (ax * sp - f.vx) * Math.min(1, dt * (f.onGround ? 18 : 10)); }
  }
  if (f.onGround) { f.coyote = COYOTE; f.jumps = 0; } else f.coyote = Math.max(0, f.coyote - dt);
  if (f.jumpBuf > 0 && f.stun <= 0) {
    const ground = f.coyote > 0 && f.jumps === 0;
    if (ground || f.jumps < 2) {
      const second = !ground;
      f.vy = -JUMP * (second ? 0.85 : 1) * (f.slow > 0 ? 0.8 : 1);
      f.jumps = second ? 2 : 1; f.coyote = 0; f.onGround = false; f.jumpBuf = 0; f.jumpCut = false;
      if (second) burstParticles(f.x, f.y, f.element, 6, 120);
    }
  }
  f.jumpBuf = Math.max(0, f.jumpBuf - dt);
  if (!jumpHeld && !f.jumpCut && f.vy < 0) { f.vy *= 0.5; f.jumpCut = true; }
  f.fastFall = drop && !f.onGround;
  f.dropT = drop ? 0.2 : Math.max(0, f.dropT - dt);
  if (casts.length) casts.forEach(i => tryCast(f, i));
  else if (f.queued) { f.queued.t -= dt; if (f.queued.t <= 0) f.queued = null; else if (canCast(f, f.queued.i)) tryCast(f, f.queued.i); }
  if (!f.dash) f.face = f.aimMode === 'auto' ? (opp(f).x > f.x ? 1 : -1) : (Math.cos(f.aimAng) >= 0 ? 1 : -1);
  for (let i = 0; i < 5; i++) { f.cds[i] = Math.max(0, f.cds[i] - dt); f.fail[i] = Math.max(0, f.fail[i] - dt); }
  f.stun = Math.max(0, f.stun - dt); f.blind = Math.max(0, f.blind - dt); f.slow = Math.max(0, f.slow - dt);
  f.invuln = Math.max(0, f.invuln - dt); f.castAnim = Math.max(0, f.castAnim - dt);
  f.mana = Math.min(MANA_MAX, f.mana + MANA_REGEN * dt);
  f.ult = Math.min(ULT_MAX, f.ult + ULT_REGEN * dt);
  if (f.shield) { f.shield.t -= dt; if (f.shield.t <= 0) f.shield = null; }
  if (Math.abs(f.vx) > 40 && f.onGround) f.runPhase += dt * Math.abs(f.vx) / 28;
}

function physics(f, dt) {
  if (f.dash) {
    f.dash.t -= dt; f.vx = f.dash.vx; f.vy = f.dash.vy;
    if (Math.random() < 0.8) spawnP(f.x, f.y - 20 - Math.random() * 50, f.element, -f.dash.vx * 0.15, -f.dash.vy * 0.15 + (Math.random() - 0.5) * 60, 0.35, 3);
    const o = opp(f);
    if (!f.dash.hit && f.dash.m.stats.damage > 0 && Math.abs(o.x - f.x) < 34 && Math.abs(o.y - f.y) < 70) { f.dash.hit = true; registerHit(f, o, f.dash.i, false, f.dash.m, f.x - Math.sign(f.dash.vx || 1)); }
    if (f.dash.t <= 0) { f.dash = null; f.vx *= 0.3; f.vy *= 0.2; }
  } else {
    f.vy = Math.min(1500, f.vy + GRAV * (f.fastFall && f.vy > -100 ? 1.7 : 1) * dt);
  }
  const prevY = f.y;
  f.x = clamp(f.x + f.vx * dt, 24, W - 24);
  f.y = Math.max(90, f.y + f.vy * dt);
  f.onGround = false;
  if (f.y >= GROUND) { f.y = GROUND; f.vy = 0; f.onGround = true; }
  else if (f.vy >= 0 && f.dropT <= 0) {
    for (const p of PLATFORMS) {
      if (prevY <= p.y + 1 && f.y >= p.y && f.x > p.x - 8 && f.x < p.x + p.w + 8) { f.y = p.y; f.vy = 0; f.onGround = true; break; }
    }
  }
}

function updateProjectiles(dt) {
  for (const p of projectiles) {
    p.t += dt; p.life -= dt;
    const tgt = opp(p.owner);
    if (p.homing) {
      const ta = Math.atan2(chestY(tgt) - 10 - p.by, tgt.x - p.bx);
      let d = ta - p.ang; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      p.ang += clamp(d, -1.3 * p.homing * dt, 1.3 * p.homing * dt);
    }
    if (p.g) { p.vy += p.g * dt; p.bx += p.vx * dt; p.by += p.vy * dt; p.ang = Math.atan2(p.vy, p.vx); }
    else { p.bx += Math.cos(p.ang) * p.sp * dt; p.by += Math.sin(p.ang) * p.sp * dt; }
    const off = p.curve ? Math.sin(p.t * 7 + p.phase) * (16 + 10 * p.curve) : p.el === 'lightning' ? (hash(Math.floor(p.t * 22) + p.phase * 13) - 0.5) * 16 : 0;
    p.x = p.bx - Math.sin(p.ang) * off; p.y = p.by + Math.cos(p.ang) * off;
    if (Math.random() < 0.6) trailParticle(p.x, p.y, p.el, p.ang, p.sp);
    if (p.x < -40 || p.x > W + 40 || p.y < -60) p.life = 0;
    if (p.y > GROUND - 2) { p.life = 0; burstParticles(p.x, GROUND - 4, p.el, 5, 120); }
    if (p.life <= 0 || p.hitSet.has(tgt)) continue;
    const cy = chestY(tgt);
    const earthShield = tgt.element === 'earth';
    const passes = !earthShield && (p.curve || p.el === 'antimatter');
    if (tgt.shield && !passes && Math.hypot(p.x - tgt.x, p.y - cy) < tgt.shield.r + p.r) {
      if (tgt.element === 'steel') { tgt.mana = Math.min(MANA_MAX, tgt.mana + 10); addText(tgt.x, tgt.y - 120, '+10 mana', elCol('steel'), 20); }
      if (tgt.shield.reflect) {
        p.owner = tgt; p.idx = -1; p.ang += Math.PI; p.g = 0; p.sp *= 1 + 0.1 * tgt.shield.rs; p.bx = p.x; p.by = p.y; p.hitSet.clear(); p.life = 2;
        addText(p.x, p.y - 22, 'reflected!', elCol(tgt.element), 22);
      } else { p.life = 0; addText(p.x, p.y - 22, 'blocked', C.soft, 20); }
      continue;
    }
    const hp = headPos(tgt);
    const head = Math.hypot(p.x - hp.x, p.y - hp.y) < p.r + HEAD_R;
    if (head || circleHitsBody(p.x, p.y, p.r, tgt)) {
      if (registerHit(p.owner, tgt, p.idx, head, p.move, p.x - Math.cos(p.ang) * 10)) {
        if (p.pierce) p.hitSet.add(tgt); else p.life = 0;
      }
    }
  }
  // element clashes between projectiles
  for (let a = 0; a < projectiles.length; a++) {
    const p = projectiles[a]; if (p.life <= 0) continue;
    for (let b = a + 1; b < projectiles.length; b++) {
      const q = projectiles[b]; if (q.life <= 0 || q.owner === p.owner) continue;
      if (Math.hypot(p.x - q.x, p.y - q.y) > p.r + q.r) continue;
      clashProjectiles(p, q);
    }
  }
  for (const z of zones) {
    if (z.el !== 'water') continue;
    for (const p of projectiles) if (p.life > 0 && p.el === 'fire' && p.owner !== z.owner && Math.hypot(p.x - z.x, p.y - z.y) < z.r) { p.life = 0; addText(p.x, p.y - 20, 'fizz!', elCol('water'), 22); }
  }
  for (const p of projectiles) if (p.life <= 0 && !p.boom) { p.boom = 1; burstParticles(p.x, p.y, p.el, p.el === 'ice' || p.el === 'earth' ? 8 : 5, 170); }
  projectiles = projectiles.filter(p => p.life > 0);
}
function clashProjectiles(p, q) {
  const pair = (x, y) => (p.el === x && q.el === y) ? [p, q] : (p.el === y && q.el === x) ? [q, p] : null;
  let w;
  if ((w = pair('water', 'fire'))) { p.life = 0; q.life = 0; addText(p.x, p.y - 20, 'steam!', elCol('water'), 22); burstParticles(p.x, p.y, 'water', 10, 160); }
  else if ((w = pair('fire', 'ice'))) { w[1].life = 0; addText(w[1].x, w[1].y - 20, 'melted!', elCol('fire'), 22); }
  else if (p.el === 'antimatter' && q.el !== 'antimatter') { q.life = 0; addText(q.x, q.y - 20, 'erased!', elCol('antimatter'), 22); }
  else if (q.el === 'antimatter' && p.el !== 'antimatter') { p.life = 0; addText(p.x, p.y - 20, 'erased!', elCol('antimatter'), 22); }
}

function fireBeam(b) {
  const f = b.owner, o = opp(f);
  const ux = Math.cos(b.ang), uy = Math.sin(b.ang);
  const end = rayEnd(b.x0, b.y0, b.ang);
  let tEnd = end.t, blocked = false;
  if (f.element === 'antimatter') {
    projectiles.forEach(p => { if (p.owner !== f && p.life > 0 && distPointSeg(p.x, p.y, b.x0, b.y0, end.x, end.y) < p.r + b.thick / 2) { p.life = 0; addText(p.x, p.y - 20, 'erased!', elCol('antimatter'), 20); } });
  }
  if (o.shield && !(f.element === 'antimatter' && o.element !== 'earth')) {
    const cx = o.x - b.x0, cy = chestY(o) - b.y0, proj = cx * ux + cy * uy;
    if (proj > 0) {
      const perp2 = cx * cx + cy * cy - proj * proj, r = o.shield.r;
      if (perp2 < (r + b.thick / 2) ** 2) {
        const tHit = perp2 < r * r ? proj - Math.sqrt(r * r - perp2) : proj;
        if (tHit < tEnd) {
          tEnd = Math.max(0, tHit); blocked = true;
          const hx = b.x0 + ux * tEnd, hy = b.y0 + uy * tEnd;
          if (o.element === 'steel') o.mana = Math.min(MANA_MAX, o.mana + 10);
          if (o.shield.reflect && !b.reflected) {
            beams.push({ owner: o, move: b.move, idx: -1, ang: b.ang + Math.PI, windup: 0, life: 0.22, thick: b.thick, x0: hx, y0: hy, fired: false, el: b.el, reflected: true });
            addText(hx, hy - 28, 'reflected!', elCol(o.element), 22);
          } else addText(hx, hy - 28, 'blocked', C.soft, 20);
        }
      }
    }
  }
  b.x1 = b.x0 + ux * tEnd; b.y1 = b.y0 + uy * tEnd;
  if (f.element === 'light') {
    zones.forEach(z => {
      if (z.owner !== f && z.life > 0 && distPointSeg(z.x, z.y, b.x0, b.y0, b.x1, b.y1) < z.r + b.thick / 2) {
        z.life = 0; addText(z.x, z.y - z.r * 0.5, 'dispelled!', C.light, 24); burstParticles(z.x, z.y, 'light', 24, 300);
      }
    });
  }
  if (blocked && tEnd < 1) return;
  const hp = headPos(o);
  let hit = null;
  if (distPointSeg(hp.x, hp.y, b.x0, b.y0, b.x1, b.y1) <= HEAD_R + 1) hit = 'head';
  else {
    for (let k = 0; k <= 6 && !hit; k++) {
      const py = o.y - 56 + k * (56 / 6);
      if (distPointSeg(o.x, py, b.x0, b.y0, b.x1, b.y1) <= 12 + b.thick / 2) hit = 'body';
    }
    if (!hit && distPointSeg(hp.x, hp.y, b.x0, b.y0, b.x1, b.y1) <= HEAD_R + b.thick / 2) hit = 'body';
  }
  if (hit) registerHit(f, o, b.idx, hit === 'head', b.move, b.x0);
}
function updateBeams(dt) {
  for (const b of beams) {
    if (b.windup > 0) {
      b.windup -= dt;
      const ca = Math.cos(b.ang), sa = Math.sin(b.ang);
      b.x0 = b.owner.x + ca * 20; b.y0 = chestY(b.owner) + sa * 20;
      if (b.owner.stun > 0) b.life = 0;
      continue;
    }
    if (!b.fired) { b.fired = true; fireBeam(b); }
    b.life -= dt;
  }
  beams = beams.filter(b => b.life > 0);
}
function updateZones(dt) {
  for (const z of zones) {
    z.life -= dt; z.spin += dt * 6; z.x = clamp(z.x + z.drift * dt, z.r * 0.5, W - z.r * 0.5); z.tick -= dt;
    const o = opp(z.owner), cy = chestY(o);
    const inside = Math.hypot(o.x - z.x, cy - z.y) < z.r;
    if (inside) {
      const pull = effOf(z.move, 'pull'), push = effOf(z.move, 'push');
      const dir = Math.sign(z.x - o.x);
      if (pull && o.invuln <= 0 && !o.dash) o.x = clamp(o.x + dir * pull * 70 * dt, 24, W - 24);
      if (push && o.invuln <= 0 && !o.dash) o.x = clamp(o.x - dir * push * 70 * dt, 24, W - 24);
      if (z.tick <= 0) { if (registerHit(z.owner, o, z.idx, false, z.move, z.x)) z.tick = 1; }
    }
    if (Math.random() < 0.7) {
      const a = Math.random() * Math.PI * 2, rr = z.r * (0.4 + Math.random() * 0.6);
      if (z.el === 'wind') spawnP(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, 'wind', -Math.sin(a) * 160, Math.cos(a) * 160, 0.35, 2.5);
    }
  }
  for (const a of zones) for (const b of zones) {
    if (a === b || a.owner === b.owner || a.life <= 0 || b.life <= 0) continue;
    if (a.el === 'water' && b.el === 'fire' && Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r * 0.5) { a.life = 0; b.life = 0; addText(b.x, b.y - 20, 'steam!', elCol('water'), 24); burstParticles(b.x, b.y, 'water', 20, 200); }
  }
  zones = zones.filter(z => z.life > 0);
}

function updateExtras(dt) {
  for (const s of pending) { s.t -= dt; if (s.t <= 0 && !s.done) { s.done = true; s.fn(); } }
  pending = pending.filter(s => !s.done);
  for (const s of strikes) {
    s.t += dt;
    if (!s.done && s.t >= s.delay) {
      s.done = true; const o = opp(s.owner);
      if (Math.hypot(o.x - s.x, chestY(o) - s.y) < s.r + 14) registerHit(s.owner, o, s.idx, false, s.move, s.x);
      flashes.push({ x: s.x, y: s.y, r: s.r, el: s.el, life: 0.45, max: 0.45, kind: 'strike' });
      burstParticles(s.x, s.y, s.el, 26, 340); shake = Math.max(shake, 7);
    }
  }
  strikes = strikes.filter(s => !s.done);
  for (const w of waves) {
    w.x += w.dir * w.sp * dt; w.t += dt;
    const o = opp(w.owner);
    if (!w.hit && Math.abs(o.x - w.x) < 24 && o.y <= w.y + 3 && o.y > w.y - w.h) { w.hit = true; registerHit(w.owner, o, w.idx, false, w.move, w.x - w.dir * 10); }
    if (Math.random() < 0.7) burstParticles(w.x, w.y - 6, w.el, 1, 110);
    if (w.x < -40 || w.x > W + 40 || w.t > 2.6) w.dead = true;
  }
  waves = waves.filter(w => !w.dead);
  for (const t of traps) {
    t.age += dt; t.life -= dt;
    const o = opp(t.owner);
    if (t.age > 0.5 && Math.abs(o.x - t.x) < t.r && Math.abs(o.y - t.y) < 28) {
      registerHit(t.owner, o, t.idx, false, t.move, t.x);
      flashes.push({ x: t.x, y: t.y - 24, r: t.r * 1.7, el: t.el, life: 0.4, max: 0.4, kind: 'burst' }); burstParticles(t.x, t.y - 12, t.el, 24, 320); t.life = 0;
    }
  }
  traps = traps.filter(t => t.life > 0);
  for (const s of summons) {
    s.life -= dt; s.fireT -= dt; s.t += dt;
    const f = s.owner, o = opp(f), tx = f.x - f.face * 46, ty = f.y - 112 + Math.sin(s.t * 3) * 6;
    s.x += (tx - s.x) * Math.min(1, dt * 6); s.y += (ty - s.y) * Math.min(1, dt * 6);
    if (s.fireT <= 0) { s.fireT = s.rate; projectiles.push(mkProj(f, s.move, s.idx, s.x, s.y, Math.atan2(chestY(o) - s.y, o.x - s.x), 600, s.shotR, { life: 1.6, homing: 0, curve: 0, pierce: false })); }
  }
  summons = summons.filter(s => s.life > 0);
  for (const f of fighters) {
    const ob = f.orbit; if (!ob) continue;
    ob.t -= dt; ob.ang += ob.spin * dt; ob.cd -= dt;
    if (ob.t <= 0) { f.orbit = null; continue; }
    const o = opp(f), cy = chestY(f), hp = headPos(o);
    for (let k = 0; k < ob.n; k++) {
      const a = ob.ang + k * Math.PI * 2 / ob.n, x = f.x + Math.cos(a) * ob.r, y = cy + Math.sin(a) * ob.r;
      if (ob.cd <= 0) { const head = Math.hypot(x - hp.x, y - hp.y) < ob.or + HEAD_R; if ((head || circleHitsBody(x, y, ob.or, o)) && registerHit(f, o, ob.idx, head, ob.move, f.x)) ob.cd = 0.6; }
      for (const p of projectiles) if (p.owner !== f && p.life > 0 && Math.hypot(p.x - x, p.y - y) < p.r + ob.or) { p.life = 0; addText(p.x, p.y - 18, 'blocked', C.soft, 18); }
    }
  }
  for (const fl of flashes) fl.life -= dt;
  flashes = flashes.filter(x => x.life > 0);
}

function update(dt) {
  clock += dt;
  pollPadCapture();
  if (NET.on) netTick(dt);
  if (NET.on && NET.role === 'guest') { guestUpdate(dt); return; }
  stepParticles(dt);
  for (const t of texts) { t.life -= dt; t.y -= 40 * dt; }
  texts = texts.filter(t => t.life > 0);
  for (const r of rings) r.life -= dt;
  rings = rings.filter(r => r.life > 0);
  shake = Math.max(0, shake - dt * 40);
  banner = Math.max(0, banner - dt);
  if (state === 'countdown') {
    countdown -= dt;
    fighters.forEach(f => updateAim(f, null));
    if (countdown <= 0) { state = 'fight'; banner = 0.7; bannerText = 'Fight!'; pressed.clear(); }
    return;
  }
  if (state === 'timeup') { timeupT -= dt; if (timeupT <= 0) afterRound(); return; }
  if (state !== 'fight') return;
  if (hitstop > 0) { hitstop -= dt; return; }
  timeLeft -= dt;
  fighters.forEach(f => controlFighter(f, dt));
  fighters.forEach(f => physics(f, dt));
  updateProjectiles(dt); updateBeams(dt); updateZones(dt); updateExtras(dt);
  pressed.clear();

  if (timeLeft <= 0) { timeLeft = 0; state = 'timeup'; timeupT = 1.3; banner = 1.3; bannerText = 'Time!'; }
}

/* ---------- drawing ---------- */
// Arena: a soft backdrop tinted by both fighters' elements, two layers of parallax hills, then the floor and platforms.
let HILLS = null;
function drawHills(layer, base, amp, par, col) {
  if (!HILLS) HILLS = [0, 1].map(l => Array.from({ length: 22 }, (_, i) => 0.35 + hash(i * 7.3 + l * 91) * 0.65));
  const off = (cam.x - W / 2) * par, pts = HILLS[layer], step = (W + 400) / (pts.length - 1);
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-200 + off, GROUND);
  pts.forEach((h, i) => { const x = -200 + i * step + off, y = base - h * amp; if (i === 0) ctx.lineTo(x, y); else { const px = -200 + (i - 0.5) * step + off; ctx.quadraticCurveTo(px, base - (pts[i - 1] + h) / 2 * amp - amp * 0.15, x, y); } });
  ctx.lineTo(W + 200 + off, GROUND); ctx.closePath(); ctx.fill();
}
function drawArena() {
  ctx.fillStyle = C.paper; ctx.fillRect(-200, -200, W + 400, H + 400);
  if (fighters.length === 2) {
    fighters.forEach((f, i) => {
      const g = ctx.createRadialGradient(i ? W : 0, GROUND * 0.55, 20, i ? W : 0, GROUND * 0.55, W * 0.7);
      g.addColorStop(0, withA(elCol(f.element), isDark ? 0.16 : 0.12)); g.addColorStop(1, withA(elCol(f.element), 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
    });
  }
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 32) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, GROUND); }
  for (let y = 0; y <= GROUND; y += 32) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
  ctx.stroke();
  ctx.save(); ctx.globalAlpha = isDark ? 0.5 : 0.55; drawHills(0, GROUND - 40, 150, 0.12, C.paper2);
  ctx.globalAlpha = isDark ? 0.55 : 0.5; drawHills(1, GROUND, 90, 0.25, C.ground); ctx.restore();
  ctx.fillStyle = C.ground; ctx.fillRect(-200, GROUND, W + 400, H - GROUND + 200);
  ctx.strokeStyle = C.platform; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-200, GROUND); ctx.lineTo(W + 200, GROUND); ctx.stroke();
  // floor hatching gives the ground some texture and makes camera moves readable
  ctx.save(); ctx.globalAlpha = 0.25; ctx.lineWidth = 2; ctx.beginPath();
  for (let x = -192; x < W + 200; x += 48) { ctx.moveTo(x, GROUND + 10); ctx.lineTo(x - 14, GROUND + 26); }
  ctx.stroke(); ctx.restore();
  for (const p of PLATFORMS) {
    ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = C.ink; ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, GROUND + 2, p.w * 0.42, 5, 0, 0, 7); ctx.fill(); ctx.restore();
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.w, p.y + 1.5); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x + 10, p.y + 8); ctx.lineTo(p.x + p.w - 14, p.y + 9); ctx.stroke(); ctx.lineWidth = 4;
  }
}

/* ---------- visual effects ---------- */
const EL2 = { light: '#fffbe6', wind: '#e8fff8', fire: '#ffd23f', water: '#d9f1ff', earth: '#4a2f16', darkness: '#140a22', antimatter: '#0b0b10', steel: '#ffffff', lightning: '#ffffff', ice: '#f4fdff' };
const PKIND = { fire: 'flame', water: 'drop', lightning: 'spark', ice: 'snow', earth: 'rock', darkness: 'smoke', antimatter: 'glitch', steel: 'spark', light: 'glint', wind: 'streak' };
let frameDt = 1 / 60;
function withA(hex, a) { const h = String(hex).replace('#', ''); if (!/^[0-9a-f]{3,6}$/i.test(h)) return `rgba(128,128,128,${a})`; const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const glowOn = () => { if (isDark) ctx.globalCompositeOperation = 'lighter'; };
const glowOff = () => { ctx.globalCompositeOperation = 'source-over'; };
function along(x0, y0, x1, y1, step, fn) {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, n = Math.max(1, Math.floor(L / step)), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  for (let i = 0; i <= n; i++) { const t = i / n; fn(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, t, -uy, ux, i); }
}
function jagged(x0, y0, x1, y1, amp, step = 26) {
  ctx.beginPath(); ctx.moveTo(x0, y0);
  along(x0, y0, x1, y1, step, (x, y, t, nx, ny, i) => { if (t > 0 && t < 1) { const o = (Math.random() - 0.5) * amp; ctx.lineTo(x + nx * o, y + ny * o); } });
  ctx.lineTo(x1, y1);
}
function wavyPath(x0, y0, x1, y1, amp, freq, phase) {
  ctx.beginPath();
  along(x0, y0, x1, y1, 8, (x, y, t, nx, ny, i) => { const o = Math.sin(t * freq + phase) * amp * Math.min(1, t * 6); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x + nx * o, y + ny * o); });
}
function starPath(r1, r2, n, rot = 0) { ctx.beginPath(); for (let k = 0; k < n * 2; k++) { const r = k % 2 ? r2 : r1, a = rot + k * Math.PI / n; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }

/* particles: each element has its own kind of spark */
function spawnP(x, y, el, vx, vy, life, size, kind) {
  if (particles.length > 900) return;
  particles.push({ x, y, vx, vy, life, max: life, el, size, kind: kind || PKIND[el] || 'dot', rot: Math.random() * 6 });
}
function burstParticles(x, y, el, n, spd = 260) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = spd * (0.3 + Math.random());
    spawnP(x, y, el, Math.cos(a) * s, Math.sin(a) * s - (PKIND[el] === 'flame' ? 80 : 0), 0.35 + Math.random() * 0.45, 2 + Math.random() * 3);
  }
}
function trailParticle(x, y, el, ang, sp) {
  const k = PKIND[el];
  const back = -0.12;
  spawnP(x, y, el, Math.cos(ang) * sp * back + (Math.random() - 0.5) * 40, Math.sin(ang) * sp * back + (Math.random() - 0.5) * 40 - (k === 'flame' || k === 'smoke' ? 60 : 0),
    k === 'smoke' ? 0.6 : 0.3, k === 'smoke' ? 6 : 2 + Math.random() * 2);
}
function stepParticles(dt) {
  for (const p of particles) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 6;
    const k = p.kind;
    if (k === 'drop' || k === 'rock') p.vy += 900 * dt;
    else if (k === 'spark') { p.vy += 300 * dt; p.vx *= 0.92; p.vy *= 0.92; }
    else if (k === 'flame') { p.vy -= 160 * dt; p.vx *= 0.94; }
    else if (k === 'snow') { p.vx *= 0.9; p.vy = p.vy * 0.9 + 18 * dt * 10; }
    else if (k === 'smoke') { p.size += dt * 14; p.vx *= 0.95; p.vy *= 0.95; }
    else { p.vx *= 0.95; p.vy *= 0.95; }
  }
  particles = particles.filter(p => p.life > 0);
}
function drawParticles() {
  for (const p of particles) {
    const a = clamp(p.life / p.max, 0, 1), col = elCol(p.el);
    ctx.globalAlpha = a;
    switch (p.kind) {
      case 'flame': glowOn(); ctx.fillStyle = a > 0.6 ? EL2.fire : col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a), 0, 7); ctx.fill(); glowOff(); break;
      case 'drop': ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * 0.6, p.size, Math.atan2(p.vy, p.vx) + 1.57, 0, 7); ctx.fill(); break;
      case 'spark': glowOn(); ctx.strokeStyle = p.el === 'lightning' ? EL2.lightning : col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); glowOff(); break;
      case 'snow': ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * 0.3); ctx.beginPath(); for (let k = 0; k < 3; k++) { const ang = k * Math.PI / 3; ctx.moveTo(-Math.cos(ang) * p.size, -Math.sin(ang) * p.size); ctx.lineTo(Math.cos(ang) * p.size, Math.sin(ang) * p.size); } ctx.stroke(); ctx.restore(); break;
      case 'rock': ctx.fillStyle = col; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.8); ctx.restore(); break;
      case 'smoke': ctx.globalAlpha = a * 0.35; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); break;
      case 'glitch': ctx.fillStyle = Math.random() < 0.5 ? col : EL2.antimatter; ctx.fillRect(p.x + (Math.random() - 0.5) * 4, p.y, p.size * 2.2, p.size * 0.7); break;
      case 'glint': glowOn(); ctx.fillStyle = col; ctx.save(); ctx.translate(p.x, p.y); starPath(p.size * 1.6, p.size * 0.35, 4, p.rot * 0.2); ctx.fill(); ctx.restore(); glowOff(); break;
      case 'streak': ctx.strokeStyle = col; ctx.lineWidth = p.size * 0.6; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06); ctx.stroke(); break;
      default: ctx.fillStyle = col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
}

/* beams */
function drawBeam(b) {
  const col = elCol(b.el), el = b.el;
  if (b.windup > 0) {
    const e = b.x1 !== undefined && b.view ? { x: b.x1, y: b.y1 } : rayEnd(b.x0, b.y0, b.ang);
    ctx.save(); ctx.globalAlpha = 0.45 + Math.random() * 0.4; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(e.x, e.y); ctx.stroke(); ctx.restore();
    ctx.save(); glowOn(); ctx.fillStyle = col; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(b.x0, b.y0, 6 + Math.random() * 6, 0, 7); ctx.fill(); ctx.restore();
    return;
  }
  if (b.x1 === undefined) return;
  const a = clamp(b.life / 0.22, 0, 1), t = b.thick, x0 = b.x0, y0 = b.y0, x1 = b.x1, y1 = b.y1;
  ctx.save(); ctx.globalAlpha = a; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (el) {
    case 'lightning':
      glowOn();
      for (let pass = 0; pass < 2; pass++) { jagged(x0, y0, x1, y1, t * 2.4 + 10); ctx.strokeStyle = col; ctx.lineWidth = t * 1.4 + 4; ctx.globalAlpha = a * 0.5; ctx.stroke(); ctx.strokeStyle = EL2.lightning; ctx.lineWidth = Math.max(2, t * 0.45); ctx.globalAlpha = a; ctx.stroke(); }
      along(x0, y0, x1, y1, 90, (x, y, tt, nx, ny, i) => { if (i && Math.random() < 0.7) { const s = Math.random() < 0.5 ? 1 : -1; jagged(x, y, x + nx * s * 50 + (x1 - x0) * 0.04, y + ny * s * 50 + (y1 - y0) * 0.04, 14, 12); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); } });
      break;
    case 'fire':
      glowOn();
      along(x0, y0, x1, y1, 12, (x, y, tt) => { const r = t * (0.5 + tt * 1.1) * (0.75 + Math.random() * 0.5); ctx.fillStyle = col; ctx.globalAlpha = a * 0.45; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.fillStyle = EL2.fire; ctx.globalAlpha = a * 0.6; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 7); ctx.fill(); });
      if (Math.random() < 0.9) spawnP(x1 + (Math.random() - 0.5) * t * 2, y1, 'fire', (Math.random() - 0.5) * 80, -60 - Math.random() * 80, 0.4, 4);
      break;
    case 'water':
      for (let k = 0; k < 3; k++) { wavyPath(x0, y0, x1, y1, t * 0.35, 18, clock * 14 + k * 2); ctx.strokeStyle = k === 1 ? EL2.water : col; ctx.globalAlpha = a * (k === 1 ? 0.9 : 0.6); ctx.lineWidth = k === 1 ? t * 0.45 : t * 0.9; ctx.stroke(); }
      if (Math.random() < 0.8) spawnP(x1, y1, 'water', (Math.random() - 0.5) * 200, -100 - Math.random() * 150, 0.6, 3);
      break;
    case 'light':
      glowOn();
      ctx.strokeStyle = col; ctx.globalAlpha = a * 0.25; ctx.lineWidth = t * 3.2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.globalAlpha = a * 0.7; ctx.lineWidth = t * 1.5; ctx.stroke();
      ctx.strokeStyle = EL2.light; ctx.globalAlpha = a; ctx.lineWidth = t * 0.6; ctx.stroke();
      along(x0, y0, x1, y1, 46, (x, y, tt, nx, ny, i) => { const l = t * 1.4 + 6; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.globalAlpha = a * 0.6; ctx.beginPath(); ctx.moveTo(x + nx * l * 0.6, y + ny * l * 0.6); ctx.lineTo(x + nx * l * 1.5, y + ny * l * 1.5); ctx.moveTo(x - nx * l * 0.6, y - ny * l * 0.6); ctx.lineTo(x - nx * l * 1.5, y - ny * l * 1.5); ctx.stroke(); });
      break;
    case 'antimatter':
      ctx.strokeStyle = col; ctx.globalAlpha = a * 0.7; ctx.lineWidth = t * 1.9 + 4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = EL2.antimatter; ctx.globalAlpha = a; ctx.lineWidth = t * 0.9 + 1; ctx.stroke();
      for (let k = 0; k < 5; k++) { const s = Math.random(), e = Math.min(1, s + 0.12), o = (Math.random() - 0.5) * 18; const nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1;
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0 + (x1 - x0) * s + nx / L * o, y0 + (y1 - y0) * s + ny / L * o); ctx.lineTo(x0 + (x1 - x0) * e + nx / L * o, y0 + (y1 - y0) * e + ny / L * o); ctx.stroke(); }
      break;
    case 'darkness':
      for (let k = 0; k < 4; k++) { wavyPath(x0, y0, x1, y1, t * 0.6 + 6, 7 + k * 3, clock * (6 + k) + k * 1.7); ctx.strokeStyle = col; ctx.globalAlpha = a * 0.45; ctx.lineWidth = t * 0.6 + 2; ctx.stroke(); }
      ctx.strokeStyle = EL2.darkness; ctx.globalAlpha = a; ctx.lineWidth = Math.max(2, t * 0.4); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      break;
    case 'ice':
      ctx.strokeStyle = col; ctx.globalAlpha = a * 0.8; ctx.lineWidth = t * 1.1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = EL2.ice; ctx.lineWidth = t * 0.4; ctx.stroke();
      along(x0, y0, x1, y1, 32, (x, y, tt, nx, ny, i) => { const s = t * 0.9 + 6; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(y1 - y0, x1 - x0) + (i % 2 ? 0.6 : -0.6)); ctx.fillStyle = EL2.ice; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.35, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.35, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); });
      break;
    case 'earth':
      ctx.strokeStyle = col; ctx.lineWidth = t * 0.9; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      along(x0, y0, x1, y1, 22, (x, y, tt, nx, ny, i) => { const s = (i % 2 ? 1 : -1), h = t * 1.3 + 8 + hash(i) * 8; ctx.fillStyle = col; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - ny * 7, y + nx * 7); ctx.lineTo(x + nx * s * h, y + ny * s * h); ctx.lineTo(x + ny * 7, y - nx * 7); ctx.closePath(); ctx.fill(); ctx.stroke(); });
      break;
    case 'steel':
      glowOn(); ctx.strokeStyle = col; ctx.globalAlpha = a * 0.5; ctx.lineWidth = t * 1.5 + 3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = EL2.steel; ctx.globalAlpha = a; ctx.lineWidth = Math.max(2, t * 0.45); ctx.stroke();
      ctx.save(); ctx.translate(x1, y1); ctx.fillStyle = EL2.steel; starPath(18, 3, 4, clock * 4); ctx.fill(); ctx.restore();
      break;
    default: // wind
      for (let k = 0; k < 3; k++) { wavyPath(x0, y0, x1, y1, t * 0.5 + 5, 10, clock * 18 + k * 2.1); ctx.strokeStyle = col; ctx.globalAlpha = a * 0.55; ctx.lineWidth = 2 + t * 0.25; ctx.stroke(); }
  }
  glowOff(); ctx.restore();
}

/* projectiles */
function drawProjectileShape(el, r, t, shape, vis) {
  const col = elCol(el);
  switch (el) {
    case 'fire': {
      glowOn(); ctx.fillStyle = col; ctx.globalAlpha *= 0.4; ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, 7); ctx.fill(); ctx.globalAlpha /= 0.4; glowOff();
      const fl = 1 + Math.sin(t * 40) * 0.15;
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(r * 1.2, 0); ctx.quadraticCurveTo(r * 0.2, -r * 1.1, -r * 2.2 * fl, 0); ctx.quadraticCurveTo(r * 0.2, r * 1.1, r * 1.2, 0); ctx.fill();
      ctx.fillStyle = EL2.fire; ctx.beginPath(); ctx.arc(r * 0.3, 0, r * 0.55, 0, 7); ctx.fill(); break;
    }
    case 'water':
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-r * 1.9, 0); ctx.quadraticCurveTo(-r * 0.4, -r * 1.05, r, -r * 0.2); ctx.arc(r * 0.1, 0, r, -0.3, 0.3, false); ctx.quadraticCurveTo(-r * 0.4, r * 1.05, -r * 1.9, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.fillStyle = EL2.water; ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.35, r * 0.3, 0, 7); ctx.fill(); break;
    case 'earth':
      ctx.rotate(t * 5); ctx.fillStyle = col; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath();
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = r * (0.85 + hash(k + r) * 0.4); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = EL2.earth; ctx.globalAlpha *= 0.4; ctx.beginPath(); ctx.arc(-r * 0.3, r * 0.2, r * 0.35, 0, 7); ctx.fill(); break;
    case 'ice':
      ctx.fillStyle = EL2.ice; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * 1.9, 0); ctx.lineTo(0, -r * 0.6); ctx.lineTo(-r * 1.4, 0); ctx.lineTo(0, r * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 1.9, 0); ctx.lineTo(-r * 1.4, 0); ctx.stroke(); break;
    case 'lightning':
      glowOn(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0, 7); ctx.fill(); ctx.fillStyle = EL2.lightning; ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, 7); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; for (let k = 0; k < 3; k++) { const a = Math.random() * 7; jagged(0, 0, Math.cos(a) * r * 2.4, Math.sin(a) * r * 2.4, 8, 6); ctx.stroke(); } glowOff(); break;
    case 'darkness':
      ctx.fillStyle = EL2.darkness; ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0, 7); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0, 7); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(r * 0.3, 0, r * 0.45, r * 0.22, 0, 0, 7); ctx.fill(); break;
    case 'antimatter':
      ctx.strokeStyle = col; ctx.globalAlpha *= 0.4; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, 7); ctx.stroke(); ctx.globalAlpha /= 0.4;
      ctx.fillStyle = EL2.antimatter; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 40; ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, 7); ctx.stroke(); ctx.setLineDash([]); break;
    case 'steel': {
      if (shape !== 'spear') ctx.rotate(t * 16);
      const L = r * 2.6; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
      ctx.fillStyle = EL2.steel; ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(-L * 0.3, -r * 0.4); ctx.lineTo(-L * 0.3, r * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-L * 0.3, -r * 0.9); ctx.lineTo(-L * 0.3, r * 0.9); ctx.moveTo(-L * 0.3, 0); ctx.lineTo(-L * 0.7, 0); ctx.stroke(); break;
    }
    case 'light':
      glowOn(); ctx.fillStyle = col; ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, 7); ctx.fill(); ctx.globalAlpha /= 0.35;
      ctx.fillStyle = col; starPath(r * 1.8, r * 0.5, 4, t * 6); ctx.fill(); ctx.fillStyle = EL2.light; ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, 7); ctx.fill(); glowOff(); break;
    default: // wind
      ctx.fillStyle = col; ctx.globalAlpha *= 0.85; ctx.beginPath(); ctx.arc(0, 0, r * 1.3, -1.5, 1.5); ctx.arc(-r * 0.7, 0, r * 1.1, 1.3, -1.3, true); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = EL2.wind; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-r * 0.4, 0, r * 1.5, -0.9, 0.9); ctx.stroke();
  }
}
function drawProjectile(p) {
  ctx.save();
  if (p.el === 'darkness') { const t = opp(p.owner); ctx.globalAlpha = clamp((320 - Math.hypot(p.x - t.x, p.y - chestY(t))) / 220, 0.12, 1); }
  ctx.translate(p.x, p.y); ctx.rotate(p.ang);
  drawProjectileShape(p.el, p.r, p.t || clock, p.shape);
  ctx.restore();
}

/* zones */
function drawZone(z) {
  const col = elCol(z.el), a = clamp(z.life / 0.4, 0, 1) * clamp((z.max - z.life) / 0.2, 0, 1), r = z.r;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(z.x, z.y);
  const rad = (c0, a0) => { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, c0); g.addColorStop(1, withA(c0, 0)); ctx.globalAlpha = a * a0; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.globalAlpha = a; };
  switch (z.el) {
    case 'fire':
      glowOn(); rad(col, 0.55);
      for (let k = 0; k < 12; k++) { const x = (hash(k) - 0.5) * r * 1.5, base = Math.sqrt(Math.max(0, r * r - x * x)) * 0.7, h = (18 + hash(k + 9) * r * 0.5) * (0.7 + 0.3 * Math.sin(clock * 18 + k));
        ctx.fillStyle = k % 3 ? col : EL2.fire; ctx.beginPath(); ctx.moveTo(x - 9, base); ctx.quadraticCurveTo(x - 6, base - h * 0.6, x + Math.sin(clock * 9 + k) * 6, base - h); ctx.quadraticCurveTo(x + 6, base - h * 0.6, x + 9, base); ctx.fill(); }
      glowOff(); if (Math.random() < 0.6) spawnP(z.x + (Math.random() - 0.5) * r, z.y + r * 0.4, 'fire', 0, -80, 0.6, 4); break;
    case 'water':
      rad(col, 0.4);
      for (let k = 0; k < 3; k++) { const rr = ((clock * 0.6 + k / 3) % 1) * r; ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.globalAlpha = a * (1 - rr / r); ctx.beginPath(); ctx.arc(0, 0, rr, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); for (let k = 0; k <= 40; k++) { const t = k / 40 * Math.PI * 2, rr = r * (0.95 + Math.sin(t * 6 + clock * 4) * 0.04); ctx.lineTo(Math.cos(t) * rr, Math.sin(t) * rr); } ctx.stroke();
      if (Math.random() < 0.3) spawnP(z.x + (Math.random() - 0.5) * r, z.y + (Math.random() - 0.5) * r, 'water', 0, -40, 0.5, 3); break;
    case 'earth':
      rad(col, 0.45);
      for (let k = 0; k < 8; k++) { const t = z.spin * 0.4 + k / 8 * Math.PI * 2, rr = r * (0.55 + hash(k) * 0.35); ctx.save(); ctx.translate(Math.cos(t) * rr, Math.sin(t) * rr * 0.6); ctx.rotate(t * 2); ctx.fillStyle = col; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.fillRect(-6, -5, 12, 10); ctx.strokeRect(-6, -5, 12, 10); ctx.restore(); }
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -clock * 20; ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, 7); ctx.stroke(); ctx.setLineDash([]); break;
    case 'ice':
      rad(EL2.ice, 0.6); rad(col, 0.25);
      for (let k = 0; k < 7; k++) { const t = clock * 0.5 + k, x = (hash(k) - 0.5) * r * 1.4, y = ((hash(k + 3) + clock * 0.15) % 1 - 0.5) * r * 1.4; ctx.save(); ctx.translate(x, y); ctx.rotate(t); ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); for (let q = 0; q < 3; q++) { const an = q * Math.PI / 3; ctx.moveTo(-Math.cos(an) * 7, -Math.sin(an) * 7); ctx.lineTo(Math.cos(an) * 7, Math.sin(an) * 7); } ctx.stroke(); ctx.restore(); }
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.arc(0, 0, r * 0.97, 0, 7); ctx.stroke(); ctx.setLineDash([]); break;
    case 'lightning':
      rad(col, 0.25); glowOn();
      for (let k = 0; k < 3; k++) { const a1 = Math.random() * 7, a2 = a1 + 1 + Math.random() * 3; jagged(Math.cos(a1) * r * 0.9, Math.sin(a1) * r * 0.9, Math.cos(a2) * r * 0.6, Math.sin(a2) * r * 0.6, 14, 12); ctx.strokeStyle = k ? col : EL2.lightning; ctx.lineWidth = 2; ctx.stroke(); }
      glowOff(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); break;
    case 'darkness':
      for (let k = 0; k < 7; k++) { const t = clock * 0.8 + k * 0.9; ctx.globalAlpha = a * 0.3; ctx.fillStyle = k % 2 ? col : EL2.darkness; ctx.beginPath(); ctx.arc(Math.cos(t) * r * 0.4, Math.sin(t * 1.3) * r * 0.3, r * (0.35 + hash(k) * 0.3), 0, 7); ctx.fill(); }
      ctx.globalAlpha = a * 0.5; ctx.fillStyle = EL2.darkness; ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, 7); ctx.fill();
      if (Math.random() < 0.5) spawnP(z.x + (Math.random() - 0.5) * r, z.y + (Math.random() - 0.5) * r, 'darkness', 0, -20, 0.8, 8); break;
    case 'antimatter':
      glowOn(); rad(col, 0.35); glowOff();
      for (let k = 0; k < 3; k++) { ctx.save(); ctx.rotate(z.spin * (0.5 + k * 0.3) + k); ctx.strokeStyle = col; ctx.lineWidth = 3 - k * 0.7; ctx.beginPath(); ctx.ellipse(0, 0, r * (0.9 - k * 0.15), r * (0.28 + k * 0.05), 0, 0, 7); ctx.stroke(); ctx.restore(); }
      ctx.fillStyle = EL2.antimatter; ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, 7); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); break;
    case 'light':
      glowOn(); rad(col, 0.5);
      ctx.save(); ctx.rotate(clock * 0.8); ctx.strokeStyle = col; ctx.lineWidth = 3;
      for (let k = 0; k < 12; k++) { const t = k / 12 * Math.PI * 2; ctx.globalAlpha = a * (0.4 + 0.4 * Math.sin(clock * 5 + k)); ctx.beginPath(); ctx.moveTo(Math.cos(t) * r * 0.3, Math.sin(t) * r * 0.3); ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); ctx.stroke(); }
      ctx.restore(); ctx.globalAlpha = a; ctx.fillStyle = EL2.light; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, 7); ctx.fill(); glowOff(); break;
    case 'steel':
      rad(col, 0.2);
      for (let k = 0; k < 6; k++) { const t = z.spin * 0.7 + k / 6 * Math.PI * 2; ctx.save(); ctx.translate(Math.cos(t) * r * 0.8, Math.sin(t) * r * 0.8); ctx.rotate(t + 1.57); drawProjectileShape('steel', 7, 0, 'spear'); ctx.restore(); }
      break;
    default:
      ctx.strokeStyle = col; ctx.lineCap = 'round';
      for (let k = 0; k < 4; k++) { const rr = r * (0.35 + k * 0.2); ctx.lineWidth = 4 - k * 0.6; ctx.globalAlpha = a * 0.85; ctx.beginPath(); ctx.arc(0, 0, rr, z.spin * (1 + k * 0.3) + k, z.spin * (1 + k * 0.3) + k + 2.2); ctx.stroke(); }
      rad(col, 0.15);
  }
  ctx.restore();
}

/* bursts, strikes, waves, traps, summons, orbits */
function drawRing(rg) {
  const k = 1 - rg.life / rg.max, col = elCol(rg.el), el = rg.el;
  ctx.save(); ctx.globalAlpha = 1 - k; ctx.translate(rg.x, rg.y);
  const R = rg.r * (0.3 + 0.7 * k);
  if (rg.arc) {
    const c = rg.arc > 0 ? 0 : Math.PI; glowOn();
    ctx.fillStyle = col; ctx.globalAlpha = (1 - k) * 0.35; ctx.beginPath(); ctx.arc(0, 0, R, c - 1.2, c + 1.2); ctx.arc(0, 0, R * 0.6, c + 1.2, c - 1.2, true); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = EL2.steel; ctx.globalAlpha = 1 - k; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, R, c - 1.2, c + 1.2); ctx.stroke(); glowOff();
  } else if (el === 'antimatter') {
    const R2 = rg.r * (1 - 0.8 * k); ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, R2, 0, 7); ctx.stroke(); ctx.fillStyle = EL2.antimatter; ctx.globalAlpha = 0.5 * (1 - k); ctx.beginPath(); ctx.arc(0, 0, R2 * 0.5, 0, 7); ctx.fill();
  } else if (el === 'lightning') {
    glowOn(); for (let q = 0; q < 8; q++) { const a = q / 8 * 7 + rg.max; jagged(0, 0, Math.cos(a) * R, Math.sin(a) * R, 16, 14); ctx.strokeStyle = q % 2 ? col : EL2.lightning; ctx.lineWidth = 2.5; ctx.stroke(); } glowOff();
  } else if (el === 'ice' || el === 'earth') {
    for (let q = 0; q < 10; q++) { const a = q / 10 * Math.PI * 2; ctx.save(); ctx.rotate(a); ctx.fillStyle = el === 'ice' ? EL2.ice : col; ctx.strokeStyle = el === 'ice' ? col : C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(R * 0.4, -6); ctx.lineTo(R, 0); ctx.lineTo(R * 0.4, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
  } else if (el === 'fire' || el === 'darkness' || el === 'light') {
    if (el !== 'darkness') glowOn();
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R); g.addColorStop(0, el === 'darkness' ? EL2.darkness : EL2[el]); g.addColorStop(0.5, col); g.addColorStop(1, withA(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill(); glowOff();
  } else {
    ctx.strokeStyle = col; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
    if (el === 'wind') { ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * 0.7, k * 6, k * 6 + 3); ctx.stroke(); }
  }
  ctx.restore();
}
const SKY = { lightning: 1, light: 1, steel: 1, fire: 1 }, GROUNDUP = { earth: 1, ice: 1, water: 1 };
function drawStrike(s) {
  const col = elCol(s.el), p = clamp(s.t / s.delay, 0, 1);
  ctx.save(); ctx.translate(s.x, s.y);
  ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -clock * 30; ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.arc(0, 0, s.r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = 0.25; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, s.r * p, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  if (s.el === 'fire' || s.el === 'earth') { const y = -(1 - p) * (s.y + 60); ctx.save(); ctx.translate(0, y); ctx.rotate(1.57); drawProjectileShape(s.el, 10 + s.r * 0.12, clock, 'orb'); ctx.restore(); }
  else if (s.el === 'steel') { const y = -(1 - p) * (s.y + 80) - 30; ctx.save(); ctx.translate(0, y); ctx.rotate(1.57); drawProjectileShape('steel', 16, 0, 'spear'); ctx.restore(); }
  ctx.restore();
}
function drawFlash(fl) {
  const col = elCol(fl.el), k = 1 - fl.life / fl.max, a = 1 - k;
  ctx.save(); ctx.globalAlpha = a;
  if (fl.kind === 'strike' && SKY[fl.el]) {
    glowOn();
    if (fl.el === 'lightning') { for (let q = 0; q < 2; q++) { jagged(fl.x + (Math.random() - 0.5) * 40, 0, fl.x, fl.y, 40, 30); ctx.strokeStyle = col; ctx.lineWidth = 12; ctx.globalAlpha = a * 0.5; ctx.stroke(); ctx.strokeStyle = EL2.lightning; ctx.lineWidth = 4; ctx.globalAlpha = a; ctx.stroke(); } }
    else { const w = fl.r * 0.9 * (1 - k * 0.5); const g = ctx.createLinearGradient(fl.x - w, 0, fl.x + w, 0); g.addColorStop(0, withA(col, 0)); g.addColorStop(0.5, fl.el === 'steel' ? EL2.steel : EL2[fl.el]); g.addColorStop(1, withA(col, 0)); ctx.fillStyle = g; ctx.fillRect(fl.x - w, 0, w * 2, fl.y + fl.r * 0.4); ctx.fillStyle = col; ctx.globalAlpha = a * 0.5; ctx.fillRect(fl.x - w * 0.5, 0, w, fl.y); }
    glowOff();
  } else if (fl.kind === 'strike' && GROUNDUP[fl.el]) {
    const n = 7;
    for (let q = 0; q < n; q++) { const x = fl.x + (q - (n - 1) / 2) * fl.r * 0.28, h = fl.r * (1.2 - Math.abs(q - (n - 1) / 2) * 0.25) * Math.min(1, k * 4);
      ctx.fillStyle = fl.el === 'ice' ? EL2.ice : col; ctx.strokeStyle = fl.el === 'ice' ? col : C.ink; ctx.lineWidth = 2;
      if (fl.el === 'water') { ctx.globalAlpha = a * 0.7; ctx.beginPath(); ctx.ellipse(x, fl.y + fl.r * 0.4 - h / 2, 9, h / 2, 0, 0, 7); ctx.fill(); ctx.globalAlpha = a; }
      else { ctx.beginPath(); ctx.moveTo(x - 10, fl.y + fl.r * 0.5); ctx.lineTo(x, fl.y + fl.r * 0.5 - h); ctx.lineTo(x + 10, fl.y + fl.r * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
  } else {
    const R = fl.r * (0.4 + 0.8 * k);
    if (fl.el === 'antimatter') { ctx.fillStyle = EL2.antimatter; ctx.beginPath(); ctx.arc(fl.x, fl.y, fl.r * (1 - k), 0, 7); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke(); }
    else if (fl.el === 'darkness') { ctx.strokeStyle = col; ctx.lineWidth = 6; for (let q = -1; q <= 1; q++) { ctx.beginPath(); ctx.moveTo(fl.x - fl.r * 0.6 + q * 18, fl.y - fl.r * 0.6); ctx.quadraticCurveTo(fl.x + q * 18, fl.y, fl.x + fl.r * 0.5 + q * 18, fl.y + fl.r * 0.6); ctx.stroke(); } }
    else { glowOn(); const g = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, R); g.addColorStop(0, EL2[fl.el] || '#fff'); g.addColorStop(0.45, col); g.addColorStop(1, withA(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fl.x, fl.y, R, 0, 7); ctx.fill(); glowOff(); }
  }
  ctx.restore();
}
function drawWave(w) {
  const col = elCol(w.el), d = w.dir;
  ctx.save();
  for (let q = 0; q < 5; q++) {
    const x = w.x - d * q * 18, h = w.h * (1 - q * 0.18), al = 1 - q * 0.18;
    ctx.globalAlpha = al;
    if (w.el === 'water') { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - d * 16, w.y); ctx.quadraticCurveTo(x - d * 4, w.y - h * 1.1, x + d * 12, w.y - h * 0.8); ctx.quadraticCurveTo(x + d * 2, w.y - h * 0.5, x + d * 10, w.y); ctx.fill(); if (!q) { ctx.fillStyle = EL2.water; ctx.beginPath(); ctx.arc(x + d * 10, w.y - h * 0.8, 4, 0, 7); ctx.fill(); } }
    else if (w.el === 'fire') { glowOn(); ctx.fillStyle = q % 2 ? col : EL2.fire; const fl = 0.8 + Math.sin(clock * 30 + q) * 0.2; ctx.beginPath(); ctx.moveTo(x - 10, w.y); ctx.quadraticCurveTo(x - 6, w.y - h * 0.6, x, w.y - h * fl); ctx.quadraticCurveTo(x + 6, w.y - h * 0.6, x + 10, w.y); ctx.fill(); glowOff(); }
    else if (w.el === 'lightning') { glowOn(); jagged(x, w.y, x + (Math.random() - 0.5) * 10, w.y - h, 12, 10); ctx.strokeStyle = q ? col : EL2.lightning; ctx.lineWidth = 3; ctx.stroke(); glowOff(); }
    else { const ice = w.el === 'ice'; ctx.fillStyle = ice ? EL2.ice : col; ctx.strokeStyle = ice ? col : C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 11, w.y); ctx.lineTo(x + d * 3, w.y - h); ctx.lineTo(x + 11, w.y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  }
  ctx.restore();
}
function drawTrap(t) {
  const col = elCol(t.el), armed = t.age > 0.5, enemy = opp(t.owner);
  ctx.save(); ctx.translate(t.x, t.y - 2);
  ctx.globalAlpha = t.el === 'darkness' ? 0.25 : armed ? 0.6 + 0.3 * Math.sin(clock * 8) : 0.4;
  ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -clock * 20;
  ctx.beginPath(); ctx.ellipse(0, 0, t.r, t.r * 0.28, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = col; ctx.save(); ctx.scale(1, 0.4); starPath(t.r * 0.5, t.r * 0.18, 5, clock); ctx.fill(); ctx.restore();
  ctx.restore();
}
function drawSummon(s) {
  const col = elCol(s.el), o = opp(s.owner), look = Math.atan2(chestY(o) - s.y, o.x - s.x);
  ctx.save(); ctx.translate(s.x, s.y); ctx.globalAlpha = clamp(s.life / 0.4, 0, 1);
  glowOn(); ctx.fillStyle = col; ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.fill(); ctx.globalAlpha /= 0.35; glowOff();
  if (s.el === 'darkness') { ctx.fillStyle = EL2.darkness; ctx.beginPath(); ctx.ellipse(0, 0, 15, 9, 0, 0, 7); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(Math.cos(look) * 5, Math.sin(look) * 3, 4, 0, 7); ctx.fill(); }
  else if (s.el === 'lightning') { ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(0, 0); ctx.stroke(); ctx.save(); ctx.rotate(look); drawProjectileShape('lightning', 8, clock); ctx.restore(); }
  else if (s.el === 'steel') { ctx.rotate(look); drawProjectileShape('steel', 9, 0, 'spear'); }
  else { ctx.save(); ctx.rotate(look); drawProjectileShape(s.el, 10, clock, 'orb'); ctx.restore(); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(Math.cos(look) * 4, Math.sin(look) * 4 - 2, 2.5, 0, 7); ctx.fill(); }
  ctx.restore();
}
function drawOrbit(f) {
  const ob = f.orbit; if (!ob) return;
  const cy = chestY(f);
  for (let k = 0; k < ob.n; k++) {
    const a = ob.ang + k * Math.PI * 2 / ob.n;
    ctx.save(); ctx.translate(f.x + Math.cos(a) * ob.r, cy + Math.sin(a) * ob.r); ctx.rotate(a + 1.57);
    drawProjectileShape(f.element, ob.or, clock + k, 'blade'); ctx.restore();
  }
  ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = elCol(f.element); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, cy, ob.r, 0, 7); ctx.stroke(); ctx.restore();
}
function drawShield(f) {
  const s = f.shield, col = elCol(f.element), cy = chestY(f), a = clamp(s.t / 0.25, 0, 1), r = s.r;
  ctx.save(); ctx.translate(f.x, cy); ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r); g.addColorStop(0, withA(col, 0)); g.addColorStop(1, col);
  ctx.globalAlpha = a * 0.35; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.globalAlpha = a;
  ctx.strokeStyle = col; ctx.lineWidth = 3;
  switch (f.element) {
    case 'earth': for (let k = 0; k < 10; k++) { const t = k / 10 * Math.PI * 2; ctx.save(); ctx.rotate(t); ctx.fillStyle = col; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.fillRect(r - 9, -10, 14, 20); ctx.strokeRect(r - 9, -10, 14, 20); ctx.restore(); } break;
    case 'ice': ctx.beginPath(); for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2 + 0.52; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); } ctx.closePath(); ctx.stroke(); ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2 + 0.52; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); } ctx.stroke(); break;
    case 'lightning': glowOn(); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); for (let k = 0; k < 2; k++) { const a1 = Math.random() * 7; jagged(Math.cos(a1) * r, Math.sin(a1) * r, Math.cos(a1 + 1.5) * r, Math.sin(a1 + 1.5) * r, 12, 10); ctx.strokeStyle = EL2.lightning; ctx.lineWidth = 2; ctx.stroke(); } glowOff(); break;
    case 'water': ctx.beginPath(); for (let k = 0; k <= 40; k++) { const t = k / 40 * Math.PI * 2, rr = r * (1 + Math.sin(t * 5 + clock * 6) * 0.04); ctx.lineTo(Math.cos(t) * rr, Math.sin(t) * rr); } ctx.stroke(); ctx.fillStyle = EL2.water; ctx.beginPath(); ctx.arc(-r * 0.4, -r * 0.45, r * 0.12, 0, 7); ctx.fill(); break;
    case 'steel': ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); ctx.save(); ctx.rotate(0.8); drawProjectileShape('steel', 10, 0, 'spear'); ctx.rotate(-1.6); drawProjectileShape('steel', 10, 0, 'spear'); ctx.restore(); break;
    default: ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
      if (s.reflect) { ctx.lineWidth = 2; ctx.strokeStyle = EL2.light; ctx.beginPath(); ctx.arc(0, 0, r - 8, -2.4 + clock * 3, -1.6 + clock * 3); ctx.stroke(); }
  }
  ctx.restore();
}

/* stick figures: two-part limbs with smoothed joints for fluid motion.
   Angles are measured from straight down: 0 = down, +PI/2 = forward, PI = up, negative = backward. */
function aimArm(f, P) { return Math.atan2(Math.cos(f.aimAng) * (Math.sign(f.faceS) || 1), Math.sin(f.aimAng)) - P.lean; }
function castPose(f, P) {
  const dur = f.castDur || 0.28, u = clamp(1 - f.castAnim / dur, 0, 1), aim = aimArm(f, P), big = f.castUlt ? 1.35 : 1;
  const early = u < 0.35;
  switch (f.castType) {
    case 'beam': // two-handed push
      P.lean += 0.14 * big; P.sh = [aim, aim + 0.12]; P.el = [0, 0.1]; P.hipA = [0.55, -0.45]; P.knee = [-0.35, -0.2]; P.crouch += 5; break;
    case 'burst': // curl in, then explode outward
      if (early) { P.sh = [0.2, 0.1]; P.el = [2.2, 2.2]; P.crouch += 12; P.lean += 0.3; }
      else { P.sh = [2.4, -2.3]; P.el = [0.1, -0.1]; P.crouch -= 4; P.lean -= 0.1; P.headTilt = 0.25; P.hipA = [0.6, -0.6]; P.knee = [-0.2, -0.2]; }
      break;
    case 'strike': case 'rain': // call it down from the sky
      if (early) { P.sh = [3.0, 2.7]; P.el = [0.1, 0.2]; P.headTilt = 0.35; P.lean -= 0.12; P.crouch -= 3; }
      else { P.sh = [aim + 0.2, 0.6]; P.el = [0, 1.4]; P.lean += 0.25; P.crouch += 8; }
      break;
    case 'zone': case 'trap': // palm to the floor
      P.sh = [1.0, -0.4]; P.el = [0.5, 0.8]; P.lean += 0.38; P.crouch += 12; P.hipA = [0.9, -0.5]; P.knee = [-1.2, -0.4]; P.headTilt = -0.2; break;
    case 'wave': // ground slam
      if (early) { P.sh = [2.9, 2.6]; P.el = [0.3, 0.3]; P.crouch -= 6; P.lean -= 0.05; }
      else { P.sh = [0.5, 0.3]; P.el = [0.2, 0.3]; P.crouch += 18; P.lean += 0.45; P.hipA = [1.0, -0.7]; P.knee = [-1.5, -0.3]; }
      break;
    case 'summon': // arms raised in a V
      P.sh = [2.5, 2.2]; P.el = [0.25, -0.25]; P.headTilt = 0.3; P.lean -= 0.1; P.crouch -= 2; break;
    case 'orbit': { // spin the arms around
      const sp = clock * 22; P.sh = [1.6 + Math.sin(sp) * 1.1, 1.6 - Math.sin(sp) * 1.1]; P.el = [0.2, 0.2]; P.crouch += 4; break; }
    case 'shield': P.sh = [1.4, 1.2]; P.el = [1.3, 1.5]; P.crouch += 6; break;
    default: // projectile: a throw with the back arm swinging back and a lunge
      P.lean += 0.16 * big; P.sh = [aim, -0.9]; P.el = [0, 0.5]; P.hipA = [0.6, -0.45]; P.knee = [-0.3, -0.15]; P.crouch += 4;
  }
  if (f.castUlt) { P.crouch += 4; P.headTilt += 0.1; }
}
function poseTargets(f) {
  const moving = Math.abs(f.vx) > 40 && f.onGround, ph = f.runPhase, sp = clamp(Math.abs(f.vx) / MOVE, 0, 1.2);
  const P = { lean: 0, crouch: 0, hipA: [0.2, -0.2], knee: [-0.15, -0.15], sh: [0.5, -0.3], el: [1.6, 0.6], headTilt: 0 };
  if (f.dash) { P.lean = 0.6; P.hipA = [0.9, -0.9]; P.knee = [-1.4, -0.3]; P.sh = [-1.4, -1.7]; P.el = [0.3, 0.2]; P.headTilt = -0.1; }
  else if (!f.onGround) {
    if (f.flip > 0) { P.hipA = [1.7, 1.5]; P.knee = [-2.3, -2.2]; P.sh = [1.2, 1.0]; P.el = [1.8, 1.8]; P.lean = 0.3; } // tucked flip
    else if (f.vy < 0) { P.hipA = [1.1, 0.1]; P.knee = [-1.8, -0.9]; P.sh = [2.5, 2.8]; P.el = [0.5, 0.35]; P.lean = 0.12; P.headTilt = 0.12; }
    else { const fl = Math.sin(clock * 14) * 0.15; P.hipA = [0.45, -0.3]; P.knee = [-0.7, -0.3]; P.sh = [1.7 + fl, 2.1 - fl]; P.el = [0.5, 0.6]; P.lean = -0.06; P.headTilt = -0.05; }
  } else if (moving) {
    const s = Math.sin(ph), c = Math.cos(ph), fwd = Math.sign(f.vx) * f.face; // +1 running forward, -1 backpedalling
    P.hipA = [s * 0.85 * sp, -s * 0.85 * sp];
    P.knee = [-(Math.max(0, -c) * 1.5 + 0.2) * sp, -(Math.max(0, c) * 1.5 + 0.2) * sp];
    P.sh = [-s * 1.0 * sp + 0.2, s * 1.0 * sp + 0.2]; P.el = [1.5 + Math.max(0, s) * 0.5, 1.5 + Math.max(0, -s) * 0.5];
    P.lean = (fwd > 0 ? 0.22 : -0.08) * sp; P.crouch = 3 - Math.abs(c) * 4 * sp; P.headTilt = -P.lean * 0.4;
  } else {
    // fighting stance: knees bent, guard up, gentle breathing
    const br = Math.sin(clock * 2.6 + f.slot * 1.7);
    P.crouch = 5 + br * 1.4; P.lean = 0.1 + br * 0.02;
    P.hipA = [0.5, -0.38]; P.knee = [-0.75, -0.35]; P.sh = [1.05 + br * 0.04, 0.55 - br * 0.04]; P.el = [1.95, 2.05]; P.headTilt = -0.04;
  }
  if (f.castAnim > 0) castPose(f, P);
  if (f.shield) { P.sh = [1.4, 1.2]; P.el = [1.3, 1.5]; }
  if (f.stun > 0) {
    // knocked the way the hit pushed: the head whips along with the push
    const d = (f.hitDir || -f.face) * (Math.sign(f.faceS) || 1);
    P.lean = 0.42 * d; P.sh = [d > 0 ? 2.2 : -0.6, d > 0 ? -0.6 : 2.4]; P.el = [0.4, 0.6]; P.headTilt = f.hitHead ? 0.45 * d : 0.15 * d;
    P.knee = [-0.6, -0.4]; P.crouch += 4;
  }
  if (f.land > 0) P.crouch += f.land * 50;
  return P;
}
// Joints move on springs, so limbs overshoot a little and settle (follow-through and overlapping action).
const SPRING = { lean: [260, 0.6], crouch: [320, 0.55], hipA: [300, 0.62], knee: [210, 0.5], sh: [250, 0.55], el: [170, 0.45], headTilt: [160, 0.5] };
function smoothPose(f) {
  const T = poseTargets(f), dt = Math.min(frameDt, 1 / 30);
  if (!f.pose) { f.pose = JSON.parse(JSON.stringify(T)); f.poseV = JSON.parse(JSON.stringify(T)); for (const k in f.poseV) f.poseV[k] = Array.isArray(f.poseV[k]) ? f.poseV[k].map(() => 0) : 0; }
  const P = f.pose, V = f.poseV;
  const step = (key, i) => {
    const [k, z] = SPRING[key], d = 2 * Math.sqrt(k) * z;
    const p = i === undefined ? P[key] : P[key][i], v = i === undefined ? V[key] : V[key][i], t = i === undefined ? T[key] : T[key][i];
    const nv = v + (k * (t - p) - d * v) * dt, np = p + nv * dt;
    if (i === undefined) { V[key] = nv; P[key] = np; } else { V[key][i] = nv; P[key][i] = np; }
  };
  for (const key in T) { if (Array.isArray(T[key])) T[key].forEach((_, i) => step(key, i)); else step(key); }
  return P;
}
function nudge(f, key, amt, i) { if (!f.poseV) return; if (i === undefined) f.poseV[key] += amt; else f.poseV[key][i] += amt; }
// Cosmetic effects that live only on this screen (impact stars, ground rings). Never affect gameplay.
let fx = [];
function fxPush(e) { if (fx.length < 60) fx.push(e); }
function impactFx(x, y, el, k = 1) {
  fxPush({ kind: 'impact', x, y, r: 34 * k, el, life: 0.22, max: 0.22, rot: Math.random() * 6 });
  for (let i = 0; i < 5 * k; i++) { const a = Math.random() * 6.28, sp = 380 + Math.random() * 380; spawnP(x, y, el, Math.cos(a) * sp, Math.sin(a) * sp, 0.18 + Math.random() * 0.12, 3, 'streak'); }
}
function stepDrawFx() {
  for (const e of fx) {
    e.life -= frameDt; if (e.life <= 0) continue;
    const k = 1 - e.life / e.max, col = e.el === 'dust' ? C.soft : elCol(e.el);
    ctx.save(); ctx.translate(e.x, e.y);
    if (e.kind === 'ring') {
      ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = col; ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(0, 0, e.r * (0.3 + k), e.r * (0.3 + k) * 0.22, 0, 0, 7); ctx.stroke();
    } else if (e.kind === 'impact') {
      ctx.rotate(e.rot); glowOn();
      ctx.globalAlpha = 1 - k; ctx.fillStyle = k < 0.25 ? (isDark ? '#ffffff' : C.paper) : col;
      starPath(e.r * (0.6 + k * 0.6), e.r * 0.18, 6); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 3 * (1 - k);
      ctx.beginPath(); ctx.arc(0, 0, e.r * (0.4 + k * 1.1), 0, 7); ctx.stroke(); glowOff();
    }
    ctx.restore();
  }
  fx = fx.filter(e => e.life > 0);
}
// Smear trails on hands and feet when they move fast.
function pushTrail(f, key, x, y) {
  f.trails = f.trails || {}; const t = f.trails[key] = f.trails[key] || [];
  t.unshift([x, y]); if (t.length > 7) t.pop();
}
function drawTrails(f) {
  if (!f.trails) return;
  const col = elCol(f.element);
  for (const key in f.trails) {
    const t = f.trails[key]; if (t.length < 3) continue;
    const sp = Math.hypot(t[0][0] - t[2][0], t[0][1] - t[2][1]); if (sp < 14) continue;
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 1; i < t.length; i++) { ctx.globalAlpha = (1 - i / t.length) * Math.min(1, sp / 40) * 0.55; ctx.strokeStyle = key === 'hand' ? col : C.ink; ctx.lineWidth = 6 * (1 - i / t.length) + 1; ctx.beginPath(); ctx.moveTo(t[i - 1][0], t[i - 1][1]); ctx.lineTo(t[i][0], t[i][1]); ctx.stroke(); }
    ctx.restore();
  }
}
function dust(x, y, n, spread = 1) { for (let i = 0; i < n; i++) spawnP(x + (Math.random() - 0.5) * 16, y - 2, 'dust', (Math.random() - 0.5) * 160 * spread, -20 - Math.random() * 50, 0.45 + Math.random() * 0.3, 4 + Math.random() * 3, 'smoke'); }
function drawShadow(f) {
  let gy = GROUND;
  for (const p of PLATFORMS) if (f.x > p.x - 8 && f.x < p.x + p.w + 8 && p.y >= f.y - 1 && p.y < gy) gy = p.y;
  const h = clamp((gy - f.y) / 300, 0, 1);
  ctx.save(); ctx.globalAlpha = 0.22 * (1 - h * 0.7); ctx.fillStyle = C.ink;
  ctx.beginPath(); ctx.ellipse(f.x, gy + 1, 20 * (1 - h * 0.5), 4.5 * (1 - h * 0.5), 0, 0, 7); ctx.fill(); ctx.restore();
}
function animEvents(f) {
  // react to what just happened: landing, jumping, casting, getting hit, footsteps
  if (f.wasGround === false && f.onGround) { const impact = clamp((f.lastVy || 0) / 1200, 0.3, 1.2); nudge(f, 'crouch', 260 * impact); f.sqV = (f.sqV || 0) - 5 * impact; dust(f.x, f.y, Math.round(5 * impact), 1.4); if (impact > 0.8) fxPush({ kind: 'ring', x: f.x, y: f.y, r: 44 * impact, el: 'dust', life: 0.3, max: 0.3 }); }
  if (f.wasGround === true && !f.onGround && (f.vy || 0) < -200) { f.sqV = (f.sqV || 0) + 4; dust(f.x, f.y, 3, 0.6); }
  if ((f.castAnim || 0) > (f.prevCast || 0) + 0.05) {
    // anticipation kick: wind back against the coming motion, the springs then snap it through
    const t = f.castType, k = f.castUlt ? 1.5 : 1;
    if (t === 'burst' || t === 'wave') { nudge(f, 'crouch', 220 * k); f.sqV = (f.sqV || 0) - 4 * k; }
    else if (t === 'strike' || t === 'rain' || t === 'summon') { nudge(f, 'sh', 16 * k, 0); nudge(f, 'sh', 14 * k, 1); nudge(f, 'crouch', -120); }
    else { nudge(f, 'sh', -18 * k, 0); nudge(f, 'lean', -5 * k); nudge(f, 'el', 14, 0); }
    if (f.castUlt) { fxPush({ kind: 'ring', x: f.x, y: f.y, r: 140, el: f.element, life: 0.5, max: 0.5 }); fxPush({ kind: 'ring', x: f.x, y: f.y, r: 90, el: f.element, life: 0.35, max: 0.35 }); }
  }
  // double jump: a quick front flip
  if (f.jumps === 2 && f.prevJumps === 1) { f.flip = 0.42; nudge(f, 'crouch', -80); }
  if (f.flip > 0) f.flip = Math.max(0, f.flip - frameDt);
  if (f.onGround) f.flip = 0;
  // turnaround skid
  const dir = Math.sign(Math.round(f.vx / 60));
  if (f.onGround && dir && f.prevDir && dir !== f.prevDir) { dust(f.x + dir * 8, f.y, 3, 0.8); nudge(f, 'lean', -6 * dir * f.face); }
  if (dir) f.prevDir = dir;
  f.prevJumps = f.jumps;
  if (f.stun > 0 && !(f.prevStun > 0)) { nudge(f, 'lean', -14); nudge(f, 'headTilt', -12); f.hitFlash = 0.1; f.sqV = (f.sqV || 0) - 3; }
  const ph = Math.floor((f.runPhase || 0) / Math.PI);
  if (f.onGround && Math.abs(f.vx) > 120 && ph !== f.lastStep) { f.lastStep = ph; if (Math.random() < 0.7) dust(f.x - f.face * 6, f.y, 1, 0.5); }
  f.wasGround = f.onGround; f.lastVy = f.vy; f.prevCast = f.castAnim; f.prevStun = f.stun;
  // squash and stretch on a spring around 1 (stretch when moving fast vertically)
  const target = f.onGround ? 1 : 1 + clamp(Math.abs(f.vy || 0) / 4000, 0, 0.12);
  const dt = Math.min(frameDt, 1 / 30); f.sq = f.sq || 1; f.sqV = f.sqV || 0;
  f.sqV += (300 * (target - f.sq) - 18 * f.sqV) * dt; f.sq = clamp(f.sq + f.sqV * dt, 0.75, 1.25);
  f.hitFlash = Math.max(0, (f.hitFlash || 0) - frameDt);
}
function drawFighter(f) {
  const col = elCol(f.element);
  if (f.faceS === undefined) f.faceS = f.face;
  f.faceS += (f.face - f.faceS) * (1 - Math.exp(-frameDt * 18));
  animEvents(f);
  const P = smoothPose(f), fs = Math.abs(f.faceS) < 0.15 ? Math.sign(f.faceS || 1) * 0.15 : f.faceS;
  const shakeX = f.stun > 0 ? (Math.random() - 0.5) * 4 : 0;
  drawShadow(f);
  if (f.dash) { for (let g = 1; g <= 4; g++) { ctx.save(); ctx.globalAlpha = 0.2 / g; ctx.translate(-(f.vx || 0) * 0.012 * g, -(f.vy || 0) * 0.008 * g); drawBody(f, P, fs, shakeX, col, true); ctx.restore(); } }
  ctx.save();
  // squash and stretch around the feet, keeping the volume the same
  ctx.translate(f.x, f.y); ctx.scale(1 / Math.sqrt(f.sq), f.sq); ctx.translate(-f.x, -f.y);
  if (f.flip > 0) { const k = 1 - f.flip / 0.42, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, cy = f.y - 40; ctx.translate(f.x, cy); ctx.rotate(e * Math.PI * 2 * (Math.sign(f.faceS) || 1)); ctx.translate(-f.x, -cy); }
  drawTrails(f);
  if (f.invuln > 0 && !f.dash && Math.floor(clock * 30) % 2) ctx.globalAlpha = 0.45;
  drawBody(f, P, fs, shakeX, col, false);
  ctx.restore();
  if (f.orbit) drawOrbit(f);
  if (f.shield) drawShield(f);
  const tags = [];
  if (f.blind > 0) tags.push('blind');
  if (f.slow > 0) tags.push('slow');
  if (tags.length) { ctx.fillStyle = C.soft; ctx.font = '400 17px Anton, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(tags.join(' + '), f.x, f.y - 96); }
  if (f.blind > 0) { ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = 'rgba(255,240,170,0.7)'; ctx.beginPath(); ctx.arc(f.x, f.y - 70, 22 + Math.sin(clock * 20) * 3, 0, 7); ctx.fill(); ctx.restore(); }
}
function drawBody(f, P, fs, shakeX, col, ghost) {
  const L1 = 17, L2 = 17, U1 = 14, U2 = 14, TORSO = 24;
  const hipX = f.x + shakeX, hipY = f.y - 34 + P.crouch;
  const neckX = hipX + Math.sin(P.lean) * TORSO * fs, neckY = hipY - Math.cos(P.lean) * TORSO;
  const limb = (x, y, a1, a2, l1, l2) => { const kx = x + Math.sin(a1) * l1 * fs, ky = y + Math.cos(a1) * l1; const ex = kx + Math.sin(a1 + a2) * l2 * fs, ey = ky + Math.cos(a1 + a2) * l2; return [kx, ky, ex, ey]; };
  const flash = !ghost && f.hitFlash > 0;
  const ink = ghost ? col : flash ? (isDark ? '#ffffff' : C.red) : C.ink;
  ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const legs = [0, 1].map(i => limb(hipX, hipY, P.hipA[i], P.knee[i], L1, L2));
  const arms = [0, 1].map(i => limb(neckX, neckY + 3, P.sh[i] + P.lean, P.el[i], U1, U2));
  // curved limbs read smoother than straight segments
  const seg = (x0, y0, j, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(j[0], j[1], j[2], j[3]); ctx.stroke(); };
  ctx.globalAlpha *= 0.72; seg(hipX, hipY, legs[1], 5); seg(neckX, neckY + 3, arms[1], 4.5); ctx.globalAlpha /= 0.72;
  ctx.lineWidth = 5.5; ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.quadraticCurveTo((hipX + neckX) / 2 - Math.sin(P.lean) * 3 * fs, (hipY + neckY) / 2, neckX, neckY); ctx.stroke();
  seg(hipX, hipY, legs[0], 5);
  const hx = neckX + Math.sin(P.lean + P.headTilt) * 13 * fs, hy = neckY - Math.cos(P.lean + P.headTilt) * 13;
  ctx.fillStyle = flash ? ink : col; ctx.beginPath(); ctx.arc(hx, hy, HEAD_R, 0, 7); ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
  if (!ghost) {
    ctx.fillStyle = C.ink;
    const blink = (Math.floor(clock * 10 + f.slot * 7) % 37) === 0;
    if (f.stun > 0) { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx + fs * 3, hy - 5); ctx.lineTo(hx + fs * 8, hy); ctx.moveTo(hx + fs * 8, hy - 5); ctx.lineTo(hx + fs * 3, hy); ctx.stroke(); }
    else if (blink) { ctx.fillRect(hx + fs * 3, hy - 2, 5 * Math.sign(fs), 1.5); }
    else { ctx.beginPath(); ctx.arc(hx + fs * 5, hy - 2, 2.3, 0, 7); ctx.fill(); }
  }
  seg(neckX, neckY + 3, arms[0], 5);
  // element-coloured fists keep each fighter readable at a glance
  ctx.lineWidth = 2; ctx.fillStyle = ghost ? col : flash ? ink : col;
  ctx.beginPath(); ctx.arc(arms[0][2], arms[0][3], 4.2, 0, 7); ctx.fill(); ctx.strokeStyle = ink; ctx.stroke();
  if (!ghost) { pushTrail(f, 'hand', arms[0][2], arms[0][3]); pushTrail(f, 'foot0', legs[0][2], legs[0][3]); pushTrail(f, 'foot1', legs[1][2], legs[1][3]); }
  if (f.castAnim > 0 && !ghost) { const h = arms[0]; glowOn(); ctx.fillStyle = elGlow(f.element); ctx.beginPath(); ctx.arc(h[2], h[3], 9 + f.castAnim * 24, 0, 7); ctx.fill(); glowOff(); }
}

function drawEntities() {
  traps.forEach(drawTrap);
  zones.forEach(drawZone);
  strikes.forEach(drawStrike);
  rings.forEach(drawRing);
  waves.forEach(drawWave);
  projectiles.forEach(drawProjectile);
  beams.forEach(drawBeam);
  summons.forEach(drawSummon);
  flashes.forEach(drawFlash);
  drawParticles();
}

function drawAim(f) {
  if (f.isBot || f.aimMode === 'auto' || state !== 'fight') return;
  const cy = chestY(f), ca = Math.cos(f.aimAng), sa = Math.sin(f.aimAng);
  ctx.save();
  ctx.strokeStyle = elCol(f.element); ctx.globalAlpha = 0.45; ctx.lineWidth = 2; ctx.setLineDash([4, 8]);
  ctx.beginPath(); ctx.moveTo(f.x + ca * 30, cy + sa * 30); ctx.lineTo(f.x + ca * 110, cy + sa * 110); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  if (f.aimMode === 'mouse' && mouse.over) {
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 9, 0, Math.PI * 2);
    ctx.moveTo(mouse.x - 15, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y); ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 15, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 15); ctx.lineTo(mouse.x, mouse.y - 5); ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + 15);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTexts() {
  ctx.textAlign = 'center';
  for (const t of texts) {
    ctx.globalAlpha = clamp(t.life / 0.3, 0, 1);
    ctx.font = `400 ${t.size}px Anton, Impact, sans-serif`;
    ctx.lineWidth = 5; ctx.strokeStyle = C.paper; ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.col; ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function slotLabel(f, i) { if (f.isBot) return '·'; const sc = schemeFor(f.slot); return sc ? keyShort(binds[sc]['m' + (i + 1)][0]) : '·'; }

function drawHUD() {
  if (!fighters.length) return;
  fighters.forEach(f => {
    const left = f.slot === 0, col = elCol(f.element);
    const px = left ? 20 : W - 20 - 380;
    ctx.textAlign = left ? 'left' : 'right';
    const tx = left ? px : px + 380;
    ctx.fillStyle = C.ink; ctx.font = '400 17px Anton, Impact, "Arial Narrow", sans-serif';
    ctx.fillText(`${sideLabel(f.slot)} · ${elName(f.element)}`, tx, 32);
    const bw = 240, bx = left ? px : px + 380 - bw, by = 42;
    ctx.fillStyle = C.paper2; roundRect(bx, by, bw, 14, 7); ctx.fill();
    f.manaGhost = f.manaGhost === undefined ? f.mana : f.mana > f.manaGhost ? f.mana : f.manaGhost - (f.manaGhost - f.mana) * Math.min(1, frameDt * 3);
    ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = C.red; roundRect(bx, by, Math.max(14, bw * f.manaGhost / MANA_MAX), 14, 7); ctx.fill(); ctx.restore();
    ctx.fillStyle = col; roundRect(bx, by, Math.max(14, bw * f.mana / MANA_MAX), 14, 7); ctx.fill();
    ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#ffffff'; roundRect(bx + 3, by + 2, Math.max(8, bw * f.mana / MANA_MAX - 6), 4, 2); ctx.fill(); ctx.restore();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; roundRect(bx, by, bw, 14, 7); ctx.stroke();
    ctx.fillStyle = C.soft; ctx.font = '600 13px "Bricolage Grotesque", system-ui, sans-serif';
    ctx.fillText(`${Math.floor(f.mana)} mana`, left ? bx + bw + 10 : bx - 10, by + 12);
    if (f.shownScore !== f.score) { f.scorePop = 1; f.shownScore = f.score; }
    f.scorePop = Math.max(0, (f.scorePop || 0) - frameDt * 3);
    const pop = 1 + Math.sin(f.scorePop * Math.PI) * 0.35 * f.scorePop;
    ctx.save(); ctx.translate(left ? px + 380 : px, 62); ctx.scale(pop, pop);
    ctx.fillStyle = f.scorePop > 0.4 ? col : C.ink; ctx.font = '400 50px Anton, Impact, sans-serif';
    ctx.textAlign = left ? 'right' : 'left';
    ctx.fillText(String(f.score), 0, 0); ctx.restore();
    const sw = 104, sh = 58, gap = 8, sy = GROUND + 12;
    for (let i = 0; i < 5; i++) {
      const m = f.moves[i]; if (!m) continue;
      const sxp = left ? 20 + i * (sw + gap) : W - 20 - (5 - i) * (sw + gap) + gap;
      const ready = m.ult ? f.ult >= ULT_MAX : true;
      const noMana = m.ult ? false : f.mana < m.mana_cost;
      ctx.fillStyle = C.panel; roundRect(sxp, sy, sw, sh, 8); ctx.fill();
      if (m.ult) { ctx.save(); ctx.globalAlpha = ready ? 0.35 + 0.15 * Math.sin(clock * 8) : 0.22; ctx.fillStyle = col; roundRect(sxp, sy + sh * (1 - f.ult / ULT_MAX), sw, sh * f.ult / ULT_MAX, 8); ctx.fill(); ctx.restore(); }
      else if (f.cds[i] > 0) { const k = f.cds[i] / m.cooldown; ctx.fillStyle = C.paper2; roundRect(sxp, sy, sw, sh * k, 8); ctx.fill(); }
      ctx.strokeStyle = f.fail[i] > 0 ? C.red : (m.ult ? (ready ? col : C.line) : (noMana || f.cds[i] > 0 ? C.line : col)); ctx.lineWidth = f.fail[i] > 0 ? 3 : (m.ult && ready ? 3.5 : 2.5);
      roundRect(sxp, sy, sw, sh, 8); ctx.stroke();
      ctx.globalAlpha = noMana ? 0.45 : 1;
      ctx.textAlign = 'left'; ctx.fillStyle = C.ink;
      ctx.font = '600 13px "Bricolage Grotesque", system-ui, sans-serif';
      ctx.fillText(slotLabel(f, i), sxp + 8, sy + 17);
      ctx.textAlign = 'right'; ctx.fillStyle = C.soft; ctx.font = '600 12px "Bricolage Grotesque", system-ui, sans-serif';
      ctx.fillText(m.ult ? (ready ? 'ready' : `${Math.floor(f.ult)}%`) : `${m.mana_cost}`, sxp + sw - 8, sy + 17);
      ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.font = '600 13px "Bricolage Grotesque", system-ui, sans-serif';
      let nm = m.name; while (ctx.measureText(nm).width > sw - 14 && nm.length > 3) nm = nm.slice(0, -2) + '…';
      ctx.fillText(nm, sxp + 8, sy + 36);
      ctx.fillStyle = C.soft; ctx.font = '600 12px "Bricolage Grotesque", system-ui, sans-serif';
      ctx.fillText(m.ult ? 'ultimate' : f.cds[i] > 0 ? `${f.cds[i].toFixed(1)}s` : m.type, sxp + 8, sy + 51);
      ctx.globalAlpha = 1;
    }
  });
  ctx.textAlign = 'center';
  const t = Math.ceil(timeLeft), mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0'), hurry = state === 'fight' && timeLeft <= 10;
  const tp = hurry ? 1 + Math.max(0, Math.cos((timeLeft % 1) * Math.PI * 2)) * 0.12 : 1;
  ctx.save(); ctx.translate(W / 2, 44); ctx.scale(tp, tp); ctx.fillStyle = hurry ? C.red : C.ink;
  ctx.font = '400 34px Anton, Impact, "Arial Narrow", sans-serif'; ctx.fillText(`${mm}:${ss}`, 0, 0); ctx.restore();
  ctx.fillStyle = C.soft; ctx.font = '600 14px "Bricolage Grotesque", system-ui, sans-serif';
  ctx.fillText(`Round ${round + 1} of 2`, W / 2, 64);
}

function drawReconnect() {
  if (!NET.on || !NET.reconnecting) return;
  ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = C.ink; roundRect(W / 2 - 170, 84, 340, 40, 20); ctx.fill();
  ctx.fillStyle = C.paper; ctx.font = '600 17px "Bricolage Grotesque", system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`Reconnecting to your opponent${'.'.repeat(1 + Math.floor(clock * 2) % 3)}`, W / 2, 110); ctx.restore();
}
function drawBanner() {
  let txt = null;
  if (state === 'countdown') txt = String(Math.ceil(countdown / 0.8));
  else if (banner > 0) txt = bannerText;
  if (paused) txt = 'Paused';
  if (!txt) return;
  if (txt !== drawBanner.last) { drawBanner.last = txt; drawBanner.t = 0; }
  drawBanner.t = (drawBanner.t || 0) + frameDt;
  const bt = clamp(drawBanner.t / 0.22, 0, 1), bs = 1 + (1 - bt) * (1 - bt) * 0.9 - Math.sin(bt * Math.PI) * 0.06;
  ctx.save(); ctx.translate(W / 2, H / 2 - 10); ctx.scale(bs, bs); ctx.rotate((1 - bt) * -0.06); ctx.globalAlpha = Math.min(1, bt * 2.5);
  ctx.textAlign = 'center'; ctx.font = `400 ${txt.length > 12 ? 70 : 104}px Anton, Impact, sans-serif`;
  ctx.fillStyle = withA(C.ink, 0.25); ctx.fillText(txt, 5, 6);
  ctx.lineWidth = 10; ctx.lineJoin = 'round'; ctx.strokeStyle = C.paper; ctx.strokeText(txt, 0, 0);
  ctx.fillStyle = C.red; ctx.fillText(txt, 0, 0); ctx.restore(); ctx.globalAlpha = 1;
  if (paused) { ctx.font = '400 20px Anton, Impact, "Arial Narrow", sans-serif'; ctx.fillStyle = C.ink; ctx.fillText('Press Esc or P to resume', W / 2, H / 2 + 34); }
  else if (state === 'countdown' && opts.mode === 'bot' && opts.aim === 'mouse' && countdown > 1.2) {
    ctx.font = '400 20px Anton, Impact, "Arial Narrow", sans-serif'; ctx.fillStyle = C.ink;
    ctx.fillText('Aim with the mouse', W / 2, H / 2 + 34);
  }
}

// A gentle camera: zooms in when fighters are close and punches in on big moments, keeping the floor in place.
const cam = { x: W / 2, y: H / 2, z: 1, punch: 0 };
function updateCam(dt) {
  let tz = 1, tx = W / 2;
  if (fighters.length === 2 && (fighting() || state === 'timeup')) {
    const d = Math.abs(fighters[0].x - fighters[1].x);
    tz = clamp(1.1 - d / W * 0.22, 1, 1.1); tx = (fighters[0].x + fighters[1].x) / 2;
    if (cam.focus && cam.focus.t > 0) { cam.focus.t -= dt; tz += 0.08; tx = tx * 0.4 + cam.focus.x * 0.6; }
  }
  cam.punch = Math.max(0, cam.punch - dt * 0.25);
  const k = 1 - Math.exp(-dt * 3);
  cam.z += (tz + cam.punch - cam.z) * k; cam.x += (tx - cam.x) * k;
  const half = W / (2 * cam.z); cam.x = clamp(cam.x, half, W - half);
  cam.y = GROUND - (GROUND - H / 2) / cam.z;
}
function render() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  updateCam(frameDt || 1 / 60);
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawArena();
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, GROUND); ctx.clip();
  drawEntities();
  ctx.restore();
  fighters.forEach(drawFighter);
  stepDrawFx();
  drawTexts();
  fighters.forEach(drawAim);
  ctx.restore();
  drawHUD();
  drawBanner();
  drawReconnect();
  const aiming = fighting() && fighters.some(f => !f.isBot && f.aimMode === 'mouse');
  cv.classList.toggle('aiming', aiming);
}

function resize() {
  const avail = document.getElementById('stage').clientWidth;
  const maxH = Math.max(260, innerHeight - 150);
  const w = Math.max(300, Math.min(avail, maxH * 2));
  cv.style.width = w + 'px'; cv.style.height = (w / 2) + 'px';
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(w / 2 * dpr);
  scale = cv.width / W;
}
addEventListener('resize', resize);

let last = performance.now(), slowmo = 0;
function loop(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000); last = now; frameDt = paused ? 0 : dt;
  slowmo = Math.max(0, slowmo - dt);
  if (!paused) update(slowmo > 0 && !(NET.on && NET.role === 'guest') ? dt * 0.4 : dt);
  render();
  requestAnimationFrame(loop);
}

/* ---------- online play ---------- */
// Both players open the game and share a short code. Everything travels as "presence": each side keeps one small
// object up to date (the host: the match state; the guest: its controller input), so dropped packets never matter.
const NET = { on: false, role: null, side: 0, code: '', room: null, opp: null, oppLastSeen: 0, myId: null,
  pres: {}, presKey: '', sendT: 0, events: [], evId: 0, seenEv: 0, inC: { j: 0, m: [0, 0, 0, 0, 0] }, lastInKey: '',
  hostPlan: null, oppPlan: null, ready: 0, oppReady: 0, snap: null, snapAt: 0, status: '', full: false, planKey: '', lost: false, connectedAt: 0 };
const EL_INDEX = Object.fromEntries(EL_IDS.map((e, i) => [e, i]));
const SHAPE_INDEX = Object.fromEntries(SHAPES.map((e, i) => [e, i]));
const r1 = v => Math.round(v * 10) / 10;

const BUILT_IN_RELAY = typeof __RELAY__ === 'string' ? __RELAY__ : '';
function defaultServerUrl() {
  try { const s = localStorage.getItem('stick-server'); if (s) return s; } catch (e) {}
  if (location.protocol === 'http:' || location.protocol === 'https:') return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  return 'ws://localhost:8787';
}
function makeCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 5; i++) c += a[Math.floor(Math.random() * a.length)]; return c; }

async function openRoom(code) {
  const name = 'stick-' + code.toLowerCase();
  if (!STANDALONE) {
    const lobby = await window.claude.use('room');
    if (!lobby) throw { code: 'no_room' };
    const r = await lobby.join(name);
    return { kind: 'claude', presence: p => r.presence(p).catch(() => {}), leave: () => r.leave().catch(() => {}),
      peers: () => r.peers().map(p => ({ id: p.peer, me: p.sameTab, data: p.presence || {} })), connected: () => r.connected() };
  }
  if (BUILT_IN_RELAY && settings.net !== 'p2p-only') {
    try { return await wsRoom(BUILT_IN_RELAY, name); }
    catch (e) { if (e && e.code === 'full') throw e; /* relay unreachable: fall back to a direct link */ }
  }
  if (settings.net !== 'server' && window.Peer) return p2pRoom(code, NET.role);
  return wsRoom(defaultServerUrl(), name);
}
// ICE servers: STUN finds each player's public address (enough for most home networks); TURN relays the game when
// a network blocks direct links (mobile data, offices, schools). PeerJS's free relay is tried, plus your own if set.
function iceServers() {
  const list = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' }
  ];
  // a relay baked in at build time from GitHub Actions secrets (TURN_URL, TURN_USERNAME, TURN_CREDENTIAL)
  const B = typeof __TURN__ === 'object' && __TURN__ ? __TURN__ : null;
  if (B && B.url) list.unshift({ urls: B.url.split(/[\s,]+/).filter(Boolean).map(u => /^turns?:/.test(u) ? u : 'turn:' + u), username: B.username || undefined, credential: B.credential || undefined });
  if (settings.turnUrl) {
    const urls = settings.turnUrl.split(/[\s,]+/).filter(Boolean).map(u => /^turns?:/.test(u) ? u : 'turn:' + u);
    if (urls.length) list.unshift({ urls, username: settings.turnUser || undefined, credential: settings.turnPass || undefined });
  }
  return list;
}
function peerOptions() {
  const o = { debug: 0, config: { iceServers: iceServers(), sdpSemantics: 'unified-plan' } };
  if (settings.peerHost) {
    const m = settings.peerHost.match(/^(?:(wss?|https?):\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/);
    if (m) { o.host = m[2]; if (m[3]) o.port = Number(m[3]); o.path = m[4] || '/'; o.secure = m[1] ? (m[1] === 'wss' || m[1] === 'https') : location.protocol === 'https:'; }
  }
  return o;
}
// Peer-to-peer: the host claims an id made from the code and the guest connects to it, so no game server is needed.
// Each side keeps one "presence" object and sends the whole thing on every change and on a steady heartbeat,
// so a dropped or late message can never leave the other side stuck.
function p2pRoom(code, role) {
  return new Promise((resolve, reject) => {
    const hostId = 'stickv1-' + code.toLowerCase();
    let peer;
    try { peer = role === 'host' ? new window.Peer(hostId, peerOptions()) : new window.Peer(peerOptions()); } catch (e) { reject({ code: 'no_signal' }); return; }
    const conns = new Map(); let mine = {}, timer = null, open = false, myId = null, done = false, destroyed = false, iceFailed = false, tries = 0, retryT = null, quickT = null;
    const api = { kind: 'p2p',
      presence: (patch, urgent) => { for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; } if (urgent) { clearTimeout(timer); flush(); } else if (!timer) timer = setTimeout(flush, 33); },
      peers: () => [{ id: myId, me: true, data: mine }, ...[...conns].filter(([, c]) => c.open).map(([pid, c]) => ({ id: pid, me: false, data: c.data }))],
      leave: () => { destroyed = true; clearInterval(beat); clearTimeout(retryT); clearTimeout(quickT); clearTimeout(relinkT); try { peer.destroy(); } catch (e) {} }, connected: () => open };
    function flush() { timer = null; const msg = JSON.stringify(mine); for (const c of conns.values()) if (c.open) { try { c.conn.send(msg); } catch (e) {} } }
    const beat = setInterval(() => { if (!timer) flush(); }, 250);
    const finish = (ok, err) => {
      if (done) return; done = true; clearTimeout(fail); clearTimeout(retryT); clearTimeout(quickT);
      if (ok) { open = true; resolve(api); } else { destroyed = true; clearInterval(beat); try { peer.destroy(); } catch (e) {} reject(err); }
    };
    function attach(conn) {
      const old = conns.get(conn.peer); if (old && old.conn !== conn) { try { old.conn.close(); } catch (e) {} }
      const rec = { conn, data: {}, open: false }; conns.set(conn.peer, rec);
      conn.on('open', () => { rec.open = true; flush(); if (role === 'guest') finish(true); });
      conn.on('data', d => { try { const v = typeof d === 'string' ? JSON.parse(d) : d; if (v && typeof v === 'object') rec.data = v; } catch (e) {} });
      conn.on('close', () => { if (conns.get(conn.peer) === rec) { conns.delete(conn.peer); if (role === 'guest' && done && open && !destroyed) relink(); } });
      conn.on('error', () => {});
      // spot networks that can't reach each other instead of waiting silently
      const watch = () => { const pc = conn.peerConnection; if (!pc) { setTimeout(watch, 100); return; }
        pc.addEventListener('iceconnectionstatechange', () => { if (pc.iceConnectionState === 'failed') { iceFailed = true; if (role === 'guest') { if (!done) retry(); else { try { conn.close(); } catch (e) {} relink(); } } } }); };
      watch();
    }
    // after the game has started, a dropped link is re-opened to the same host (the host keeps the same guest id)
    let relinkT = null;
    function relink() { if (relinkT || destroyed) return; relinkT = setTimeout(() => { relinkT = null; if (destroyed || [...conns.values()].some(c => c.open)) return; if (peer.disconnected) { try { peer.reconnect(); } catch (e) {} } try { connectToHost(); } catch (e) {} relink(); }, 2000); }
    function connectToHost() {
      tries++;
      attach(peer.connect(hostId, { reliable: true, serialization: 'raw' }));
    }
    // the host may still be registering, or the first attempt may stall: try again a few times
    function retry() { if (done || destroyed || quickT) return; quickT = setTimeout(() => { quickT = null; if (!done && !destroyed && peer.open && tries < 8) connectToHost(); }, 1500); }
    const fail = setTimeout(() => finish(false, { code: role === 'host' ? 'no_signal' : iceFailed ? 'blocked' : tries > 0 && peer.open ? 'no_game' : 'no_signal' }), role === 'host' ? 15000 : 30000);
    peer.on('open', pid => {
      myId = pid;
      if (role === 'host') finish(true);
      else { connectToHost(); const again = () => { if (!done && !destroyed) { if (tries < 4 && ![...conns.values()].some(c => c.open)) connectToHost(); retryT = setTimeout(again, 8000); } }; retryT = setTimeout(again, 8000); }
    });
    peer.on('connection', conn => { if (role === 'host') attach(conn); });
    peer.on('error', e => {
      const t = e && e.type;
      if (t === 'peer-unavailable') { if (role === 'guest' && !done) retry(); return; }
      if (t === 'unavailable-id') { finish(false, { code: 'code_taken' }); return; }
      if (!done && (t === 'browser-incompatible' || t === 'ssl-unavailable')) { finish(false, { code: 'no_signal' }); return; }
      // network / server hiccups: keep trying until the timeout
    });
    // the matchmaking link can drop while players are idle; get it back so new guests can still find the host
    peer.on('disconnected', () => { if (!destroyed) setTimeout(() => { try { if (!destroyed && peer.disconnected) peer.reconnect(); } catch (e) {} }, 800); });
  });
}
// Relay server (the Cloudflare Worker in server/). Messages go through the relay, so it works on any network.
// The client picks its own id so a reconnect is recognised as the same player.
function wsRoom(url, name) {
  return new Promise((resolve, reject) => {
    const myId = 'p' + Math.random().toString(36).slice(2, 10);
    const peers = new Map(); let ws = null, mine = {}, timer = null, open = false, done = false, closed = false, retryT = null;
    const api = { kind: 'ws',
      presence: (patch, urgent) => { for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; } if (urgent) { clearTimeout(timer); flush(); } else if (!timer) timer = setTimeout(flush, 33); },
      peers: () => [{ id: myId, me: true, data: mine }, ...[...peers].map(([id, data]) => ({ id, me: false, data }))],
      leave: () => { closed = true; clearInterval(beat); clearTimeout(retryT); try { ws && ws.close(); } catch (e) {} }, connected: () => open };
    function flush() { timer = null; if (open && ws && ws.readyState === 1) { try { ws.send(JSON.stringify({ t: 'p', data: mine })); } catch (e) {} } }
    let lastHeard = Date.now(), beats = 0;
    const beat = setInterval(() => {
      if (!timer) flush();
      if (++beats % 8 === 0 && open && ws && ws.readyState === 1) { try { ws.send('{"t":"ping"}'); } catch (e) {} }
      // nothing heard for 6 s: the link is dead even if the browser hasn't noticed, so drop it and re-join
      if (open && Date.now() - lastHeard > 6000) { open = false; const dead = ws; ws = null; try { dead.onclose = null; dead.close(); } catch (e) {} if (!closed) { clearTimeout(retryT); retryT = setTimeout(connect, 300); } }
    }, 250);
    const target = url.replace(/^http/, 'ws').replace(/\/+$/, '') + '/?room=' + encodeURIComponent(name);
    const fail = setTimeout(() => { if (!done) { done = true; closed = true; clearInterval(beat); try { ws && ws.close(); } catch (e) {} reject({ code: 'no_server' }); } }, 10000);
    function connect() {
      try { ws = new WebSocket(target); } catch (e) { if (!done) { done = true; clearTimeout(fail); clearInterval(beat); reject({ code: 'bad_url' }); } return; }
      ws.onopen = () => { lastHeard = Date.now(); try { ws.send(JSON.stringify({ t: 'join', room: name, id: myId })); } catch (e) {} };
      ws.onmessage = ev => {
        lastHeard = Date.now();
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'welcome') { open = true; peers.clear(); (m.peers || []).forEach(p => peers.set(p.id, p.data || {})); flush(); if (!done) { done = true; clearTimeout(fail); resolve(api); } }
        else if (m.t === 'p') peers.set(m.id, m.data || {});
        else if (m.t === 'left') peers.delete(m.id);
        else if (m.t === 'full') { closed = true; if (!done) { done = true; clearTimeout(fail); clearInterval(beat); reject({ code: 'full' }); } else NET.full = true; }
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        open = false;
        if (closed) return;
        if (!done) { retryT = setTimeout(connect, 1200); return; }
        retryT = setTimeout(connect, 1000); // keep the same id and re-join: the game shows "Reconnecting…" meanwhile
      };
    }
    connect();
  });
}
function netPresence(patch, urgent) {
  if (!NET.room) return;
  Object.assign(NET.pres, patch);
  for (const k in patch) if (patch[k] === null) delete NET.pres[k];
  NET.room.presence(patch, urgent);
}
async function netStart(role, code) {
  netStop();
  NET.role = role; NET.side = role === 'host' ? 0 : 1; NET.code = code; NET.status = 'Connecting…'; NET.full = false; NET.lost = false;
  showLobby();
  try {
    const room = await openRoom(code);
    if (NET.code !== code) { room.leave(); return; }
    NET.room = room; NET.on = true; NET.pres = {}; NET.connectedAt = performance.now();
    netPresence({ r: role, v: 1 });
    NET.status = role === 'host' ? 'Waiting for your friend to join…' : 'Looking for the host…';
  } catch (e) {
    if (e && e.code === 'code_taken' && role === 'host') { netStart('host', makeCode()); return; }
    NET.status = e && e.code === 'no_game' ? 'No game found with that code. Make sure your friend is still on the code screen, check the code and try again.'
      : e && e.code === 'full' ? 'That game already has two players.'
      : e && e.code === 'blocked' ? 'Found the game, but your two networks won’t let a direct link through. Try again, switch one of you to another network (for example a phone hotspot), or add a TURN relay under Server settings.'
      : e && e.code === 'no_signal' ? 'Couldn’t reach the matchmaking service. Check your internet connection, turn off any VPN or ad blocker for this page, and try again.'
      : e && e.code === 'no_server' ? `Couldn’t reach the game server at ${defaultServerUrl()}. Check the address in Settings, or start the server.`
      : e && e.code === 'no_room' ? 'Online play isn’t available in this view. Open the game in Claude, or use the desktop version with a server.'
      : 'Couldn’t join that game. Check the code and try again.';
    NET.code = '';
  }
  if (state === 'lobby') showLobby();
}
function netStop() {
  if (NET.room) NET.room.leave();
  NET.lastSnapObj = null; NET.oppPlanKey = '';
  NET.reconnecting = false; NET.lastAgain = undefined; NET.slowNote = false;
  Object.assign(NET, { on: false, room: null, opp: null, role: null, snap: null, hostPlan: null, oppPlan: null, ready: 0, oppReady: 0, events: [], seenEv: 0, evId: 0, planKey: '', presKey: '', lastInKey: '' });
}
function compactPlan(side) {
  const p = plan[side]; if (!p) return null;
  return { el: p.element, ok: p.result.valid ? 1 : 0, m: p.result.moves.map(m => ({ name: m.name, type: m.type, stats: m.stats, effects: m.effects, cooldown: m.cooldown, mana_overcharge: m.mana_overcharge, visual: m.visual })) };
}
function planFromCompact(c) {
  if (!c || !EL_IDS.includes(c.el)) return null;
  const r = validate(c.m, c.el);
  return r.valid ? { element: c.el, moves: r.moves } : { element: c.el, moves: validate(deep(DEFAULTS[c.el]), c.el).moves };
}
function oppPeer() {
  if (!NET.room) return null;
  const peers = NET.room.peers();
  const me = peers.find(p => p.me); if (me) NET.myId = me.id;
  const others = peers.filter(p => !p.me && p.data);
  if (NET.role === 'host') {
    if (NET.opp) return others.find(p => p.id === NET.opp) || null;
    const g = others.find(p => p.data.r === 'guest');
    if (g) { NET.opp = g.id; netPresence({ opp: g.id }); }
    return g || null;
  }
  const h = others.find(p => p.data.r === 'host');
  if (h && h.data.opp && NET.myId && h.data.opp !== NET.myId) { NET.full = true; return null; }
  return h || null;
}

function netTick(dt) {
  if (!NET.room) return;
  const o = oppPeer(), now = performance.now();
  if (o) NET.oppLastSeen = now;
  const inMatch = !['lobby', 'menu', 'controls', 'settings'].includes(state);
  const gone = now - NET.oppLastSeen, settled = now - NET.connectedAt > 7000;
  NET.reconnecting = inMatch && settled && gone > 2500 && !NET.lost;
  if (inMatch && !NET.lost && settled && gone > 30000) { NET.lost = true; showLost(); return; }
  if (state === 'lobby') {
    if (NET.full) { NET.status = 'That game already has two players.'; showLobby(); netStop(); return; }
    if (o) { onlineSetup(); return; }
    if (NET.role === 'guest' && !NET.slowNote && now - NET.connectedAt > 12000) { NET.slowNote = true; NET.status = 'No host has joined this code yet. Check the code with your friend. This screen keeps waiting.'; showLobby(); }
    return;
  }
  if (!o) return;
  const d = o.data;
  if (d.plan) { const key = JSON.stringify(d.plan); if (key !== NET.oppPlanKey) { NET.oppPlanKey = key; NET.oppPlan = d.plan; refreshOppPanel(); } }
  if ((d.ready || 0) !== NET.oppReady) { NET.oppReady = d.ready || 0; refreshOppPanel(); }
  // keep my plan visible to the other side while preparing
  NET.sendT -= dt;
  if ((state === 'prep' || state === 'half') && NET.sendT <= 0) {
    NET.sendT = 0.4;
    const c = compactPlan(NET.side), key = JSON.stringify(c);
    if (key !== NET.planKey) { NET.planKey = key; netPresence({ plan: c }); }
    if (NET.role === 'host') netPresence({ snap: { st: state, rd: round, sc: fighters.map(f => [f.score, f.roundScore[0], f.roundScore[1]]) } });
  }
  if (NET.role === 'host') {
    if ((state === 'prep' || state === 'half') && NET.ready === round + 1 && NET.oppReady === round + 1 && plan[0].result.valid && !plan[0].busy) startOnlineRound();
    if (fighting() || state === 'timeup') { NET.snapT = (NET.snapT || 0) - dt; if (NET.snapT <= 0) { NET.snapT = 0.033; netPresence({ snap: buildSnap() }, true); } }
    else if (state === 'results') {
      NET.snapT = (NET.snapT || 0) - dt; if (NET.snapT <= 0) { NET.snapT = 0.5; netPresence({ snap: buildSnap() }); }
      if (d.again && d.again !== NET.lastAgain) { NET.lastAgain = d.again; round = 0; fighters.forEach(f => { f.score = 0; f.roundScore = [0, 0]; f.heads = 0; f.bodies = 0; f.bonus = 0; }); NET.ready = 0; netPresence({ ready: 0 }); showPrep(); }
    }
  } else {
    if (d.plan) NET.hostPlan = d.plan;
    if (d.snap && d.snap !== NET.lastSnapObj) { NET.lastSnapObj = d.snap; guestApply(d.snap); }
    if (fighting() || state === 'timeup') guestSendInput();
  }
}

function onlineSetup() {
  const myEl = sideEls[0] || 'fire';
  plan = [null, null];
  plan[NET.side] = newPlan(myEl);
  const otherEl = randomOther(myEl);
  plan[1 - NET.side] = newPlan(otherEl);
  fighters = [0, 1].map(i => makeFighter(i, plan[i].element));
  fighters.forEach((f, i) => resetFighter(f, plan[i].result.moves));
  round = 0; NET.ready = 0; NET.planKey = '';
  showPrep();
}
function setReady(on) {
  NET.ready = on ? round + 1 : 0;
  netPresence({ ready: NET.ready, plan: compactPlan(NET.side) });
  refreshOppPanel();
}
function startOnlineRound() {
  const g = planFromCompact(NET.oppPlan) || { element: plan[1].element, moves: plan[1].result.moves };
  plan[1] = Object.assign(plan[1] || newPlan(g.element), { element: g.element });
  plan[1].result = { valid: true, errors: [], warnings: [], moves: g.moves, total: 0, ultCost: 0 };
  NET.ready = 0; netPresence({ ready: 0, plan: null });
  startRound();
  const f = fighters[1]; f.remote = true; f.isBot = false;
  const d = (oppPeer() || {}).data || {}, inp = d.in || {};
  f.rj = inp.j || 0; f.rm = (inp.m || [0, 0, 0, 0, 0]).slice();
}
function netRemoteInput(f) {
  const o = oppPeer(); const d = (o && o.data && o.data.in) || {};
  const casts = [];
  const m = Array.isArray(d.m) ? d.m : [0, 0, 0, 0, 0];
  f.rm = f.rm || [0, 0, 0, 0, 0];
  // presses are counters: a higher number means a new press. If a counter ever goes backwards, follow it instead of waiting.
  for (let k = 0; k < 5; k++) { const v = Number(m[k]) || 0; if (v > f.rm[k]) casts.push(k); f.rm[k] = v; }
  const j = Number(d.j) || 0, wantJump = j > (f.rj || 0); f.rj = j;
  f.remoteAim = Array.isArray(d.s) ? { kind: 'stick', x: Number(d.s[0]) || 0, y: Number(d.s[1]) || 0 } : Array.isArray(d.a) ? { kind: 'mouse', x: Number(d.a[0]) || 0, y: Number(d.a[1]) || 0 } : null;
  return { ax: clamp(Number(d.ax) || 0, -1, 1), wantJump, jumpHeld: !!d.jh, drop: !!d.dr, casts };
}
function buildSnap() {
  const F = fighters.map(f => [Math.round(f.x), Math.round(f.y), Math.round(f.vx), f.face, r1(f.aimAng), Math.round(f.mana), Math.round(f.ult), f.cds.map(r1),
    (f.onGround ? 1 : 0) | (f.stun > 0 ? 2 : 0) | (f.blind > 0 ? 4 : 0) | (f.slow > 0 ? 8 : 0) | (f.invuln > 0 ? 16 : 0) | (f.dash ? 32 : 0),
    f.shield ? [Math.round(f.shield.r), r1(f.shield.t), f.shield.reflect ? 1 : 0] : 0, r1(f.castAnim), r1(f.runPhase % 100),
    f.score, f.roundScore[0], f.roundScore[1], f.heads, f.bodies, f.bonus, EL_INDEX[f.element], f.stats.map(s => [s.casts, s.hits, s.pts]), Math.round(f.vy), f.orbit ? [f.orbit.n, Math.round(f.orbit.r), r1(f.orbit.ang), r1(f.orbit.or)] : 0, TYPE_IDS.indexOf(f.castType || 'projectile') + (f.castUlt ? 100 : 0), f.jumps, f.hitDir || 0]);
  const snap = { st: state, rd: round, tl: r1(timeLeft), cd: r1(countdown), bn: banner > 0 ? [bannerText, r1(banner)] : 0, sh: Math.round(shake), f: F,
    z: zones.map(z => [Math.round(z.x), Math.round(z.y), Math.round(z.r), EL_INDEX[z.el], r1(z.life), r1(z.max), r1(z.spin)]),
    b: beams.map(b => { const e = b.x1 === undefined ? rayEnd(b.x0, b.y0, b.ang) : { x: b.x1, y: b.y1 }; return [Math.round(b.x0), Math.round(b.y0), Math.round(e.x), Math.round(e.y), Math.round(b.thick), EL_INDEX[b.el], b.windup > 0 ? 1 : 0, r1(b.life)]; }),
    rg: rings.map(r => [Math.round(r.x), Math.round(r.y), Math.round(r.r), EL_INDEX[r.el], r1(r.life), r1(r.max), r.arc || 0]),
    ev: NET.events.slice(), p: [],
    sk: strikes.map(k => [Math.round(k.x), Math.round(k.y), Math.round(k.r), EL_INDEX[k.el], r1(k.t), r1(k.delay)]),
    wv: waves.map(w => [Math.round(w.x), Math.round(w.y), Math.round(w.h), EL_INDEX[w.el], w.dir]),
    tp: traps.map(t => [Math.round(t.x), Math.round(t.y), Math.round(t.r), EL_INDEX[t.el], r1(t.age), t.owner.slot]),
    sm: summons.map(m => [Math.round(m.x), Math.round(m.y), EL_INDEX[m.el], m.owner.slot, r1(m.life)]),
    fl: flashes.map(x => [Math.round(x.x), Math.round(x.y), Math.round(x.r), EL_INDEX[x.el], r1(x.life), r1(x.max), x.kind === 'strike' ? 1 : 0]) };
  const P = projectiles.map(p => [Math.round(p.x), Math.round(p.y), r1(p.ang), Math.round(p.sp), Math.round(p.r), EL_INDEX[p.el], SHAPE_INDEX[p.shape] || 0, p.owner.slot]);
  snap.p = P;
  while (JSON.stringify(snap).length > 3700 && snap.p.length) snap.p.pop();
  while (JSON.stringify(snap).length > 3800 && snap.ev.length) snap.ev.shift();
  return snap;
}
function guestBuildFighters() {
  const mine = plan[NET.side], hp = planFromCompact(NET.hostPlan);
  const host = hp || { element: plan[0] ? plan[0].element : 'fire', moves: validate(deep(DEFAULTS[plan[0] ? plan[0].element : 'fire']), plan[0] ? plan[0].element : 'fire').moves };
  plan[0] = Object.assign(plan[0] || {}, { element: host.element });
  fighters = [makeFighter(0, host.element), makeFighter(1, mine.element)];
  resetFighter(fighters[0], host.moves); resetFighter(fighters[1], deep(mine.result.moves));
  fighters.forEach(f => { f.isBot = false; f.view = true; });
}
function guestApply(s) {
  if (!s || typeof s !== 'object') return;
  const st = String(s.st || '');
  if (st === 'prep' || st === 'half') {
    const rd = Number(s.rd) || 0;
    if (Array.isArray(s.sc) && fighters.length) s.sc.forEach((v, i) => { if (fighters[i] && Array.isArray(v)) { fighters[i].score = v[0] | 0; fighters[i].roundScore = [v[1] | 0, v[2] | 0]; } });
    if (state !== st || round !== rd) { round = rd; NET.ready = 0; netPresence({ ready: 0, again: null }); if (st === 'prep' && fighters.length) fighters.forEach(f => { f.score = 0; f.roundScore = [0, 0]; f.heads = 0; f.bodies = 0; f.bonus = 0; }); showPrep(); }
    return;
  }
  if (st === 'countdown' || st === 'fight' || st === 'timeup') {
    if (!fighting() && state !== 'timeup') { guestBuildFighters(); projectiles = []; beams = []; zones = []; rings = []; texts = []; particles = []; strikes = []; waves = []; traps = []; summons = []; flashes = []; pending = []; hideScreen(); NET.seenEv = 0; NET.lastIn = null; }
    state = st; round = Number(s.rd) || 0; timeLeft = Number(s.tl) || 0; countdown = Number(s.cd) || 0;
    if (Array.isArray(s.bn)) { bannerText = String(s.bn[0]).slice(0, 40); banner = Number(s.bn[1]) || 0; }
    shake = Math.max(shake, Number(s.sh) || 0);
    applyFighters(s.f);
    applyEntities(s);
    return;
  }
  if (st === 'results' && state !== 'results') { applyFighters(s.f); state = 'results'; showResults(); }
}
function applyFighters(F) {
  if (!Array.isArray(F)) return;
  F.forEach((a, i) => {
    const f = fighters[i]; if (!f || !Array.isArray(a)) return;
    f.tx = Number(a[0]) || 0; f.ty = Number(a[1]) || 0; if (f.x === 0 || Math.abs(f.tx - f.x) > 200) { f.x = f.tx; f.y = f.ty; }
    const predicted = NET.role === 'guest' && i === NET.side && state === 'fight';
    f.svx = Number(a[2]) || 0; if (!predicted) f.vx = f.svx; f.face = a[3] < 0 ? -1 : 1; f.aimAng = Number(a[4]) || 0; f.mana = Number(a[5]) || 0; f.ult = Number(a[6]) || 0;
    if (Array.isArray(a[7])) f.cds = a[7].map(Number);
    const fl = a[8] | 0; f.sground = !!(fl & 1); if (!predicted) f.onGround = f.sground; f.stun = fl & 2 ? 0.1 : 0; f.blind = fl & 4 ? 0.1 : 0; f.slow = fl & 8 ? 0.1 : 0; f.invuln = fl & 16 ? 0.1 : 0; f.dash = fl & 32 ? { vx: f.vx, vy: 0 } : null;
    f.shield = Array.isArray(a[9]) ? { r: Number(a[9][0]), t: Number(a[9][1]), reflect: !!a[9][2] } : null;
    f.castAnim = Number(a[10]) || 0; if (!predicted) f.runPhase = Number(a[11]) || 0;
    f.score = a[12] | 0; f.roundScore = [a[13] | 0, a[14] | 0]; f.heads = a[15] | 0; f.bodies = a[16] | 0; f.bonus = a[17] | 0;
    const el = EL_IDS[a[18]]; if (el) f.element = el;
    if (Array.isArray(a[19])) f.stats = a[19].map(v => ({ casts: v[0] | 0, hits: v[1] | 0, pts: v[2] | 0 }));
    f.svy = Number(a[20]) || 0; if (!predicted) f.vy = f.svy;
    f.orbit = Array.isArray(a[21]) ? { n: a[21][0] | 0, r: Number(a[21][1]), ang: Number(a[21][2]), or: Number(a[21][3]) } : null;
    const ct = a[22] | 0; f.castType = TYPE_IDS[ct % 100] || 'projectile'; f.castUlt = ct >= 100; if (f.castAnim > (f.castDur || 0)) f.castDur = f.castAnim; if (f.castAnim <= 0) f.castDur = 0;
    if (!predicted) f.jumps = a[23] | 0; f.hitDir = Number(a[24]) || 0;
  });
}
function applyEntities(s) {
  const el = i => EL_IDS[i] || 'fire';
  zones = (s.z || []).map(z => ({ x: z[0], y: z[1], r: z[2], el: el(z[3]), life: z[4], max: z[5], spin: z[6], owner: fighters[0], view: true }));
  beams = (s.b || []).map(b => ({ x0: b[0], y0: b[1], x1: b[2], y1: b[3], ang: Math.atan2(b[3] - b[1], b[2] - b[0]), thick: b[4], el: el(b[5]), windup: b[6] ? 0.05 : 0, life: b[7], view: true }));
  rings = (s.rg || []).map(r => ({ x: r[0], y: r[1], r: r[2], el: el(r[3]), life: r[4], max: r[5], arc: r[6] }));
  strikes = (s.sk || []).map(k => ({ x: k[0], y: k[1], r: k[2], el: el(k[3]), t: k[4], delay: k[5] || 1 }));
  waves = (s.wv || []).map(w => ({ x: w[0], y: w[1], h: w[2], el: el(w[3]), dir: w[4] < 0 ? -1 : 1 }));
  traps = (s.tp || []).map(t => ({ x: t[0], y: t[1], r: t[2], el: el(t[3]), age: t[4], owner: fighters[t[5]] || fighters[0] }));
  summons = (s.sm || []).map(m => ({ x: m[0], y: m[1], el: el(m[2]), owner: fighters[m[3]] || fighters[0], life: m[4] }));
  flashes = (s.fl || []).map(x => ({ x: x[0], y: x[1], r: x[2], el: el(x[3]), life: x[4], max: x[5] || 0.4, kind: x[6] ? 'strike' : 'burst' }));
  projectiles = (s.p || []).map(p => ({ x: p[0], y: p[1], ang: p[2], sp: p[3], r: p[4], el: el(p[5]), shape: SHAPES[p[6]] || 'orb', owner: fighters[p[7]] || fighters[0], t: 0 }));
  (s.ev || []).forEach(e => {
    if (!Array.isArray(e) || e[0] <= NET.seenEv) return;
    NET.seenEv = e[0];
    texts.push({ x: e[1], y: e[2], text: String(e[3]).slice(0, 24), col: /^#[0-9a-f]{3,8}$|^rgba?\([\d.,\s]+\)$/i.test(e[4]) ? e[4] : C.ink, size: clamp(Number(e[5]) || 22, 14, 40), life: 0.9 });
    if (e[6] && EL_IDS.includes(e[6])) { burstParticles(e[1], e[2] + 26, e[6], 12); impactFx(e[1], e[2] + 26, e[6], /head/.test(String(e[3])) ? 1.4 : 1); }
  });
}
function guestUpdate(dt) {
  stepParticles(dt);
  for (const t of texts) { t.life -= dt; t.y -= 40 * dt; }
  texts = texts.filter(t => t.life > 0);
  shake = Math.max(0, shake - dt * 40);
  banner = Math.max(0, banner - dt);
  if (!fighting() && state !== 'timeup') { pressed.clear(); return; }
  const mine = fighters[NET.side];
  for (const f of fighters) { if (f !== mine && f.tx !== undefined) { f.x += (f.tx - f.x) * Math.min(1, dt * 18); f.y += (f.ty - f.y) * Math.min(1, dt * 18); } }
  if (mine) predictMine(mine, dt);
  for (const p of projectiles) { p.x += Math.cos(p.ang) * p.sp * dt; p.y += Math.sin(p.ang) * p.sp * dt; p.t += dt; if (Math.random() < 0.5) trailParticle(p.x, p.y, p.el, p.ang, p.sp); }
  for (const z of zones) z.spin += dt * 6;
  for (const x of flashes) x.life -= dt;
  for (const k of strikes) k.t += dt;
  for (const w of waves) w.x += w.dir * 300 * dt;
  for (const f of fighters) if (f.orbit) f.orbit.ang += dt * 4;
  for (const r of rings) r.life -= dt;
  rings = rings.filter(r => r.life > 0);
  const me = fighters[NET.side]; if (me) for (let i = 0; i < 5; i++) me.fail[i] = Math.max(0, me.fail[i] - dt);
}
// Client-side prediction for the guest: run my own movement locally with my own input so it feels instant,
// while the host stays in charge. The local copy is pulled gently toward the host's position and snapped if far off.
function predictMine(f, dt) {
  const r = NET.lastIn, live = state === 'fight' && r;
  if (f.tx === undefined) return;
  if (!live || f.dash || f.stun > 0) { f.x += (f.tx - f.x) * Math.min(1, dt * 18); f.y += (f.ty - f.y) * Math.min(1, dt * 18); f.pvx = f.svx || 0; f.pvy = f.svy || 0; f.pjumps = f.jumps; f.pground = f.sground; return; }
  if (f.pvx === undefined) { f.pvx = f.svx || 0; f.pvy = f.svy || 0; f.pjumps = 0; f.pground = f.sground !== false; }
  const sp = MOVE * (f.slow > 0 ? 0.5 : 1); let ground = f.pground;
  f.pvx += (r.ax * sp - f.pvx) * Math.min(1, dt * (ground ? 18 : 10));
  if (ground) f.pjumps = 0;
  if (r.wantJump && (ground || f.pjumps < 2)) { const second = !ground; f.pvy = -JUMP * (second ? 0.85 : 1) * (f.slow > 0 ? 0.8 : 1); f.pjumps = second ? 2 : 1; ground = false; r.wantJump = false; f.pcut = false; }
  if (!r.jumpHeld && !f.pcut && f.pvy < 0) { f.pvy *= 0.5; f.pcut = true; }
  f.pvy = Math.min(1500, f.pvy + GRAV * (r.drop && !ground && f.pvy > -100 ? 1.7 : 1) * dt);
  const prevY = f.y;
  f.x = clamp(f.x + f.pvx * dt, 24, W - 24); f.y = Math.max(90, f.y + f.pvy * dt);
  f.pground = false;
  if (f.y >= GROUND) { f.y = GROUND; f.pvy = 0; f.pground = true; }
  else if (f.pvy >= 0 && !r.drop) for (const p of PLATFORMS) if (prevY <= p.y + 1 && f.y >= p.y && f.x > p.x - 8 && f.x < p.x + p.w + 8) { f.y = p.y; f.pvy = 0; f.pground = true; break; }
  // reconcile with the host: its position is a little old, so compare it with where I was recently, not where I am now
  const H = f.phist = f.phist || []; H.push([f.x, f.y]); if (H.length > 36) H.shift();
  let best = Infinity, bx = 0, by = 0;
  for (const [hx, hy] of H) { const d = (f.tx - hx) ** 2 + (f.ty - hy) ** 2; if (d < best) { best = d; bx = f.tx - hx; by = f.ty - hy; } }
  const err = Math.sqrt(best);
  if (err > 140) { f.x = f.tx; f.y = f.ty; f.pvx = f.svx; f.pvy = f.svy; H.length = 0; }
  else if (err > 4) { const k = Math.min(1, dt * (err > 50 ? 8 : 3)); f.x += bx * k; f.y += by * k; for (const h of H) { h[0] += bx * k; h[1] += by * k; } }
  // drive the animation from the predicted motion
  f.vx = f.pvx; f.vy = f.pvy; f.onGround = f.pground; f.jumps = f.pjumps;
  if (Math.abs(f.vx) > 40 && f.onGround) f.runPhase = (f.predPhase = (f.predPhase || 0) + dt * Math.abs(f.vx) / 28);
}
function guestSendInput() {
  const sc = soloScheme(), r = readLocalInput(sc, 0);
  pressed.clear();
  if (r.wantJump) NET.inC.j++;
  r.casts.forEach(i => { NET.inC.m[i]++; });
  const inp = { ax: r.ax, jh: r.jumpHeld ? 1 : 0, dr: r.drop ? 1 : 0, j: NET.inC.j, m: NET.inC.m.slice() };
  if (r.pad && r.pad.aim) inp.s = [Math.round(r.pad.aim.x * 100), Math.round(r.pad.aim.y * 100)];
  else if (opts.aim === 'mouse') inp.a = [Math.round(mouse.x), Math.round(mouse.y)];
  const key = JSON.stringify(inp);
  if (key !== NET.lastInKey) { NET.lastInKey = key; netPresence({ in: inp }, true); }
  NET.lastIn = r;
}

/* ---------- Claude ultimate creation ---------- */
let sampleFn = null, sampleState = 'checking';
const BUILT_IN_GEMINI_KEY = typeof __GEMINI_KEY__ === 'string' ? __GEMINI_KEY__ : '';
const settings = { key: '', model: 'claude-sonnet-5-5', gkey: '', gmodel: 'gemini-3.5-flash-lite', net: 'p2p', peerHost: '' };
try {
  const g = k => localStorage.getItem(k);
  settings.key = g('stick-api-key') || ''; settings.model = g('stick-model') || settings.model;
  settings.gkey = g('stick-gemini-key') || ''; settings.gmodel = g('stick-gemini-model') || settings.gmodel;
  settings.net = 'p2p'; settings.peerHost = g('stick-peer-host') || ''; settings.turnUrl = g('stick-turn-url') || ''; settings.turnUser = g('stick-turn-user') || ''; settings.turnPass = g('stick-turn-pass') || '';
} catch (e) {}
function parseJsonLoose(t) {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/); let body = m ? m[1] : t;
  const i = Math.min(...['{', '['].map(c => { const k = body.indexOf(c); return k < 0 ? 1e9 : k; })); if (i < 1e9) body = body.slice(i);
  try { return JSON.parse(body.trim()); } catch (e) { const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']')); try { return JSON.parse(body.slice(0, end + 1)); } catch (e2) { throw { code: 'invalid_json' }; } }
}
// Google AI Studio (Gemini) keys have a free tier, so this is the default for the web and desktop versions.
const GEMINI_FALLBACK = 'gemini-3.8-flash';
function geminiSampler() {
  const call = async (prompt, o = {}, model = settings.gmodel) => {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', signal: o.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': settings.gkey || BUILT_IN_GEMINI_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 1 } }) });
    } catch (e) { throw { code: e && e.name === 'AbortError' ? 'cancelled' : 'upstream_error' }; }
    if (res.status === 404 && model !== GEMINI_FALLBACK) return call(prompt, o, GEMINI_FALLBACK);
    if (res.status === 400) { const t = await res.text().catch(() => ''); throw { code: /API_KEY_INVALID|API key not valid/i.test(t) ? 'bad_key' : 'upstream_error' }; }
    if (res.status === 401 || res.status === 403) throw { code: 'bad_key' };
    if (res.status === 429) throw { code: 'rate_limited' };
    if (!res.ok) throw { code: 'upstream_error' };
    const data = await res.json();
    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const text = parts.map(p => p.text || '').join('');
    if (!text) throw { code: 'refused' };
    return text;
  };
  const fn = async (p, o) => ({ text: await call(p, o) });
  fn.json = async (p, o) => parseJsonLoose(await call(p, o));
  return fn;
}
// Desktop and self-hosted builds talk to the Anthropic API directly with the player's own key.
function apiSampler() {
  const call = async (prompt, o = {}) => {
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: o.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': settings.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: settings.model, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }) });
    } catch (e) { throw { code: e && e.name === 'AbortError' ? 'cancelled' : 'upstream_error' }; }
    if (res.status === 401 || res.status === 403) throw { code: 'bad_key' };
    if (res.status === 429) throw { code: 'rate_limited' };
    if (!res.ok) throw { code: 'upstream_error' };
    const data = await res.json();
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  };
  const fn = async (p, o) => ({ text: await call(p, o) });
  fn.json = async (p, o) => parseJsonLoose(await call(p + '\n\nReply with JSON only.', o));
  return fn;
}
function initSample() {
  if (STANDALONE) { sampleFn = (settings.gkey || BUILT_IN_GEMINI_KEY) ? geminiSampler() : settings.key ? apiSampler() : null; sampleState = sampleFn ? 'ready' : 'nokey'; refreshForgeUI(); return; }
  window.claude.use('sample').then(s => { sampleFn = s; sampleState = s ? 'ready' : 'none'; refreshForgeUI(); })
    .catch(() => { sampleState = 'none'; refreshForgeUI(); });
}
function refreshForgeUI() {
  screenEl.querySelectorAll('[data-needs-claude]').forEach(b => { b.disabled = sampleState !== 'ready' || (plan[Number(b.dataset.side)] || {}).busy; });
  screenEl.querySelectorAll('[data-claude-note]').forEach(n => {
    n.textContent = sampleState === 'checking' ? 'Connecting to Claude…' : sampleState === 'nokey' ? 'To forge ultimates here, add a free Google AI Studio key (or an Anthropic key) under Settings on the main menu. You can still build the ultimate yourself with the sliders below.' : sampleState === 'none' ? 'Claude creates ultimates when this page is open in Claude. You can still build one yourself with the sliders below.' : '';
    n.hidden = sampleState === 'ready';
  });
}

function buildUltPrompt(element, desc, invent, theme) {
  const El = elName(element);
  return `You design the ULTIMATE move for one fighter in “Stick V1”, a 2D stick-figure fighting game. The player describes their ultimate in their own words and you turn it into game data. Keep the player’s idea recognisable, make it feel spectacular, and give it a vivid name and one flavor sentence saying how it looks and plays.

The fighter’s element is ${El}. Element rule: ${ELEMENTS[element].passive}
The ultimate costs no mana and has no cooldown: it fires once the ultimate meter fills, about once or twice a round.

Map the ultimate onto the one building block ("type") that best matches the idea:
- rain: many things falling from the sky around the target (meteors, arrows, bolts). "count" adds drops, "size" widens the area.
- strike: a marked circle at the target that blasts after a short delay (a pillar of light, a lightning strike, an eruption, a falling sword).
- wave: something racing along the ground (tsunami, spikes, shockwave); "size" is its height and jumping dodges it.
- orbit: things spinning around the caster for "duration" seconds that hit anyone close ("count" of them).
- summon: a floating helper or creature that keeps shooting at the enemy for "duration".
- trap: a hidden mine or rune that explodes when the enemy steps on it.
- zone: a lingering area near the target for "duration" seconds (storm, black hole, fire field); scores once per second inside.
- projectile: things thrown or shot at the target; "count" fires several side by side.
- burst: an instant blast around the caster.
- beam: an instant straight line at the target. Only use beam when the player clearly describes a beam, laser or ray.
- dash: a quick charge through the enemy.
- shield: a bubble around the caster that blocks attacks.

Effects, 0 to 2, strength 1 to 5: blind (enemy can’t use moves for a moment), pull, push, slow, reflect (shields only), homing (projectiles), curve (projectiles weave and slip around shields), pierce (projectiles keep going after a hit).
Stats are integers: damage 0-10 (0 means effect only and scores no points), speed 1-10, size 1-10, count 1-6, duration 0-5.
Cost: build = type base (projectile 2, dash 2, beam 3, burst 3, wave 3, trap 3, zone 4, shield 4, rain 4, strike 4, orbit 4, summon 6) + damage×2 + speed + size + (count−1)×3 + duration + effect costs (push 1, pull 2, slow 2, homing 2, curve 2, pierce 2, blind 3, reflect 4, each times its strength). The ultimate must cost ${ULT_BUDGET} build points or fewer, so choose what matters most for the idea. If the description asks for something unfair (instant win, invincibility), keep its spirit in a fair form and explain briefly in "note"; otherwise leave "note" empty.

${invent ? `Invent an ultimate for a ${El} fighter with the theme “${theme}”. In "description", write the idea the way a player would type it.` : `The player’s description: ${JSON.stringify(desc)}`}

Reply with only one JSON object shaped like this example:
{"name":"Serpent Storm","type":"rain","stats":{"damage":4,"speed":6,"size":4,"count":4,"duration":0},"effects":[{"type":"slow","strength":1}],"visual":{"shape":"orb"},"flavor":"Glowing serpents pour from the sky around the enemy.","note":""${invent ? ',"description":"snakes rain down from the sky"' : ''}}
Pick the type from the idea itself, not from this example.
visual.shape must be one of orb, spear, blade, star.`;
}

function aiName() { return !STANDALONE ? 'Claude' : (settings.gkey || BUILT_IN_GEMINI_KEY) ? 'Gemini' : 'Claude'; }
function claudeErrorStatus(e) {
  const code = e && e.code;
  if (code === 'cancelled') return null;
  if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) {
    sampleState = 'none';
    return { kind: 'err', text: 'Claude isn’t available to this page, so ultimate creation is off. You can still build it yourself with the sliders.' };
  }
  if (code === 'bad_key') { return { kind: 'err', text: 'Your AI key was rejected. Check it under Settings on the main menu.' }; }
  if (code === 'rate_limited') return { kind: 'err', text: 'Claude is busy right now. Wait a moment, then try again.' };
  if (code === 'refused') return { kind: 'err', text: 'Claude declined that description. Reword it and try again.' };
  if (code === 'invalid_json' || code === 'shape') return { kind: 'err', text: 'Claude’s answer couldn’t be read as a move. Try again, or shorten the description.' };
  return { kind: 'err', text: 'Couldn’t reach Claude. Try again.' };
}

async function forgeUlt(side, invent) {
  const p = plan[side];
  if (!sampleFn || p.busy) return;
  const desc = (p.ultDesc || '').trim();
  if (!invent && !desc) { p.status = { kind: 'err', text: 'Describe your ultimate first.' }; showPrep(); return; }
  const themes = ELEMENTS[p.element].themes, theme = themes[Math.floor(Math.random() * themes.length)];
  p.busy = true; p.ctl = new AbortController();
  p.status = { kind: 'busy', text: invent ? `${aiName()} is dreaming up a ${theme} ultimate…` : `${aiName()} is forging your ultimate…` };
  showPrep();
  try {
    let out = await sampleFn.json(buildUltPrompt(p.element, desc, invent, theme), { signal: p.ctl.signal, cache: false });
    if (Array.isArray(out)) out = out[0];
    if (!out || typeof out !== 'object' || !out.type) throw { code: 'shape' };
    out.element = p.element;
    out.description = invent ? String(out.description || out.flavor || '') : desc;
    if (invent) p.ultDesc = out.description;
    const raw = p.result.moves.length === 5 ? p.result.moves.map(toRaw) : deep(p.raw);
    raw[4] = out;
    const fitted = fitBudget(raw, p.element, [4]);
    p.raw = fitted.raw; p.text = JSON.stringify(p.raw, null, 2); p.result = validate(p.raw, p.element);
    p.status = { kind: 'ok', text: `Your ultimate is ${p.result.moves[4].name}.${fitted.notes.length ? ' ' + fitted.notes.join(' ') : ''}` };
  } catch (e) {
    p.status = claudeErrorStatus(e);
  } finally {
    p.busy = false; p.ctl = null;
    if (state === 'prep' || state === 'half') showPrep();
  }
}

/* ---------- flow ---------- */
function togglePause() {
  if (!fighting() || opts.mode === 'online') return;
  paused = !paused; down.clear(); pressed.clear();
}
function newPlan(el) {
  const raw = deep(DEFAULTS[el]);
  return { element: el, raw, text: JSON.stringify(raw, null, 2), editing: false, result: validate(raw, el), ultDesc: DEFAULT_ULT_DESC[el], busy: false, status: null, open: new Set() };
}
// ---------- bot loadouts ----------
// The bot rolls a fresh kit every time: a ranged poke, a second threat, a utility move and a wildcard,
// drawn from the hand-tuned starting moves of every element, re-skinned for its own element and fitted to the budget.
const BOT_ROLES = [
  ['projectile', 'beam'],
  ['burst', 'zone', 'wave', 'trap', 'strike', 'rain', 'projectile', 'beam'],
  ['dash', 'shield', 'orbit'],
  ['summon', 'strike', 'rain', 'zone', 'trap', 'wave', 'burst', 'orbit', 'projectile']
];
const BOT_WORDS = {
  light: ['Solar', 'Radiant', 'Prism', 'Halo', 'Dawn'], wind: ['Gale', 'Zephyr', 'Cyclone', 'Gust', 'Sky'],
  fire: ['Blaze', 'Ember', 'Inferno', 'Cinder', 'Magma'], water: ['Tide', 'Torrent', 'Bubble', 'Riptide', 'Mist'],
  earth: ['Boulder', 'Quake', 'Granite', 'Dune', 'Crag'], darkness: ['Shadow', 'Umbral', 'Night', 'Eclipse', 'Gloom'],
  antimatter: ['Void', 'Null', 'Rift', 'Quantum', 'Singularity'], steel: ['Iron', 'Razor', 'Chrome', 'Blade', 'Anvil'],
  lightning: ['Thunder', 'Volt', 'Static', 'Storm', 'Arc'], ice: ['Frost', 'Glacier', 'Hail', 'Rime', 'Blizzard']
};
const BOT_NOUNS = { projectile: ['Bolt', 'Shot', 'Shard', 'Volley'], beam: ['Ray', 'Lance', 'Beam'], burst: ['Burst', 'Nova', 'Pulse'],
  zone: ['Field', 'Pool', 'Vortex'], dash: ['Step', 'Rush', 'Blink'], shield: ['Ward', 'Guard', 'Barrier'], rain: ['Rain', 'Storm', 'Barrage'],
  strike: ['Strike', 'Hammer', 'Pillar'], orbit: ['Halo', 'Ring', 'Orbit'], wave: ['Wave', 'Surge', 'Quake'], trap: ['Mine', 'Snare', 'Rune'], summon: ['Sentinel', 'Familiar', 'Drone'] };
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function botMoveName(el, type, used) {
  for (let k = 0; k < 12; k++) { const n = `${pick(BOT_WORDS[el])} ${pick(BOT_NOUNS[type])}`; if (!used.has(n)) { used.add(n); return n; } }
  return `${elName(el)} ${type}`;
}
function rollBotMoves(el, foe) {
  const pool = EL_IDS.flatMap(id => DEFAULTS[id].slice(0, 4).map(m => ({ m, own: id === el })));
  const ults = EL_IDS.map(id => ({ m: DEFAULTS[id][4], own: id === el }));
  // light counter-picking: reflect shields make the bot lean away from plain projectiles, lots of projectiles make it want a shield
  const foeMoves = foe ? foe.result.moves.slice(0, 4) : [];
  const foeReflect = foeMoves.some(m => m.type === 'shield' && effOf(m, 'reflect'));
  const foeShots = foeMoves.filter(m => m.type === 'projectile' || m.type === 'beam').length;
  const weight = c => (c.own ? 2.2 : 1) * (foeReflect && c.m.type === 'projectile' && !effOf(c.m, 'curve') ? 0.4 : 1) * (foeShots >= 2 && c.m.type === 'shield' ? 1.8 : 1);
  const choose = list => { const tot = list.reduce((a, c) => a + weight(c), 0); let r = Math.random() * tot; for (const c of list) { r -= weight(c); if (r <= 0) return c; } return list[list.length - 1]; };
  const usedTypes = new Set(), usedNames = new Set(), out = [];
  for (const role of BOT_ROLES) {
    let cands = pool.filter(c => role.includes(c.m.type) && !usedTypes.has(c.m.type));
    if (!cands.length) cands = pool.filter(c => !usedTypes.has(c.m.type));
    const c = choose(cands), m = deep(c.m);
    usedTypes.add(m.type);
    // small random twist on the stats so no two bots feel the same
    const s = m.stats, j = () => Math.floor(Math.random() * 3) - 1;
    if (m.type !== 'shield' && m.type !== 'dash') s.damage = clamp(s.damage + j(), 1, 10);
    s.speed = clamp(s.speed + j(), 1, 10); s.size = clamp(s.size + j(), 1, 10);
    if (m.type === 'projectile' && Math.random() < 0.35 && m.effects.length < 2 && !m.effects.some(e => e.type === 'homing')) m.effects.push({ type: pick(['homing', 'curve', 'pierce']), strength: 1 });
    if (!c.own) { m.name = botMoveName(el, m.type, usedNames); m.flavor = `${elName(el)} style. ${TYPE_HINTS[m.type].split('. ')[0].replace(/\.$/, '')}.`; } else usedNames.add(m.name);
    out.push(m);
  }
  shuffle(out);
  const u = choose(ults), ult = deep(u.m);
  if (!u.own) { ult.name = botMoveName(el, ult.type, usedNames); ult.flavor = `${elName(el)} ultimate. ${TYPE_HINTS[ult.type].split('. ')[0].replace(/\.$/, '')}.`; }
  out.push(ult);
  return fitBudget(out, el, [0, 1, 2, 3, 4]).raw;
}
function botPlan(el, foe) {
  const p = newPlan(el);
  for (let tries = 0; tries < 8; tries++) {
    const raw = rollBotMoves(el, foe); let res = validate(raw, el);
    if (!res.valid) continue;
    // spend leftover points: a good kit uses its whole budget, mostly on damage and speed of the attacks
    for (let g = 0; g < 40 && res.total < REG_BUDGET - 3; g++) {
      const i = Math.floor(Math.random() * 4), m = raw[i], s = m.stats, key = m.type === 'dash' || m.type === 'shield' ? (m.type === 'shield' ? 'duration' : 'speed') : pick(['damage', 'damage', 'speed', 'size']);
      const max = key === 'duration' ? 5 : key === 'damage' ? 8 : 10; if (s[key] >= max) continue;
      s[key]++; const t = validate(raw, el); if (t.valid) res = t; else s[key]--;
    }
    p.raw = raw; p.result = validate(raw, el); p.text = JSON.stringify(raw, null, 2); break;
  }
  p.botRolled = true;
  return p;
}
const isBotSide = side => opts.mode === 'bot' && side === 1;
function setupMatch() {
  if (opts.mode === 'bot') sideEls[1] = randomOther(sideEls[0]);
  plan = sideEls.map((el, i) => isBotSide(i) ? null : newPlan(el));
  if (opts.mode === 'bot') plan[1] = botPlan(sideEls[1], plan[0]);
  fighters = sideEls.map((el, i) => makeFighter(i, el));
  round = 0;
  fighters.forEach((f, i) => resetFighter(f, plan[i].result.moves));
  showPrep();
}
function changeElement(side, el) {
  if (opts.mode === 'online' && NET.ready) setReady(false);
  if (plan[side].ctl) plan[side].ctl.abort();
  plan[side] = isBotSide(side) ? botPlan(el, plan[0]) : newPlan(el); sideEls[side] = el;
  fighters[side] = Object.assign(makeFighter(side, el), { score: fighters[side].score, roundScore: fighters[side].roundScore, heads: fighters[side].heads, bodies: fighters[side].bodies, bonus: fighters[side].bonus, stats: fighters[side].stats });
  fighters[side].element = el;
  showPrep();
}
function startRound() {
  if (!plan.every(p => p.result.valid) || plan.some(p => p.busy)) return;
  fighters.forEach((f, i) => { f.element = plan[i].element; resetFighter(f, deep(plan[i].result.moves)); });
  projectiles = []; beams = []; zones = []; rings = []; particles = []; texts = []; strikes = []; waves = []; traps = []; summons = []; flashes = []; pending = []; fx = [];
  fighters.forEach(f => { f.orbit = null; f.flip = 0; f.pose = null; });
  timeLeft = opts.roundLen; countdown = 2.4; state = 'countdown'; paused = false; hitstop = 0;
  down.clear(); pressed.clear();
  hideScreen();
}
function afterRound() {
  if (round === 0) { round = 1; state = 'half'; plan.forEach(p => { p.status = null; }); if (opts.mode === 'bot') plan[1] = botPlan(plan[1].element, plan[0]); showPrep(); }
  else { state = 'results'; showResults(); }
}

/* ---------- screens ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
function showScreen(html) { screenEl.innerHTML = html; screenEl.hidden = false; }
function hideScreen() { screenEl.hidden = true; screenEl.innerHTML = ''; }

function segButtons(key, items) {
  return items.map(([v, label]) => `<button data-set="${key}:${v}" aria-pressed="${String(opts[key]) === String(v)}">${label}</button>`).join('');
}
function elButtons(side) {
  return `<div class="el-pick">${EL_IDS.map(id => `<button style="--c: var(--el-${id})" data-el="${side}:${id}" aria-pressed="${sideEls[side] === id}">${ELEMENTS[id].name}</button>`).join('')}</div>`;
}
function bindSummary(sc) {
  const b = binds[sc], k = a => b[a].map(c => `<kbd>${esc(keyName(c))}</kbd>`).join(' or ');
  return `${k('left')} ${k('right')} move, ${k('jump')} jump (tap again in the air to double jump, hold for higher), ${k('drop')} drop or fast fall. Moves: ${['m1', 'm2', 'm3', 'm4'].map(k).join(', ')}. Ultimate: ${k('m5')}.`;
}
function showMenu() {
  if (NET.on) netStop();
  state = 'menu'; paused = false; capture = null;
  const solo = opts.mode !== 'pvp', online = opts.mode === 'online';
  showScreen(`<div class="narrow">
    <h1 class="title">Stick V1</h1>
    <p class="lede">Ten elements. Build four moves and an ultimate yourself. Fight two rounds with a half-time break to rework your moves. Head hits score 2, body hits score 1.</p>
    <div class="opt"><span>Mode</span><div class="seg">${segButtons('mode', [['bot', 'Me vs bot'], ['online', 'Online with a code']])}</div></div>
    <div class="opt"><span>${solo ? 'Your element' : 'Player 1'}</span><div>${elButtons(0)}</div></div>
    ${online ? '' : solo ? `<div class="opt"><span>Bot element</span><span class="note">The bot picks its own element and moves at random every match.</span></div>` : `<div class="opt"><span>Player 2</span><div>${elButtons(1)}</div></div>`}
    ${solo ? `<div class="opt"><span>Aiming</span><div class="seg">${segButtons('aim', [['auto', 'Auto-aim'], ['mouse', 'Aim with mouse']])}</div></div>` : ''}
    ${opts.mode === 'bot' ? `<div class="opt"><span>Bot skill</span><div class="seg">${segButtons('level', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']])}</div></div>` : ''}
    <div class="opt"><span>Round length</span><div class="seg">${segButtons('roundLen', [[120, '2:00'], [60, '1:00'], [30, '0:30']])}</div>${online ? '<span></span><span class="note">The host’s round length is used.</span>' : ''}</div>
    <div class="go"><button class="cta" data-action="${online ? 'lobby' : 'setup'}">${online ? 'Go online' : 'Go to prep time'}</button><button data-action="controls">Controls</button>${STANDALONE ? '<button data-action="settings">Settings</button>' : ''}</div>
    <div class="controls">
      <table>
        ${solo
          ? `<tr><td>You</td><td>${opts.aim === 'mouse' ? 'Aim with the mouse. ' : 'Attacks aim at your opponent automatically. '}${bindSummary(soloScheme())}</td></tr>`
          : `<tr><td>Player 1</td><td>${bindSummary('duo1')}</td></tr><tr><td>Player 2</td><td>${bindSummary('duo2')}</td></tr>`}
        <tr><td>Controller</td><td>PlayStation or Xbox: left stick or d-pad to move, right stick to aim (optional). Buttons: ${padSummary()}.</td></tr>
        <tr><td>Anytime</td><td><kbd>Esc</kbd>, <kbd>P</kbd> or the controller’s menu button pauses (not online)</td></tr>
      </table>
    </div>
  </div>`);
}
function padSummary() { const b = binds.pad, k = a => (b[a] || []).map(i => `<kbd>${esc(padName(i))}</kbd>`).join(' or ') || 'not set'; return `${k('jump')} jump, ${k('m1')}, ${k('m2')}, ${k('m3')}, ${k('m4')} moves, ${k('m5')} ultimate`; }

function showSettings() {
  state = 'settings';
  const inp = (k, v, type = 'text', ph = '') => `<input type="${type}" data-setting="${k}" value="${esc(v)}" placeholder="${ph}" style="font:inherit;padding:6px;border:2px solid var(--ink);border-radius:6px;background:var(--panel);color:var(--ink);width:100%">`;
  showScreen(`<div class="narrow">
    <h2>Settings</h2>
    <p class="note">Saved on this device only.</p>
    <h3 style="margin-top:18px">Online play</h3>
    <p class="note">Online games connect the two players directly. Leave this empty unless your network blocks direct connections and you run your own PeerJS server.</p>
    <div class="opt"><span>Custom PeerJS server</span>${inp('peerHost', settings.peerHost, 'text', 'leave empty to use the free public one')}</div>
    <p class="note">If you and your friend can’t connect from different networks, add a TURN relay. A free one: create an account at metered.ca (Open Relay), then paste its TURN address, username and password here. Both players should add the same one.</p>
    <div class="opt"><span>TURN address</span>${inp('turnUrl', settings.turnUrl, 'text', 'turn:example.com:3478')}</div>
    <div class="opt"><span>TURN username</span>${inp('turnUser', settings.turnUser)}</div>
    <div class="opt"><span>TURN password</span>${inp('turnPass', settings.turnPass, 'password')}</div>
    <div class="go"><button class="cta" data-action="save-settings">Save</button><button data-action="menu">Back</button></div>
  </div>`);
}
function showLobby() {
  state = 'lobby';
  const hosting = NET.role === 'host' && NET.code && NET.on;
  showScreen(`<div class="narrow">
    <h2>Play online</h2>
    <p class="lede">One player hosts and shares the code. The other enters it to join. ${STANDALONE ? 'Both of you just need this game open. It connects you directly, no account needed.' : 'Your friend needs to open this same page in Claude (share it with them from the Share menu).'}</p>
    ${hosting ? `<p class="note">Your game code</p><div class="big" style="letter-spacing:0.12em">${esc(NET.code)}</div>` : `
      <div class="go"><button class="cta" data-action="host">Host a game</button></div>
      <div class="opt" style="margin-top:22px"><span>Join with a code</span><div class="seg"><input data-joincode maxlength="5" placeholder="CODE" style="font:400 1.4rem Anton, Impact, sans-serif;letter-spacing:0.15em;width:8.5rem;text-transform:uppercase;padding:6px 10px;border:2px solid var(--ink);border-radius:8px;background:var(--panel);color:var(--ink)"><button data-action="join">Join</button></div></div>`}
    ${NET.status ? `<p class="status" role="status">${esc(NET.status)}</p>` : ''}
    <p class="note">Your element: <b>${esc(elName(sideEls[0]))}</b>. You can change it and build your moves once your friend arrives.</p>
    <div class="go"><button data-action="menu">${NET.on ? 'Leave' : 'Back to menu'}</button>${STANDALONE ? '<button class="ghost" data-action="settings">Server settings</button>' : ''}</div>
  </div>`);
}
function showLost() {
  state = 'lost';
  showScreen(`<div class="narrow"><h2>Your opponent left</h2><p class="lede">The connection to the other player was lost.</p><div class="go"><button class="cta" data-action="menu">Back to menu</button></div></div>`);
}
function refreshOppPanel() {
  const el = screenEl.querySelector('[data-opp]'); if (el) el.innerHTML = oppPanelInner();
  const sr = screenEl.querySelector('[data-startrow]'); if (sr) sr.innerHTML = startRowHTML();
}
function oppPanelInner() {
  const c = NET.oppPlan, ready = NET.oppReady === round + 1;
  if (!c || !EL_IDS.includes(c.el)) return `<h2>Opponent</h2><p class="note">Waiting for your opponent to pick an element…</p>`;
  const names = Array.isArray(c.m) ? c.m.map(m => esc(String((m && m.name) || '?').slice(0, 26))) : [];
  return `<div class="col-head"><h2>${esc(elName(c.el))}</h2><span class="who">${ready ? 'Ready!' : 'Preparing…'}</span></div>
    <p class="passive"><b>${esc(elName(c.el))}:</b> ${esc(ELEMENTS[c.el].passive)}</p>
    <p class="note">Their moves: ${names.slice(0, 4).join(', ')}. Ultimate: ${names[4] || '?'}.</p>`;
}

function showControls() {
  state = 'controls';
  const solo = opts.mode !== 'pvp';
  const schemes = solo ? [[soloScheme(), opts.aim === 'mouse' ? 'Keyboard and mouse (mouse aim)' : 'Keyboard and mouse (auto-aim)']] : [['duo1', 'Player 1'], ['duo2', 'Player 2']];
  const table = ([sc, label]) => `<div><h2>${label}</h2><table class="bind-table">${ACTIONS.map(([a, name]) => {
    const isCap = capture && capture.scheme === sc && capture.action === a;
    return `<tr><td>${name}</td><td>${binds[sc][a].map(c => `<kbd>${esc(keyName(c))}</kbd>`).join(' or ') || '<span class="note">Not set</span>'}</td>
      <td><button class="${isCap ? 'capturing' : ''}" data-action="rebind" data-scheme="${sc}" data-bind="${a}">${isCap ? 'Press a key or click…' : 'Change'}</button></td></tr>`;
  }).join('')}</table></div>`;
  const padRows = ACTIONS.filter(([a]) => a !== 'left' && a !== 'right').map(([a, name]) => {
    const isCap = capture && capture.kind === 'pad' && capture.action === a;
    return `<tr><td>${name}</td><td>${(binds.pad[a] || []).map(i => `<kbd>${esc(padName(i))}</kbd>`).join(' or ') || '<span class="note">Not set</span>'}</td>
      <td><button class="${isCap ? 'capturing' : ''}" data-action="rebind-pad" data-bind="${a}">${isCap ? 'Press a button…' : 'Change'}</button></td></tr>`;
  }).join('');
  showScreen(`<div class="wrap" style="max-width:1000px">
    <div class="prep-head"><div><h2>Controls</h2><p>Click Change, then press the key, mouse button or mouse gesture you want: a single click, a double click, a side button, or left and right together. Esc cancels. A key used twice is taken from the old action.</p></div></div>
    ${solo ? `<div class="go" style="margin:0 0 12px"><span class="note">Mouse layouts for moves 1–4 and the ultimate:</span>
      <button data-action="mouse-gaming">Gaming mouse: left, right, two side buttons, left + right</button>
      <button data-action="mouse-normal">Normal mouse: left, right, double left, double right, left + right</button></div>` : ''}
    <div class="bind-cols">${schemes.map(table).join('')}
      <div><h2>Controller</h2><table class="bind-table">
        <tr><td>Move</td><td><kbd>Left stick</kbd> or <kbd>D-pad</kbd></td><td></td></tr>
        <tr><td>Aim</td><td><kbd>Right stick</kbd> (otherwise auto-aim)</td><td></td></tr>
        ${padRows}
      </table><p class="note">${getPads().length ? `${getPads().length} controller${getPads().length > 1 ? 's' : ''} connected.` : 'No controller found yet. Plug one in or pair it, then press any button.'} Every connected controller uses this layout${opts.mode === 'pvp' ? '; the first one is Player 1' : ''}.</p></div>
    </div>
    <p class="note">A double-click binding makes that button’s single click wait about a quarter of a second, so the game can tell them apart.</p>
    <div class="go"><button class="cta" data-action="menu">Done</button><button class="ghost" data-action="reset-binds">Reset controls</button></div>
  </div>`);
}
function setPadBind(action, i) {
  Object.keys(binds.pad).forEach(a => { binds.pad[a] = binds.pad[a].filter(x => x !== i); });
  binds.pad[action] = [i];
  capture = null; saveBinds(); showControls();
}
function setBind(sc, action, code) {
  const group = opts.mode !== 'pvp' ? [sc] : ['duo1', 'duo2'];
  group.forEach(g => Object.keys(binds[g]).forEach(a => { binds[g][a] = binds[g][a].filter(c => c !== code); }));
  binds[sc][action] = [code];
  capture = null; saveBinds(); updateLegend(); showControls();
}
screenEl.addEventListener('contextmenu', e => { if (capture) e.preventDefault(); });

const TYPE_HINTS = {
  projectile: 'Thrown or shot at the target. Count fires several side by side.',
  beam: 'An instant line after a short wind-up. Size is thickness.',
  zone: 'A lingering area near the target. Duration is seconds; speed makes it drift. Scores once per second.',
  burst: 'An instant blast around you. Size is the radius.',
  dash: 'A quick move. Speed is distance. Hits if damage is above 0.',
  shield: 'A bubble that blocks projectiles and beams. Duration is how long it lasts.',
  rain: 'Drops fall from the sky around the target. Count adds drops; size widens the area.',
  strike: 'A marked circle at the target that blasts after a delay. Faster speed means a shorter delay.',
  orbit: 'Things circle you for a few seconds, hitting anyone close and blocking projectiles.',
  wave: 'Travels along the ground. Size is its height. Jumping dodges it.',
  trap: 'A hidden rune on the ground that blows up when the enemy steps on it.',
  summon: 'A floating helper that shoots at the enemy on its own. Speed fires faster.'
};
function summaryHTML(side, i, half) {
  const p = plan[side], m = p.result.moves[i], f = fighters[side];
  if (!m) return '';
  const s = m.stats;
  const k = f ? slotLabel(f, i) : String(i + 1);
  const fx = m.effects.length ? m.effects.map(e => `<span class="fx">${esc(e.type)} ${e.strength}</span>`).join('') : '<span class="kind">no effects</span>';
  let perf = '';
  if (half && f && f.stats[i]) { const st = f.stats[i]; perf = `<div class="perf">Round 1: used ${st.casts}×, landed ${st.hits}, scored ${st.pts}</div>`; }
  const busyUlt = m.ult && p.busy;
  return `<div class="move-top"><span class="slotkey">${esc(k)}</span><h3>${esc(busyUlt ? 'Forging…' : m.name)}</h3><span class="kind">${m.ult ? '<span class="ult-tag">ultimate</span> · ' : ''}${esc(m.type)}</span></div>
    ${m.flavor ? `<p class="flavor">${esc(m.flavor)}</p>` : ''}
    <div class="statline"><span>Damage <b>${s.damage}</b></span><span>Speed <b>${s.speed}</b></span><span>Size <b>${s.size}</b></span><span>Count <b>${s.count}</b></span><span>Duration <b>${s.duration}</b></span></div>
    <div>${fx}</div>
    <div class="costs">${m.ult ? `<span>Build ${m.build_cost} of ${ULT_BUDGET}</span><span class="mana">No mana, fires when the meter is full</span>` : `<span>Cooldown ${m.cooldown}s</span><span>Build ${m.build_cost}</span><span class="mana">${m.mana_cost} mana</span>${m.mana_overcharge ? `<span>includes +${m.mana_overcharge} overcharge</span>` : ''}`}</div>
    ${m.note ? `<p class="note-line">Claude’s note: ${esc(m.note)}</p>` : ''}
    ${perf}`;
}
function rangeField(side, i, field, label, min, max, val, step = 1) {
  return `<label>${label} <output data-out="${side}:${i}:${field}">${val}</output><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-edit="${side}:${i}:${field}"></label>`;
}
function effectField(side, i, n, e) {
  const opts2 = ['', ...Object.keys(EFFECT_COST)].map(t => `<option value="${t}" ${e && e.type === t ? 'selected' : ''}>${t || 'none'}</option>`).join('');
  return `<label>Effect ${n + 1}<select data-edit="${side}:${i}:eff${n}">${opts2}</select></label>
    ${rangeField(side, i, 'effs' + n, `Effect ${n + 1} strength`, 1, 5, e ? e.strength : 1)}`;
}
function builderHTML(side, i) {
  const p = plan[side], m = p.result.moves[i];
  const s = m.stats;
  return `<details class="builder" data-open="${side}:${i}" ${p.open.has(i) ? 'open' : ''}>
    <summary${i === 4 ? ' class="build-btn"' : ''}>${i === 4 ? 'Build' : 'Build this move yourself'}</summary>
    <div class="bgrid">
      <label class="wide">Name<input type="text" maxlength="26" value="${esc(m.name)}" data-edit="${side}:${i}:name"></label>
      <label>Type<select data-edit="${side}:${i}:type">${Object.keys(TYPE_BASE).map(t => `<option ${m.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Look<select data-edit="${side}:${i}:shape">${SHAPES.map(t => `<option ${m.visual.shape === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${rangeField(side, i, 'damage', 'Damage', 0, 10, s.damage)}
      ${rangeField(side, i, 'speed', 'Speed', 1, 10, s.speed)}
      ${rangeField(side, i, 'size', 'Size', 1, 10, s.size)}
      ${rangeField(side, i, 'count', 'Count', 1, 6, s.count)}
      ${rangeField(side, i, 'duration', 'Duration', 0, 5, s.duration)}
      ${i === 4 ? '' : rangeField(side, i, 'cooldown', 'Cooldown (s)', 1, 10, m.cooldown)}
      ${i === 4 ? '' : rangeField(side, i, 'overcharge', 'Overcharge mana', 0, 40, m.mana_overcharge, 5)}
      ${effectField(side, i, 0, m.effects[0])}
      ${effectField(side, i, 1, m.effects[1])}
    </div>
    <p class="type-hint" data-hint="${side}:${i}">${TYPE_HINTS[m.type]}</p>
  </details>`;
}
function ultHTML(side) {
  const p = plan[side];
  return `<div class="idea">
    <label for="ult${side}">Describe your ultimate</label>
    <textarea id="ult${side}" data-ult="${side}" rows="2" maxlength="220">${esc(p.ultDesc || '')}</textarea>
    <div class="idea-row">
      <button class="primary" data-action="forge-ult" data-side="${side}" data-needs-claude style="background:var(--ink);color:var(--paper);font-weight:800">Forge with ${aiName()}</button>
      <button data-action="forge-invent" data-side="${side}" data-needs-claude>Surprise me</button>
      ${p.busy ? `<button class="ghost" data-action="stop" data-side="${side}">Stop</button>` : ''}
    </div>
    <p class="note" data-claude-note hidden></p>
    ${p.status ? `<p class="status ${p.status.kind}" role="status">${esc(p.status.text)}</p>` : ''}
  </div>`;
}
function budgetHTML(side) {
  const r = plan[side].result;
  return `<div class="meter ${r.total > REG_BUDGET ? 'over' : ''}"><i style="width:${clamp(r.total / REG_BUDGET * 100, 0, 100)}%"></i></div>
    <small>Moves use ${r.total} of ${REG_BUDGET} build points · Ultimate uses ${r.ultCost} of ${ULT_BUDGET}</small>`;
}
function msgsHTML(side) {
  const r = plan[side].result;
  const m = [...r.errors.map(e => `<li class="err">${esc(e)}</li>`), ...r.warnings.map(w => `<li class="warn">${esc(w)}</li>`)].join('');
  return m ? `<ul class="msgs">${m}</ul>` : '';
}
function botColumn(side, half) {
  const el = plan[side].element, f = fighters[side];
  return `<section class="col bot-col" style="--el: var(--el-${el})">
    <div class="vs-tag">vs</div>
    <div class="vs-el">${elName(el)}</div>
    ${half && f ? `<div class="vs-score">Bot round 1 score ${f.roundScore[0]}</div>` : ''}
  </section>`;
}
function prepColumn(side, half) {
  if (isBotSide(side)) return botColumn(side, half);
  const p = plan[side], el = p.element, f = fighters[side];
  if (p.result.moves.length !== 5) p.result = { ...validate(deep(DEFAULTS[el]), el), errors: p.result.errors, valid: false };
  return `<section class="col" style="--el: var(--el-${el})">
    <div class="col-head"><h2>${elName(el)}</h2><span class="who">${esc(sideLabel(side))}${half && f ? `, round 1 score ${f.roundScore[0]}` : ''}</span></div>
    ${`<label class="note" style="display:block;margin-top:6px">Element <select data-elsel="${side}">${EL_IDS.map(id => `<option value="${id}" ${id === el ? 'selected' : ''}>${ELEMENTS[id].name}</option>`).join('')}</select></label>`}
    <p class="passive"><b>${elName(el)}:</b> ${esc(ELEMENTS[el].passive)}</p>
    <div class="budget" data-budget="${side}">${budgetHTML(side)}</div>
    <div class="moves">
      ${[0, 1, 2, 3].map(i => `<article class="move"><div data-summary="${side}:${i}">${summaryHTML(side, i, half)}</div>${builderHTML(side, i)}</article>`).join('')}
      <article class="move ult"><div data-summary="${side}:4">${summaryHTML(side, 4, half)}</div>${builderHTML(side, 4)}</article>
    </div>
    <div data-msgs="${side}">${msgsHTML(side)}</div>
    <div class="edit-row adv">
      <button data-action="trim" data-side="${side}">Trim moves to fit budget</button>
      <button class="ghost" data-action="reset" data-side="${side}">Reset to starting moves</button>
    </div>
  </section>`;
}
function startOK() { return plan.every(p => p.result.valid) && !plan.some(p => p.busy); }
function startRowHTML() {
  const ok = startOK(), half = round === 1;
  if (opts.mode === 'online') {
    const mine = plan[NET.side], meReady = NET.ready === round + 1, oppReady = NET.oppReady === round + 1;
    const can = mine && mine.result.valid && !mine.busy;
    return `${meReady ? `<button class="cta" data-action="unready">Not ready</button>` : `<button class="cta" data-action="ready" ${can ? '' : 'disabled'}>I’m ready</button>`}
      <span class="note">${!can ? 'Fix the errors in red first.' : meReady ? (oppReady ? 'Starting…' : 'Waiting for your opponent…') : oppReady ? 'Your opponent is ready.' : ''}</span>`;
  }
  return `<button class="cta" data-action="start" ${ok ? '' : 'disabled'}>${half ? 'Start round 2' : 'Start round 1'}</button>
    ${ok ? '' : `<span class="note">${plan.some(p => p.busy) ? 'Please wait…' : 'Fix the errors in red to start.'}</span>`}`;
}
function showPrep() {
  const half = round === 1;
  state = half ? 'half' : 'prep';
  const y = screenEl.scrollTop;
  showScreen(`<div class="wrap">
    <div class="prep-head">
      <div>
        <h2>${half ? 'Half time' : 'Prep time'}</h2>
        <p>${half ? 'See what landed in round 1, then tune your moves or rebuild your ultimate. Mana and the ultimate meter reset for round 2.' : 'Open “Build this move yourself” on any move to change it with sliders. Press Build on your ultimate to shape it the same way.'}</p>
      </div>
      <button class="ghost" data-action="menu">${opts.mode === 'online' ? 'Leave game' : 'Back to menu'}</button>
    </div>
    ${opts.mode === 'online' ? `<p class="note">Online game ${esc(NET.code)}. You are ${NET.side === 0 ? 'the host, on the left' : 'on the right'}.</p>` : ''}
    <div class="cols">${opts.mode === 'online' ? (NET.side === 0 ? prepColumn(0, half) + `<section class="col" data-opp>${oppPanelInner()}</section>` : `<section class="col" data-opp>${oppPanelInner()}</section>` + prepColumn(1, half)) : prepColumn(0, half) + prepColumn(1, half)}</div>
    <details>
      <summary>How costs and interactions work</summary>
      <p><code>build = type base + damage×2 + speed + size + (count−1)×3 + duration + effect costs − cooldown discount − overcharge discount</code></p>
      <p><code>mana per cast = 5 + build×0.6 + overcharge</code>. Your four moves share ${REG_BUDGET} build points and one move can cost at most 60 mana. Mana refills 6 per second, plus 5 for every scoring hit. The ultimate has its own ${ULT_BUDGET}-point budget, costs no mana and fires when its meter fills (slowly over time, faster when you score).</p>
      <ul>
        <li>Type base: projectile 2, dash 2, beam 3, burst 3, wave 3, trap 3, zone 4, shield 4, rain 4, strike 4, orbit 4, summon 6.</li>
        <li>Effect cost per strength point: push 1, pull 2, slow 2, homing 2, curve 2, pierce 2, blind 3, reflect 4.</li>
        <li>Cooldown discount: 1 point per second above 3. Overcharge discount: 3 points per 10 extra mana.</li>
        ${EL_IDS.map(id => `<li><b>${ELEMENTS[id].name}:</b> ${esc(ELEMENTS[id].passive)}</li>`).join('')}
        <li>Curving projectiles slip around shields. Reflect shields send projectiles and beams back. Area hits count as body hits.</li>
      </ul>
    </details>
    <div class="go" data-startrow>${startRowHTML()}</div>
  </div>`);
  screenEl.scrollTop = y;
  refreshForgeUI();
}
function patchSide(side) {
  const half = round === 1, p = plan[side];
  for (let i = 0; i < 5; i++) { const el = screenEl.querySelector(`[data-summary="${side}:${i}"]`); if (el) el.innerHTML = summaryHTML(side, i, half); }
  const b = screenEl.querySelector(`[data-budget="${side}"]`); if (b) b.innerHTML = budgetHTML(side);
  const m = screenEl.querySelector(`[data-msgs="${side}"]`); if (m) m.innerHTML = msgsHTML(side);
  const sr = screenEl.querySelector('[data-startrow]'); if (sr) sr.innerHTML = startRowHTML();
  p.text = JSON.stringify(p.raw, null, 2);
}
function applyEdit(side, i, field, value) {
  const p = plan[side];
  const raw = p.result.moves.map(toRaw);
  const m = raw[i];
  if (field === 'name') m.name = value || `Move ${i + 1}`;
  else if (field === 'type') m.type = value;
  else if (field === 'shape') m.visual = { shape: value };
  else if (field === 'cooldown') m.cooldown = Number(value);
  else if (field === 'overcharge') m.mana_overcharge = Number(value);
  else if (field === 'eff0' || field === 'eff1') {
    const n = Number(field.slice(3));
    const strength = Number((screenEl.querySelector(`[data-edit="${side}:${i}:effs${n}"]`) || {}).value || 1);
    const list = [0, 1].map(k => k === n ? (value ? { type: value, strength } : null) : (m.effects[k] || null));
    m.effects = list.filter(Boolean);
  } else if (field === 'effs0' || field === 'effs1') {
    const n = Number(field.slice(4));
    const sel = screenEl.querySelector(`[data-edit="${side}:${i}:eff${n}"]`);
    if (sel && sel.value) { const e = m.effects.find(x => x.type === sel.value); if (e) e.strength = Number(value); }
  } else m.stats[field] = Number(value);
  m.flavor = ''; m.note = '';
  p.raw = raw; p.result = validate(raw, p.element);
  if (field === 'type') { const h = screenEl.querySelector(`[data-hint="${side}:${i}"]`); if (h) h.textContent = TYPE_HINTS[value]; }
  patchSide(side);
}

function showResults() {
  const [a, b] = fighters;
  const winner = a.score === b.score ? null : (a.score > b.score ? a : b);
  const verdict = winner ? `${sideLabel(winner.slot)} win${winner.slot === 0 && opts.mode === 'bot' ? '' : 's'} with ${elName(winner.element)}!` : 'It’s a draw!';
  const row = (label, fn) => `<tr><th>${label}</th><td>${fn(a)}</td><td>${fn(b)}</td></tr>`;
  showScreen(`<div class="narrow">
    <p class="verdict">${esc(verdict)}</p>
    <div class="scoreboard">
      <div><div class="big" style="color:var(--el-${a.element})">${a.score}</div>${esc(sideLabel(0))}</div>
      <div class="note">final</div>
      <div><div class="big" style="color:var(--el-${b.element})">${b.score}</div>${esc(sideLabel(1))}</div>
    </div>
    <table class="result-table">
      <tr><th></th><th>${esc(sideLabel(0))} (${elName(a.element)})</th><th>${esc(sideLabel(1))} (${elName(b.element)})</th></tr>
      ${row('Round 1', f => f.roundScore[0])}
      ${row('Round 2', f => f.roundScore[1])}
      ${row('Head hits', f => f.heads)}
      ${row('Body hits', f => f.bodies)}
      ${row('Points from reflects and deflects', f => f.bonus)}
    </table>
    <div class="go">
      ${opts.mode === 'online' && NET.role !== 'host' ? (NET.pres.again ? '<span class="note">Waiting for the host to start the rematch…</span>' : '<button class="cta" data-action="ask-rematch">Play again</button>') : `<button class="cta" data-action="rematch">${opts.mode === 'online' ? 'Play again' : 'Rematch with these moves'}</button>`}
      <button data-action="menu">${opts.mode === 'online' ? 'Leave game' : 'Back to menu'}</button>
    </div>
  </div>`);
}

screenEl.addEventListener('toggle', e => {
  const d = e.target; if (!d.dataset || !d.dataset.open) return;
  const [s, i] = d.dataset.open.split(':').map(Number);
  if (d.open) plan[s].open.add(i); else plan[s].open.delete(i);
}, true);
screenEl.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.ult !== undefined) { plan[Number(t.dataset.ult)].ultDesc = t.value; return; }
  if (t.dataset.edit && t.type === 'range') {
    const [s, i, field] = t.dataset.edit.split(':');
    const o = screenEl.querySelector(`[data-out="${s}:${i}:${field}"]`); if (o) o.textContent = t.value;
    applyEdit(Number(s), Number(i), field, t.value);
  }
});
screenEl.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.elsel !== undefined) { changeElement(Number(t.dataset.elsel), t.value); return; }
  if (t.dataset.edit && t.type !== 'range') { const [s, i, field] = t.dataset.edit.split(':'); applyEdit(Number(s), Number(i), field, t.value); }
});

screenEl.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  if (btn.dataset.set) {
    const [k, v] = btn.dataset.set.split(':');
    opts[k] = k === 'roundLen' ? Number(v) : v;
    showMenu(); updateLegend();
    return;
  }
  if (btn.dataset.netpick) { const keep = {}; screenEl.querySelectorAll('[data-setting]').forEach(i => { keep[i.dataset.setting] = i.value; }); settings.net = btn.dataset.netpick; showSettings(); Object.entries(keep).forEach(([k, v]) => { const i = screenEl.querySelector(`[data-setting="${k}"]`); if (i) i.value = v; }); return; }
  if (btn.dataset.el) {
    const [s, id] = btn.dataset.el.split(':'); sideEls[Number(s)] = id;
    showMenu(); return;
  }
  const side = Number(btn.dataset.side);
  switch (btn.dataset.action) {
    case 'setup': setupMatch(); updateLegend(); break;
    case 'lobby': NET.status = ''; showLobby(); break;
    case 'host': netStart('host', makeCode()); break;
    case 'join': {
      const inp = screenEl.querySelector('[data-joincode]'); const code = (inp ? inp.value : '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length < 4) { NET.status = 'Enter the code your friend gave you.'; showLobby(); break; }
      netStart('guest', code); break;
    }
    case 'ready': saveDescsNoop(); setReady(true); break;
    case 'unready': setReady(false); break;
    case 'settings': showSettings(); break;
    case 'save-settings': {
      const v = k => (screenEl.querySelector(`[data-setting="${k}"]`) || {}).value || '';
      settings.key = v('key').trim(); settings.gkey = v('gkey').trim(); settings.gmodel = v('gmodel').trim() || 'gemini-3.5-flash-lite'; settings.peerHost = v('peerHost').trim(); settings.turnUrl = v('turnUrl').trim(); settings.turnUser = v('turnUser').trim(); settings.turnPass = v('turnPass').trim();
      try { const S = (k, x) => localStorage.setItem(k, x); S('stick-api-key', settings.key); S('stick-gemini-key', settings.gkey); S('stick-gemini-model', settings.gmodel); S('stick-net', 'p2p'); S('stick-peer-host', settings.peerHost); S('stick-turn-url', settings.turnUrl); S('stick-turn-user', settings.turnUser); S('stick-turn-pass', settings.turnPass); } catch (e) {}
      initSample(); showMenu(); break;
    }
    case 'rebind-pad': capture = { kind: 'pad', action: btn.dataset.bind }; showControls(); break;
    case 'mouse-gaming': case 'mouse-normal': {
      const sc = soloScheme(), set = btn.dataset.action === 'mouse-gaming' ? ['Mouse0', 'Mouse2', 'Mouse3', 'Mouse4', 'MouseLR'] : ['Mouse0', 'Mouse2', 'Mouse0x2', 'Mouse2x2', 'MouseLR'];
      const keys = { m1: 'KeyJ', m2: 'KeyK', m3: 'KeyL', m4: 'KeyI', m5: 'KeyO' };
      ['m1', 'm2', 'm3', 'm4', 'm5'].forEach((a, i) => { binds[sc][a] = [set[i], keys[a]]; });
      Object.keys(binds[sc]).forEach(a => { if (!a.startsWith('m')) binds[sc][a] = binds[sc][a].filter(c => !c.startsWith('Mouse')); });
      saveBinds(); updateLegend(); showControls(); break;
    }
    case 'menu': fighters = []; plan.forEach(p => p && p.ctl && p.ctl.abort()); showMenu(); break;
    case 'controls': capture = null; showControls(); break;
    case 'rebind': capture = { scheme: btn.dataset.scheme, action: btn.dataset.bind }; showControls(); break;
    case 'reset-binds': binds = deep(DEFAULT_BINDS); capture = null; saveBinds(); updateLegend(); showControls(); break;
    case 'start': startRound(); break;
    case 'forge-ult': forgeUlt(side, false); break;
    case 'forge-invent': forgeUlt(side, true); break;
    case 'stop': if (plan[side].ctl) plan[side].ctl.abort(); break;
    case 'trim': {
      const p = plan[side];
      const fitted = fitBudget(p.result.moves.map(toRaw), p.element, [0, 1, 2, 3, 4]);
      p.raw = fitted.raw; p.result = validate(p.raw, p.element); p.text = JSON.stringify(p.raw, null, 2);
      p.status = fitted.notes.length ? { kind: 'ok', text: fitted.notes.join(' ') } : { kind: 'ok', text: 'Everything already fits the budget.' };
      showPrep(); break;
    }
    case 'reset': { if (plan[side].ctl) plan[side].ctl.abort(); plan[side] = newPlan(plan[side].element); showPrep(); break; }
    case 'ask-rematch': netPresence({ again: Date.now() }); showResults(); break;
    case 'rematch': {
      if (opts.mode === 'online') { const od = (oppPeer() || {}).data || {}; NET.lastAgain = od.again; round = 0; fighters.forEach(f => { f.score = 0; f.roundScore = [0, 0]; f.heads = 0; f.bodies = 0; f.bonus = 0; }); NET.ready = 0; netPresence({ ready: 0 }); showPrep(); break; }
      round = 0;
      if (opts.mode === 'bot') { sideEls[1] = randomOther(plan[0].element); plan[1] = botPlan(sideEls[1], plan[0]); }
      fighters = plan.map((p, i) => makeFighter(i, p.element));
      fighters.forEach((f, i) => resetFighter(f, plan[i].result.moves));
      showPrep(); break;
    }
  }
});

function updateLegend() {
  const s = sc => { const b = binds[sc], k = a => `<kbd>${esc(keyShort(b[a][0]))}</kbd>`; return `${k('left')}${k('right')} move · ${k('jump')} jump · ${k('drop')} drop · ${['m1', 'm2', 'm3', 'm4'].map(k).join('')} moves · ${k('m5')} ultimate`; };
  legendEl.innerHTML = opts.mode !== 'pvp'
    ? `You: ${opts.aim === 'mouse' ? 'aim with the mouse · ' : ''}${s(soloScheme())} &nbsp;|&nbsp; controller works too &nbsp;|&nbsp; <kbd>Esc</kbd> pause`
    : `Player 1: ${s('duo1')} &nbsp;|&nbsp; Player 2: ${s('duo2')} &nbsp;|&nbsp; <kbd>Esc</kbd> pause`;
}

function saveDescsNoop() {}
/* ---------- boot ---------- */
if (/[?&]debug\b/.test(location.search)) window.__stick = { get state() { return state; }, get fighters() { return fighters; }, skip: () => { timeLeft = 0.01; } };
resize();
updateLegend();
showMenu();
initSample();
requestAnimationFrame(loop);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => render());
})();
