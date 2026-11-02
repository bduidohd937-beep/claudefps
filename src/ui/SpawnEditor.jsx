import { useEffect, useState } from 'react'
import { SPAWNS, ACTIVE_MAP, saveSpawn, clearSpawnOverrides } from '../config'
import { refs, useGame } from '../store'

const toFields = (v) => v.map((n) => String(Number(n.toFixed?.(2) ?? n)))
const readFields = (fields) => {
  if (fields.some((v) => String(v).trim() === '')) return null
  const coords = fields.map(Number)
  return coords.every((v) => Number.isFinite(v) && Math.abs(v) < 100000) ? coords : null
}

function XYZ({ title, values, change }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <b style={{ fontSize: 13 }}>{title}</b>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        {['X (좌우)', 'Y (높이)', 'Z (앞뒤)'].map((label, i) => (
          <label key={label} style={{ flex: 1, minWidth: 0, fontSize: 11, color: '#c5cbd0' }}>
            {label}
            <input
              aria-label={title + ' ' + label}
              type="number" step="0.25" value={values[i]}
              onChange={(e) => change(values.map((v, j) => j === i ? e.target.value : v))}
              style={{ width: '100%', marginTop: 4, padding: 8, background: '#171b20',
                color: '#fff', border: '1px solid #656d75', borderRadius: 4, fontSize: 13 }}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

export default function SpawnEditor() {
  const open = useGame((s) => s.spawnEditorOpen)
  const setOpen = useGame((s) => s.setSpawnEditorOpen)
  const [player, setPlayer] = useState(() => toFields(SPAWNS.player))
  const [bot, setBot] = useState(() => toFields(SPAWNS.bot))
  const [bounds, setBounds] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return
    setPlayer(toFields(SPAWNS.player))
    setBot(toFields(SPAWNS.bot))
    setBounds(refs.mapBounds)
    setMessage('입력 좌표는 캐릭터 중심 기준. Y는 실제 바닥보다 약 0.85 높여야 합니다.')
  }, [open])

  if (!open) return null

  const current = () => {
    const pos = refs.playerBody?.translation()
    if (!pos) return setMessage('플레이어 물리 객체가 준비되지 않았습니다.')
    setPlayer(toFields([pos.x, pos.y, pos.z]))
    setMessage('현재 플레이어 위치를 입력창에 반영했습니다.')
  }
  const goto = (pos) => {
    refs.teleportPlayer?.(pos)
    setPlayer(toFields(pos))
  }
  const preview = () => {
    const pos = readFields(player)
    if (!pos) return setMessage('좌표 3개를 올바른 숫자로 입력해 주세요.')
    goto(pos)
    setMessage('미리보기 이동 완료. 아직 저장되지는 않았습니다. 편집창을 닫으면 중력이 다시 적용됩니다.')
  }
  const snap = () => {
    const pos = readFields(player)
    if (!pos) return setMessage('플레이어 좌표부터 입력해 주세요.')
    const safe = refs.snapSpawn?.(pos)
    if (!safe) return setMessage('주변에서 지면을 찾지 못했습니다. GLB 맵의 중심 좌표를 확인해 주세요.')
    goto(safe)
    setMessage('근처 지면 위로 이동했습니다. 정상 위치인지 확인 후 저장하세요.')
  }
  const center = () => {
    if (!bounds) return setMessage('맵 범위를 읽지 못했습니다. GLB 로드 상태를 확인해 주세요.')
    // 모델의 최대 높이 위에 둬서, 맵 좌표가 원점에서 멀어도 찾을 수 있게 한다.
    const pos = [bounds.center[0], bounds.max[1] + 4, bounds.center[2]]
    goto(pos)
    setMessage('맵 중앙 상공으로 이동했습니다. Y를 낮추거나 지면 맞춤을 눌러 주세요.')
  }
  const apply = () => {
    const p = readFields(player)
    const b = readFields(bot)
    if (!p || !b) return setMessage('플레이어와 AI의 X/Y/Z를 모두 숫자로 입력해 주세요.')
    if (Math.hypot(p[0] - b[0], p[2] - b[2]) < 2) {
      return setMessage('플레이어와 AI 스폰을 최소 2m 이상 떨어뜨려 주세요.')
    }
    saveSpawn('player', p)
    saveSpawn('bot', b)
    refs.safePlayerSpawn = [...p]
    refs.safeBotSpawn = [...b]
    refs.teleportPlayer?.(p)
    refs.resetBot?.(b)
    setMessage('저장 완료! 이 맵의 다음 라운드와 새로고침에도 적용됩니다.')
  }
  const reset = () => {
    clearSpawnOverrides()
    setPlayer(toFields(SPAWNS.player))
    setBot(toFields(SPAWNS.bot))
    refs.resetRound?.()
    setMessage('수동 좌표를 삭제하고 자동 스폰을 다시 탐색했습니다.')
  }

  const btn = { padding: '9px 11px', cursor: 'pointer', borderRadius: 4,
    border: '1px solid #5b6670', color: 'white', background: '#303942', fontSize: 12 }
  return (
    <aside aria-label="스폰 좌표 편집기" style={{
      position: 'fixed', top: 18, right: 18, zIndex: 999, maxHeight: 'calc(100vh - 36px)',
      overflowY: 'auto', width: 'min(440px, calc(100vw - 36px))', padding: 18,
      background: 'rgba(13,17,23,0.97)', color: '#fff',
      border: '1px solid #e28c35', borderRadius: 9, boxShadow: '0 12px 45px #0009',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>스폰 좌표 편집기 (F6)</h2>
        <button style={btn} onClick={() => setOpen(false)}>닫기</button>
      </div>
      <p style={{ color: '#aeb7c1', fontSize: 12, margin: '8px 0 12px' }}>
        맵: {ACTIVE_MAP.key} · 편집 중 중력/이동 정지
      </p>
      {bounds && (
        <div style={{ fontSize: 12, background: '#242b32', padding: 10, marginBottom: 13, borderRadius: 4 }}>
          맵 중심 (대략): {bounds.center.map((n) => n.toFixed(1)).join(', ')}
          <div style={{ color: '#b9c1c8', marginTop: 4 }}>
            X 범위: {bounds.min[0].toFixed(1)} ~ {bounds.max[0].toFixed(1)}<br />
            Y 범위: {bounds.min[1].toFixed(1)} ~ {bounds.max[1].toFixed(1)}<br />
            Z 범위: {bounds.min[2].toFixed(1)} ~ {bounds.max[2].toFixed(1)}
          </div>
        </div>
      )}
      <XYZ title="플레이어 스폰" values={player} change={setPlayer} />
      <XYZ title="AI 스폰" values={bot} change={setBot} />
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
        <button style={btn} onClick={current}>현재 위치 가져오기</button>
        <button style={btn} onClick={preview}>입력 위치로 이동</button>
        <button style={btn} onClick={snap}>근처 지면 맞춤</button>
        <button style={btn} onClick={center}>맵 중앙 상공</button>
      </div>
      <button className="start" onClick={apply}>좌표 저장 + 즉시 이동</button>
      <button className="ghost" onClick={reset}>수동 좌표 초기화 (자동 탐색)</button>
      <p role="status" style={{ minHeight: 33, color: '#e3b97a', fontSize: 12, lineHeight: 1.5 }}>
        {message}
      </p>
      <div style={{ color: '#9ca4ae', fontSize: 12 }}>
        입력 후 이동 → 지면 확인 → 저장. 닫은 뒤에는 메뉴에서 '계속하기'를 눌러 조작하세요.
      </div>
    </aside>
  )
}
