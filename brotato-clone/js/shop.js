// Between-wave shop. Pure state: it rolls offers, charges materials and mutates
// G.items / G.weapons. It never touches the DOM — agent D renders shopState(G).

import { clamp } from "./core.js";
import { itemPool, applyItemEffects } from "./items.js";
import { WEAPON_DEFS, makeWeapon } from "./weapons.js";

export const OFFER_COUNT = 5;
export const MAX_WEAPON_SLOTS = 6;

const SELL_FRACTION = 0.5;   // refund on selling a weapon
const REROLL_GROWTH = 1.6;   // each reroll inside one visit costs this much more
const PRICE_SLOPE = 0.09;    // price inflation per wave, so late materials mean less

/* --------------------------------------------------------------- pricing */

/** Sticker price of a def at this wave. Early waves are tight by design. */
function priceFor(basePrice, wave) {
  return Math.max(1, Math.round((basePrice || 10) * (1 + (wave - 1) * PRICE_SLOPE)));
}

function baseRerollCost(wave) {
  return 2 + Math.floor(wave * 0.75);
}

function rerollCostFor(shop) {
  return Math.round(shop.baseReroll * Math.pow(REROLL_GROWTH, shop.rerolls));
}

/* ----------------------------------------------------------- tier rolling */

/**
 * Odds of each tier appearing. Tier 1 decays with the wave while higher tiers
 * unlock on a delay; luck multiplies the rarer tiers compoundingly, so a luck
 * build visibly changes what the shop shows rather than nudging it.
 */
function tierWeights(wave, luck) {
  const w = clamp(wave, 1, 25);
  const lucky = 1 + clamp(luck, -50, 300) / 100;
  return [
    [1, Math.max(6, 100 - (w - 1) * 4.5)],
    [2, clamp((w - 2) * 7, 0, 62) * lucky],
    [3, clamp((w - 6) * 5.5, 0, 48) * lucky * lucky],
    [4, clamp((w - 10) * 3.2, 0, 26) * lucky * lucky],
  ];
}

function rollTier(G) {
  const luck = G.stats ? G.stats.luck : 0;
  return G.rng.weighted(tierWeights(G.wave || 1, luck));
}

/**
 * Odds an offer slot is a weapon. Falls off as slots fill so a full loadout
 * stops wasting offers, and hits zero at the cap.
 */
function weaponChance(G) {
  const n = (G.weapons || []).length;
  if (n >= MAX_WEAPON_SLOTS) return 0;
  return clamp(0.5 - n * 0.06, 0.16, 0.5);
}

/* ------------------------------------------------------------- offer rolls */

function weaponsAtTier(tier, used) {
  const out = [];
  for (const id in WEAPON_DEFS) {
    const def = WEAPON_DEFS[id];
    if (def.tier !== tier || used.has(id)) continue;
    out.push(def);
  }
  return out;
}

// Walk down to lower tiers, then up, so an empty bucket never blanks an offer.
function nearbyTiers(tier) {
  const order = [tier];
  for (let d = 1; d <= 3; d++) {
    if (tier - d >= 1) order.push(tier - d);
    if (tier + d <= 4) order.push(tier + d);
  }
  return order;
}

function rollWeaponOffer(G, tier, used) {
  for (const t of nearbyTiers(tier)) {
    const pool = weaponsAtTier(t, used);
    if (pool.length) {
      const def = G.rng.pick(pool);
      return { kind: "weapon", def, tier: t, price: priceFor(def.price, G.wave || 1), sold: false };
    }
  }
  return null;
}

function rollItemOffer(G, tier, used) {
  for (const t of nearbyTiers(tier)) {
    const pool = itemPool(G, t).filter((d) => !used.has(d.id));
    if (pool.length) {
      const def = G.rng.pick(pool);
      return { kind: "item", def, tier: t, price: priceFor(def.price, G.wave || 1), sold: false };
    }
  }
  return null;
}

function usedIds(offers, skipIndex) {
  const used = new Set();
  for (let i = 0; i < offers.length; i++) {
    if (i === skipIndex) continue;
    const o = offers[i];
    if (o && o.def && o.def.id) used.add(o.def.id);
  }
  return used;
}

function rollOneOffer(G, used) {
  const tier = rollTier(G);
  const wantWeapon = G.rng.chance(weaponChance(G));
  let offer = wantWeapon ? rollWeaponOffer(G, tier, used) : rollItemOffer(G, tier, used);
  if (!offer) offer = wantWeapon ? rollItemOffer(G, tier, used) : rollWeaponOffer(G, tier, used);
  return offer;
}

function rollOffers(G) {
  const offers = [];
  if (!G.rng) return offers; // shopState can be polled before a run starts

  const used = new Set();
  for (let i = 0; i < OFFER_COUNT; i++) {
    const offer = rollOneOffer(G, used);
    if (!offer) continue; // both pools exhausted; a short shop beats a broken one
    used.add(offer.def.id);
    offers.push(offer);
  }
  return offers;
}

/* ---------------------------------------------------------------- state */

function makeShop(G) {
  return {
    wave: G.wave || 1,
    rerolls: 0,
    baseReroll: baseRerollCost(G.wave || 1),
    offers: rollOffers(G),
    message: "",
  };
}

// Lazily builds (or refreshes a stale) shop so the UI can call shopState at any
// time without openShop having run first.
function ensureShop(G) {
  if (!G.shop || G.shop.wave !== (G.wave || 1)) G.shop = makeShop(G);
  return G.shop;
}

/** Roll a fresh set of offers and reset the reroll price. */
export function openShop(G) {
  G.shop = makeShop(G);
  return shopState(G);
}

/** Pay the escalating reroll price for a whole new set of offers. */
export function rerollShop(G) {
  const shop = ensureShop(G);
  const cost = rerollCostFor(shop);
  if (G.materials < cost) {
    shop.message = "Not enough materials to reroll.";
    return { ok: false, reason: shop.message, cost };
  }
  G.materials -= cost;
  shop.rerolls++;
  shop.offers = rollOffers(G);
  shop.message = "";
  return { ok: true, cost };
}

/* ----------------------------------------------------------- transactions */

function weaponDefOf(w) {
  if (!w) return null;
  // The instance shape is agent B's; accept the likely spellings before falling
  // back to the def table so the integrator's starting weapon also resolves.
  if (w.def && w.def.name) return w.def;
  const id = w.id || w.defId || w.type;
  return (id && WEAPON_DEFS[id]) || null;
}

function weaponName(w) {
  const def = weaponDefOf(w);
  return w.name || (def && def.name) || "Weapon";
}

function weaponBasePrice(w) {
  const def = weaponDefOf(w);
  if (typeof w.buyPrice === "number") return w.buyPrice;
  return priceFor((def && def.price) || 15, 1);
}

function sellValue(w) {
  return Math.max(1, Math.floor(weaponBasePrice(w) * SELL_FRACTION));
}

/**
 * Buy offer `index`. Validates cost and slot space before spending anything, so
 * a failed buy leaves materials and the offer untouched.
 */
export function buyOffer(G, index) {
  const shop = ensureShop(G);
  const offer = shop.offers[index];
  if (!offer) return fail(shop, "No such offer.");
  if (offer.sold) return fail(shop, "Already bought.");
  if (offer.kind === "weapon" && (G.weapons || []).length >= MAX_WEAPON_SLOTS) {
    return fail(shop, "All " + MAX_WEAPON_SLOTS + " weapon slots are full — sell one first.");
  }
  if (G.materials < offer.price) return fail(shop, "Not enough materials.");

  let result;
  if (offer.kind === "weapon") {
    const w = makeWeapon(offer.def.id, offer.tier);
    if (!w) return fail(shop, "That weapon jammed on the way out of the crate.");
    w.buyPrice = offer.price;
    G.weapons.push(w);
    G.materials -= offer.price;
    announce(G, "weaponBought", w);
    result = { ok: true, kind: "weapon", name: weaponName(w), price: offer.price, weapon: w };
  } else {
    const item = { ...offer.def };
    G.items.push(item);
    G.materials -= offer.price;
    applyItemEffects(G, item);
    announce(G, "itemBought", item);
    result = { ok: true, kind: "item", name: item.name, price: offer.price, item };
  }

  // Replace the bought card so a purchase is not a dead slot until the next reroll.
  const next = rollOneOffer(G, usedIds(shop.offers, index));
  if (next) shop.offers[index] = next;
  else offer.sold = true;
  shop.message = "";
  return result;
}

// Buying changes the stat block; the integrator owns recomputeStats, so nudge it
// through whatever hook exists and always announce the purchase on the bus.
function announce(G, event, payload) {
  if (typeof G.recomputeStats === "function") G.recomputeStats();
  if (G.bus) G.bus.emit(event, payload);
}

function fail(shop, reason) {
  shop.message = reason;
  return { ok: false, reason };
}

/** Sell the weapon in `slotIndex` for a partial refund and free the slot. */
export function sellWeapon(G, slotIndex) {
  const shop = ensureShop(G);
  const weapons = G.weapons || [];
  const w = weapons[slotIndex];
  if (!w) return fail(shop, "No weapon in that slot.");
  // Selling down to zero weapons would leave the run unwinnable.
  if (weapons.length <= 1) return fail(shop, "You need to keep at least one weapon.");
  const refund = sellValue(w);
  weapons.splice(slotIndex, 1);
  G.materials += refund;
  shop.message = "";
  announce(G, "weaponSold", w);
  return { ok: true, refund, name: weaponName(w) };
}

/* ----------------------------------------------------------- render feed */

function ownedCount(G, id) {
  let n = 0;
  const items = G.items || [];
  for (let i = 0; i < items.length; i++) if (items[i].id === id) n++;
  return n;
}

function weaponNote(def) {
  const parts = [];
  if (def.type) parts.push(def.type);
  if (def.damage) parts.push(def.damage + " dmg");
  if (def.cooldown) parts.push((1 / def.cooldown).toFixed(1) + "/s");
  return parts.join(" · ");
}

/** Everything the shop UI needs. Read-only snapshot — never mutate it. */
export function shopState(G) {
  const shop = ensureShop(G);
  const rerollCost = rerollCostFor(shop);
  const offers = shop.offers.map((o, i) => {
    const def = o.def;
    const base = {
      index: i,
      kind: o.kind,
      id: def.id,
      name: def.name,
      desc: def.desc || "",
      tier: o.tier,
      price: o.price,
      color: def.color || "#c8d0dc",
      tags: def.tags || [],
      sold: o.sold,
      affordable: !o.sold && G.materials >= o.price,
    };
    if (o.kind === "item") {
      base.mods = def.mods;
      base.owned = ownedCount(G, def.id);
      base.note = base.owned > 0 ? "Owned: " + base.owned : "";
    } else {
      base.note = weaponNote(def);
      base.slotsFull = (G.weapons || []).length >= MAX_WEAPON_SLOTS;
      if (base.slotsFull) base.affordable = false;
    }
    return base;
  });
  return {
    wave: shop.wave,
    materials: G.materials,
    offers,
    rerollCost,
    rerolls: shop.rerolls,
    canReroll: G.materials >= rerollCost,
    message: shop.message,
    slots: {
      used: (G.weapons || []).length,
      max: MAX_WEAPON_SLOTS,
      full: (G.weapons || []).length >= MAX_WEAPON_SLOTS,
    },
    weapons: (G.weapons || []).map((w, i) => {
      const def = weaponDefOf(w);
      return {
        index: i,
        name: weaponName(w),
        tier: w.tier || (def && def.tier) || 1,
        color: (def && def.color) || "#c8d0dc",
        type: (def && def.type) || w.type || "",
        sellValue: sellValue(w),
      };
    }),
    itemCount: (G.items || []).length,
  };
}
