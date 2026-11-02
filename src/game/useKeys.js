import { useEffect, useRef } from 'react'
import { live } from '../store'

// 눌린 키 상태를 ref에 저장 (리렌더 없음). e.code 기준이라 한글 입력 상태에서도 동작합니다.
export function useKeys() {
  const keys = useRef({})
  useEffect(() => {
    const down = (e) => {
      keys.current[e.code] = true
      if (live.locked && (e.code === 'Space' || e.code === 'Tab')) e.preventDefault()
    }
    const up = (e) => { keys.current[e.code] = false }
    const clear = () => { keys.current = {}; live.firing = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])
  return keys
}
