# Phase 1: Simulation Engine - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Headless discrete event simulation engine: 이벤트 큐, Pod 상태 머신, 동기 worker 모델, health check probe, round-robin load balancer, metrics 수집기. 순수 TypeScript로 구현하며 UI 의존성 없이 unit test로 검증 가능해야 한다.

</domain>

<decisions>
## Implementation Decisions

### Simulation Engine Core
- **D-01:** 정수 밀리초 기반 시뮬레이션 시계 사용 (wall clock과 완전 분리)
- **D-02:** Binary min-heap 기반 priority queue로 이벤트 스케줄링 (sorted array 금지 — 100x 속도에서 성능 문제)
- **D-03:** Self-scheduling 이벤트 패턴 — 각 이벤트가 다음 이벤트를 스케줄링 (REQUEST_ARRIVAL → 다음 arrival, PROBE → 다음 probe)

### Pod Model
- **D-04:** Pod 3-state 머신: READY → NOT_READY → RESTARTING, 각 전환 조건은 HC requirements에 정의됨
- **D-05:** Pod restart 시 진행 중인 모든 요청과 backlog를 drop (별도 카테고리 아닌 유실 처리)
- **D-06:** initializeTime 후 probe 재개, successThreshold 달성 시 READY 복귀

### Health Check
- **D-07:** Probe가 worker를 점유 (일반 요청과 동일한 경로). Probe 처리시간은 1ms (무시할 수 있을 정도로 짧음)
- **D-08:** 다음 probe는 이전 probe 완료/timeout 후 periodSeconds 뒤에 발생 (고정 간격이 아님)
- **D-09:** Backlog 가득 참 상태에서 probe 도착 시 즉시 failure (timeout 대기 없이)

### Load Balancer
- **D-10:** Round-robin으로 READY 상태 pod에만 분배. 전략 패턴 인터페이스로 추상화하되 RR만 구현.
- **D-11:** 모든 pod가 Not Ready이면 즉시 503

### Snapshot
- **D-12:** 엔진은 현재 상태의 immutable snapshot 객체를 생성하는 메서드를 제공. Phase 2에서 Canvas/Chart가 이 snapshot을 소비.

### Claude's Discretion
- Request arrival 패턴 (Poisson vs Uniform) — 구현 시 적절히 결정
- Metrics 수집 방식 (per-event vs time-window) — 차트 성능을 고려하여 결정
- Restart로 drop된 요청의 카운팅 방식 — 구현 시 적절히 결정

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Specification
- `SPEC.md` — 전체 시뮬레이션 모델, Pod 상태 머신 다이어그램, 이벤트 목록, 파라미터 정의, 파일 구조

### Research
- `.planning/research/ARCHITECTURE.md` — DES 엔진 아키텍처, 컴포넌트 경계, 데이터 플로우, 빌드 순서
- `.planning/research/PITFALLS.md` — 18개 도메인 특화 함정 (시뮬레이션 시간 혼동, PQ 성능, probe 타이밍 정확도 등)
- `.planning/research/STACK.md` — 기술 스택 버전 및 선택 근거

### Requirements
- `.planning/REQUIREMENTS.md` — SIM-01~04, POD-01~06, HC-01~08, LB-01~03 (21개 요구사항)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 없음 (greenfield 프로젝트)

### Established Patterns
- 없음 (Phase 1이 패턴을 확립함)

### Integration Points
- Phase 2에서 snapshot 객체를 소비할 예정 — snapshot 포맷이 Phase 1의 핵심 출력

</code_context>

<specifics>
## Specific Ideas

- Research에서 권장: 시뮬레이션 엔진은 React/DOM/Canvas 의존성 제로로 구현
- 3-tier state 아키텍처: engine state (plain TS) → render snapshot → React UI state
- Vitest로 headless 단위 테스트 가능해야 함
- 100% slow request 시나리오와 0% slow request 시나리오가 핵심 검증 케이스

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-simulation-engine*
*Context gathered: 2026-04-11*
