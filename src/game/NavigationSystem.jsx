import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { refs } from '../store'
import { NavigationRuntime } from './NavigationRuntime.js'

// Mounted inside Physics, after GameMap and before Bot. It progressively scans
// collision-valid walkable points during the buy phase and while playing.
export default function NavigationSystem() {
  const { world, rapier } = useRapier()
  const nav = useMemo(() => new NavigationRuntime(world, rapier, refs), [world, rapier])
  useEffect(() => {
    refs.navigation = nav
    return () => { if (refs.navigation === nav) refs.navigation = null }
  }, [nav])
  useFrame(() => {
    const p = refs.botBody?.translation() || refs.safeBotSpawn && {
      x: refs.safeBotSpawn[0], y: refs.safeBotSpawn[1], z: refs.safeBotSpawn[2],
    }
    if (p) nav.tick(p, 5)
  })
  return null
}
