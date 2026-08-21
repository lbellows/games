export const TILE = 48;
export const MAX_DEPTH = 8;

export const T = {
  WALL: 0,
  SOIL: 1,
  MOSS: 2,
  STONE: 3,
  WATER: 4,
  STAIRS: 5,
  BLIGHT: 6,
};

export function walkable(t) {
  return t === T.SOIL || t === T.MOSS || t === T.STONE || t === T.STAIRS || t === T.BLIGHT;
}

export function plantable(t) {
  return t === T.SOIL || t === T.MOSS || t === T.BLIGHT;
}

export function blocksVision(t) {
  return t === T.WALL;
}

export const SEED_ORDER = ["sunroot", "thornvine", "glowcap", "coinleaf", "nightshade"];

export const PLANTS = {
  sunroot: {
    id: "sunroot",
    name: "Sunroot",
    key: "1",
    grow: 3,
    sprite: "sunroot",
    color: "#e8b84a",
    harvestable: true,
    heal: 8,
    hunger: 28,
    seedChance: 0.45,
    price: 6,
    desc: "Harvest to mend wounds and hunger.",
  },
  thornvine: {
    id: "thornvine",
    name: "Thornvine",
    key: "2",
    grow: 4,
    sprite: "thornvine",
    color: "#c45c4a",
    harvestable: true,
    turret: 2,
    seedChance: 1,
    price: 8,
    desc: "A living fence. Hurts adjacent pests each turn.",
  },
  glowcap: {
    id: "glowcap",
    name: "Glowcap",
    key: "3",
    grow: 3,
    sprite: "glowcap",
    color: "#6ec8c0",
    harvestable: true,
    light: 4,
    glowTurns: 40,
    seedChance: 0.35,
    price: 12,
    desc: "Lights the plot while grown. Harvest for a longer lantern.",
  },
  coinleaf: {
    id: "coinleaf",
    name: "Coinleaf",
    key: "4",
    grow: 4,
    sprite: "coinleaf",
    color: "#e2b657",
    harvestable: true,
    gold: [9, 16],
    seedChance: 0.3,
    price: 10,
    desc: "Leaves like pennies. Harvest for gold.",
  },
  nightshade: {
    id: "nightshade",
    name: "Nightshade",
    key: "5",
    grow: 5,
    sprite: "nightshade",
    color: "#8a5cb8",
    harvestable: true,
    detonate: 8,
    seedChance: 0.25,
    price: 14,
    desc: "Harvest to burst poison on nearby pests.",
  },
};

export const ENEMIES = {
  slug: {
    id: "slug",
    name: "Garden Slug",
    hp: 8,
    atk: 2,
    slow: true,
    eat: true,
    compost: true,
    sprite: "slug",
    gold: [1, 3],
    desc: "Slow. Prefers your crops to you.",
  },
  aphid: {
    id: "aphid",
    name: "Aphid",
    hp: 3,
    atk: 1,
    sprite: "aphid",
    gold: [0, 1],
    desc: "Fast, fragile, and rude.",
  },
  moth: {
    id: "moth",
    name: "Blight Moth",
    hp: 7,
    atk: 2,
    blight: true,
    poison: 3,
    sprite: "moth",
    gold: [2, 5],
    desc: "Dusts tiles with blight. Bite may poison.",
  },
  topiary: {
    id: "topiary",
    name: "Topiary Knight",
    hp: 18,
    atk: 4,
    slow: true,
    plant: true,
    sprite: "topiary",
    gold: [6, 12],
    desc: "Hedge clipped into a grudge. Slow, heavy.",
  },
  heartroot: {
    id: "heartroot",
    name: "The Heartroot",
    hp: 70,
    atk: 5,
    def: 1,
    boss: true,
    plant: true,
    sprite: "heartroot",
    summonEvery: 5,
    slamEvery: 8,
    desc: "The conservatory's rotten heart.",
  },
};

export const FLOORS = {
  1: {
    name: "Kitchen Garden",
    flavor: "Raised beds. Something ate the labels.",
    theme: "kitchen",
    fov: 8,
    enemies: [
      ["aphid", 0.55],
      ["slug", 0.45],
    ],
    count: [5, 7],
  },
  2: {
    name: "Herb Border",
    flavor: "Rosemary still clinging to the brick.",
    theme: "kitchen",
    fov: 8,
    enemies: [
      ["aphid", 0.4],
      ["slug", 0.6],
    ],
    count: [6, 8],
  },
  3: {
    name: "Glasshouse Walk",
    flavor: "Moonlight through a hundred cracked panes.",
    theme: "glass",
    fov: 7,
    shop: true,
    enemies: [
      ["aphid", 0.3],
      ["slug", 0.4],
      ["moth", 0.3],
    ],
    count: [7, 9],
  },
  4: {
    name: "Orchid Nave",
    flavor: "The air is sweet and wrong.",
    theme: "glass",
    fov: 7,
    enemies: [
      ["slug", 0.35],
      ["moth", 0.45],
      ["aphid", 0.2],
    ],
    count: [8, 10],
  },
  5: {
    name: "Moon Beds",
    flavor: "White flowers that open only for the lost.",
    theme: "moon",
    fov: 6,
    enemies: [
      ["moth", 0.45],
      ["slug", 0.25],
      ["topiary", 0.3],
    ],
    count: [8, 11],
  },
  6: {
    name: "Thorn Cloister",
    flavor: "The hedges remember being walls.",
    theme: "thorn",
    fov: 6,
    shop: true,
    enemies: [
      ["topiary", 0.4],
      ["moth", 0.35],
      ["slug", 0.25],
    ],
    count: [9, 12],
  },
  7: {
    name: "Root Cellar",
    flavor: "Everything down here is listening.",
    theme: "cellar",
    fov: 5,
    enemies: [
      ["topiary", 0.45],
      ["moth", 0.35],
      ["slug", 0.2],
    ],
    count: [10, 13],
  },
  8: {
    name: "The Heartroot",
    flavor: "A pulse in the soil. It knows your name.",
    theme: "heart",
    fov: 8,
    boss: true,
    enemies: [],
    count: [0, 0],
  },
};

export const SHOP_GOODS = [
  { id: "sunroot", kind: "seed", name: "Sunroot seed", price: 6 },
  { id: "thornvine", kind: "seed", name: "Thornvine seed", price: 8 },
  { id: "glowcap", kind: "seed", name: "Glowcap spore", price: 12 },
  { id: "coinleaf", kind: "seed", name: "Coinleaf seed", price: 10 },
  { id: "nightshade", kind: "seed", name: "Nightshade seed", price: 14 },
  { id: "water", kind: "water", name: "Refill the can", price: 5 },
  { id: "beet", kind: "heal", name: "Heart beet", price: 12, heal: 12 },
];

export const ITEM_NAMES = {
  gold: "Loose coins",
  seed: "Seed packet",
  beet: "Heart beet",
  shears: "Steel shears",
  flask: "Tonic flask",
};

export const DIRS8 = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

export const DIRS4 = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
