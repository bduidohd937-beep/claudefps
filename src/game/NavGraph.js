// Pure graph and A* layer. Walkability and capsule clearance are supplied by
// NavigationRuntime using actual Rapier map collisions, not GLB image geometry.
export class NavGraph {
  constructor(cell = 1) {
    this.cell = cell
    this.nodes = []
    this.byCell = new Map()
  }

  key(gx, gz, y) {
    return gx + ':' + gz + ':' + Math.round(y / 0.55)
  }

  add(gx, gz, y) {
    if (![gx, gz, y].every(Number.isFinite)) return null
    const key = this.key(gx, gz, y)
    if (this.byCell.has(key)) return this.nodes[this.byCell.get(key)]
    const node = {
      id: this.nodes.length, gx, gz, x: gx * this.cell, y, z: gz * this.cell,
      links: new Map(),
    }
    this.nodes.push(node)
    this.byCell.set(key, node.id)
    return node
  }

  connect(a, b) {
    if (!a || !b || a.id === b.id) return
    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    a.links.set(b.id, d)
    b.links.set(a.id, d)
  }

  closest(point, maxDistance = Infinity) {
    if (!point) return null
    let best = null, score = maxDistance * maxDistance
    for (const n of this.nodes) {
      const d = (n.x - point.x) ** 2 + (n.z - point.z) ** 2 +
        (n.y - (point.y ?? n.y)) ** 2 * 2.25
      if (d < score) { score = d; best = n }
    }
    return best
  }

  route(from, to, maxVisited = 4200) {
    const source = this.closest(from, 3)
    const destination = this.closest(to)
    if (!source || !destination) return null
    if (source.id === destination.id) {
      return { points: [{ x: source.x, y: source.y, z: source.z }],
        targetError: Math.hypot(source.x - to.x, source.z - to.z) }
    }
    const heap = new MinHeap()
    const costs = new Map([[source.id, 0]])
    const prev = new Map()
    const visited = new Set()
    const h = (n) => Math.hypot(n.x - destination.x, n.y - destination.y, n.z - destination.z)
    heap.push({ id: source.id, f: h(source) })
    while (heap.length && visited.size < maxVisited) {
      const entry = heap.pop()
      if (visited.has(entry.id)) continue
      visited.add(entry.id)
      if (entry.id === destination.id) {
        const points = []
        let at = entry.id
        while (at != null) {
          const n = this.nodes[at]
          points.push({ x: n.x, y: n.y, z: n.z })
          at = prev.get(at)
        }
        points.reverse()
        return { points, targetError: Math.hypot(destination.x - to.x, destination.z - to.z) }
      }
      const n = this.nodes[entry.id]
      for (const [id, length] of n.links) {
        if (visited.has(id)) continue
        const cost = costs.get(n.id) + length
        if (cost >= (costs.get(id) ?? Infinity)) continue
        costs.set(id, cost)
        prev.set(id, n.id)
        heap.push({ id, f: cost + h(this.nodes[id]) })
      }
    }
    return null
  }
}

class MinHeap {
  constructor() { this.items = [] }
  get length() { return this.items.length }
  push(item) {
    const a = this.items
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].f <= item.f) break
      a[i] = a[p]
      i = p
    }
    a[i] = item
  }
  pop() {
    const a = this.items
    const top = a[0]
    const end = a.pop()
    if (!a.length) return top
    let i = 0
    while (true) {
      const l = 2 * i + 1, r = l + 1
      if (l >= a.length) break
      const child = r < a.length && a[r].f < a[l].f ? r : l
      if (a[child].f >= end.f) break
      a[i] = a[child]
      i = child
    }
    a[i] = end
    return top
  }
}
