import { useState } from 'react'
import { ACTIVE_MAP, MAPS, MAP_CHOICES } from '../config'

export default function MapSelector() {
  const [selected, setSelected] = useState(ACTIVE_MAP.key)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  const choice = MAP_CHOICES.find((map) => map.id === selected)

  const switchMap = async () => {
    if (checking || selected === ACTIVE_MAP.key) return
    setChecking(true)
    setMessage('')
    const path = MAPS[selected]
    if (path) {
      try {
        // Vite sometimes answers missing files with index.html and HTTP 200.
        const response = await fetch(path, { method: 'HEAD', cache: 'no-store' })
        const type = response.headers.get('content-type') || ''
        if (!response.ok || type.includes('text/html')) {
          setMessage('맵 파일을 찾지 못했어. public' + path + '에 GLB 파일을 넣어줘.')
          setChecking(false)
          return
        }
      } catch {
        setMessage('맵 파일 확인 실패. 개발 서버 실행과 파일 위치를 확인해 줘.')
        setChecking(false)
        return
      }
    }
    // Reload is intentional: physics colliders and round spawns belong to each map.
    const next = new URL(window.location.href)
    next.searchParams.set('map', selected)
    next.searchParams.delete('spawn')
    next.searchParams.delete('bot')
    window.location.assign(next.toString())
  }

  return (
    <section style={{ marginBottom: 16, padding: 12, border: '1px solid #454e58', borderRadius: 6 }}>
      <label htmlFor="map-selection" style={{ display: 'block', fontWeight: 700, marginBottom: 7 }}>
        대전 맵 선택
      </label>
      <select
        id="map-selection"
        value={selected}
        onChange={(e) => { setSelected(e.target.value); setMessage('') }}
        style={{ width: '100%', padding: 10, color: '#f2f4f7',
          background: '#222a33', border: '1px solid #67717c', borderRadius: 4 }}
      >
        {MAP_CHOICES.map((map) => (
          <option key={map.id} value={map.id}>{map.label}</option>
        ))}
      </select>
      <div style={{ color: '#adb8c4', fontSize: 12, marginTop: 7 }}>
        {choice?.detail}
        {MAPS[selected] && (
          <div style={{ overflowWrap: 'anywhere', marginTop: 4 }}>
            필요한 파일: {MAPS[selected].split('/').pop()}
          </div>
        )}
      </div>
      <button
        type="button"
        className="ghost"
        onClick={switchMap}
        disabled={checking || selected === ACTIVE_MAP.key}
        style={{ opacity: checking || selected === ACTIVE_MAP.key ? 0.5 : 1 }}
      >
        {checking ? '파일 확인 중…' : selected === ACTIVE_MAP.key ? '현재 선택된 맵' : '선택한 맵으로 게임 다시 시작'}
      </button>
      {message && <p role="alert" style={{ color: '#ffb88e', fontSize: 12, margin: '9px 0 0' }}>{message}</p>}
      <p style={{ margin: '7px 0 0', fontSize: 11, color: '#9aa4af' }}>
        맵 변경 시 현재 매치는 초기화돼. 스폰 좌표는 맵마다 F6으로 별도 저장할 수 있어.
      </p>
    </section>
  )
}
