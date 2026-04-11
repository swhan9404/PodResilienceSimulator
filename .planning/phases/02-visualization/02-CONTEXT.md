# Phase 2: Visualization - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Real-time visual rendering of simulation state: Pod 상태를 Canvas로, 메트릭을 uPlot time-series 차트로 표시. SimulationEngine의 snapshot 객체를 소비하여 브라우저에서 시각화. Phase 3에서 추가될 컨트롤/파라미터 UI와는 분리 — 이 Phase에서는 시각화 컴포넌트와 렌더링 루프만 구현.

</domain>

<decisions>
## Implementation Decisions

### Pod Canvas 레이아웃
- **D-01:** Pod 배치는 Claude 재량 — Pod 수에 따라 1열 또는 그리드로 자동 결정
- **D-02:** Worker slot은 개별 셀로 표현 — 각 worker마다 네모난 셀, idle=회색, 처리중=request profile color로 채움 (VIZ-02)
- **D-03:** Backlog은 숫자만 표시 ("BL: 7/10" 형태), fill bar 아님
- **D-04:** Pod 테두리 색상: Ready=green, NotReady=yellow, Restarting=red (VIZ-04)
- **D-05:** Probe 결과: Pod별 최근 N회 liveness/readiness 결과를 ✓/✗로 표시 (VIZ-03)

### Chart 구성
- **D-06:** 시간 윈도우 고정 60초 (시뮬레이션 시간 기준) — 최신 60초만 표시, 스크롤링 없음
- **D-07:** 4개 차트를 2x2 그리드로 배치: [Worker Usage %, Ready Pods] / [503 Rate %, Response Time/ms]
- **D-08:** uPlot + uplot-react wrapper 사용 (CLAUDE.md 기술 스택 결정)

### 렌더링 루프
- **D-09:** requestAnimationFrame 기반 루프 — 매 프레임마다 engine.step(deltaTime * speed) 호출 후 snapshot을 Canvas에 전달
- **D-10:** Canvas(Pod 시각화)는 매 프레임 업데이트, Chart(uPlot)는 1초에 1회 쓰로틀링 — metrics 샘플 주기(1초)와 맞춤
- **D-11:** Phase 2에서는 기본 루프만 구현 (자동 실행), start/pause/speed 컨트롤은 Phase 3에서 추가

### 화면 레이아웃
- **D-12:** 상하 분할 — 위: Pod Canvas (그리드), 아래: 2x2 Charts
- **D-13:** Phase 3에서 좌측 파라미터 패널 추가 시 우측 영역으로 자연스럽게 통합되도록 구조 설계
- **D-14:** 데스크톱 전용 (1280px+ 최소 너비, REQUIREMENTS.md Out of Scope에 모바일 반응형 제외)

### Claude's Discretion
- Pod 그리드 열 수 결정 (Pod 수에 따라 적절히)
- Canvas 내부 spacing, padding, font size 등 시각적 디테일
- uPlot chart 색상 및 스타일링

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Specification
- `SPEC.md` — 전체 시뮬레이션 모델, 시각화 요구사항, 파라미터 정의

### Phase 1 Artifacts
- `src/simulation/types.ts` — SimulationSnapshot, PodSnapshot, MetricsSample, WorkerSnapshot 타입 정의 (Phase 2의 입력 데이터 구조)
- `src/simulation/engine.ts` — SimulationEngine.step(), getSnapshot() API (Phase 2에서 소비)
- `src/simulation/metrics.ts` — MetricsCollector, 1초 단위 샘플링 로직

### Research & Architecture
- `.planning/research/ARCHITECTURE.md` — 3-tier state 아키텍처 (engine state → snapshot → UI)
- `.planning/research/PITFALLS.md` — 렌더링 성능 관련 함정들
- `.planning/research/STACK.md` — uPlot, Canvas 2D 선택 근거

### Requirements
- `.planning/REQUIREMENTS.md` — VIZ-01~04, MET-01~04 (8개 요구사항)

### Prior Context
- `.planning/phases/01-simulation-engine/01-CONTEXT.md` — D-12: snapshot 포맷 결정

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SimulationSnapshot` interface: clock, pods[], stats{}, metrics[], phase — Canvas와 Chart의 입력 데이터
- `PodSnapshot`: id, state, workers[], backlogSize, backlogMax, livenessHistory[], readinessHistory[], generation
- `WorkerSnapshot`: busy, profileName, profileColor, progress
- `MetricsSample`: time, totalRequests, total503s, readyPodCount, activeWorkerCount, totalWorkerCount, perProfileResponseTime
- `SimulationEngine`: step(deltaMs) → void, getSnapshot() → SimulationSnapshot

### Established Patterns
- Vite + React 19 + TypeScript 5.7 프로젝트 구조 확립
- Vitest로 단위 테스트 (src/**/*.test.ts)
- 시뮬레이션 로직은 React 외부 (plain TS classes)

### Integration Points
- `engine.step(deltaMs)` 호출 → `engine.getSnapshot()` 로 최신 상태 획득
- Canvas 컴포넌트가 snapshot.pods를 소비하여 Pod grid 렌더링
- Chart 컴포넌트가 snapshot.metrics와 snapshot.stats를 소비하여 time-series 업데이트
- Phase 3에서 Zustand store 추가 시 snapshot을 store에 저장하는 형태로 확장

</code_context>

<specifics>
## Specific Ideas

- Worker 개별 셀은 처리 중인 요청의 profile color로 채워야 함 — WorkerSnapshot.profileColor 활용
- Backlog은 숫자만으로 충분 — 시각적 복잡도 줄이기
- Chart 쓰로틀링(1초)은 MetricsSample의 1초 윈도우와 자연스럽게 매칭
- Phase 2는 자동 실행 데모 형태 — 하드코딩된 기본 config로 즉시 시뮬레이션 시작

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-visualization*
*Context gathered: 2026-04-11*
