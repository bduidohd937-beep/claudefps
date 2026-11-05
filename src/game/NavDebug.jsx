import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { refs, useGame } from '../store'

function updateSegments(line, vertices) {
  const next = new THREE.BufferGeometry()
  next.setAttribute('position', new THREE.Float32BufferAttribute(vertices.length ? vertices : [0, -999, 0, 0, -999, 0], 3))
  line.geometry.dispose()
  line.geometry = next
}

export default function NavDebug() {
  const enabled = useGame((s) => s.navDebug)
  const last = useRef(-10)
  const lines = useMemo(() => ({
    graph: new THREE.LineSegments(new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x40c8a0, transparent: true, opacity: 0.42, depthTest: false })),
    path: new THREE.LineSegments(new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffac43, depthTest: false, linewidth: 2 })),
  }), [])
  useEffect(() => () => {
    lines.graph.geometry.dispose()
    lines.path.geometry.dispose()
    lines.graph.material.dispose()
    lines.path.material.dispose()
  }, [lines])

  useFrame(({ clock }) => {
    lines.graph.visible = enabled
    lines.path.visible = enabled
    if (!enabled || clock.elapsedTime - last.current < 0.45) return
    last.current = clock.elapsedTime
    const info = refs.navigation?.debugData()
    if (!info) return
    const out = []
    const ns = info.nodes
    const stride = Math.max(1, Math.ceil(ns.length / 450))
    for (let i = 0; i < ns.length; i += stride) {
      const n = ns[i]
      for (const id of n.links.keys()) {
        if (id < n.id || id % stride !== 0) continue
        const other = ns[id]
        out.push(n.x, n.y - 0.7, n.z, other.x, other.y - 0.7, other.z)
        if (out.length > 9000) break
      }
      if (out.length > 9000) break
    }
    updateSegments(lines.graph, out)
    const route = info.path || []
    const waypoints = []
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i]
      waypoints.push(a.x, a.y - 0.55, a.z, b.x, b.y - 0.55, b.z)
    }
    updateSegments(lines.path, waypoints)
  })
  return <group renderOrder={2000}>
    <primitive object={lines.graph} />
    <primitive object={lines.path} />
  </group>
}
