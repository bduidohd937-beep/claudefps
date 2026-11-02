import { useEffect, useRef, useState } from 'react'
import { CFG, MATCH, TRAINING } from '../config'
import { live, refs, useGame } from '../store'
import { WEAPONS } from '../weapons'
import { SHOP } from '../shop'
import { on } from '../fx'
import { initAudio } from '../audio'
import SpawnEditor from './SpawnEditor'
import WeaponTuner from './WeaponTuner'
import { toLobby } from './MainMenu'

const STATE_LABEL = { stand: '정지', walk: '걷기', run: '달리기', crouch: '앉기', air: '공중' }

// 크로스헤어: 실제 탄 퍼짐(도)을 화면 픽셀로 환산해서 벌어짐을 표시. 사격 시 미세 킥백.
// 매 프레임 DOM을 직접 갱신하므로 React 리렌더가 발생하지 않습니다.
function Crosshair() {
  const parts = useRef({})
  const debug = useRef()

  useEffect(() => {
    let raf
    const halfFov = Math.tan((CFG.fov * Math.PI) / 360)
    const tick = () => {
      const px = (Math.tan((live.totalSpread * Math.PI) / 180) / halfFov) * (window.innerHeight / 2)
      const gap = Math.max(3, px) + live.crossKick * 6
      const p = parts.current
      if (p.l) {
        p.l.style.transform = `translateX(${-gap - 9}px)`
        p.r.style.transform = `translateX(${gap}px)`
        p.t.style.transform = `translateY(${-gap - 9}px)`
        p.b.style.transform = `translateY(${gap}px)`
      }
      if (debug.current) {
        const pos = refs.playerBody?.translation()
        let html =
          `상태 <b>${STATE_LABEL[live.state]}</b><br>` +
          `속도 <b>${live.speed.toFixed(1)}</b> m/s<br>` +
          `퍼짐 <b>${live.totalSpread.toFixed(2)}°</b>`
        if (pos) html += `<br>위치 <b>${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}</b>`
        if (live.tuner) {
          const t = live.vmTune[live.weapon]
          html += `<br><br><b>뷰모델 튜너 (${live.weapon})</b><br>` +
            `x ${t.x.toFixed(2)} y ${t.y.toFixed(2)} z ${t.z.toFixed(2)}<br>` +
            `scale ×${t.s.toFixed(2)} rx ${t.rx.toFixed(1)} ry ${t.ry.toFixed(1)}<br>` +
            `J/L 좌우 · I/K 상하 · U/O 앞뒤<br>Z/X 크기 · N/M 좌우회전 · T/G 위아래회전<br>Backspace 초기화`
        }
        debug.current.innerHTML = html
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const set = (key) => (el) => { parts.current[key] = el }
  return (
    <>
      <div className="crosshair">
        <i className="h" ref={set('l')} />
        <i className="h" ref={set('r')} />
        <i className="v" ref={set('t')} />
        <i className="v" ref={set('b')} />
        <i className="dot" />
      </div>
      <div className="debug" ref={debug} />
    </>
  )
}

// 적 피격: 붉은 X 히트마커(0.15초) + 데미지/헤드샷 텍스트
function HitFeedback() {
  const marker = useRef()
  const text = useRef()

  useEffect(() => on('hit', ({ headshot, killed, damage }) => {
    const m = marker.current
    const s = headshot ? 1.5 : killed ? 1.3 : 1
    m.style.strokeWidth = headshot || killed ? 4 : 3
    m.animate(
      [
        { opacity: 1, transform: `translate(-50%,-50%) scale(${s * 1.2})` },
        { opacity: 0, transform: `translate(-50%,-50%) scale(${s})` },
      ],
      { duration: 150, easing: 'ease-out' },
    )
    const t = text.current
    t.textContent = `${damage}${headshot ? '  헤드샷' : ''}${killed ? '  처치' : ''}`
    t.className = `hittext${headshot ? ' head' : ''}`
    t.animate(
      [
        { opacity: 1, transform: 'translate(-50%,0)' },
        { opacity: 1, transform: 'translate(-50%,-6px)', offset: 0.35 },
        { opacity: 0, transform: 'translate(-50%,-22px)' },
      ],
      { duration: 750, easing: 'ease-out' },
    )
  }), [])

  return (
    <>
      <svg ref={marker} className="hitmarker" viewBox="-20 -20 40 40" width="44" height="44">
        <g stroke="#ff2a2a" strokeLinecap="round" fill="none">
          <path d="M-12 -12 L-5 -5 M12 -12 L5 -5 M-12 12 L-5 5 M12 12 L5 5" />
        </g>
      </svg>
      <div ref={text} className="hittext" style={{ opacity: 0 }} />
    </>
  )
}

function Killfeed() {
  const [items, setItems] = useState([])
  useEffect(() => on('kill', (k) => {
    const id = performance.now() + Math.random()
    setItems((l) => [...l.slice(-4), { ...k, id }])
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 4500)
  }), [])

  return (
    <div className="killfeed">
      {items.map((k) => (
        <div key={k.id} className={`kill${k.headshot ? ' head' : ''}${k.victim === '플레이어' ? ' me' : ''}`}>
          <b>{k.killer ?? '플레이어'}</b>
          <span className="w">{k.weapon}</span>
          {k.headshot && <span className="hs">헤드샷</span>}
          <b>{k.victim}</b>
        </div>
      ))}
    </div>
  )
}

// 플레이어 피격: 화면 테두리 붉은 비네트
function DamageVignette() {
  const el = useRef()
  useEffect(() => on('playerHit', ({ amount }) => {
    el.current.animate(
      [{ opacity: Math.min(1, 0.55 + amount / 60) }, { opacity: 0 }],
      { duration: 900, easing: 'ease-out' },
    )
  }), [])
  return <div ref={el} className="vignette" />
}

// 좌하단: HP / Shield / 소지금
function Vitals() {
  const hp = useGame((s) => s.hp)
  const armor = useGame((s) => s.armor)
  const money = useGame((s) => s.money)
  return (
    <div className="vitals">
      {!TRAINING && <div className="money">${money.toLocaleString()}</div>}
      <div className="bar hp"><i style={{ width: `${hp}%` }} /><span>HP {Math.ceil(hp)}</span></div>
      <div className="bar armor"><i style={{ width: `${armor}%` }} /><span>Shield {Math.ceil(armor)}</span></div>
    </div>
  )
}

function Ammo() {
  const weapon = useGame((s) => s.weapon)
  const a = useGame((s) => s.ammo[s.weapon])
  const w = WEAPONS[weapon]
  const wrap = useRef()
  const bar = useRef()

  useEffect(() => {
    let raf
    const tick = () => {
      if (wrap.current) {
        wrap.current.dataset.reloading = live.reloading
        bar.current.style.transform = `scaleX(${live.reloading ? live.reloadProgress : 0})`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="ammo" ref={wrap} data-reloading="false">
      {!w.melee && (
        <div className="count">
          <b className={a.mag === 0 ? 'empty' : ''}>{a.mag}</b>
          <span>/ {a.reserve}</span>
        </div>
      )}
      <div className="wname">{w.name}</div>
      <div className="reload"><i ref={bar} /><em>재장전 중</em></div>
    </div>
  )
}

// 상단: 라운드 스코어 + 타이머
function Scoreboard() {
  const score = useGame((s) => s.score)
  const round = useGame((s) => s.round)
  const difficulty = useGame((s) => s.difficulty)
  const phase = useGame((s) => s.phase)
  const timer = useRef()

  useEffect(() => {
    let raf
    const tick = () => {
      if (timer.current) {
        const buy = live.phase === 'buy'
        const left = buy ? live.buyEnd - performance.now() / 1000 : live.roundTimeLeft
        const s = Math.max(0, Math.ceil(left))
        timer.current.textContent = buy
          ? `구매 ${s}초`
          : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (TRAINING || phase === 'menu') return null
  return (
    <div className="score">
      <div className="teams">
        <span className="me">플레이어 <b>{score.player}</b></span>
        <span className="sep">:</span>
        <span className="ai"><b>{score.ai}</b> AI Lv.{difficulty}</span>
      </div>
      <div className="sub">라운드 {round} · {MATCH.winScore}선승 · <span ref={timer} /></div>
    </div>
  )
}

function RoundBanner() {
  const phase = useGame((s) => s.phase)
  const b = useGame((s) => s.roundBanner)
  if (phase !== 'roundEnd' || !b) return null
  const win = b.winner === 'player'
  return (
    <div className={`banner ${win ? 'win' : 'lose'}`}>
      <h2>{win ? '라운드 승리' : '라운드 패배'}</h2>
      <p>+${b.reward.toLocaleString()}</p>
    </div>
  )
}

// B키 상점
function Shop() {
  const money = useGame((s) => s.money)
  const armor = useGame((s) => s.armor)
  const owned = useGame((s) => s.owned)
  const weapon = useGame((s) => s.weapon)
  const phase = useGame((s) => s.phase)
  const buy = useGame((s) => s.buy)
  const toggleShop = useGame((s) => s.toggleShop)
  const endBuy = useGame((s) => s.endBuy)
  const lock = useGame((s) => s.lock)
  const [msg, setMsg] = useState('')
  const timer = useRef()
  const canBuy = phase === 'buy'

  useEffect(() => {
    let raf
    const tick = () => {
      if (timer.current) timer.current.textContent = Math.max(0, Math.ceil(live.buyEnd - performance.now() / 1000))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const click = (id) => {
    const r = buy(id)
    setMsg(r.msg)
  }
  const stateOf = (it) => {
    if (it.id === 'rifle' && owned.rifle) return '보유 중'
    if (it.id === 'pistol') return weapon === 'pistol' ? '장착 중' : '장착'
    if ((it.id === 'armor_half' || it.id === 'armor_full') && armor >= CFG.armorMax) return '가득 참'
    return `$${it.price}`
  }

  const groups = [...new Set(SHOP.map((i) => i.group))]
  return (
    <div className="overlay">
      <div className="panel shop">
        <div className="shop-head">
          <h1>상점</h1>
          <div className="shop-money">${money.toLocaleString()}</div>
        </div>
        <p className="sub">
          {canBuy ? <>구매 시간 <b ref={timer} />초 남음</> : '지금은 구매할 수 없습니다 (구매 시간 종료)'}
        </p>
        {groups.map((g) => (
          <div key={g} className="shop-group">
            <h3>{g}</h3>
            {SHOP.filter((i) => i.group === g).map((it) => {
              const afford = money >= it.price
              return (
                <button
                  key={it.id}
                  className="item"
                  disabled={!canBuy || (!afford && it.price > 0)}
                  onClick={() => click(it.id)}
                >
                  <span className="n">{it.name}<small>{it.desc}</small></span>
                  <span className="p">{stateOf(it)}</span>
                </button>
              )
            })}
          </div>
        ))}
        <div className="shop-msg">{msg}</div>
        <div className="shop-actions">
          {canBuy ? (
            <button className="start" onClick={() => { initAudio(); endBuy(); lock() }}>준비 완료 · 라운드 시작</button>
          ) : (
            <button className="start" onClick={toggleShop}>닫기 (B)</button>
          )}
        </div>
        <p className="hint">B키로 상점을 열고 닫습니다. 열려 있는 동안 게임은 멈춥니다.</p>
      </div>
    </div>
  )
}

function SensSlider() {
  const sensitivity = useGame((s) => s.sensitivity)
  const setSensitivity = useGame((s) => s.setSensitivity)
  return (
    <div className="sens">
      <label htmlFor="sens">
        <span>마우스 감도</span>
        <output>{sensitivity.toFixed(2)}</output>
      </label>
      <input
        id="sens" type="range" min={CFG.sensMin} max={CFG.sensMax} step="0.05"
        value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))}
      />
    </div>
  )
}

// Only shown after entering a game. The independent main lobby lives in MainMenu.jsx.
function PauseMenu() {
  const lock = useGame((s) => s.lock)
  const setTuner = useGame((s) => s.setTunerOpen)
  const setSpawn = useGame((s) => s.setSpawnEditorOpen)
  return (
    <div className="overlay">
      <div className="panel" style={{ width: 'min(420px, 92vw)' }}>
        <h1>일시정지</h1>
        <p className="sub">게임을 계속하거나 로비로 돌아갈 수 있어.</p>
        <button className="start" onClick={() => { initAudio(); lock() }}>게임 계속하기</button>
        <button className="ghost" onClick={() => setTuner(true)}>무기 위치 조정 (F2)</button>
        <button className="ghost" onClick={() => setSpawn(true)}>스폰 위치 조정 (F6)</button>
        <button className="ghost" onClick={toLobby}>메인 메뉴로 돌아가기</button>
        <p className="hint">메인 메뉴에서는 맵과 AI 난이도를 변경할 수 있어.</p>
      </div>
    </div>
  )
}

function MatchEnd() {
  const phase = useGame((s) => s.phase)
  const over = useGame((s) => s.matchOver)
  const score = useGame((s) => s.score)
  const difficulty = useGame((s) => s.difficulty)
  const startMatch = useGame((s) => s.startMatch)
  if (phase !== 'matchEnd') return null
  const win = over === 'win'
  return (
    <div className="overlay">
      <div className={`panel result ${win ? 'win' : 'lose'}`}>
        <h1>{win ? '최종 승리' : '최종 패배'}</h1>
        <div className="final-score">{score.player} : {score.ai}</div>
        <p className="sub">AI 난이도 {difficulty}</p>
        <button className="start" onClick={() => { initAudio(); startMatch(difficulty) }}>재경기</button>
        <button className="ghost" onClick={toLobby}>메인 메뉴로</button>
      </div>
    </div>
  )
}

export default function HUD() {
  const locked = useGame((s) => s.locked)
  const phase = useGame((s) => s.phase)
  const shopOpen = useGame((s) => s.shopOpen)
  const spawnEditorOpen = useGame((s) => s.spawnEditorOpen)
  const tunerOpen = useGame((s) => s.tunerOpen)

  // B키: 상점 토글 (포인터락이 풀려 있어도 동작해야 하므로 전역 리스너)
  useEffect(() => {
    const kd = (e) => {
      if (e.repeat) return
      if (e.code === 'F6') {
        e.preventDefault()
        const st = useGame.getState()
        st.setSpawnEditorOpen(!st.spawnEditorOpen)
      } else if (e.code === 'Escape' && useGame.getState().spawnEditorOpen) {
        useGame.getState().setSpawnEditorOpen(false)
      } else if (e.code === 'KeyB' && !useGame.getState().spawnEditorOpen) {
        useGame.getState().toggleShop()
      }
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
  }, [])

  const playing = phase === 'buy' || phase === 'live' || phase === 'roundEnd'
  const showPause = !locked && !shopOpen && !spawnEditorOpen && !tunerOpen && (phase === 'buy' || phase === 'live')
  return (
    <>
      <DamageVignette />
      <Crosshair />
      <HitFeedback />
      <Killfeed />
      {playing && <Vitals />}
      {playing && <Ammo />}
      <Scoreboard />
      <RoundBanner />
      {phase === 'menu' && <div className="overlay"><div className="panel"><h1>전장 준비 중</h1><p className="sub">맵과 캐릭터를 불러오고 있어.</p><button className="ghost" onClick={toLobby}>메인 메뉴로 돌아가기</button></div></div>}
      {showPause && <PauseMenu />}
      {shopOpen && !spawnEditorOpen && !tunerOpen && (phase === 'buy' || phase === 'live') && <Shop />}
      <MatchEnd />
      <SpawnEditor />
      <WeaponTuner />
    </>
  )
}
