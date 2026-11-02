// 적 레지스트리: 레이캐스트 대상 메시와 적 상태를 모듈 레벨로 공유합니다. (React 리렌더 없음)
export const enemies = new Map() // id -> { name, dead, hp, takeDamage(dmg) => { killed } }
export const targetMeshes = [] // userData: { enemyId, part: 'head' | 'body' | 'legs' }
