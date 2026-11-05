# FPS V0.3.3 — SPAWN SYSTEM V6 / MAP SECTORS

## Changes
- **Zone-based spawning replaces the V5 per-coordinate random draw** on imported maps when dynamic spawns + navigation are enabled.
- The navigation runtime scans collision-reachable walkable regions up to its documented budget (9,000 nodes, radius adapted to map bounds). It **preserves** previously found verified regions across round-start teleports rather than erasing the graph.
- Sectorize existing connected NavGraph nodes into ~12m x 12m spatial zones with separate height bands (3.5m). A minimum of four linked cells is required; samples are spread within each zone. These are **candidate regions**, not guaranteed safe spawn positions.
- Select player and AI **as one pair** from geographically diversified zones. Every proposed pair still passes the V5 physical floor, headroom, exit, line-of-sight, height, fair distance, and *verified A* connectivity* checks before spawning.
- Rotate away from the previous round's zones, rather than merely shifting a few meters from the previous coordinate.
- Honor user-saved F6 anchors by restricting each party's candidate sector to within 12m.
- If the graph has not expanded far enough, show **pending** and periodically recheck; no invented sky / roof fallback. If all graph routes are exhausted with no valid pair, show rejection details in F6 rather than spawning in a disconnected area.
- F6 editor: list discovered candidate sectors, selected player/AI sectors, counts of rejected pair reasons; buttons load a sector into one party's coordinate fields (not committed until manually validated/saved).
- F6 "safe random" now selects a sample from a verified sector when V6 is active.
- Reversible comparisons: add `&spawnEngine=v5` to select previous coordinate-based logic. Existing `&spawnNav=off` performs physical checks only and `&nav=off` disables the AI navigation system.
- 10 new unit tests for zone grouping, upper-floor separation, geographical spread, recent-zone rotation, manual anchors, audit limits and failure reasons.

## Limits and performance
- This is a **progressively expanding NavGraph**, not an offline fully baked polygon NavMesh.
- A sector is available only after its collision-connected graph has been scanned. Coverage of the entire imported GLB is **not proven**.
- Path graph evidence is never a replacement for Rapier collision and spawn LOS checks.
- Large worlds can take time to discover multiple distant, connected sectors; F6 may initially show pending while the graph expands. Never describe the full map as already scanned.
- The ranking is a tactical heuristic, not a statistical guarantee of symmetric gameplay balance.
- Test map-by-map: there may be areas with stairs/doorways too narrow for the grid graph.
- GitHub automated tests/build don't prove actual Ghost City FPS/step collision or anti-spawn-kill outcomes.

## Commands
```powershell
cd "$HOME\Desktop\claudefps"
git fetch origin
git switch --track origin/feat/fps-v0.3.3-spawn-zones-v6
npm test
npm run build
npm run dev
```

## Real play test
1. Ghost City: F6 sector list becomes populated as NavGraph explores. Compare first and fifth rounds (zone variety).
2. Verify F6 selected sector IDs differ between rounds when multiple viable regions exist.
3. During a new round, player/AI should be on collision-validated walkable ground, out of direct close sight and able to reach each other.
4. On an unscanned region, expect pending followed by a recheck; if no safe pair exists, the game should remain in F6 instead of unsafe placement.
5. F6 click '플레이어 후보로' or 'AI 후보로', test pair score before saving.
6. Re-run with `&spawnEngine=v5` for direct A/B on the same map, then report better/worse behavior.
7. Confirm bot pathfinding, stairs, economy, guns and spawn protection are unchanged.

## PR order
Independent PR stacked onto V0.3.2.1 PR #16. `main` is not modified.
