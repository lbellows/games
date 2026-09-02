// DOM overlay: HUD, title, level-up, shop, pause, game over, victory.
// syncUI runs every frame, so every write goes through a cached-value setter —
// the DOM is only touched when a number actually changed. Card lists are
// rebuilt on a content signature, never per frame.

import { fmt } from "./core.js";
import { BASE_STATS, STAT_LABELS, PERCENT_STATS, xpForLevel, describeStat } from "./stats.js";
import { shopState } from "./shop.js";
import { makeWeapon, weaponDps, weaponHit, weaponBreakdown } from "./weapons.js";
import { TOTAL_WAVES } from "./waves.js";
import { iconSVG } from "./icons.js";
import { toggleMute, isMuted } from "./audio.js";

const SLOTS = 6;

let A = null;      // action callbacks from main.js
let G0 = null;     // latest game state, refreshed by syncUI
let el = {};
let sel = 0;       // keyboard selection on the level-up screen
let lastPhase = "";
let shopSig = "";
let choiceSig = "";
let hudSlotSig = "";
let shopSlotSig = "";
let choiceCount = 0;
let offerCards = [];
let choiceCards = [];
let hudSlots = [];
let shopSlots = [];
let statRows = new Map();

/* ---------------------------------------------------------- tiny DOM utils */

const q = (id) => document.getElementById(id);

function setText(node, v) {
  if (node._v !== v) {
    node._v = v;
    node.textContent = v;
  }
}

function setHTML(node, v) {
  if (node._h !== v) {
    node._h = v;
    node.innerHTML = v;
  }
}

function setWidth(node, v) {
  if (node._w !== v) {
    node._w = v;
    node.style.width = v;
  }
}

function setClass(node, name, on) {
  const c = node._c || (node._c = {});
  if (c[name] !== on) {
    c[name] = on;
    node.classList.toggle(name, on);
  }
}

function show(node, on) {
  setClass(node, "hidden", !on);
}

function setTier(node, tier) {
  const t = tier >= 1 && tier <= 4 ? tier : 1;
  if (node._t !== t) {
    if (node._t) node.classList.remove("tier-" + node._t);
    node._t = t;
    node.classList.add("tier-" + t);
  }
}

function setIcon(node, id) {
  if (!node) return;
  const key = id || "";
  if (node._icon === key) return;
  node._icon = key;
  node.innerHTML = key ? iconSVG(key) : "";
}

/* --------------------------------------------------------- offer/item shape */

// Other modules may hand back either a bare def or a wrapper around one; read
// through both so the shop renders whichever shape agent C settled on.
function unwrap(o) {
  if (!o) return {};
  return o.def || o.item || o.weapon || o;
}

function isWeaponLike(def, o) {
  if (o && (o.kind === "weapon" || o.kind === "item")) return o.kind === "weapon";
  return def.cooldown !== undefined || def.projShape !== undefined;
}

function describeOffer(o) {
  const def = unwrap(o);
  const weapon = isWeaponLike(def, o);
  return {
    def,
    weapon,
    name: def.name || def.id || "???",
    tier: o.tier || def.tier || 1,
    price: o.price !== undefined ? o.price : def.price || 0,
    desc: def.desc || "",
    mods: def.mods || null,
    sold: !!(o.sold || o.bought),
    kind: weapon ? (def.type ? String(def.type).toUpperCase() : "WEAPON") : "ITEM",
  };
}

function statText(key, v) {
  const pct = PERCENT_STATS.has(key);
  const sign = v > 0 ? "+" : "";
  return sign + fmt(Math.round(v * 10) / 10) + (pct ? "%" : "");
}

// "+10% Damage · -2 Max HP", colored so trade-off items read at a glance.
function modsLine(mods) {
  let out = "";
  for (const k in mods) {
    const v = mods[k];
    if (!v) continue;
    const label = STAT_LABELS[k] || k;
    out += (out ? " · " : "") +
      '<span class="' + (v > 0 ? "up" : "down") + '">' + statText(k, v) + " " + label + "</span>";
  }
  return out;
}

function asWeapon(def, tier) {
  if (!def) return null;
  if (def.dmgType && def.cooldown) return def;
  if (!def.id) return def;
  try { return makeWeapon(def.id, tier || def.tier || 1); } catch (err) { return def; }
}

function weaponLine(def, tier, stats) {
  const w = asWeapon(def, tier);
  if (!w) return "";
  const s = stats || BASE_STATS;
  const bits = [];
  const hit = w.damage !== undefined ? weaponHit(w, s) : 0;
  const dps = w.cooldown ? weaponDps(w, s) : 0;
  if (hit) bits.push('<span class="up">' + fmt(hit) + " dmg</span>");
  if (dps) bits.push(fmt(dps) + " dps");
  if (w.count > 1) bits.push("x" + w.count);
  if (w.pierce) bits.push("pierce " + w.pierce);
  return bits.join(" · ");
}

function tipHTML(t) {
  if (!t) return "";
  let h = '<div class="tip-title">' + t.title + "</div>";
  if (t.blurb) h += '<p class="tip-blurb">' + t.blurb + "</p>";
  if (t.formula) h += '<pre class="tip-formula">' + t.formula + "</pre>";
  if (t.math) h += '<p class="tip-math">' + String(t.math).replace(/\n/g, "<br />") + "</p>";
  return h;
}

function placeTip(anchor) {
  const tip = el.tip;
  if (!tip || !anchor || !el.stage) return;
  const stage = el.stage.getBoundingClientRect();
  const scale = stage.width / 1280 || 1;
  const a = anchor.getBoundingClientRect();
  const tw = tip.offsetWidth || 280;
  const th = tip.offsetHeight || 120;
  const ax = (a.left - stage.left) / scale;
  const ay = (a.top - stage.top) / scale;
  const aw = a.width / scale;
  const ah = a.height / scale;
  let x, y;
  // Wide cards (shop / level-up) sit in a row — put the tip underneath.
  if (aw > 160 && ay + ah + 8 + th < 712) {
    x = ax;
    y = ay + ah + 8;
  } else {
    x = ax + aw + 10;
    y = ay;
    if (x + tw > 1268) x = ax - tw - 10;
  }
  if (x + tw > 1268) x = 1268 - tw;
  if (x < 8) x = 8;
  if (y + th > 708) y = 720 - 12 - th;
  if (y < 8) y = 8;
  tip.style.left = Math.round(x) + "px";
  tip.style.top = Math.round(y) + "px";
}

function showTip(html, anchor) {
  if (!el.tip || !html) return;
  setHTML(el.tip, html);
  show(el.tip, true);
  placeTip(anchor);
}

function hideTip() {
  if (el.tip) show(el.tip, false);
}

function bindTip(node, htmlFn) {
  node.addEventListener("mouseenter", () => {
    const html = typeof htmlFn === "function" ? htmlFn() : node._tip;
    if (html) showTip(html, node);
  });
  node.addEventListener("mouseleave", hideTip);
}

/* ------------------------------------------------------------ level choices */

// The integrator owns level-up rolls; accept any of the plausible field names
// rather than hard-coding one and rendering an empty screen if it differs.
function getChoices(G) {
  const c = G.upgradeChoices || G.levelChoices || G.choices || G.upgrades;
  return Array.isArray(c) ? c : [];
}

function describeChoice(c) {
  const key = c.stat || c.key || null;
  const amount = c.amount !== undefined ? c.amount : c.value;
  let value = "";
  if (c.mods) value = modsLine(c.mods);
  else if (key && amount !== undefined) value = statText(key, amount);
  else if (amount !== undefined) value = fmt(amount);
  return {
    name: c.name || c.label || (key ? STAT_LABELS[key] || key : "Upgrade"),
    tier: c.tier || 1,
    value,
    desc: c.desc || "",
  };
}

/* ------------------------------------------------------------- construction */

function buildHudSlots() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < SLOTS; i++) {
    const d = document.createElement("div");
    d.className = "slot empty tier-1";
    d._t = 1;
    d.innerHTML =
      '<span class="slot-key">' + (i + 1) + '</span>' +
      '<span class="slot-icon"></span>' +
      '<div class="slot-copy"><span class="slot-name">—</span><span class="slot-sub">empty</span></div>';
    d._icon = d.querySelector(".slot-icon");
    d._name = d.querySelector(".slot-name");
    d._sub = d.querySelector(".slot-sub");
    bindTip(d, () => d._tip);
    frag.appendChild(d);
    hudSlots.push(d);
  }
  el.slots.appendChild(frag);
}

function buildShopSlots() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < SLOTS; i++) {
    const d = document.createElement("div");
    d.className = "wslot empty tier-1";
    d._t = 1;
    d.innerHTML =
      '<span class="slot-icon"></span>' +
      '<div><span class="slot-name">—</span><br /><span class="slot-sub">empty slot</span></div>' +
      '<button class="btn" type="button">Sell</button>';
    d._icon = d.querySelector(".slot-icon");
    d._name = d.querySelector(".slot-name");
    d._sub = d.querySelector(".slot-sub");
    d._btn = d.querySelector("button");
    d._btn.addEventListener("click", () => A.sell(i));
    bindTip(d, () => d._tip);
    frag.appendChild(d);
    shopSlots.push(d);
  }
  el.shopSlots.appendChild(frag);
}

function buildStatSheet() {
  const frag = document.createDocumentFragment();
  for (const key in STAT_LABELS) {
    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML =
      '<span class="sicon">' + iconSVG(key) + '</span>' +
      '<span class="sname">' + STAT_LABELS[key] + '</span><span class="sval">0</span>';
    row._val = row.querySelector(".sval");
    bindTip(row, () => {
      if (!G0) return "";
      return tipHTML(describeStat(key, G0.stats, G0.wave));
    });
    frag.appendChild(row);
    statRows.set(key, row);
  }
  el.statSheet.appendChild(frag);
}

function makeCard(index, onPick, withPrice) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "card tier-1";
  b._t = 1;
  b.innerHTML =
    '<span class="card-key">' + (index + 1) + '</span>' +
    '<span class="card-icon"></span>' +
    '<span class="card-kind"></span>' +
    '<h3 class="card-name"></h3>' +
    (withPrice ? '<p class="card-mods"></p>' : '<div class="card-value"></div>') +
    '<p class="card-desc"></p>' +
    (withPrice ? '<span class="card-price"></span>' : "");
  b._icon = b.querySelector(".card-icon");
  b._kind = b.querySelector(".card-kind");
  b._name = b.querySelector(".card-name");
  b._mods = b.querySelector(".card-mods") || b.querySelector(".card-value");
  b._desc = b.querySelector(".card-desc");
  b._price = b.querySelector(".card-price");
  b.addEventListener("click", () => onPick(index));
  b.addEventListener("mouseenter", () => {
    if (!withPrice) selectChoice(index);
    if (b._tip) showTip(b._tip, b);
  });
  b.addEventListener("mouseleave", hideTip);
  return b;
}

function ensureCards(list, host, count, onPick, withPrice) {
  while (list.length < count) {
    const c = makeCard(list.length, onPick, withPrice);
    list.push(c);
    host.appendChild(c);
  }
  for (let i = 0; i < list.length; i++) show(list[i], i < count);
}

/* ------------------------------------------------------------------ screens */

function screenFor(phase) {
  switch (phase) {
    case "menu": return el.scTitle;
    case "levelup": return el.scLevel;
    case "shop": return el.scShop;
    case "gameover": return el.scOver;
    case "win": return el.scWin;
    default: return null;
  }
}

function runStats(G) {
  return (
    '<div><b>' + G.wave + '</b><span>Wave</span></div>' +
    '<div><b>' + (G.kills || 0) + '</b><span>Kills</span></div>' +
    '<div><b>' + (G.level || 1) + '</b><span>Level</span></div>' +
    '<div><b>' + (G.materials || 0) + '</b><span>Materials</span></div>'
  );
}

/* ------------------------------------------------------------------- keyboard */

function selectChoice(i) {
  sel = choiceCount ? ((i % choiceCount) + choiceCount) % choiceCount : 0;
  i = sel;
  for (let k = 0; k < choiceCards.length; k++) setClass(choiceCards[k], "sel", k === i);
}

function togglePause() {
  const G = G0;
  if (!G || G.phase !== "wave") return;
  if (A.pause) A.pause();
  else G.paused = !G.paused;
}

function confirm() {
  const G = G0;
  if (!G) return;
  switch (G.phase) {
    case "menu": A.start(); break;
    case "shop": A.next(); break;
    case "levelup": if (choiceCount) A.pickUpgrade(sel); break;
    case "gameover":
    case "win": A.restart(); break;
    case "wave": if (G.paused) togglePause(); break;
    default: break;
  }
}

function onKey(e) {
  if (e.repeat) return;
  const G = G0;
  if (!G) return;
  const k = e.key.toLowerCase();

  if (k === "escape") {
    togglePause();
    e.preventDefault();
    return;
  }
  if (k === "m") {
    toggleMute();
    return;
  }
  if (k === " " || k === "enter") {
    confirm();
    e.preventDefault();
    return;
  }
  if (k === "r" && G.phase === "shop") {
    A.reroll();
    return;
  }
  if (G.phase === "shop" && k >= "1" && k <= "5") {
    A.buy(+k - 1);
    return;
  }
  if (G.phase === "levelup") {
    const n = choiceCount;
    if (!n) return;
    if (k >= "1" && k <= "9") {
      const i = +k - 1;
      if (i < n) {
        selectChoice(i);
        A.pickUpgrade(i);
      }
      return;
    }
    if (k === "arrowleft" || k === "a") selectChoice((sel + n - 1) % n);
    else if (k === "arrowright" || k === "d") selectChoice((sel + 1) % n);
  }
}

/* -------------------------------------------------------------------- layout */

// One transform keeps the 1280x720 stage and its overlay in lockstep on any
// viewport; the canvas keeps its own device-pixel backing store underneath.
function fitStage() {
  const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720, 1.75);
  // Centre by translating the scaled size: the stage's layout box is always
  // 1280x720, so letting the browser centre it clips the bottom once the
  // viewport is shorter than that.
  const x = (window.innerWidth - 1280 * s) / 2;
  const y = (window.innerHeight - 720 * s) / 2;
  el.stage.style.transform =
    "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) scale(" + s.toFixed(4) + ")";
}

/* ---------------------------------------------------------------------- init */

export function initUI(G, actions) {
  A = actions;
  G0 = G;
  el = {
    stage: q("stage"),
    hud: q("hud"),
    hudLeft: q("hud-left"),
    hpFill: q("hp-fill"),
    hpText: q("hp-text"),
    xpFill: q("xp-fill"),
    xpText: q("xp-text"),
    lvlText: q("lvl-text"),
    waveText: q("wave-text"),
    timer: q("timer"),
    matsText: q("mats-text"),
    killsText: q("kills-text"),
    slots: q("slots"),
    scTitle: q("screen-title"),
    scLevel: q("screen-levelup"),
    scShop: q("screen-shop"),
    scPause: q("screen-pause"),
    scOver: q("screen-over"),
    scWin: q("screen-win"),
    levelTitle: q("levelup-title"),
    upgradeCards: q("upgrade-cards"),
    shopTitle: q("shop-title"),
    shopMats: q("shop-mats"),
    shopOffers: q("shop-offers"),
    shopSlots: q("shop-slots"),
    slotCount: q("slot-count"),
    statSheet: q("stat-sheet"),
    rerollBtn: q("btn-reroll"),
    rerollCost: q("reroll-cost"),
    muteBtn: q("btn-mute"),
    tip: q("tip"),
    overStats: q("over-stats"),
    winStats: q("win-stats"),
  };

  buildHudSlots();
  buildShopSlots();
  buildStatSheet();
  setText(el.shopTitle, "SHOP");

  q("btn-start").addEventListener("click", () => A.start());
  q("btn-next").addEventListener("click", () => A.next());
  q("btn-resume").addEventListener("click", togglePause);
  q("btn-restart").addEventListener("click", () => A.restart());
  q("btn-restart-win").addEventListener("click", () => A.restart());
  el.rerollBtn.addEventListener("click", () => A.reroll());
  if (el.muteBtn) {
    el.muteBtn.addEventListener("click", () => toggleMute());
    el.muteBtn.classList.toggle("is-muted", isMuted());
  }

  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", fitStage);
  fitStage();
  syncUI(G);
}

/* -------------------------------------------------------------- per-frame sync */

function syncHud(G) {
  const p = G.player;
  const maxHp = (G.stats && G.stats.maxHp) || 1;
  const hp = Math.max(0, Math.ceil(p ? p.hp : 0));
  const frac = Math.max(0, Math.min(1, hp / maxHp));
  setWidth(el.hpFill, (frac * 100).toFixed(1) + "%");
  setText(el.hpText, hp + "/" + maxHp);
  setClass(el.hudLeft, "low", frac <= 0.34);

  const need = xpForLevel(G.level || 1);
  setText(el.lvlText, "LV " + (G.level || 1));
  setWidth(el.xpFill, (Math.max(0, Math.min(1, (G.xp || 0) / need)) * 100).toFixed(1) + "%");
  setText(el.xpText, Math.floor(G.xp || 0) + "/" + need);

  setText(el.waveText, "WAVE " + G.wave + " / " + TOTAL_WAVES);
  const left = Math.max(0, Math.ceil((G.waveTime || 0) - (G.t || 0)));
  setText(el.timer, String(left));
  setClass(el.timer, "urgent", left <= 5 && G.phase === "wave");

  setText(el.matsText, String(G.materials || 0));
  setText(el.killsText, String(G.kills || 0));

  syncSlots(G, hudSlots, false);
}

function slotSignature(G, shop) {
  const w = G.weapons;
  let s = String(w.length);
  for (let i = 0; i < w.length; i++) {
    const d = unwrap(w[i]);
    s += "|" + (d.id || d.name || i) + ":" + (w[i].tier || d.tier || 1);
  }
  // Slots print live dmg/dps, so damage-side stats belong in the signature.
  if (G.stats) {
    const t = G.stats;
    s += "#" + t.damage + "," + t.meleeDamage + "," + t.rangedDamage + "," +
      t.attackSpeed + "," + t.critChance + "," + t.engineering;
  }
  return s;
}

function syncSlots(G, nodes, shop) {
  const sig = slotSignature(G, shop);
  if (shop) {
    if (sig === shopSlotSig) return;
    shopSlotSig = sig;
  } else {
    if (sig === hudSlotSig) return;
    hudSlotSig = sig;
  }
  for (let i = 0; i < SLOTS; i++) {
    const node = nodes[i];
    const w = G.weapons[i];
    if (!w) {
      setClass(node, "empty", true);
      setTier(node, 1);
      setIcon(node._icon, "");
      setText(node._name, "—");
      setText(node._sub, shop ? "empty slot" : "empty");
      node._tip = "";
      if (node._btn) show(node._btn, false);
      continue;
    }
    const d = unwrap(w);
    const tier = w.tier || d.tier || 1;
    setClass(node, "empty", false);
    setTier(node, tier);
    setIcon(node._icon, d.id || "");
    setText(node._name, d.name || d.id || "weapon");
    const stats = G.stats || BASE_STATS;
    let hit = 0;
    let dps = 0;
    try {
      hit = weaponHit(w, stats);
      dps = weaponDps(w, stats);
    } catch (err) {
      hit = w.damage || 0;
    }
    const bits = [];
    if (hit) bits.push(fmt(hit) + " dmg");
    if (dps) bits.push(fmt(dps) + " dps");
    setText(node._sub, bits.length ? bits.join(" · ") : (d.type || "weapon") + " · T" + tier);
    try {
      node._tip = tipHTML(weaponBreakdown(w, stats));
    } catch (err) {
      node._tip = "";
    }
    if (node._btn) show(node._btn, true);
  }
  if (shop) setText(el.slotCount, G.weapons.length + " / " + SLOTS);
}

function syncShop(G) {
  const st = shopState(G) || {};
  const offers = st.offers || [];
  ensureCards(offerCards, el.shopOffers, offers.length, (i) => A.buy(i), true);

  let sig = String(offers.length);
  for (let i = 0; i < offers.length; i++) {
    const d = unwrap(offers[i]);
    sig += "|" + (d.id || d.name || i) + (offers[i].sold || offers[i].bought ? "!" : "");
  }
  if (G.stats) {
    const t = G.stats;
    sig += "#" + t.damage + "," + t.meleeDamage + "," + t.rangedDamage + "," +
      t.attackSpeed + "," + t.critChance + "," + t.engineering;
  }
  if (sig !== shopSig) {
    shopSig = sig;
    for (let i = 0; i < offers.length; i++) {
      const card = offerCards[i];
      const o = describeOffer(offers[i]);
      setTier(card, o.tier);
      setIcon(card._icon, o.def.id || "");
      setText(card._kind, o.kind + " · T" + o.tier);
      setText(card._name, o.name);
      setHTML(card._mods, o.weapon ? weaponLine(o.def, o.tier, G.stats) : modsLine(o.mods || {}));
      setText(card._desc, o.desc);
      if (card._price) setText(card._price, o.price + " ◆");
      setClass(card, "sold", o.sold);
      card._price0 = o.price;
      card._sold = o.sold;
      if (o.weapon) {
        try {
          card._tip = tipHTML(weaponBreakdown(asWeapon(o.def, o.tier), G.stats || BASE_STATS));
        } catch (err) {
          card._tip = "";
        }
      } else if (o.mods) {
        const parts = [];
        for (const k in o.mods) parts.push(tipHTML(describeStat(k, G.stats || BASE_STATS, G.wave)));
        card._tip = parts.join("") || "";
      } else {
        card._tip = "";
      }
    }
  }

  // Affordability flips with every purchase, so it is refreshed every frame —
  // but only as a class toggle guarded by its cached value.
  const mats = G.materials || 0;
  for (let i = 0; i < offers.length; i++) {
    const card = offerCards[i];
    setClass(card, "poor", !card._sold && card._price0 > mats);
  }

  setText(el.shopMats, String(mats));
  const cost = st.rerollCost !== undefined ? st.rerollCost : 0;
  setText(el.rerollCost, cost + " ◆");
  const can = st.canReroll !== undefined ? st.canReroll : cost <= mats;
  setClass(el.rerollBtn, "off", !can);
  el.rerollBtn.disabled = !can;

  syncSlots(G, shopSlots, true);

  const s = G.stats || BASE_STATS;
  for (const [key, row] of statRows) {
    const v = s[key] !== undefined ? s[key] : 0;
    setText(row._val, statText(key, v));
    setClass(row, "buffed", v > BASE_STATS[key]);
    setClass(row, "nerfed", v < BASE_STATS[key]);
  }
}

function syncLevelUp(G) {
  const choices = getChoices(G);
  choiceCount = choices.length;
  ensureCards(choiceCards, el.upgradeCards, choices.length, (i) => A.pickUpgrade(i), false);
  setText(el.levelTitle, "LEVEL " + (G.level || 1));

  let sig = String(choices.length);
  for (let i = 0; i < choices.length; i++) {
    const c = choices[i];
    sig += "|" + (c.id || c.stat || c.key || c.name || i) + ":" + (c.amount !== undefined ? c.amount : c.value);
  }
  if (sig === choiceSig) return;
  choiceSig = sig;
  for (let i = 0; i < choices.length; i++) {
    const card = choiceCards[i];
    const raw = choices[i];
    const c = describeChoice(raw);
    setTier(card, c.tier);
    setIcon(card._icon, raw.stat || raw.key || "");
    setText(card._kind, "UPGRADE");
    setText(card._name, c.name);
    setHTML(card._mods, c.value);
    const key = raw.stat || raw.key;
    const amount = raw.amount !== undefined ? raw.amount : raw.value;
    let info = null;
    if (key) {
      const after = Object.assign({}, G.stats || BASE_STATS);
      if (amount) after[key] = (after[key] || 0) + amount;
      info = describeStat(key, after, G.wave);
    }
    setText(card._desc, c.desc || (info ? info.blurb : ""));
    card._tip = info ? tipHTML(info) : "";
  }
  selectChoice(0);
}

/** Called once per frame. Cheap: cached setters, signature-gated rebuilds. */
export function syncUI(G) {
  G0 = G;
  const phase = G.phase;

  if (phase !== lastPhase) {
    lastPhase = phase;
    const target = screenFor(phase);
    show(el.scTitle, target === el.scTitle);
    show(el.scLevel, target === el.scLevel);
    show(el.scShop, target === el.scShop);
    show(el.scOver, target === el.scOver);
    show(el.scWin, target === el.scWin);
    show(el.hud, phase === "wave" || phase === "levelup");
    if (phase === "gameover") setHTML(el.overStats, runStats(G));
    if (phase === "win") setHTML(el.winStats, runStats(G));
    if (phase === "shop") shopSig = "";      // force a rebuild on entry
    if (phase === "levelup") choiceSig = "";
    hideTip();
  }

  show(el.scPause, phase === "wave" && !!G.paused);

  if (phase === "wave" || phase === "levelup") syncHud(G);
  if (phase === "levelup") syncLevelUp(G);
  if (phase === "shop") syncShop(G);
}
