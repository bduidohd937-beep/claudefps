# FPS V0.3.1.2 — MOVEMENT & SPAWN CORE FIX

## Scope
- **Movement:** Default player controller changed from dynamic-capsule + ray-teleport stepping to Rapier KinematicCharacterController. Uses native autostep (max 0.38m, min step width 0.18m), ground snapping (0.27m), slope limit (50°), and continuous capsule sliding. One-keypress-per-jump preserved. FPS camera height smoothed on successful climb.
- **Safety rollback:** append `&movement=legacy` to an entered-game URL to use the original controller for A/B regression. Original implementation remains at `src/game/LegacyPlayer.jsx`.
- **Spawn:** Baseline, manually saved and randomized positions all pass the same walkable floor, capsule clearance and escape-lane checks; build an opponent-aware fair spawn pair before a round starts.
- **No unsafe fallback:** No arbitrary spawn in the sky if a fair pair cannot be found. Match stays in the buy phase with shop closed and F6 open, showing an error and **Retry after fixing both spawns** control; cannot start combat with invalid spawns.
- **Fast sampling:** Collision-validated ground samples are cached per anchor and spawn radius, reused between rounds; each pair is then filtered using actual opponent line-of-sight and separation.
- **Grace period:** AI now ignores audible player activity during spawn protection to avoid memorizing the player's location in the grace period.
- **CI:** New GitHub workflow runs `npm ci`, `npm test`, `npm run build` on pushes and PRs.

## Explicit limits
- Does **not** introduce navigation meshes, pathfinding across building floors, ladders or climbing higher walls.
- Spawns are tested for local escape routes, NOT globally proven to connect to the whole map.
- Imported GLB geometry and real FPS play testing have not been confirmed in the model environment.
- The Rapier character controller needs smoke testing for all selected maps, crouch, jump timing, and F6 movement on a real browser.

## User local checks
```powershell
cd "$HOME\Desktop\claudefps"
git fetch origin
git switch --track origin/feat/fps-v0.3.1.2-movement-spawn-core
npm test
npm run build
npm run dev
```

1. Default arena: can climb the short box/steps without Space, cannot walk through wall colliders.
2. Ghost City: climb regular staircases; walk DOWN stairs without hovering; jumping once does not auto-repeat if held.
3. Ghost City: round 1 to round 5 random spawns; no immediate open line-of-sight at close range; no trapped thin ledges.
4. Artificial bad spawn: F6 appears rather than air-spawning; saving two suitable points and Retry resumes the buy phase.
5. Economy and all guns/F2/F6/audio remain usable.
6. If the new movement controller behaves differently, load the same game URL with `&movement=legacy` to compare.
