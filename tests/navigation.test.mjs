import test from 'node:test'
import assert from 'node:assert/strict'
import { NavGraph } from '../src/game/NavGraph.js'
import { NavigationRuntime } from '../src/game/NavigationRuntime.js'

test('A* takes connected detour and never crosses missing wall cells', () => {
  const g = new NavGraph(1)
  for (let z = -2; z <= 2; z++) for (let x = 0; x <= 4; x++) {
    if (x === 2 && Math.abs(z) <= 1) continue
    g.add(x, z, 0.83)
  }
  for (const n of g.nodes) for (const [dx, dz] of [[1, 0], [0, 1]]) {
    const b = g.nodes.find((v) => v.gx === n.gx + dx && v.gz === n.gz + dz)
    if (b) g.connect(n, b)
  }
  const route = g.route({ x: 0, y: 0.83, z: 0 }, { x: 4, y: 0.83, z: 0 })
  assert.ok(route && route.points.length > 5)
  assert.ok(route.points.some((p) => Math.abs(p.z) === 2))
  assert.ok(route.points.every((p) => !(p.x === 2 && Math.abs(p.z) <= 1)))
})

test('unconnected upper floors are never linked merely by shared x and z', () => {
  const g = new NavGraph()
  const ground = g.add(0, 0, 0.83)
  const floorTwo = g.add(0, 0, 5.83)
  const next = g.add(1, 0, 0.83)
  g.connect(ground, next)
  assert.ok(g.route({ x: 0, y: 0.83, z: 0 }, { x: 1, y: 0.83, z: 0 }))
  assert.equal(g.route({ x: 0, y: 5.83, z: 0 }, { x: 1, y: 0.83, z: 0 }), null)
  assert.notEqual(ground.id, floorTwo.id)
})

test('collision samples create a walkable route on a flat Rapier-like floor', () => {
  class Ray { constructor(origin, dir) { this.origin = origin; this.dir = dir } }
  const world = {
    castRayAndGetNormal: (ray, len) => {
      if (ray.dir.y !== -1 || ray.origin.y <= 0 || ray.origin.y > len) return null
      return { timeOfImpact: ray.origin.y, normal: { y: 1 } }
    },
    castRay: () => null,
  }
  const nav = new NavigationRuntime(world, { Ray }, {}, { maxNodes: 120, radius: 6 })
  const bot = { x: 0, y: 0.83, z: 0 }
  for (let i = 0; i < 25; i++) nav.tick(bot, 6)
  assert.ok(nav.graph.nodes.length > 15)
  const path = nav.route(bot, { x: 3, y: 0.83, z: 0 })
  assert.ok(path && path.points.length > 1)
  assert.ok(path.targetError < 1.1)
})

test('collision blocked at mid-height forces A* to route around a wall', () => {
  class Ray { constructor(origin, dir) { this.origin = origin; this.dir = dir } }
  const world = {
    castRayAndGetNormal(ray, len) {
      if (ray.dir.y !== -1 || ray.origin.y <= 0 || ray.origin.y > len) return null
      return { timeOfImpact: ray.origin.y, normal: { y: 1 } }
    },
    castRay(ray, len) {
      if (Math.abs(ray.dir.x) < 0.001) return null
      const t = (1.5 - ray.origin.x) / ray.dir.x
      const z = ray.origin.z + ray.dir.z * t
      if (t >= 0 && t <= len && Math.abs(z) < 1.0) return { timeOfImpact: t }
      return null
    },
  }
  const nav = new NavigationRuntime(world, { Ray }, {}, { maxNodes: 260, radius: 7 })
  const bot = { x: 0, y: 0.83, z: 0 }
  for (let i = 0; i < 75; i++) nav.tick(bot, 5)
  const path = nav.route(bot, { x: 4, y: 0.83, z: 0 })
  assert.ok(path && path.points.length > 3, 'route across obstacle must use another corridor')
  assert.ok(path.points.some((p) => Math.abs(p.z) >= 1))
})
