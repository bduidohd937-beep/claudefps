# FPS V0.3.1.1 — MOVEMENT / SPAWN / AI FOOTSTEPS STABILIZATION

## Scope (implemented in feature branch)
1. **Automatic stair stepping**: when walking or running against a low obstacle, cast Rapier rays to confirm short forward obstacle, free upper path, a level landing, four surrounding foot supports, and head clearance. Valid rises 0.055–0.38 m are climbed automatically; 0.23–0.88 m high ledges still require **a fresh W+Space input**. Gentle visual smoothing after stepping.
2. **One press, one jump**: holding Space over successive landings no longer triggers repeated jump impulses. Release then press to jump again.
3. **AI footsteps**: raise walk/run/stealth loudness, extend distance attenuation slightly, improve low-pass cutoff/volume when occluded; keep left-right stereo and distance scaling. AI has no true crouch animation yet.
4. **Spawn quality**: in addition to floor normal, clearance, opponent LOS/distance and cover checks, each dynamic random spawn requires at least four supported footprint samples and two same-height escape directions. Reject isolated roof edges and overly trapped corners; use safe baseline if no random option exists.
5. **Spawn protection fairness**: bot will not chase or acquire the player's position during the existing 2.5-second round-start protection interval.
6. Unit tests: 4 movement/jump tests + 2 additional sound/spawn tests.

## Local test
```powershell
git fetch origin
git switch --track origin/fix/fps-v0.3.1.1-steps-spawn-audio
npm test
npm run build
npm run dev
```

### Manual game smoke check
- Default arena: W alone across a low test step; no need to hold Space
- Ghost City: ordinary stairs climb while walking; high walls still stop
- Space: press once then hold through landing: no repeated jumps; release and press to jump again
- Walk/run/crouch: AI's moving sound increases with gait and nearness, decreases behind walls
- Ghost City: 3–5 consecutive rounds with random positions; avoid instant eye-to-eye fighting, thin ledges and dead-end traps
- Spawn-protected start: AI stays still during protection, then behaves normally
- Existing guns, F2 and F6, economy, full 5-round match must still work

## Limits
- No general navmesh/A* or verified multi-story navigation
- Safe random fallback does not imply guaranteed cover when the source GLB map has no good candidate
- Low-step physics on actual imported stair collision meshes needs real local browser validation
- No real local npm test or npm run build was run in this ChatGPT environment
