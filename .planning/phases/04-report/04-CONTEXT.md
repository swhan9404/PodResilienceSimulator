# Phase 4: Report - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

시뮬레이션 실행 후 critical failure timeline과 recovery metrics를 보여주는 리포트. 엔진에 critical event timestamp 수집을 추가하고, recovered 상태에서 자동으로 시각화 영역을 리포트로 교체하여 표시한다. 세로 타임라인 + 카드 그리드 + profile 테이블 구성.

</domain>

<decisions>
## Implementation Decisions

### Report 트리거 & 라이프사이클
- **D-01:** recovered 자동 표시 — Stop Requests 후 모든 Pod가 Ready로 복구(phase='recovered')되면 자동으로 리포트 표시. 별도 버튼 없음
- **D-02:** 복구 시에만 표시 — Stop Requests를 하지 않으면 리포트도 없음. RPT-04(복구시간)가 핵심이므로 복구 플로우를 강제
- **D-03:** Reset 시 리포트 사라짐 — Reset 버튼 누르면 idle 상태로 돌아가며 리포트 제거

### Report 배치 & UI 구조
- **D-04:** 시각화 영역 대체 — recovered 시 Pod Canvas + Charts 영역을 리포트로 교체. 좌측 패널은 그대로 유지(Reset 버튼 접근 가능)
- **D-05:** 좌측 패널 상태 유지 — 컨트롤 패널(Reset 버튼 포함)은 리포트 표시 중에도 접근 가능

### 데이터 표현 방식
- **D-06:** 세로 타임라인으로 degradation 표현 (RPT-01~03) — 시간축을 세로로 배치, 각 이벤트를 마커로 표시. 시뮬레이션 시작 → 첫 readiness 실패 → 첫 liveness restart → 전체 서비스 다운 → Stop Requests → 복구 순서
- **D-07:** 카드 그리드로 summary stats 표현 (RPT-04~06) — 복구시간, 503 비율, 총 처리 수를 큰 숫자 카드로. Profile별 응답시간은 별도 테이블
- **D-08:** 타임라인 먼저, 카드 아래 — 위: degradation 타임라인 (스토리텔링), 아래: summary 카드 + profile 테이블

### Critical Event 데이터 수집
- **D-09:** 엔진에 critical event timestamp 추적 추가 필요 — 현재 MetricsCollector와 SimulationSnapshot에는 첫 readiness 실패, 첫 liveness restart, 전체 서비스 다운 시점이 없음. 엔진 또는 별도 이벤트 로거에서 이 시점들을 기록해야 함

### Claude's Discretion
- 타임라인의 시각적 디테일 (마커 스타일, 색상, 간격 비례 여부)
- 카드 그리드 열 수 및 크기
- Critical event timestamp 수집 방식 (엔진 내부 vs 별도 collector)
- Profile 테이블 정렬 및 스타일링

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Specification
- `SPEC.md` — 전체 시뮬레이션 모델, 파라미터 정의

### Requirements
- `.planning/REQUIREMENTS.md` — RPT-01~06 (6개 요구사항)

### Engine Data Sources
- `src/simulation/types.ts` — SimulationSnapshot, MetricsSample, PodSnapshot (리포트 입력 데이터 구조)
- `src/simulation/engine.ts` — getSnapshot() API, phase 전환 로직, stopRequests()
- `src/simulation/metrics.ts` — MetricsCollector (cumulative totals, per-profile response time)

### State Management
- `src/store/useSimulationStore.ts` — Zustand store (playback state, engine refs, chartData). 리포트 표시 조건: playback state 또는 snapshot.phase 감시

### Prior Context
- `.planning/phases/02-visualization/02-CONTEXT.md` — D-12/D-13: 레이아웃 결정 (상하 분할, 좌측 패널 준비)
- `.planning/phases/03-controls-parameters/03-CONTEXT.md` — D-07: 좌측 패널 300px, D-08: 상태별 컨트롤 표시 패턴

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SimulationSnapshot.phase`: 'running' | 'stopped_requests' | 'recovered' | 'finished' — 리포트 트리거 조건으로 사용
- `MetricsCollector`: totalRequests, total503s, droppedByRestart — RPT-06 데이터
- `MetricsSample.perProfileResponseTime`: Record<string, { sum, count }> — RPT-05 데이터
- Zustand store의 playback state 및 engine refs — 리포트 컴포넌트가 구독할 상태

### Established Patterns
- Tailwind CSS 유틸리티 클래스 스타일링
- CSS custom properties로 다크 모드 지원 (`--bg-dominant`, `--bg-secondary`, `--border-color`)
- 좌측 패널 + 우측 시각화 레이아웃 (Phase 3에서 확립)
- Zustand selector로 필요한 부분만 구독

### Integration Points
- App.tsx에서 snapshot.phase === 'recovered' 감지 시 시각화 → 리포트 컴포넌트 전환
- 엔진에 critical event timestamps 추적 로직 추가 (RPT-01~03 데이터 소스)
- Zustand store에 리포트 데이터 또는 snapshot에서 직접 추출

### Key Gap
- 현재 엔진이 첫 readiness 실패, 첫 liveness restart, 전체 서비스 다운 시점을 추적하지 않음 — RPT-01~03을 위해 추가 필요

</code_context>

<specifics>
## Specific Ideas

- 세로 타임라인: 시뮬레이션 시작(0s) → 첫 readiness 실패 → 첫 liveness restart → 전체 다운 → Stop Requests → 복구, 각 이벤트에 시간과 관련 Pod 정보 표시
- 카드 그리드: 복구시간/503 비율/총 처리 수를 큰 숫자로 강조, profile별 응답시간은 테이블로 분리
- recovered 시 Pod Canvas와 Charts를 리포트 컴포넌트로 교체하는 조건부 렌더링
- Reset 시 리포트 제거 후 idle 상태로 복귀 (기존 reset 로직 활용)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-report*
*Context gathered: 2026-04-11*
