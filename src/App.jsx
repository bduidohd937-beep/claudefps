import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { AUTO_ENTER, CFG, TRAINING } from './config'
import { live, refs, useGame } from './store'
import GameMap from './game/GameMap'
import Player from './game/Player'
import WeaponSystem from './game/WeaponSystem'
import Bot from './game/Bot'
import NavigationSystem from './game/NavigationSystem'
import NavDebug from './game/NavDebug'
import Enemies from './game/Enemies'
import Match from './game/Match'
import Impacts from './game/Impacts'
import Particles from './game/Particles'
import HUD from './ui/HUD'
import MainMenu from './ui/MainMenu'

function Controls() {
  const ref = useRef()
  const lastUnlockAt = useRef(-Infinity)
  const sensitivity = useGame((s) => s.sensitivity)
  const setLocked = useGame((s) => s.setLocked)

  useEffect(() => {
    // Chrome blocks re-locking immediately after unlock; only request it on a fresh user click.
    useGame.setState({ lock: () => {
      if (performance.now() - lastUnlockAt.current < 1200) return
      if (!document.pointerLockElement) ref.current?.lock()
    } })
    refs.unlock = () => ref.current?.unlock()
    return () => { refs.unlock = null; useGame.setState({ lock: () => {} }) }
  }, [])

  return (
    <PointerLockControls
      ref={ref}
      pointerSpeed={sensitivity}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI - 0.05}
      onLock={() => { live.locked = true; setLocked(true) }}
      onUnlock={() => { lastUnlockAt.current = performance.now(); live.locked = false; live.firing = false; setLocked(false) }}
    />
  )
}

export default function App() {
  // A real menu: no game world, bots, HUD or physics are mounted until Enter.
  if (!AUTO_ENTER) return <MainMenu />
  return (
    <>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: CFG.fov, near: 0.05, far: 600 }}
      >
        <color attach="background" args={['#9db2c4']} />
        <fog attach="fog" args={['#9db2c4', 60, 260]} />
        <hemisphereLight args={['#dfe8f0', '#4a4f55', 1.1]} />
        <directionalLight position={[30, 50, 20]} intensity={1.6} />
        <Suspense fallback={null}>
          {/* 실행 순서 중요: Player(카메라 이동) → WeaponSystem(총기) → Bot/Match */}
          <Physics gravity={[0, CFG.gravity, 0]} timeStep="vary">
            <GameMap />
            <NavigationSystem />
            <Player />
            <WeaponSystem />
            {TRAINING ? <Enemies /> : <Bot />}
            <Match />
            <NavDebug />
          </Physics>
        </Suspense>
        <Impacts />
        <Particles />
        <Controls />
      </Canvas>
      <HUD />
    </>
  )
}
