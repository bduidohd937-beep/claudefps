# FPS V0.3.2 A/B — Collision Navigation Graph & AI Path Following

## What was implemented
- Progressive **walkability navigation graph** generation from the actual Rapier scene collision surfaces (no external assets or npm dependencies).
  - Walkable floor sampling from the AI's current level, checked gradients and height differences, headroom and wall obstruction.
  - Layer-aware graph: floors stacked at the same X/Z do not connect unless a walkable route through steps/ramp exists.
  - A* path search, bounded node count / radius / per-frame graph-expansion budget.
  - Built from AI spawn while in the buy phase; continues expanding during live play.
- AI use of routes to the **last known or heard** position, local patrol and selected cover position. The code does not feed it a live player position while line of sight is blocked.
- AI switched to Rapier KinematicCharacterController for native step climbing and slope snapping, analogous to the player movement that passed V0.3.1.2 user playtesting.
- AI weapon economy, reaction delay, limited field of view, collision and audible footstep systems preserved.
- When a route is not ready or AI stalls, it can use the previous local wall-avoidance fallback.
- **F7 debug view**: translucent green graph edges and orange currently planned path.
- Rollback options:
  - Add `&aiMovement=legacy` to use the preserved original dynamic bot and prior steering.
  - Add `&nav=off` to keep kinematic bot movement without navigation-graph route planning.
- Four automated tests added (A* detour, disconnected elevated levels, Rapier-like floor sampling, wall avoidance).

## Technical distinction / known limits
This is a **collision-sampled navigation graph** using A*, *not* Recast's polygon NavMesh. It intentionally avoids adding a large WebAssembly dependency without imported-map verification.
- Long maps are scanned progressively near the current bot and re-seeded if far from the explored sector.
- Reachability on every stair, roof and floor of each imported GLB is NOT guaranteed; the graph only connects surfaces sampled as walkable from a reachable origin.
- Extremely tight passages, complicated multi-floor layouts, and complex ladders still require map-specific navigation annotations or a real polygon NavMesh bake.
- Graph line-of-sight and stair checks need real browser playtests, not just Node unit tests.

## Local test commands
```powershell
cd "$HOME\Desktop\claudefps"
git fetch origin
git switch --track origin/feat/fps-v0.3.2-navgraph-ai-paths
npm test
npm run build
npm run dev
```

## Focused smoke test
1. Ghost City: F7 toggle shows green walkable edges; orange line appears when AI has a navigation target. Game should keep rendering smoothly.
2. Hide behind a wall after shooting: AI should pursue the last known/noisy location by a corridor, not walk through the wall.
3. Walk up/down standard stairs and compare whether AI can follow the stair route without bouncing.
4. Use F6 to teleport the AI: new graph should start from the updated valid floor, not the previous building.
5. Check 5 rounds of shopping/guns/armor, AI footsteps and safe spawning.
6. If AI becomes stuck or routes incorrectly, compare with `&aiMovement=legacy`. Use `&nav=off` to isolate route planning from the kinematic movement change.

## GitHub
Stacked on V0.3.1.2 PR #14; separate PR, leaves main untouched.
