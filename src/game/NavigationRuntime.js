import { NavGraph } from './NavGraph.js'

// Collision-derived walkability GRAPH (grid samples, not a polygon Recast NavMesh).
// Each connection is evaluated from the preceding walkable floor, so stairs
// and ramps work without linking unrelated roofs or stacked floors by accident.
export class NavigationRuntime {
  constructor(world, rapier, actors, options = {}) {
    this.world = world
    this.actors = actors
    this.ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
    this.cell = options.cell ?? 1
    this.maxNodes = options.maxNodes ?? 9000
    this.radius = options.radius ?? 46
    this.autoRadius = options.radius == null
    this.graph = new NavGraph(this.cell)
    this.queue = []
    this.expanded = new Set()
    this.anchor = null
    this.path = []
    this.target = null
    this.lastError = 'not initialized'
  }

  ignoreActors = (c) => {
    const handle = c.parent()?.handle
    return handle !== this.actors.playerBody?.handle && handle !== this.actors.botBody?.handle
  }

  cast(x, y, z, dx, dy, dz, distance, normal = false) {
    const ray = this.ray
    ray.origin.x = x; ray.origin.y = y; ray.origin.z = z
    ray.dir.x = dx; ray.dir.y = dy; ray.dir.z = dz
    return normal
      ? this.world.castRayAndGetNormal(ray, distance, true, undefined, undefined, undefined, undefined, this.ignoreActors)
      : this.world.castRay(ray, distance, true, undefined, undefined, undefined, undefined, this.ignoreActors)
  }

  floor(x, z, nearY, seed = false) {
    const top = nearY + (seed ? 1.6 : 0.72)
    const hit = this.cast(x, top, z, 0, -1, 0, seed ? 3.6 : 2.5, true)
    if (!hit || hit.normal.y < 0.68) return null
    const footY = top - hit.timeOfImpact
    const centerY = footY + 0.83
    if (!seed && (centerY - nearY > 0.5 || nearY - centerY > 0.7)) return null
    // Require capsule headroom. This excludes crawling holes and narrow gaps.
    if (this.cast(x, footY + 0.14, z, 0, 1, 0, 1.6)) return null
    return centerY
  }

  reset(pos) {
    this.graph = new NavGraph(this.cell)
    this.queue = []
    this.expanded.clear()
    this.anchor = null
    this.path = []
    this.target = null
    const gx = Math.round(pos.x / this.cell)
    const gz = Math.round(pos.z / this.cell)
    const y = this.floor(gx * this.cell, gz * this.cell, pos.y, true)
    if (y == null || Math.abs(y - pos.y) > 1.6) {
      this.lastError = 'no walkable start floor'
      return false
    }
    const node = this.graph.add(gx, gz, y)
    this.queue.push(node.id)
    this.anchor = { x: node.x, y: node.y, z: node.z }
    this.lastError = null
    return true
  }

  canConnect(from, gx, gz) {
    const x = gx * this.cell, z = gz * this.cell
    const distance = Math.hypot(x - from.x, z - from.z)
    if (distance < 0.01) return null
    const dx = (x - from.x) / distance, dz = (z - from.z) / distance
    // Guard against invisible walls. Probe above the highest walkable stair.
    if (this.cast(from.x, from.y + 0.65, from.z, dx, 0, dz, distance - 0.05)) return null
    let y = from.y
    const parts = Math.max(3, Math.ceil(distance / 0.25))
    for (let i = 1; i <= parts; i++) {
      const t = i / parts
      const nx = from.x + (x - from.x) * t
      const nz = from.z + (z - from.z) * t
      const nextY = this.floor(nx, nz, y)
      if (nextY == null || nextY - y > 0.4 || y - nextY > 0.55) return null
      y = nextY
    }
    // Do not connect to a razor-thin ledge; the bot has a 0.35m radius.
    if (this.cast(x, y + 0.12, z, 1, 0, 0, 0.39) ||
        this.cast(x, y + 0.12, z, -1, 0, 0, 0.39) ||
        this.cast(x, y + 0.12, z, 0, 0, 1, 0.39) ||
        this.cast(x, y + 0.12, z, 0, 0, -1, 0.39)) return null
    return y
  }

  tick(origin, budget = 5) {
    if (!origin) return
    if (!this.anchor && !this.reset(origin)) return
    // Preserve the verified region across rounds. Re-seeding it from a newly
    // randomized spawn would erase all validated zone evidence.
    const bounds = this.actors.mapBounds
    if (bounds && this.autoRadius) {
      const width = bounds.max[0] - bounds.min[0]
      const depth = bounds.max[2] - bounds.min[2]
      // Large Ghost City / FPS maps: expand across the connected walkable region.
      // Unexplored regions remain unknown, NEVER silently accepted as reachable.
      this.radius = Math.min(180, Math.max(46, Math.hypot(width, depth) * 0.9))
    }
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]
    for (let i = 0; i < budget && this.queue.length && this.graph.nodes.length < this.maxNodes; i++) {
      const id = this.queue.shift()
      if (this.expanded.has(id)) continue
      this.expanded.add(id)
      const from = this.graph.nodes[id]
      for (const [dx, dz] of dirs) {
        const gx = from.gx + dx, gz = from.gz + dz
        const x = gx * this.cell, z = gz * this.cell
        if (this.anchor && Math.hypot(x - this.anchor.x, z - this.anchor.z) > this.radius) continue
        if (bounds && (x < bounds.min[0] + 0.45 || x > bounds.max[0] - 0.45 ||
          z < bounds.min[2] + 0.45 || z > bounds.max[2] - 0.45)) continue
        const y = this.canConnect(from, gx, gz)
        if (y == null) continue
        const before = this.graph.nodes.length
        const node = this.graph.add(gx, gz, y)
        if (!node) continue
        this.graph.connect(from, node)
        if (this.graph.nodes.length !== before) this.queue.push(node.id)
      }
    }
  }

  route(origin, target) {
    if (!this.anchor || !origin || !target) return null
    const result = this.graph.route(origin, target)
    if (!result) return null
    this.path = result.points
    this.target = { ...target }
    return result
  }

  debugData() {
    return {
      nodes: this.graph.nodes,
      path: this.path,
      target: this.target,
      queued: this.queue.length,
      expanded: this.expanded.size,
      error: this.lastError,
    }
  }
}
