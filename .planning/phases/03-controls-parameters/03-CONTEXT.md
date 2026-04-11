# Phase 3: Controls & Parameters - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

React UI로 시뮬레이션 라이프사이클(시작/일시정지/배속/요청중단)을 제어하고, 모든 시뮬레이션 파라미터(클러스터, 트래픽, probe, request profile)를 설정할 수 있는 좌측 패널을 구현한다. Zustand store를 도입하여 상태 관리를 체계화한다. Phase 2의 하드코딩된 DEMO_CONFIG을 사용자 입력으로 교체하는 것이 핵심.

</domain>

<decisions>
## Implementation Decisions

### 파라미터 편집 흐름
- **D-01:** 시작 전만 수정 가능 — 실행 중 모든 파라미터 필드 disabled, Reset 버튼으로 초기 상태로 돌아가 재편집
- **D-02:** Request profile은 인라인 리스트 — 각 profile이 한 줄로 name/latencyMs/ratio/color 표시, [+]로 추가, [×]로 삭제, 필드를 직접 인라인 편집
- **D-03:** Ratio는 자동 정규화 — 비율을 자유롭게 입력(예: 7:3)하면 시뮬레이션 시작 시 자동으로 합계 100%로 정규화

### 배속 컨트롤 UX
- **D-04:** 프리셋 버튼(1x, 10x, 50x, 100x) + 로그 스케일 슬라이더 조합. 버튼은 빠른 점프, 슬라이더는 세밀한 조절
- **D-05:** 배속은 실행 중에만 조절 가능, 시작 전 비활성화, 기본값 1x. SimulationLoop.setSpeed()가 이미 구현되어 있어 즉시 반영

### 상태 표시 & 컨트롤 배치
- **D-06:** 좌측 패널 상단에 상태 정보 배치 — 경과 시뮬레이션 시간, 현재 503 수, Ready Pod 수 (CTL-04)
- **D-07:** 좌측 패널 고정 너비 300px — 1280px 최소 너비에서 우측 시각화 영역 980px 확보
- **D-08:** 컨트롤 버튼은 상태별 유효한 것만 표시/숨김:
  - 시작 전: [Start] 버튼만
  - 실행 중: [Pause] [Stop Requests] [Reset] + Speed 컨트롤
  - 일시정지: [Resume] [Reset]
  - 요청 중단 후: [Reset] + Speed 컨트롤 (복구 관찰용)

### Zustand 도입 & 상태 구조
- **D-09:** Zustand 단일 store 도입 — config(파라미터 설정) + playback(실행 상태/속도) + snapshot ref를 하나의 store에서 관리. selector로 필요한 부분만 구독
- **D-10:** Store에 SimulationEngine/SimulationLoop 인스턴스 ref 저장 — start/pause/reset 등 액션이 store 내부에서 engine을 직접 조작. 상태와 액션이 한 곳에 집중

### Claude's Discretion
- 파라미터 폼의 섹션 분리/접기 방식 (Cluster, Traffic, Probes 등)
- 색상 선택 UI (color picker vs 프리셋 팔레트)
- 기본값 설정 (현재 DEMO_CONFIG 값을 초기값으로 활용 가능)
- 좌측 패널 내부 스크롤 처리 (파라미터가 많을 경우)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Specification
- `SPEC.md` — 전체 시뮬레이션 모델, 파라미터 정의, 컨트롤 요구사항

### Requirements
- `.planning/REQUIREMENTS.md` — CTL-01~04, PAR-01~06 (10개 요구사항)

### Prior Phase Artifacts
- `src/simulation/types.ts` — SimulationConfig, ProbeConfig, RequestProfile 타입 정의 (파라미터 폼의 데이터 모델)
- `src/visualization/SimulationLoop.ts` — setSpeed(), start(), stop() API (컨트롤 연동 대상)
- `src/visualization/useSimulation.ts` — 현재 상태 관리 hook (Zustand 리팩터링 대상)
- `src/visualization/demoConfig.ts` — DEMO_CONFIG 하드코딩 값 (기본값 참조 및 제거 대상)
- `src/App.tsx` — 현재 레이아웃 (`"will become right panel"` 주석, 좌측 패널 추가 지점)

### Prior Context
- `.planning/phases/01-simulation-engine/01-CONTEXT.md` — D-12: snapshot 포맷 결정
- `.planning/phases/02-visualization/02-CONTEXT.md` — D-09~D-14: 렌더링 루프, 레이아웃 결정, Phase 3 사이드바 준비

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SimulationLoop`: setSpeed(), start(), stop() — 컨트롤 액션의 직접적 대상, 이미 구현됨
- `SimulationConfig` 타입: 모든 파라미터 필드가 정의되어 있어 폼 구조의 근거
- `DEMO_CONFIG`: 합리적인 기본값 — 파라미터 폼 초기값으로 활용 가능
- `SimulationSnapshot.phase`: 'running' | 'stopped_requests' | 'recovered' | 'finished' — UI 상태 전환의 근거

### Established Patterns
- 시뮬레이션 로직은 React 외부 plain TS 클래스 (SimulationEngine, SimulationLoop)
- rAF 기반 렌더링 루프 — snapshot을 매 프레임 소비
- Tailwind CSS 유틸리티 클래스 스타일링
- CSS custom properties로 다크 모드 지원 (`--bg-dominant`, `--bg-secondary`, `--border-color`)

### Integration Points
- `App.tsx`: 좌측 패널 추가 → 기존 시각화를 우측 영역으로 이동
- `useSimulation` hook → Zustand store 기반으로 리팩터링
- `DEMO_CONFIG` 제거 → store의 config state가 대체
- `SimulationLoop` callbacks → store의 onChartUpdate/snapshot 업데이트와 연결

</code_context>

<specifics>
## Specific Ideas

- 좌측 패널 구조: 상태 표시 → 컨트롤 버튼 → 파라미터 폼 (위에서 아래로)
- 파라미터 필드에 현재 DEMO_CONFIG 값을 기본값으로 채움 (즉시 Start 가능)
- 배속 슬라이더는 로그 스케일이어야 0.5x~100x 범위에서 자연스러운 조작감 제공
- "Stop Requests" 버튼은 RPS를 0으로 설정하여 복구 과정을 관찰하는 용도 (CTL-03)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-controls-parameters*
*Context gathered: 2026-04-11*
