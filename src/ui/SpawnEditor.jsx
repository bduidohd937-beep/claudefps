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
    <div style={{ marginBottom: 10 }}>
      <b style={{ fontSize: 13 }}>{title}</b>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        {['X (좌우)', 'Y (높이)', 'Z (앞뒤)'].map((label, i) => (
          <label key={label} style={{ flex: 1, minWidth: 0, fontSize: 11, color: '#c5cbd0' }}>
            {label}
            <input aria-label={title + ' ' + label} type="number" step="0.25"
              value={values[i]}
              onChange={(e) => change(values.map((v, j) => j === i ? e.target.value : v))}
              style={{ width: '100%', marginTop: 4, padding: 8, background: '#171b20',
                color: '#fff', border: '1px solid #656d75', borderRadius: 4, fontSize: 13 }} />
          </label>
        ))}
      </div>
    </div>
  )
}

const btn = { padding: '9px 10px', cursor: 'pointer', borderRadius: 4,
  border: '1px solid #5b6670', color: 'white', background: '#303942', fontSize: 12 }

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
    setMessage('플레이어와 AI는 각각 독립적으로 이동·저장돼. 랜덤 후보도 지면과 벽을 검사해.')
  }, [open])
  if (!open) return null

  const fields = (kind) => kind === 'player' ? player : bot
  const updateFields = (kind, pos) => (kind === 'player' ? setPlayer : setBot)(toFields(pos))
  const label = (kind) => kind === 'player' ? '플레이어' : 'AI'
  const moveOnly = (kind, point) => {
    if (!point) return false
    const move = kind === 'player' ? refs.teleportPlayer : refs.teleportBot
    if (!move) { setMessage(label(kind) + ' 물리 객체가 준비되지 않았어.'); return false }
    move(point)
    updateFields(kind, point)
    return true
  }
  const validated = (kind) => {
    const point = readFields(fields(kind))
    if (!point) { setMessage(label(kind) + ' 좌표를 숫자로 입력해 줘.'); return null }
    const safe = refs.validateSpawn?.(kind, point)
    if (!safe) {
      setMessage(label(kind) + ' 위치는 지면·천장·벽·상대 거리를 통과하지 못했어. 근처 지면 맞춤이나 안전 랜덤을 사용해 줘.')
      return null
    }
    return safe
  }
  const preview = (kind) => {
    const safe = validated(kind)
    if (safe && moveOnly(kind, safe))
      setMessage(label(kind) + '만 이동했어. 아직 저장하진 않았어.')
  }
  const saveOne = (kind) => {
    const safe = validated(kind)
    if (!safe || !moveOnly(kind, safe)) return
    saveSpawn(kind, safe)
    if (kind === 'player') refs.safePlayerSpawn = [...safe]
    else refs.safeBotSpawn = [...safe]
    setMessage(label(kind) + ' 좌표 저장 완료. 상대방은 움직이지 않았어.')
  }
  const randomOne = (kind) => {
    const safe = refs.randomSafeSpawn?.(kind)
    if (!safe) {
      setMessage(label(kind) + '의 안전한 랜덤 후보를 찾지 못했어. 이 맵의 F6 기준 스폰을 먼저 정상 지면에 저장해 줘.')
      return
    }
    if (moveOnly(kind, safe)) setMessage(label(kind) + '만 안전 랜덤 위치로 이동했어. 마음에 들면 저장 버튼을 눌러.')
  }
  const snapOne = (kind) => {
    const requested = readFields(fields(kind))
    if (!requested) { setMessage('숫자 좌표를 먼저 입력해 줘.'); return }
    const point = refs.snapSpawn?.(requested)
    if (!point) { setMessage('근처 지면을 찾지 못했어.'); return }
    const safe = refs.validateSpawn?.(kind, point)
    if (!safe) { setMessage('지면은 있지만 충돌 또는 상대와의 거리가 안전하지 않아.'); return }
    if (moveOnly(kind, safe)) setMessage(label(kind) + '를 검증된 지면에 맞췄어.')
  }
  const currentOne = (kind) => {
    const p = (kind === 'player' ? refs.playerBody : refs.botBody)?.translation()
    if (!p) return setMessage('물리 객체가 아직 준비되지 않았어.')
    updateFields(kind, [p.x, p.y, p.z])
    setMessage(label(kind) + ' 현재 좌표를 입력창으로 가져왔어.')
  }
  const reset = () => {
    clearSpawnOverrides()
    setPlayer(toFields(SPAWNS.player))
    setBot(toFields(SPAWNS.bot))
    refs.resetRound?.()
    setMessage('양쪽 수동 스폰을 초기화하고 자동 스폰을 재탐색했어.')
  }

  return (
    <aside aria-label="스폰 좌표 편집기" style={{
      position: 'fixed', top: 18, right: 18, zIndex: 999,
      maxHeight: 'calc(100vh - 36px)', overflowY: 'auto',
      width: 'min(520px, calc(100vw - 36px))', padding: 18,
      background: 'rgba(13,17,23,.97)', color: '#fff',
      border: '1px solid #e28c35', borderRadius: 9, boxShadow: '0 12px 45px #0009',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>스폰 편집기 · F6</h2>
        <button style={btn} onClick={() => setOpen(false)}>닫기</button>
      </div>
      <p style={{ color: '#aeb7c1', fontSize: 12, margin: '8px 0 12px' }}>
        맵: {ACTIVE_MAP.key} · 편집하는 동안 중력·AI 활동 정지
      </p>
      {bounds && <details style={{ fontSize: 11, marginBottom: 12, background: '#242b32', padding: 10, borderRadius: 5 }}>
        <summary style={{ cursor: 'pointer' }}>맵 좌표 범위 보기</summary>
        <p>중심: {bounds.center.map(n => n.toFixed(1)).join(', ')}</p>
        {['X','Y','Z'].map((axis,i) => <div key={axis}>{axis}: {bounds.min[i].toFixed(1)} ~ {bounds.max[i].toFixed(1)}</div>)}
      </details>}
      {[
        { kind:'player', title:'내 스폰 위치', vals:player, change:setPlayer },
        { kind:'bot', title:'AI 스폰 위치', vals:bot, change:setBot },
      ].map(({kind,title,vals,change}) => (
        <section key={kind} style={{ border: '1px solid #45515d', borderRadius: 6, padding: 11, marginBottom: 12 }}>
          <XYZ title={title} values={vals} change={change} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button style={btn} onClick={() => currentOne(kind)}>현재 좌표</button>
            <button style={btn} onClick={() => snapOne(kind)}>지면 맞춤</button>
            <button style={{ ...btn, background: '#415568' }} onClick={() => randomOne(kind)}>안전 랜덤 이동</button>
            <button style={btn} onClick={() => preview(kind)}>이 좌표로 이동</button>
          </div>
          <button className="start" style={{ marginTop: 8, padding: 10 }} onClick={() => saveOne(kind)}>
            {label(kind)}만 저장
          </button>
        </section>
      ))}
      <button className="ghost" onClick={reset}>양쪽 수동 좌표 초기화 + 자동 탐색</button>
      <p role="status" style={{ minHeight: 35, color: '#e3b97a', fontSize: 12, lineHeight: 1.6 }}>
        {message}
      </p>
      <div style={{ fontSize: 11, lineHeight: 1.6, color: '#a4aeba' }}>
        랜덤 이동은 임시 미리보기야. 게임에 영구 적용하려면 각 캐릭터의 저장 버튼을 눌러.
        맵 전체의 층간 경로까지 보장하는 기능은 아니야.
      </div>
    </aside>
  )
}
