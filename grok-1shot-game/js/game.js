import {
  T,
  walkable,
  plantable,
  PLANTS,
  ENEMIES,
  FLOORS,
  SEED_ORDER,
  SHOP_GOODS,
  DIRS4,
  DIRS8,
  MAX_DEPTH,
} from "./content.js";
import { RNG, generateFloor, computeFov, firstStep, stepToward, idx, inBounds } from "./engine.js";

let nextEnemyId = 100;

export class Game {
  constructor(seed, sfx) {
    this.seed = seed ?? (1 + Math.floor(Math.random() * 1e9));
    this.rng = new RNG(this.seed);
    this.sfx = sfx;
    this.depth = 1;
    this.turn = 0;
    this.logLines = [];
    this.over = false;
    this.won = false;
    this.shopOpen = false;
    this.shake = 0;
    this.hitFlash = 0;
    this.floaters = [];
    this.particles = [];
    this.explored = null;
    this.visible = new Set();
    this.glowLeft = 0;
    this.hover = null;
    this.kills = 0;
    this.harvested = 0;
    this.player = {
      x: 0,
      y: 0,
      hp: 24,
      hpMax: 24,
      atk: 3,
      hunger: 72,
      hungerMax: 100,
      water: 3,
      waterMax: 3,
      gold: 0,
      compost: 0,
      facing: [0, 1],
      seeds: { sunroot: 4, thornvine: 3, glowcap: 1, coinleaf: 0, nightshade: 0 },
      selected: "sunroot",
      poison: 0,
      shears: false,
    };
    this.newFloor();
    this.log("You drop into damp soil. The glasshouse breathes.", "info");
    this.log("1–5 seeds, F plant, G harvest, T water. Bump pests.", "info");
  }

  spec() {
    return FLOORS[this.depth];
  }

  newFloor() {
    const floor = generateFloor(this.depth, this.rng);
    this.w = floor.w;
    this.h = floor.h;
    this.tiles = floor.tiles;
    this.player.x = floor.player.x;
    this.player.y = floor.player.y;
    this.stairs = floor.stairs;
    this.wells = floor.wells;
    this.chests = floor.chests;
    this.enemies = floor.enemies;
    this.items = floor.items;
    this.plants = floor.plants;
    this.explored = new Uint8Array(this.w * this.h);
    this.refreshFov();
    const spec = this.spec();
    this.log(`${spec.name}. ${spec.flavor}`, "title");
    this.sfx?.descend();
    this.burst(this.player.x, this.player.y, "#cde8a8", 10);
  }

  tile(x, y) {
    if (!inBounds(x, y, this.w, this.h)) return T.WALL;
    return this.tiles[idx(x, y, this.w)];
  }

  enemyAt(x, y) {
    return this.enemies.find((e) => e.x === x && e.y === y);
  }

  plantAt(x, y) {
    return this.plants.find((p) => p.x === x && p.y === y);
  }

  chestAt(x, y) {
    return this.chests.find((c) => c.x === x && c.y === y);
  }

  wellAt(x, y) {
    return this.wells.find((w) => w.x === x && w.y === y);
  }

  itemAt(x, y) {
    return this.items.find((i) => i.x === x && i.y === y);
  }

  occupied(x, y, ignore) {
    if (this.player.x === x && this.player.y === y && ignore !== this.player) return true;
    if (this.enemyAt(x, y) && this.enemyAt(x, y) !== ignore) return true;
    if (this.plantAt(x, y)) return true;
    if (this.chestAt(x, y)) return true;
    if (this.wellAt(x, y)) return true;
    return false;
  }

  passableFor(x, y, who) {
    if (!walkable(this.tile(x, y))) return false;
    if (this.player.x === x && this.player.y === y && who !== this.player) return false;
    if (this.enemyAt(x, y) && this.enemyAt(x, y) !== who) return false;
    const plant = this.plantAt(x, y);
    if (plant) {
      const def = PLANTS[plant.kind];
      if (who !== this.player && plant.mature && def.turret) return false;
      if (who === this.player) return false;
    }
    if (this.chestAt(x, y)) return false;
    if (this.wellAt(x, y)) return false;
    return true;
  }

  fovRadius() {
    let r = this.spec().fov;
    if (this.glowLeft > 0) r += 3;
    for (const p of this.plants) {
      if (p.mature && PLANTS[p.kind].light) r = Math.max(r, this.spec().fov + 1);
    }
    return r;
  }

  refreshFov() {
    const extra = [];
    for (const p of this.plants) {
      if (p.mature && PLANTS[p.kind].light) extra.push(p);
    }
    this.visible = computeFov(
      this.tiles,
      this.w,
      this.h,
      this.player.x,
      this.player.y,
      this.fovRadius()
    );
    for (const p of extra) {
      const more = computeFov(this.tiles, this.w, this.h, p.x, p.y, PLANTS[p.kind].light);
      for (const k of more) this.visible.add(k);
    }
    for (const k of this.visible) {
      const [x, y] = k.split(",").map(Number);
      this.explored[idx(x, y, this.w)] = 1;
    }
  }

  log(msg, kind = "info") {
    this.logLines.push({ msg, kind, t: this.turn });
    if (this.logLines.length > 50) this.logLines.shift();
  }

  floater(x, y, text, color) {
    this.floaters.push({ x, y, text, color, life: 1 });
  }

  burst(x, y, color, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.4 + Math.random() * 1.2;
      this.particles.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: Math.cos(a) * s * 0.06,
        vy: Math.sin(a) * s * 0.06,
        color,
        life: 0.6 + Math.random() * 0.4,
        size: 1.5 + Math.random() * 2,
      });
    }
  }

  blocked() {
    return this.over || this.won || this.shopOpen;
  }

  tryMove(dx, dy) {
    if (this.blocked()) return false;
    if (!dx && !dy) {
      this.log("You wait. Leaves tick.", "info");
      this.endTurn();
      return true;
    }
    this.player.facing = [dx, dy];
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    if (!inBounds(nx, ny, this.w, this.h) || this.tile(nx, ny) === T.WALL) {
      this.log("A hedge bars the way.", "dim");
      return false;
    }
    if (this.tile(nx, ny) === T.WATER) {
      this.log("Black water. You keep your boots.", "dim");
      return false;
    }
    const foe = this.enemyAt(nx, ny);
    if (foe) {
      this.attack(this.player, foe);
      this.endTurn();
      return true;
    }
    const plant = this.plantAt(nx, ny);
    if (plant) {
      if (plant.mature && PLANTS[plant.kind].harvestable) {
        this.harvestPlant(plant);
        this.endTurn();
        return true;
      }
      this.log(`A ${PLANTS[plant.kind].name} occupies the bed.`, "dim");
      return false;
    }
    const chest = this.chestAt(nx, ny);
    if (chest) {
      this.openChest(chest);
      this.endTurn();
      return true;
    }
    const well = this.wellAt(nx, ny);
    if (well) {
      this.useWell(well);
      this.endTurn();
      return true;
    }
    this.player.x = nx;
    this.player.y = ny;
    this.sfx?.step();
    this.pickupHere();
    if (this.stairs && this.player.x === this.stairs.x && this.player.y === this.stairs.y) {
      this.log("A stairwell yawns. Press > to descend.", "title");
    }
    if (this.tile(nx, ny) === T.BLIGHT && this.rng.chance(0.12)) {
      this.player.poison = Math.max(this.player.poison, 2);
      this.log("Blight dust prickles your lungs.", "bad");
    }
    this.endTurn();
    return true;
  }

  pickupHere() {
    const it = this.itemAt(this.player.x, this.player.y);
    if (!it) return;
    this.takeItem(it);
    this.items = this.items.filter((i) => i !== it);
  }

  takeItem(it) {
    this.sfx?.pickup();
    if (it.kind === "gold") {
      this.player.gold += it.qty;
      this.log(`You pocket ${it.qty} coins.`, "good");
    } else if (it.kind === "seed") {
      this.player.seeds[it.seed] = (this.player.seeds[it.seed] || 0) + it.qty;
      this.log(`You tuck away ${it.qty} ${PLANTS[it.seed].name} seed${it.qty > 1 ? "s" : ""}.`, "good");
    } else if (it.kind === "beet") {
      this.heal(12);
      this.feed(16);
      this.log("The heart beet is earthy and kind.", "good");
    } else if (it.kind === "water") {
      this.player.water = Math.min(this.player.waterMax, this.player.water + it.qty);
      this.log("You slosh more water into the can.", "good");
    } else if (it.kind === "shears") {
      if (this.player.shears) {
        this.player.gold += 8;
        this.log("Spare shears. The stall will take them for 8 coins.", "good");
      } else {
        this.player.shears = true;
        this.player.atk += 1;
        this.log("Steel shears. Pests and topiary, beware.", "good");
      }
    } else if (it.kind === "flask") {
      this.player.hpMax += 4;
      this.heal(4);
      this.log("A tonic. Your roots run deeper.", "good");
    }
    this.burst(this.player.x, this.player.y, "#e2b657", 6);
  }

  openChest(chest) {
    if (chest.shop) {
      this.shopOpen = true;
      this.log("A seed stall, somehow. The gnome is napping under it.", "title");
      this.sfx?.ui();
      return;
    }
    if (chest.open) {
      this.log("The crate is empty.", "dim");
      return;
    }
    chest.open = true;
    this.sfx?.pickup();
    const roll = this.rng.next();
    if (roll < 0.4) {
      const seed = this.rng.pick(SEED_ORDER);
      const qty = this.rng.int(1, 3);
      this.player.seeds[seed] += qty;
      this.log(`Inside: ${qty} ${PLANTS[seed].name} seed${qty > 1 ? "s" : ""}.`, "good");
    } else if (roll < 0.7) {
      const g = this.rng.int(8, 16 + this.depth);
      this.player.gold += g;
      this.log(`Inside: ${g} coins, green with age.`, "good");
    } else if (roll < 0.85) {
      this.takeItem({ kind: "beet", qty: 1 });
    } else {
      this.takeItem({ kind: this.rng.chance(0.5) ? "shears" : "flask", qty: 1 });
    }
    this.burst(chest.x, chest.y, "#c4a574", 8);
  }

  useWell(well) {
    if (well.used) {
      this.log("The well is a dry throat.", "dim");
      return;
    }
    well.used = true;
    this.player.water = this.player.waterMax;
    this.heal(5);
    this.sfx?.water();
    this.log("Cold water. The can is heavy again.", "good");
  }

  buy(goodId) {
    const g = SHOP_GOODS.find((x) => x.id === goodId);
    if (!g) return;
    if (this.player.gold < g.price) {
      this.log("The stall wants more coin.", "bad");
      return;
    }
    this.player.gold -= g.price;
    if (g.kind === "seed") {
      this.player.seeds[g.id] += 1;
      this.log(`Bought ${g.name}.`, "good");
    } else if (g.kind === "water") {
      this.player.water = this.player.waterMax;
      this.log("The can sloshes full.", "good");
    } else if (g.kind === "heal") {
      this.heal(g.heal);
      this.feed(10);
      this.log("A beet, sold without ceremony.", "good");
    }
    this.sfx?.pickup();
  }

  plantFacing() {
    if (this.blocked()) return false;
    const [dx, dy] = this.player.facing;
    const x = this.player.x + dx;
    const y = this.player.y + dy;
    return this.plantAtTile(x, y);
  }

  plantAtTile(x, y) {
    if (this.blocked()) return false;
    const kind = this.player.selected;
    if (!this.player.seeds[kind]) {
      this.log(`No ${PLANTS[kind].name} seeds left.`, "bad");
      return false;
    }
    if (!inBounds(x, y, this.w, this.h) || !plantable(this.tile(x, y))) {
      this.log("This ground will not take a seed.", "dim");
      return false;
    }
    if (this.occupied(x, y) || (this.stairs && this.stairs.x === x && this.stairs.y === y)) {
      this.log("No room to plant.", "dim");
      return false;
    }
    if (Math.abs(x - this.player.x) > 1 || Math.abs(y - this.player.y) > 1 || (x === this.player.x && y === this.player.y)) {
      this.log("You can only plant a step away.", "dim");
      return false;
    }
    this.player.seeds[kind]--;
    const blight = this.tile(x, y) === T.BLIGHT;
    this.plants.push({
      x,
      y,
      kind,
      age: blight ? -1 : 0,
      mature: false,
    });
    this.sfx?.plant();
    this.log(`You press a ${PLANTS[kind].name} seed into the ${blight ? "blighted " : ""}earth.`, "good");
    this.burst(x, y, "#7dba6a", 6);
    this.player.facing = [Math.sign(x - this.player.x) || this.player.facing[0], Math.sign(y - this.player.y) || this.player.facing[1]];
    this.endTurn();
    return true;
  }

  harvestFacing() {
    if (this.blocked()) return false;
    const [dx, dy] = this.player.facing;
    let p = this.plantAt(this.player.x + dx, this.player.y + dy);
    if (!p || !p.mature) {
      p = this.plants.find(
        (pl) =>
          pl.mature &&
          Math.abs(pl.x - this.player.x) <= 1 &&
          Math.abs(pl.y - this.player.y) <= 1 &&
          !(pl.x === this.player.x && pl.y === this.player.y)
      );
    }
    if (!p) {
      this.log("Nothing ripe within reach.", "dim");
      return false;
    }
    this.harvestPlant(p);
    this.endTurn();
    return true;
  }

  harvestPlant(p) {
    const def = PLANTS[p.kind];
    this.plants = this.plants.filter((x) => x !== p);
    this.harvested++;
    this.sfx?.harvest();
    this.burst(p.x, p.y, def.color, 12);
    this.floater(p.x, p.y, def.name, def.color);

    if (def.heal) this.heal(def.heal);
    if (def.hunger) this.feed(def.hunger);
    if (def.gold) {
      const g = this.rng.int(def.gold[0], def.gold[1]);
      this.player.gold += g;
      this.log(`Coinleaf rains ${g} coins.`, "good");
    }
    if (def.glowTurns) {
      this.glowLeft += def.glowTurns;
      this.log("You bottle the mushroom's light.", "good");
    }
    if (def.detonate) {
      this.sfx?.boom();
      this.log("Nightshade bursts in a bitter cloud.", "good");
      this.shake = 8;
      for (const e of [...this.enemies]) {
        if (Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) <= 1) {
          this.hurt(e, def.detonate, "nightshade");
          if (e.hp > 0) e.stun = Math.max(e.stun, 1);
        }
      }
    }
    if (def.turret) this.log("You cut the thornvine back to a seed.", "info");
    if (def.heal) this.log("Sunroot: warmth in the ribs.", "good");

    if (def.seedChance && this.rng.chance(def.seedChance)) {
      this.player.seeds[p.kind] += 1;
      this.log("A spare seed clings to your glove.", "good");
    } else if (def.seedChance === 1) {
      this.player.seeds[p.kind] += 1;
    }
  }

  waterAdj() {
    if (this.blocked()) return false;
    if (this.player.water <= 0) {
      this.log("The can is empty.", "bad");
      return false;
    }
    const targets = this.plants.filter(
      (p) => !p.mature && Math.abs(p.x - this.player.x) <= 1 && Math.abs(p.y - this.player.y) <= 1
    );
    if (!targets.length) {
      this.log("No thirsty seedlings beside you.", "dim");
      return false;
    }
    this.player.water--;
    for (const p of targets) {
      p.age += 2;
      if (p.age >= PLANTS[p.kind].grow) {
        p.mature = true;
        p.age = PLANTS[p.kind].grow;
      }
      this.burst(p.x, p.y, "#7ec8e8", 5);
    }
    this.sfx?.water();
    this.log(`You water ${targets.length} plant${targets.length > 1 ? "s" : ""}.`, "good");
    this.endTurn();
    return true;
  }

  fertilize() {
    if (this.blocked()) return false;
    if (this.player.compost <= 0) {
      this.log("No compost. Slugs make the best.", "dim");
      return false;
    }
    const [dx, dy] = this.player.facing;
    const p = this.plantAt(this.player.x + dx, this.player.y + dy);
    if (!p) {
      this.log("Fertilize a plant you face.", "dim");
      return false;
    }
    this.player.compost--;
    p.age += 2;
    if (p.age >= PLANTS[p.kind].grow) {
      p.mature = true;
      p.age = PLANTS[p.kind].grow;
    }
    this.burst(p.x, p.y, "#6b4a2b", 6);
    this.log(`Compost packed around the ${PLANTS[p.kind].name}.`, "good");
    this.endTurn();
    return true;
  }

  eatSeed() {
    if (this.blocked()) return false;
    const k = this.player.selected;
    if (!this.player.seeds[k]) {
      this.log("No seed to chew.", "bad");
      return false;
    }
    this.player.seeds[k]--;
    this.feed(10);
    this.log(`You eat a raw ${PLANTS[k].name} seed. Bitter. Alive.`, "info");
    this.endTurn();
    return true;
  }

  descend() {
    if (this.blocked()) return false;
    if (!this.stairs || this.player.x !== this.stairs.x || this.player.y !== this.stairs.y) {
      this.log("No stair under your boots.", "dim");
      return false;
    }
    if (this.depth >= MAX_DEPTH) return false;
    this.depth++;
    this.newFloor();
    return true;
  }

  attack(from, to) {
    const isPlayer = from === this.player;
    let atk = isPlayer ? from.atk : ENEMIES[from.kind].atk;
    if (isPlayer && from.shears && ENEMIES[to.kind].plant) atk += 2;
    const def = ENEMIES[to.kind]?.def || 0;
    const dmg = Math.max(1, atk - def + this.rng.int(-1, 1));
    const name = isPlayer ? "You" : ENEMIES[from.kind].name;
    const tname = to === this.player ? "you" : ENEMIES[to.kind].name;
    this.log(isPlayer ? `You swat the ${tname}.` : `The ${name} hits you.`, "info");
    this.hurt(to, dmg);
    if (to === this.player && ENEMIES[from.kind].poison && this.rng.chance(0.45)) {
      this.player.poison = Math.max(this.player.poison, ENEMIES[from.kind].poison);
      this.log("Blight-dust in the cut.", "bad");
    }
  }

  hurt(target, amount) {
    const dmg = Math.max(1, amount | 0);
    target.hp -= dmg;
    const col = target === this.player ? "#f0a0a0" : "#f4e8c1";
    this.floater(target.x, target.y, `−${dmg}`, col);
    if (target === this.player) {
      this.shake = 12;
      this.hitFlash = 1;
      this.sfx?.hurt();
    } else {
      this.sfx?.hit();
      this.burst(target.x, target.y, "#c45c4a", 5);
    }
    if (target.hp <= 0) this.kill(target);
  }

  kill(e) {
    if (e === this.player) {
      this.player.hp = 0;
      this.over = true;
      this.log("You sink into the bed. The garden tucks you in.", "bad");
      this.sfx?.death();
      this.saveScore();
      return;
    }
    this.enemies = this.enemies.filter((x) => x !== e);
    this.kills++;
    const def = ENEMIES[e.kind];
    this.log(`The ${def.name} stills.`, "good");
    if (def.compost) {
      this.player.compost += 1;
      this.log("You scrape compost from the husk.", "info");
    }
    if (e.kind === "heartroot") {
      this.won = true;
      this.log("The Heartroot splits. For a moment, only rain on glass.", "title");
      this.sfx?.win();
      this.burst(e.x, e.y, "#c45c4a", 24);
      this.saveScore();
      return;
    }
    if (def.gold && this.rng.chance(0.45)) {
      const g = this.rng.int(def.gold[0], def.gold[1]);
      if (g > 0) this.items.push({ x: e.x, y: e.y, kind: "gold", qty: g });
    } else if (this.rng.chance(0.22)) {
      const seed = this.rng.pick(SEED_ORDER.slice(0, this.depth < 4 ? 3 : 5));
      this.items.push({ x: e.x, y: e.y, kind: "seed", seed, qty: 1 });
    }
  }

  heal(n) {
    const b = this.player.hp;
    this.player.hp = Math.min(this.player.hpMax, this.player.hp + n);
    const g = this.player.hp - b;
    if (g > 0) this.floater(this.player.x, this.player.y, `+${g}`, "#8fbc8f");
  }

  feed(n) {
    this.player.hunger = Math.min(this.player.hungerMax, this.player.hunger + n);
  }

  endTurn() {
    if (this.over || this.won) {
      this.refreshFov();
      return;
    }
    this.turn++;
    this.player.hunger = Math.max(0, this.player.hunger - 1);
    if (this.player.hunger === 0) {
      this.hurt(this.player, 1);
      if (this.over) {
        this.refreshFov();
        return;
      }
      if (this.turn % 4 === 0) this.log("Starving. The soil looks edible. It isn't.", "bad");
    } else if (this.player.hunger === 12) {
      this.log("Your stomach is a hollow pot.", "bad");
    }
    if (this.player.poison > 0) {
      this.hurt(this.player, 1);
      this.player.poison--;
      if (this.over) {
        this.refreshFov();
        return;
      }
      if (this.player.poison === 0) this.log("The poison thins.", "info");
    }
    if (this.glowLeft > 0) this.glowLeft--;

    for (const p of this.plants) {
      if (!p.mature) {
        p.age++;
        if (p.age >= PLANTS[p.kind].grow) {
          p.mature = true;
          this.burst(p.x, p.y, PLANTS[p.kind].color, 7);
        }
      } else if (PLANTS[p.kind].turret) {
        for (const e of [...this.enemies]) {
          if (Math.abs(e.x - p.x) + Math.abs(e.y - p.y) === 1) {
            this.hurt(e, PLANTS[p.kind].turret);
            this.floater(p.x, p.y, "↯", "#c45c4a");
          }
        }
      }
    }

    const acting = [...this.enemies];
    for (const e of acting) {
      if (this.over || this.won) break;
      if (!this.enemies.includes(e)) continue;
      this.actEnemy(e);
    }

    if (this.player.hp <= 0 && !this.over) {
      this.player.hp = 0;
      this.kill(this.player);
    }
    this.refreshFov();
  }

  canSee(e) {
    return this.visible.has(e.x + "," + e.y) || cheb(e.x, e.y, this.player.x, this.player.y) <= 9;
  }

  actEnemy(e) {
    const def = ENEMIES[e.kind];
    if (e.stun > 0) {
      e.stun--;
      return;
    }
    if (def.slow) {
      if (e.skip) {
        e.skip = false;
        return;
      }
      e.skip = true;
    }
    if (def.boss) {
      this.actBoss(e);
      return;
    }
    if (def.eat) {
      const meal = this.plants.find((p) => Math.abs(p.x - e.x) + Math.abs(p.y - e.y) === 1);
      if (meal) {
        this.plants = this.plants.filter((p) => p !== meal);
        this.log(`A slug chews the ${PLANTS[meal.kind].name}.`, "bad");
        this.burst(meal.x, meal.y, "#6b4a2b", 6);
        return;
      }
    }
    if (def.blight && this.tile(e.x, e.y) !== T.WALL && this.tile(e.x, e.y) !== T.WATER && this.tile(e.x, e.y) !== T.STAIRS) {
      if (this.rng.chance(0.35)) this.tiles[idx(e.x, e.y, this.w)] = T.BLIGHT;
    }
    if (cheb(e.x, e.y, this.player.x, this.player.y) === 1) {
      this.attack(e, this.player);
      return;
    }
    const pass = (x, y) => this.passableFor(x, y, e);
    let step = null;
    if (this.visible.has(e.x + "," + e.y) || cheb(e.x, e.y, this.player.x, this.player.y) <= 8) {
      step = stepToward(pass, e.x, e.y, this.player.x, this.player.y);
    } else if (this.rng.chance(0.5)) {
      const [dx, dy] = this.rng.pick(DIRS4);
      if (pass(e.x + dx, e.y + dy)) step = [dx, dy];
    }
    if (step) {
      const nx = e.x + step[0];
      const ny = e.y + step[1];
      const plant = this.plantAt(nx, ny);
      if (plant) {
        if (plant.mature && PLANTS[plant.kind].turret) {
          this.hurt(e, PLANTS[plant.kind].turret);
          return;
        }
        this.plants = this.plants.filter((p) => p !== plant);
        this.log(`The ${def.name} tramples a ${PLANTS[plant.kind].name}.`, "bad");
      }
      if (!this.enemyAt(nx, ny) && !(this.player.x === nx && this.player.y === ny)) {
        e.x = nx;
        e.y = ny;
      }
    }
  }

  actBoss(e) {
    e.clock = (e.clock || 0) + 1;
    const def = ENEMIES.heartroot;
    if (e.clock % def.summonEvery === 0) {
      const spots = DIRS8.map(([dx, dy]) => [e.x + dx, e.y + dy]).filter(
        ([x, y]) => this.passableFor(x, y, e) && !this.plantAt(x, y)
      );
      if (spots.length) {
        const [x, y] = this.rng.pick(spots);
        const kind = this.rng.chance(0.6) ? "aphid" : "slug";
        this.enemies.push({
          id: nextEnemyId++,
          kind,
          x,
          y,
          hp: ENEMIES[kind].hp,
          hpMax: ENEMIES[kind].hp,
          skip: false,
          stun: 0,
        });
        this.log("The Heartroot sheds a pest.", "bad");
        this.burst(x, y, "#8a5cb8", 8);
      }
    }
    if (e.clock % def.slamEvery === 0) {
      this.log("Root-slam! Vines scour the aisles.", "bad");
      this.shake = 16;
      this.sfx?.boom();
      if (this.player.x === e.x || this.player.y === e.y) {
        this.hurt(this.player, 4);
        this.log("A vine finds you on the line.", "bad");
      }
      return;
    }
    if (cheb(e.x, e.y, this.player.x, this.player.y) === 1) {
      this.attack(e, this.player);
      return;
    }
    const pass = (x, y) => this.passableFor(x, y, e);
    const step = stepToward(pass, e.x, e.y, this.player.x, this.player.y);
    if (step) {
      const nx = e.x + step[0];
      const ny = e.y + step[1];
      const plant = this.plantAt(nx, ny);
      if (plant && !(plant.mature && PLANTS[plant.kind].turret)) {
        this.plants = this.plants.filter((p) => p !== plant);
        this.log(`The Heartroot crushes a ${PLANTS[plant.kind].name}.`, "bad");
      }
      if (!this.enemyAt(nx, ny) && !(this.player.x === nx && this.player.y === ny)) {
        e.x = nx;
        e.y = ny;
      }
    }
  }

  clickTile(x, y) {
    if (this.blocked()) return;
    if (!inBounds(x, y, this.w, this.h)) return;
    const dx = x - this.player.x;
    const dy = y - this.player.y;
    if (dx === 0 && dy === 0) {
      this.tryMove(0, 0);
      return;
    }
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
      this.tryMove(Math.sign(dx), Math.sign(dy));
      return;
    }
    const pass = (tx, ty) => this.passableFor(tx, ty, this.player) || (tx === x && ty === y && walkable(this.tile(tx, ty)));
    const step = firstStep(pass, this.w, this.h, this.player.x, this.player.y, x, y);
    if (step) this.tryMove(step[0], step[1]);
    else this.log("No path through the hedges.", "dim");
  }

  examine(x, y) {
    if (!inBounds(x, y, this.w, this.h)) return null;
    const seen = this.visible.has(x + "," + y);
    const known = this.explored[idx(x, y, this.w)];
    if (!known) return { title: "Darkness", body: "Unturned earth." };
    const bits = [];
    const t = this.tile(x, y);
    const tname = {
      [T.WALL]: "Hedge wall",
      [T.SOIL]: "Tilled soil",
      [T.MOSS]: "Moss lawn",
      [T.STONE]: "Stone path",
      [T.WATER]: "Pond",
      [T.STAIRS]: "Stairwell",
      [T.BLIGHT]: "Blighted soil",
    }[t];
    bits.push(tname || "Ground");
    if (!seen) return { title: tname || "?", body: "Remembered, not seen." };
    if (this.player.x === x && this.player.y === y) bits.push("You.");
    const e = this.enemyAt(x, y);
    if (e) bits.push(`${ENEMIES[e.kind].name} (${e.hp} hp). ${ENEMIES[e.kind].desc}`);
    const p = this.plantAt(x, y);
    if (p) {
      const d = PLANTS[p.kind];
      bits.push(p.mature ? `Mature ${d.name}. ${d.desc}` : `${d.name} sprout (${p.age}/${d.grow}).`);
    }
    const c = this.chestAt(x, y);
    if (c) bits.push(c.shop ? "Seed stall." : c.open ? "Empty crate." : "Closed garden crate.");
    const w = this.wellAt(x, y);
    if (w) bits.push(w.used ? "Dry well." : "Garden well.");
    const it = this.itemAt(x, y);
    if (it) bits.push(itemLabel(it));
    if (this.stairs && this.stairs.x === x && this.stairs.y === y) bits.push("Stairs down.");
    return { title: tname, body: bits.join(" ") };
  }

  score() {
    return (
      this.player.gold +
      this.depth * 50 +
      this.kills * 10 +
      this.harvested * 6 +
      Math.max(0, this.player.hp) * 2 +
      (this.won ? 400 : 0)
    );
  }

  saveScore() {
    const row = {
      score: this.score(),
      depth: this.depth,
      won: this.won,
      seed: this.seed,
      kills: this.kills,
      at: Date.now(),
    };
    const list = loadScores();
    list.push(row);
    list.sort((a, b) => b.score - a.score);
    localStorage.setItem("bloomrot-scores", JSON.stringify(list.slice(0, 10)));
  }
}

function cheb(x0, y0, x1, y1) {
  return Math.max(Math.abs(x0 - x1), Math.abs(y0 - y1));
}

function itemLabel(it) {
  if (it.kind === "seed") return `${PLANTS[it.seed].name} seed.`;
  if (it.kind === "gold") return `${it.qty} coins.`;
  if (it.kind === "beet") return "Heart beet.";
  if (it.kind === "water") return "A splash of water.";
  if (it.kind === "shears") return "Steel shears.";
  if (it.kind === "flask") return "Tonic flask.";
  return "Something.";
}

export function loadScores() {
  try {
    return JSON.parse(localStorage.getItem("bloomrot-scores") || "[]");
  } catch {
    return [];
  }
}
