import * as THREE from 'three'

// --- 간단한 이벤트 버스 (HUD 등 UI가 게임 이벤트를 구독) ---
const handlers = {}
export const on = (ev, fn) => {
  (handlers[ev] ||= new Set()).add(fn)
  return () => handlers[ev].delete(fn)
}
export const emit = (ev, data) => handlers[ev]?.forEach((fn) => fn(data))

// --- 카메라 반동 / 피격 킥백 / 흔들림 ---
const UP = new THREE.Vector3(0, 1, 0)
const shakeQ = new THREE.Quaternion()
const shakeInv = new THREE.Quaternion()
const shakeE = new THREE.Euler()
let applied = false

export const cam = { shake: 0, recoil: 0, flinchP: 0, flinchY: 0 }

// 사격 반동: 시점을 즉시 위로 튕기고(pitch), 이후 자동으로 되돌아옵니다.
export function kick(camera, pitch, yaw) {
  camera.rotateX(pitch)
  camera.rotateOnWorldAxis(UP, yaw)
  cam.recoil += pitch
}

// 프레임 시작: 지난 프레임의 흔들림 회전 제거 + 피격 킥백 적용 + 반동 회복
export function camBegin(camera, dt) {
  if (applied) {
    camera.quaternion.multiply(shakeInv)
    applied = false
  }
  if (cam.flinchP || cam.flinchY) {
    camera.rotateX(cam.flinchP)
    camera.rotateOnWorldAxis(UP, cam.flinchY)
    cam.recoil += cam.flinchP
    cam.flinchP = 0
    cam.flinchY = 0
  }
  if (cam.recoil > 0) {
    const rec = cam.recoil * (1 - Math.exp(-9 * dt))
    camera.rotateX(-rec)
    cam.recoil -= rec
  }
}

// 프레임 끝: 피격 흔들림 적용 (렌더 직전)
export function camEnd(camera, t, dt) {
  cam.shake *= Math.exp(-5 * dt)
  const a = Math.min(cam.shake, 1.4)
  if (a < 0.005) return
  shakeE.set(Math.sin(t * 41) * 0.045 * a, Math.cos(t * 33) * 0.045 * a, Math.sin(t * 57) * 0.07 * a)
  shakeQ.setFromEuler(shakeE)
  shakeInv.copy(shakeQ).invert()
  camera.quaternion.multiply(shakeQ)
  camera.position.x += (Math.random() - 0.5) * 0.06 * a
  camera.position.y += (Math.random() - 0.5) * 0.06 * a
  applied = true
}
