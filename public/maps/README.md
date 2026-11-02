# FPS V0.2.4 맵 선택 및 로컬 설치

게임 메인 메뉴 또는 일시정지 메뉴에서 맵을 고를 수 있습니다.
맵을 바꾸면 현재 매치는 초기화되고 해당 맵으로 페이지가 새로고침됩니다.

| 선택 메뉴 | 파일 경로 | URL |
| --- | --- | --- |
| 테스트 아레나 | 내장 맵 | `?map=arena` |
| FPS PVP/PVE | `fps_map_pvp_pve_games.glb` (저장소 포함) | `?map=pvp` |
| Warface PVP | `warface_pvp_map_fps.glb` | `?map=warface` |
| Brutalist | `brutalist_concrete_map_free_retro_prop.glb` | `?map=brutalist` |
| FPS Map | `fps_map.glb` | `?map=fps` |
| Ghost City | `fps_map_ghost_city.glb` | `?map=ghost` |

GLB 파일은 모두 이 디렉터리(`public/maps/`)에 넣습니다. 업로드 원본 이름의
`(1)` 같은 중복 다운로드 접미사는 파일명에서 제거해야 합니다.

용량이 큰 맵은 저장소에 함께 커밋하지 않습니다. 필요한 맵만 로컬에 복사해 사용하세요.
메뉴는 파일 HEAD 요청으로 존재 여부를 검사합니다. 파일이 없으면 이동 대신 안내 메시지가 나옵니다.

- 스폰 조정: F6 (플레이어/AI 좌표 직접 입력하고 맵마다 저장)
- 초기 스폰 좌표는 임시값입니다. 실제 지면 높이/충돌체에 따라 조정이 필요합니다.
- Brutalist는 1:1 대전용으로 매우 좁습니다. 가능하면 PVP/Warface부터 테스트하세요.
- Offense 맵은 기존 주소 호환성을 위해 설정에 남겼지만 메뉴에서는 제외했습니다.
- 외부 에셋의 사용/재배포 라이선스는 원본 제공처에서 확인하세요.
