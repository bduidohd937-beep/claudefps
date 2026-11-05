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
  const [audit, setAudit] = useState(null)
  const [scanInfo, setScanInfo] = useState({ nodes: 0, pending: 0 })
  const spawnError = useGame((s) => s.spawnError)
  const retrySpawn = useGame((s) => s.retrySpawn)

  useEffect(() => {
    if (!open) return
    setPlayer(toFields(refs.safePlayerSpawn || SPAWNS.player))
    setBot(toFields(refs.safeBotSpawn || SPAWNS.bot))
    setAudit(refs.lastSpawnAudit || null)
    setBounds(refs.mapBounds)
    setMessage('플레이어와 AI는 각각 독립적으로 이동·저장돼. 랜덤 후보도 지면과 벽을 검사해.')
  }, [open])
  useEffect(() => {
    if (!open) return
    const refresh = () => setScanInfo({
      nodes: refs.navigation?.graph.nodes.length ?? 0,
      pending: refs.navigation?.queue.length ?? 0,
    })
    refresh()
    const interval = window.setInterval(refresh, 900)
    return () => window.clearInterval(interval)
  }, [open])
  if (!open) return null

  const fields = (kind) => kind === 'player' ? player : bot
  const inspectPair = () => {
    const a = readFields(player), b = readFields(bot)
    const result = refs.inspectSpawnPair?.(a, b)
    if (!result) {
      setMessage('경기 맵의 물리 검사기가 아직 준비되지 않았어.')
      return null
    }
    setAudit(result)
    setMessage(result.ok ? '양쪽 스폰 조합이 현재 안전 검사에 통과했어.' :
      '스폰 조합이 검증되지 않았어. 아래 이유를 확인하고 다시 조정해 줘.')
    return result
  }
  const updateFields = (kind, pos) => { setAudit(null); (kind === 'player' ? setPlayer : setBot)(toFields(pos)) }
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
    setAudit(null)
    if (kind === 'player') refs.safePlayerSpawn = [...safe]
    else refs.safeBotSpawn = [...safe]
    setMessage(label(kind) + ' 좌표 저장 완료. 상대방은 움직이지 않았어. 경기 재개 전에 쌍 안전도를 검사해 줘.')
  }
  const randomOne = (kind) => {
    const safe = refs.randomSafeSpawn?.(kind)
    if (!safe) {
      setMessage(label(kind) + '의 검증된 랜덤 후보가 없어. ' +
        (refs.lastSpawnAudit?.reasons?.slice(0, 2).join(' / ') ||
        'NavGraph 스캔이 끝나지 않았거나 주변에 안전한 이동 구역이 부족해.'))
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
    setAudit(null)
    clearSpawnOverrides()
    setPlayer(toFields(SPAWNS.player))
    setBot(toFields(SPAWNS.bot))
    const ok = refs.resetRound?.()
    setAudit(refs.lastSpawnAudit || null)
    setMessage(ok ? '양쪽 수동 좌표를 초기화하고 검증된 스폰 조합을 선택했어.' :
      '초기화했지만 아직 안전한 쌍을 찾지 못했어. 아래 검사 결과를 확인해 줘.')
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
      {spawnError && (
        <div role="alert" style={{ padding: 12, border: '1px solid #ffb65b',
          borderRadius: 5, background: '#493321', margin: '12px 0', fontSize: 12, lineHeight: 1.6 }}>
          <strong>안전 스폰을 찾지 못해 경기를 일시 중지했어.</strong>
          <div>{spawnError}</div>
          <button type="button" className="start" style={{ marginTop: 8 }}
            onClick={() => {
              if (!retrySpawn()) setMessage('아직 두 스폰이 안전하지 않아. 지면과 두 위치의 거리·엄폐를 확인해 줘.')
            }}>저장한 스폰으로 안전 검사 후 경기 재개</button>
        </div>
      )}
      <p style={{ color: '#aeb7c1', fontSize: 12, margin: '8px 0 12px' }}>
        맵: {ACTIVE_MAP.key} · 편집하는 동안 중력·AI 활동 정지
      </p>
      <div style={{ padding: 11, marginBottom: 12, border: '1px solid #466075',
        borderRadius: 6, background: '#17242c', fontSize: 12, lineHeight: 1.65 }}>
        <strong>스폰 V5 안전도 검사</strong>
        <div>NavGraph: 탐색 지점 {scanInfo.nodes}개 · 남은 탐색 후보 {scanInfo.pending}개</div>
        <button type="button" style={{ ...btn, marginTop: 7, background: '#245b56' }}
          onClick={inspectPair}>입력된 플레이어·AI 스폰 조합 검사</button>
        {audit && <div role="status" aria-live="polite" style={{ marginTop: 9,
          padding: 9, borderRadius: 4, background: audit.ok ? '#193a2a' : '#443123',
          border: '1px solid ' + (audit.ok ? '#4eaa7b' : '#b9874d') }}>
          <strong>{audit.status === 'partial' ? '물리 검사만 통과' : audit.ok ? '연결성 포함 통과' : audit.status === 'pending' ? '경로 탐색 대기' : '부적합'} · {audit.score}/100</strong>
          {audit.metrics && <div>시작 거리 {audit.metrics.distance.toFixed(1)}m ·
            고도 차 {audit.metrics.height.toFixed(1)}m ·
            탈출 방향 {audit.metrics.playerExits}/{audit.metrics.botExits} ·
            실제 경로 {audit.metrics.route == null ? '미확인' : audit.metrics.route.toFixed(1) + 'm'}</div>}
          {!audit.ok && <ul style={{ paddingLeft: 18, margin: '6px 0 0' }}>
            {audit.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
          </ul>}
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            안전도 점수는 내부 기준 비교용이며 모든 지형의 안전을 보증하지 않아.
          </div>
        </div>}
      </div>
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
