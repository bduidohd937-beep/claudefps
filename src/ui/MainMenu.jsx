import { useState } from 'react'
import { ACTIVE_MAP, CFG, MAP_CHOICES, MAPS, MATCH, TRAINING } from '../config'
import { useGame } from '../store'
import './MainMenu.css'

const LEVELS = [
  { n: 1, name: '입문' }, { n: 2, name: '쉬움' }, { n: 3, name: '보통' },
  { n: 4, name: '어려움' }, { n: 5, name: '전문가' },
]

export function toLobby() {
  const target = new URL(window.location.href)
  target.searchParams.delete('enter')
  target.searchParams.delete('level')
  target.searchParams.delete('spawn')
  target.searchParams.delete('bot')
  window.location.assign(target.toString())
}

export default function MainMenu() {
  const [selected, setSelected] = useState(
    MAP_CHOICES.some((m) => m.id === ACTIVE_MAP.key) ? ACTIVE_MAP.key : 'pvp',
  )
  const [level, setLevel] = useState(() => {
    const n = Number(new URLSearchParams(window.location.search).get('level'))
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 3
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const sensitivity = useGame((s) => s.sensitivity)
  const setSensitivity = useGame((s) => s.setSensitivity)
  const selectedMap = MAP_CHOICES.find((m) => m.id === selected) ?? MAP_CHOICES[0]

  async function enterGame() {
    if (busy) return
    setBusy(true)
    setError('')
    const file = MAPS[selected]
    if (file) {
      try {
        const response = await fetch(file, { method: 'HEAD', cache: 'no-store' })
        const type = (response.headers.get('content-type') || '').toLowerCase()
        if (!response.ok || type.includes('html')) {
          setError('맵 파일이 없어! 프로젝트의 public' + file + ' 경로에 GLB를 넣어줘.')
          setBusy(false)
          return
        }
      } catch {
        setError('맵을 확인하지 못했어. 로컬 서버와 public/maps 폴더를 확인해 줘.')
        setBusy(false)
        return
      }
    }
    // Physics and meshes are mounted only after the explicit launch.
    const target = new URL(window.location.href)
    target.searchParams.set('map', selected)
    target.searchParams.set('level', String(level))
    target.searchParams.set('enter', '1')
    target.searchParams.delete('spawn')
    target.searchParams.delete('bot')
    window.location.assign(target.toString())
  }

  return (
    <main className="lobby">
      <div className="lobby-glow" aria-hidden="true" />
      <header className="lobby-top">
        <div className="lobby-brand"><span className="lobby-brand-mark">C<span>:</span></span> CLAUDE<span>FPS</span></div>
        <div className="lobby-build">CLASSIC DUEL <b>V0.2.6</b></div>
      </header>

      <section className="lobby-body" aria-label="FPS 시작 화면">
        <div className="lobby-intro">
          <div className="lobby-eyebrow"><span className="lobby-dot" /> SINGLE PLAYER · OFFLINE ARENA</div>
          <h1>ONE ON<br /><em>ONE.</em></h1>
          <p>클래식 1:1 FPS. 원하는 전장을 선택하고 AI와 5선승 승부를 펼쳐.</p>
          <div className="lobby-facts">
            <span><strong>01 : 01</strong> 대전</span>
            <span><strong>05</strong> 선승</span>
            <span><strong>06</strong> 전장</span>
          </div>
          <div className="lobby-side-note">WASD 이동 · SHIFT 달리기 · C 앉기 · F2 무기 조정 · F6 스폰 설정</div>
        </div>

        <div className="lobby-panel">
          <div className="lobby-panel-head">
            <div>
              <span className="lobby-step">01 / MAP SELECTION</span>
              <h2>전장 선택</h2>
            </div>
            <span className="lobby-count">6 MAPS</span>
          </div>
          <div className="lobby-map-grid" role="radiogroup" aria-label="대전 맵">
            {MAP_CHOICES.map((map, index) => (
              <button
                type="button"
                key={map.id}
                role="radio"
                aria-checked={selected === map.id}
                className={'lobby-map' + (selected === map.id ? ' selected' : '')}
                onClick={() => { setSelected(map.id); setError('') }}
              >
                <span className={'lobby-map-art art-' + map.id} aria-hidden="true">
                  <span className="lobby-map-number">{String(index + 1).padStart(2, '0')}</span>
                </span>
                <span className="lobby-map-copy">
                  <strong>{map.label}</strong>
                  <small>{map.detail}</small>
                </span>
                <span className="lobby-map-radio" aria-hidden="true" />
              </button>
            ))}
          </div>

          <div className="lobby-rule">
            <div>
              <span className="lobby-step">02 / MATCH SETTINGS</span>
              <h2>AI 난이도</h2>
            </div>
            <div className="lobby-difficulties" role="radiogroup" aria-label="AI 난이도">
              {LEVELS.map(({ n, name }) => (
                <button key={n} type="button" role="radio" aria-checked={level === n}
                  className={level === n ? 'active' : ''}
                  onClick={() => setLevel(n)}
                  title={name}>
                  <strong>{n}</strong><small>{name}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="lobby-options">
            <button type="button" className="lobby-options-trigger" aria-expanded={showOptions}
              onClick={() => setShowOptions((v) => !v)}>
              <span>조작 설정</span><span>{showOptions ? '접기 −' : '열기 +'}</span>
            </button>
            {showOptions && <div className="lobby-sensitivity">
              <label htmlFor="lobby-sens">마우스 감도 <b>{sensitivity.toFixed(2)}</b></label>
              <input id="lobby-sens" type="range" min={CFG.sensMin} max={CFG.sensMax} step="0.05"
                value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} />
              <p>무기 위치·기울기는 대전 진입 후 F2에서 실제 3D 모델을 보며 조정할 수 있어.</p>
            </div>}
          </div>

          <div className="lobby-action">
            <div className="lobby-selection">선택된 전장 <b>{selectedMap.label}</b><br />{TRAINING ? '사격 연습' : MATCH.winScore + '선승 · AI Lv.' + level}</div>
            <button className="lobby-enter" type="button" disabled={busy} onClick={enterGame}>
              {busy ? '전장 확인 중...' : '입장하기'} <span aria-hidden="true">→</span>
            </button>
            {error && <div className="lobby-error" role="alert">{error}</div>}
          </div>
        </div>
      </section>
      <footer className="lobby-footer"><span>CLAUDE × GPT FPS PROJECT</span><span>선택 후 입장하기를 누르면 게임 화면으로 이동합니다.</span></footer>
    </main>
  )
}
