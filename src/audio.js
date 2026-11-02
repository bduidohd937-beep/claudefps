// 사운드 매니저: /sounds/*.mp3 가 있으면 그 파일을, 없으면 Web Audio로 합성한 임시 효과음을 재생합니다.
const FILES = {
  rifle_shot: '/sounds/rifle_shot.mp3',
  pistol_shot: '/sounds/pistol_shot.mp3',
  bot_shot: '/sounds/bot_shot.mp3',
  hit_marker: '/sounds/hit_marker.mp3',
  reload: '/sounds/reload.mp3',
  headshot: '/sounds/headshot.mp3', // 선택
  hurt: '/sounds/hurt.mp3', // 선택
  footstep_1: '/sounds/footstep_1.mp3',
  footstep_2: '/sounds/footstep_2.mp3',
}

let ctx = null
let master = null
let noiseBuf = null
const buffers = {}

export function initAudio() {
  if (ctx) { ctx.resume?.(); return }
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0.7
  master.connect(ctx.destination)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  Object.entries(FILES).forEach(([k, u]) => loadFile(k, u))
}

async function loadFile(key, url) {
  try {
    const r = await fetch(url)
    const type = r.headers.get('content-type') || ''
    if (!r.ok || type.includes('text/html')) return // 파일 없음 → 합성음 사용
    buffers[key] = await ctx.decodeAudioData(await r.arrayBuffer())
  } catch { /* 합성음 사용 */ }
}

function noise(t, dur, { type = 'lowpass', f0 = 4000, f1 = 800, q = 0.7, gain = 0.8 } = {}) {
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  const f = ctx.createBiquadFilter()
  f.type = type
  f.Q.value = q
  f.frequency.setValueAtTime(f0, t)
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  s.connect(f).connect(g).connect(master)
  s.start(t, Math.random() * 0.5, dur + 0.02)
}

function tone(t, dur, f0, f1, { type = 'sine', gain = 0.5 } = {}) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}

const clack = (t, v) => {
  noise(t, 0.06, { type: 'bandpass', f0: 1800, f1: 900, q: 2, gain: 0.7 * v })
  tone(t, 0.05, 700, 300, { type: 'square', gain: 0.15 * v })
}

const SYNTH = {
  rifle_shot: (t, v, r) => {
    noise(t, 0.16, { f0: 6000 * r, f1: 500, gain: 0.9 * v })
    tone(t, 0.12, 150 * r, 45, { type: 'triangle', gain: 0.8 * v })
  },
  pistol_shot: (t, v, r) => SYNTH.rifle_shot(t, v * 0.85, r * 1.15),
  bot_shot: (t, v, r) => SYNTH.rifle_shot(t, v, r * 0.9),
  hit_marker: (t, v) => {
    tone(t, 0.05, 1900, 1300, { type: 'square', gain: 0.22 * v })
    noise(t, 0.04, { type: 'highpass', f0: 3000, f1: 2500, gain: 0.3 * v })
  },
  headshot: (t, v) => {
    tone(t, 0.24, 2600, 2000, { gain: 0.5 * v })
    tone(t, 0.24, 3900, 3000, { gain: 0.3 * v })
    tone(t, 0.1, 220, 80, { type: 'triangle', gain: 0.7 * v })
    noise(t, 0.06, { type: 'highpass', f0: 2500, f1: 2000, gain: 0.4 * v })
  },
  reload: (t, v) => { clack(t + 0.3, v); clack(t + 1.05, v); clack(t + 1.6, v) },
  dry_fire: (t, v) => tone(t, 0.04, 900, 500, { type: 'square', gain: 0.2 * v }),
  knife_swing: (t, v) => noise(t, 0.16, { type: 'highpass', f0: 800, f1: 4500, gain: 0.45 * v }),
  buy: (t, v) => {
    tone(t, 0.08, 1100, 1500, { type: 'square', gain: 0.15 * v })
    tone(t + 0.07, 0.12, 1500, 2100, { type: 'square', gain: 0.15 * v })
  },
  round_win: (t, v) => {
    tone(t, 0.14, 660, 660, { gain: 0.3 * v })
    tone(t + 0.14, 0.14, 830, 830, { gain: 0.3 * v })
    tone(t + 0.28, 0.3, 990, 990, { gain: 0.3 * v })
  },
  round_lose: (t, v) => {
    tone(t, 0.25, 330, 300, { type: 'triangle', gain: 0.35 * v })
    tone(t + 0.25, 0.4, 250, 180, { type: 'triangle', gain: 0.35 * v })
  },
  hurt: (t, v) => {
    tone(t, 0.25, 140, 60, { type: 'triangle', gain: 0.9 * v })
    noise(t, 0.2, { f0: 1200, f1: 200, gain: 0.6 * v })
  },
  footstep_1: (t, v) => noise(t, 0.08, { type: 'lowpass', f0: 900, f1: 180, gain: 0.35 * v }),
  footstep_2: (t, v) => noise(t, 0.08, { type: 'lowpass', f0: 760, f1: 150, gain: 0.35 * v }),
}

export function play(name, { volume = 1, rate = 1 } = {}) {
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume()
  const buf = buffers[name]
  if (buf) {
    const s = ctx.createBufferSource()
    s.buffer = buf
    s.playbackRate.value = rate
    const g = ctx.createGain()
    g.gain.value = volume
    s.connect(g).connect(master)
    s.start()
    return
  }
  SYNTH[name]?.(ctx.currentTime, volume, rate)
}
