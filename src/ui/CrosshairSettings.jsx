import { useGame } from '../store'

const MODES = [
  { id: 'dot', label: '점 ●' },
  { id: 'cross', label: '십자 +' },
  { id: 'dynamic', label: '가변 +' },
]
export default function CrosshairSettings() {
  const mode = useGame((s) => s.crosshairMode)
  const color = useGame((s) => s.crosshairColor)
  const setMode = useGame((s) => s.setCrosshairMode)
  const setColor = useGame((s) => s.setCrosshairColor)
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      <strong style={{ fontSize: 12 }}>조준선 모양</strong>
      <div role="radiogroup" aria-label="조준선 모양" style={{ display: 'flex', gap: 7 }}>
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id}
            onClick={() => setMode(m.id)}
            style={{ flex: 1, border: '1px solid ' + (mode === m.id ? '#f08b46' : '#54616b'),
              background: mode === m.id ? '#9a4926' : '#202936', color: '#f1f4f7',
              borderRadius: 5, cursor: 'pointer', padding: '9px 4px', fontSize: 12 }}>
            {m.label}
          </button>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
        조준선 색상
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
          aria-label="조준선 색상" style={{ width: 52, height: 29, cursor: 'pointer' }} />
      </label>
      <small style={{ color: '#a2adb8' }}>설정은 자동 저장돼. 가변형은 이동·사격 퍼짐에 따라 변해.</small>
    </div>
  )
}
