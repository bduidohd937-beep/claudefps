import { useEffect, useState } from 'react'
import { live, useGame } from '../store'
import { VM } from '../game/ViewModels'
import { WEAPONS, WEAPON_IDS } from '../weapons'

const defaultTune = () => ({ x: 0, y: 0, z: 0, s: 1, rx: 0, ry: 0, rz: 0 })
const options = [
  { key: 'x', label: '좌우 X', min: -2, max: 2, step: 0.01 },
  { key: 'y', label: '상하 Y', min: -2, max: 2, step: 0.01 },
  { key: 'z', label: '앞뒤 Z', min: -6, max: 2, step: 0.01 },
  { key: 's', label: '배율', min: 0.02, max: 20, step: 0.02 },
  { key: 'rx', label: '상하 회전 X', min: -3.14, max: 3.14, step: 0.02 },
  { key: 'ry', label: '좌우 회전 Y', min: -3.14, max: 3.14, step: 0.02 },
  { key: 'rz', label: '좌우 기울기 Z (롤)', min: -3.14, max: 3.14, step: 0.02 },
]
function saveTune() {
  try { localStorage.setItem('claudefps.vmtune', JSON.stringify(live.vmTune)) } catch {}
}
export default function WeaponTuner() {
  const open = useGame((s) => s.tunerOpen)
  const setOpen = useGame((s) => s.setTunerOpen)
  const weapon = useGame((s) => s.weapon)
  const [current, setCurrent] = useState(defaultTune())
  useEffect(() => {
    if (!open) return
    setCurrent({ ...defaultTune(), ...live.vmTune[weapon] })
  }, [open, weapon])
  if (!open) return null
  const update = (key, value) => {
    if (!Number.isFinite(value)) return
    const next = { ...current, [key]: value }
    setCurrent(next)
    live.vmTune[weapon] = next
    saveTune()
  }
  const reset = () => {
    const next = defaultTune()
    setCurrent(next)
    live.vmTune[weapon] = next
    saveTune()
  }
  const displayWeapon = (id) => {
    const state = useGame.getState()
    // During a match, preview only weapons the player actually owns.
    if (state.phase !== 'menu' && !state.owned[id]) return
    live.weapon = id
    useGame.setState({ weapon: id })
  }
  const frame = { width: 'min(365px, 93vw)', position: 'fixed', zIndex: 1100,
    right: 16, top: 16, padding: 17, maxHeight: '90vh', overflow: 'auto',
    border: '1px solid #f3a450', borderRadius: 8, color: '#fff',
    background: 'rgba(12,16,22,.96)', boxShadow: '0 12px 32px #000b' }
  const button = { cursor: 'pointer', color: '#fff', padding: '8px 10px',
    borderRadius: 5, background: '#333b44', border: '1px solid #596877' }
  return (
    <section aria-label="무기 모델 위치 조정" style={frame}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <b>무기 위치 조정 · F2</b>
        <button style={button} onClick={() => setOpen(false)}>닫기</button>
      </div>
      <p style={{ fontSize: 12, color: '#b8c1cb', lineHeight: 1.5 }}>
        기존 총기는 원본 GLB, 신규 총기는 임시 모델 · 즉시 반영 · 자동 저장
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
        {WEAPON_IDS.map((id) => (
          <button key={id} disabled={useGame.getState().phase !== 'menu' && !useGame.getState().owned[id]}
            onClick={() => displayWeapon(id)}
            style={{ ...button, opacity: useGame.getState().phase !== 'menu' && !useGame.getState().owned[id] ? 0.45 : 1,
              background: weapon === id ? '#a75822' : '#303942', minWidth: '29%', flex: '1 0 29%', fontSize: 11 }}>
            {WEAPONS[id].name}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#aeb7c1', marginBottom: 8 }}>
        기본 크기 {VM[weapon]?.scale} × 추가 배율 {current.s?.toFixed(2)}
      </div>
      {options.map((o) => (
        <label key={o.key} style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            {o.label}<b>{current[o.key].toFixed(2)}</b>
          </span>
          <input type="range" min={o.min} max={o.max} step={o.step}
            value={current[o.key]} onChange={(e) => update(o.key, Number(e.target.value))}
            style={{ width: '100%', accentColor: '#ea9651' }} />
        </label>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ ...button, flex: 1 }} onClick={reset}>이 무기만 초기화</button>
        <button style={{ ...button, flex: 1, background: '#a75822' }}
          onClick={() => setOpen(false)}>설정 저장·닫기</button>
      </div>
      <p style={{ fontSize: 11, color: '#b8c1cb' }}>
        좌우 기울기(Z축 롤)로 총을 화면 안쪽으로 눕히고, 앞뒤 Z 값을 더 음수로 하면
        카메라에서 멀어집니다. 숫자 조정은 무기별로 저장되며 초기화할 수 있습니다.
      </p>
    </section>
  )
}