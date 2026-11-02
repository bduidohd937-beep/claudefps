import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MATCH, SPAWNS, TRAINING, saveSpawn } from '../config'
import { live, refs, useGame } from '../store'
import { enemies } from '../enemies'
import { cam, on } from '../fx'

// 라운드 진행 로직: 라운드 리셋, 구매 타이머, 승패 판정, 킬 보상, 스폰 저장 단축키
export default function Match() {
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    // 라운드 시작 시 플레이어/봇 위치 초기화 + 서로 마주보게 설정
    refs.resetRound = () => {
      const p = SPAWNS.player
      const rb = refs.playerBody
      if (rb) {
        rb.setTranslation({ x: p[0], y: p[1], z: p[2] }, true)
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      }
      camera.position.set(p[0], p[1] + 0.75, p[2])
      camera.lookAt(SPAWNS.bot[0], p[1] + 0.75, SPAWNS.bot[2])
      cam.recoil = 0; cam.shake = 0; cam.flinchP = 0; cam.flinchY = 0
      live.fireSpread = 0
      refs.resetBot?.(SPAWNS.bot)
    }

    // 개발용: F4 = 지금 위치를 플레이어 스폰으로 저장 / F3 = 봇 스폰으로 저장 (맵별로 기억됨)
    const kd = (e) => {
      const rb = refs.playerBody
      if (!rb || (e.code !== 'F3' && e.code !== 'F4')) return
      e.preventDefault()
      const t = rb.translation()
      const pos = [Number(t.x.toFixed(2)), Number((t.y + 0.1).toFixed(2)), Number(t.z.toFixed(2))]
      saveSpawn(e.code === 'F4' ? 'player' : 'bot', pos)
      console.log(`[spawn] ${e.code === 'F4' ? 'player' : 'bot'} =`, JSON.stringify(pos))
    }
    window.addEventListener('keydown', kd)

    // 킬 보상 (+$300)
    const off = on('kill', (k) => {
      if (k.byPlayer && !TRAINING) {
        useGame.setState((s) => ({ money: Math.min(MATCH.maxMoney, s.money + MATCH.killReward) }))
      }
    })
    return () => {
      window.removeEventListener('keydown', kd)
      off()
      refs.resetRound = null
    }
  }, [camera])

  useFrame((_, dt) => {
    if (TRAINING) return
    const st = useGame.getState()
    const now = performance.now() / 1000

    if (st.phase === 'buy' && now >= live.buyEnd) {
      st.endBuy() // 포인터는 풀린 상태 → 일시정지 화면에서 클릭하면 시작
    } else if (st.phase === 'live') {
      if (live.locked) live.roundTimeLeft -= Math.min(dt, 0.1)
      if (st.hp <= 0) st.endRound('ai')
      else if (enemies.get('bot')?.dead) st.endRound('player')
      else if (live.roundTimeLeft <= 0) st.endRound('ai') // 시간 초과
    }
  })

  return null
}
