# SHARDWAKE

A first-person rail shooter played in the browser (Three.js + Vite). It's inspired by the core loop of *Smash Hit*, with an original setting, visuals and audio.

> **The Refractory** is an abandoned light-station adrift in a dim nebula. Its halls were built from lens-glass to focus starlight into the **Core Lens**, which has since gone dark. You're a maintenance drone pulled along the station's old light-rail, and all you have to work with is a hopper of iron spheres. Shatter the glass that has crept across the rail, and shoot the amber *prisms*, which still hold enough charge to forge new spheres. Get through four sectors to relight the Core.

## Run it
```bash
npm install
npm run dev          # http://localhost:5173 (also served on your LAN for phones)
npm run build        # static build in dist/ (relative paths, can be hosted anywhere)
npm run preview      # serve the production build
```
Automated playtest (the dev server must be running; uses your installed Google Chrome):
```bash
npm run playtest                 # 25 checks + screenshots in tests/shots/
node tests/shots.mjs 40 100 250  # warp to distances and screenshot them
```
Debug URL flags: `?bot` (autoplayer), `?ff=3` (fast-forward simulation ×3).

## Controls
| Input | Action |
|---|---|
| Click / tap anywhere in the view | Throw an iron sphere toward that point |
| Hold (during **Overdrive**) | Stream spheres continuously |
| `Esc` / `P` / ❚❚ button | Pause / resume |

## Rules
- You start with **25 spheres**. Each throw costs **1**, however many balls it fires.
- Crashing into glass or a metal obstacle costs **10** and resets your streak. At **0** the run ends.
- **Amber prisms** give +3 (small) or +5 (large, ringed).
- **Streak:** every 5 prisms in a row add a ball to each throw, up to 5× (shown by the diamond pips and the ×N counter). Letting a prism slip past unbroken, or crashing, resets it to 1×.
- **Green switches** open hazard-striped doors (some need 2–4 switches), and park crushers and pendulums out of the way.
- **Power-ups** (hit them with a ball):
  - **Overdrive** (magenta ∞, 6 s): unlimited spheres, hold to stream.
  - **Nova Rounds** (violet starburst, 8 s): explosive spheres that shatter everything nearby and wreck crushers and pendulums.
  - **Stasis** (cyan hourglass, 6 s): slows the world to 45 % and muffles the music.
- **Checkpoints:** each sector you reach unlocks it on the title screen. After a game over you can retry from the sector you died in.

## Sectors
| # | Name | Palette / structure | New ideas |
|---|---|---|---|
| 1 | Vestibule | Pale teal, white square portals, floating monoliths | Panes, a full glass wall, sliding panes, tumbling cube, first switch door |
| 2 | Orrery Hall | Indigo/violet, rotating neon rings, ringed planets | Glass fans, orbiting prisms, Overdrive into triple glass walls, metal lattice, 2-switch door |
| 3 | Foundry Lens | Steel/charcoal, hex frames with orange lamps, beat-driven pistons | Crushers with switches, Nova Rounds, counter-sliding panes, 3-switch door |
| 4 | Tidal Atrium | Deep green/aqua, towering pillars, rising halos, rippling floor | Pendulums, Stasis, counter-rotating fans, spinning pane, 4-switch final gate → Core Lens |

Each sector has its own synthesized music track (96 → 108 → 120 → 126 BPM). Moving obstacles (sliding panes, fans, orbiting prisms, pistons) are phase-locked to the beat clock.

## Art direction
- **Rendering:** a mirror floor (planar reflection with a rotated-disk blur and water ripple in the Atrium), plus a procedural nebula sky whose horizon matches the fog. HDR bloom, and 4× MSAA kept through the post-processing chain.
- **Glass shader:** a crisp rim computed from each pane's real dimensions, a fresnel sheen with a thin-film iridescent tint, and a diagonal specular glint that sweeps across.
- **Finishing pass:** radial speed blur, chromatic aberration (it spikes on crashes, streaks and power-ups), per-sector split-tone grading, vignette, film grain, and colour flashes at sector gates. Stasis desaturates the image.
- **Motion:** ball trails, billboarded impact rings, drifting dust motes, jewel prisms (translucent shell with a hot core), a beat-locked camera bob and FOV kicks.
- **UI:** Unbounded (display) with Manrope (text), a custom reticle cursor with tap pulses, and a title screen over a live attract-mode flythrough. Results show a rank badge, a count-up distance and staggered stat reveals.
- **Auto-quality:** the game steps down if frame rate drops (mirror off → bloom off → lower resolution).

## Project layout
```
index.html        HUD + screens markup
src/main.js       UI wiring (HUD, title/pause/results, checkpoints)
src/game.js       Rail movement, camera, shooting, collision, rules, rendering
src/entities.js   Glass panels, fans, cube, lattice, prisms, switches, doors, crushers, pendulums, power-ups, Core Lens
src/rooms.js      Sector palettes, decor builders, obstacle layouts
src/fx.js         Pooled instanced glass shards + additive sparks/trails
src/look.js       Glass shader, sky, mirror floor, finishing pass, dust, impact rings
src/audio.js      Web Audio step sequencer (music) + procedural SFX
docs/RESEARCH.md  Reference research, sources, confirmed vs assumed mechanics
tests/            Playwright playtest + screenshot tools
```

## Assets
Everything visual and audio was made from scratch in code. The only third-party assets are two fonts, bundled locally through npm, so nothing is downloaded at runtime.
| Asset | How it's made |
|---|---|
| Title/logo | CSS typography with an animated gradient shimmer; SVG favicon and reticle drawn inline |
| Glass / sky / floor looks | Custom GLSL shaders in `src/look.js` |
| Glass panes, fans, cube | Three.js box geometry, tinted transparent material with glowing edge lines |
| Glass shards | One procedural triangular-prism geometry drawn through a pooled `InstancedMesh` |
| Prisms, power-ups, switches | Octahedron/icosahedron/cylinder primitives; power-up icons drawn on canvas (∞, starburst, hourglass) |
| Hazard stripes | Canvas-generated texture |
| Floors (grid / circles / hex / water) | Canvas-generated textures |
| Environment reflections | Three.js `RoomEnvironment` (built in, procedural) |
| Music (6 tracks) | Web Audio step sequencer: synthesized kick, hats, clap, saw bass, arps and pads; generated reverb impulse |
| Sound effects | Synthesized in real time: glass shatter, throw, prism chime, crash, metal clank, switch, door, explosion, power-up, streak, game over, victory |

Fonts: [Unbounded](https://fonts.google.com/specimen/Unbounded) and [Manrope](https://fonts.google.com/specimen/Manrope), both SIL Open Font License 1.1, installed via `@fontsource-variable/*`.

Libraries: [three.js](https://threejs.org) (MIT), [Vite](https://vitejs.dev) (MIT), [Playwright](https://playwright.dev) (Apache-2.0, tests only).
