# Shining Tactics

A turn-based tactical RPG in the Shining Force mold, written as a single canvas game.
No build step, no dependencies — open `index.html` in a browser.

```
firefox index.html      # or just double-click it
```

## The game

Three chapters, fought on 24×16 grids. Between battles the Force is healed,
restocked, and joined by a new member; levels carry across the campaign.

| Chapter | Battle | Objective |
|---|---|---|
| 1 | Ambush on the Guardiana Road | defeat every enemy |
| 2 | The Ruined Chapel | defeat every enemy |
| 3 | The Gate of Runefaust | defeat Kane, the Dark Knight |

Lose Max and the battle is lost — press Enter to retry it with the levels you earned.

## Controls

| | |
|---|---|
| move cursor | mouse, or arrow keys / WASD |
| confirm | click, or `Enter` / `Z` |
| cancel | right-click, or `Esc` / `X` |
| mute | `M` |

On your unit's turn, blue tiles are where it can walk and the red fringe is what it
could reach and strike from there. Click a tile to move, then pick an action.
Cancelling from the action menu puts the unit back where it started, so a move is
never committed until you act. Hovering an enemy paints its own danger zone in red.

## Mechanics

- **Turn order** is rolled per round from Agility, so units interleave rather than
  taking sides in blocks. The next nine are shown top-right.
- **Damage** is `ATK − DEF`, where the defender's DEF is multiplied by the land
  effect of the tile they stand on — 30% in forest, 20% on hills, 40% in mountains.
  Where you stand matters as much as what you swing.
- **Counterattacks** fire about a quarter of the time when the defender can reach
  back, which is why archers (range 1–2) strike from two squares away for free.
  Fast units sometimes land a second hit; criticals do roughly double.
- **Magic** is chosen by level: Blaze 1 is cheap and single-target, Blaze 3 costs
  more and hits a cross of five tiles. MP does not regenerate mid-battle.
- **EXP** comes from landing hits, killing, healing, and casting; 100 EXP is a level,
  and growth is rolled per class.
- **Enemy AI** scores every reachable tile against every target, weighing expected
  damage, kill potential, the land effect of where it would end up, and the counter
  it would eat — then hunts your squishy back line. Units with a small aggro radius
  hold their ground until you come to them.

## Testing

```bash
node test/browser-test.js            # headless Brave, real input  (~6s)
node test/browser-test.js --head     # same, but watch it happen
BROWSER=chromium node test/browser-test.js
```

`test/cdp.js` is a ~120-line Chrome DevTools Protocol driver with **no dependencies** —
Node's built-in `fetch` and `WebSocket` are enough. It launches Brave with
`--headless=new`, so no window ever appears, and boots in about 200ms.

The suite drives the game the way you do: `Input.dispatchMouseEvent` and
`Input.dispatchKeyEvent` produce *trusted* browser events, and clicks are mapped
through the canvas's real `getBoundingClientRect()`, so the CSS downscaling
(`max-width:100%`) is exercised rather than assumed. It asserts against live game
state by evaluating `G` directly — top-level `const` in a classic script lands in
the global lexical scope, so it is reachable from `Runtime.evaluate` by bare name.
That means **no debug hooks in the shipped code**.

It also collects `Runtime.exceptionThrown` and error-level console entries for the
whole session, and samples the canvas's own pixels to prove it is painting.

## Files

- `index.html` — page shell and canvas
- `game.js` — the whole game: data, rules, AI, renderer, input
- `test/cdp.js` — dependency-free CDP driver (launch, eval, click, key, screenshot)
- `test/browser-test.js` — end-to-end suite in a real headless browser
