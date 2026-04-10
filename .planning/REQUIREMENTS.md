# Requirements: Slow Request Simulator

**Defined:** 2026-04-11
**Core Value:** "slow request 비율이 X%일 때, Y초 후 서비스가 완전히 죽는다"를 시각적으로 확인하고, 복구까지의 시간을 측정할 수 있다.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Simulation Engine

- [ ] **SIM-01**: 이산 이벤트 시뮬레이션 엔진이 이벤트 큐(min-heap)와 시뮬레이션 시계로 동작한다
- [ ] **SIM-02**: Request arrival 이벤트가 설정된 RPS에 맞춰 생성된다
- [ ] **SIM-03**: 각 요청은 request profile 목록의 비율에 따라 처리시간이 결정된다
- [ ] **SIM-04**: 시뮬레이션은 정수 밀리초 기반 논리 시간으로 동작한다 (wall clock과 분리)

### Pod Model

- [ ] **POD-01**: Pod는 READY / NOT_READY / RESTARTING 3개 상태를 가진다
- [ ] **POD-02**: Pod당 N개의 동기 worker가 있으며, 각 worker는 요청 처리 중 점유된다
- [ ] **POD-03**: 유휴 worker가 없으면 요청이 backlog queue에 적재된다
- [ ] **POD-04**: Backlog가 max_backlog에 도달하면 해당 요청은 503으로 reject된다
- [ ] **POD-05**: Pod restart 시 진행 중인 모든 요청과 backlog가 drop된다
- [ ] **POD-06**: Restart 후 initializeTime 동안 Not Ready + Not Live 상태로 대기한다

### Health Check

- [ ] **HC-01**: Liveness probe가 periodSeconds 간격으로 발생하며, worker를 점유하여 처리된다
- [ ] **HC-02**: Readiness probe가 periodSeconds 간격으로 발생하며, worker를 점유하여 처리된다
- [ ] **HC-03**: Probe가 timeoutSeconds 내 응답받지 못하면 failure로 기록된다
- [ ] **HC-04**: Backlog가 가득 차면 probe가 즉시 failure로 판정된다
- [ ] **HC-05**: Liveness probe 연속 failureThreshold회 실패 시 Pod가 restart된다
- [ ] **HC-06**: Readiness probe 연속 failureThreshold회 실패 시 Pod가 LB에서 제외된다
- [ ] **HC-07**: 연속 successThreshold회 성공 시 Pod가 Ready 상태로 복귀한다
- [ ] **HC-08**: 다음 probe는 이전 probe 완료/timeout 후 periodSeconds 뒤에 발생한다

### Load Balancer

- [ ] **LB-01**: Round-robin 방식으로 Ready 상태인 Pod에만 요청을 분배한다
- [ ] **LB-02**: 모든 Pod가 Not Ready이면 요청은 즉시 503으로 reject된다
- [ ] **LB-03**: LB 전략이 인터페이스로 추상화되어 추후 확장 가능하다

### Visualization

- [ ] **VIZ-01**: Canvas로 각 Pod의 worker 상태(idle/처리중), backlog 점유율, probe 상태를 실시간 표시한다
- [ ] **VIZ-02**: 처리 중인 worker는 해당 request profile의 color로 표시된다
- [ ] **VIZ-03**: Pod별 최근 N회 probe 결과를 ✓/✗로 표시한다
- [ ] **VIZ-04**: Pod 상태에 따라 테두리 색상이 구분된다 (Ready=green, NotReady=yellow, Restarting=red)

### Metrics & Charts

- [ ] **MET-01**: 시간축 그래프로 worker 점유율을 실시간 표시한다
- [ ] **MET-02**: 시간축 그래프로 Ready Pod 수 변화를 실시간 표시한다
- [ ] **MET-03**: 시간축 그래프로 503 비율을 실시간 표시한다
- [ ] **MET-04**: Request profile별 평균 응답시간(큐 대기 포함)을 실시간 표시한다

### Controls

- [ ] **CTL-01**: 시뮬레이션 시작/일시정지/재개가 가능하다
- [ ] **CTL-02**: 배속을 0.5x ~ 100x 범위에서 조절할 수 있다
- [ ] **CTL-03**: "요청 중단" 버튼으로 RPS를 0으로 설정하여 복구 측정을 시작할 수 있다
- [ ] **CTL-04**: 시뮬레이션 경과 시간, 현재 503 수, Ready Pod 수가 상시 표시된다

### Parameters

- [ ] **PAR-01**: 클러스터 설정(podCount, workersPerPod, maxBacklogPerPod)을 입력할 수 있다
- [ ] **PAR-02**: Traffic 설정(rps)을 입력할 수 있다
- [ ] **PAR-03**: Request profile을 리스트 형태로 추가/삭제/수정할 수 있다 (name, latencyMs, ratio, color)
- [ ] **PAR-04**: Liveness probe 설정(periodSeconds, timeoutSeconds, failureThreshold, successThreshold)을 입력할 수 있다
- [ ] **PAR-05**: Readiness probe 설정(periodSeconds, timeoutSeconds, failureThreshold, successThreshold)을 입력할 수 있다
- [ ] **PAR-06**: Pod 설정(initializeTime)을 입력할 수 있다

### Report

- [ ] **RPT-01**: 시뮬레이션 종료 후 첫 Readiness 실패 시점을 표시한다
- [ ] **RPT-02**: 첫 Liveness 실패(restart) 시점을 표시한다
- [ ] **RPT-03**: 전체 서비스 다운 시점(모든 Pod Not Ready → 503 시작)을 표시한다
- [ ] **RPT-04**: 복구 시간(요청 중단 ~ 전체 Pod Ready 복원)을 표시한다
- [ ] **RPT-05**: Request profile별 평균 응답시간을 표시한다
- [ ] **RPT-06**: 총 처리/503 요청 수와 503 비율을 표시한다

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Extended Features

- **EXT-01**: Seeded RNG로 동일 시뮬레이션 재현
- **EXT-02**: URL-encoded 파라미터로 설정 공유
- **EXT-03**: Config export/import as JSON
- **EXT-04**: K8s 기본값 프리셋 자동 적용
- **EXT-05**: Least-connections / Random LB 전략 추가

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 백엔드 서버 / API | 순수 SPA로 완결, 배포 단순성 |
| 실제 K8s 클러스터 연동 | 시뮬레이션 전용 도구 |
| 멀티 서비스 토폴로지 | 단일 서비스 Pod 집합만 모델링, 복잡도 과다 |
| 비동기 worker 모델 | 동기 worker의 특수한 failure mode에 집중 |
| HPA(Auto-scaling) 시뮬레이션 | 높은 복잡도, v2 이후 검토 |
| CPU/메모리 리소스 모델링 | worker/backlog/probe 메커니즘에 집중 |
| A/B 비교 모드 | 높은 복잡도, 수동 비교로 충분 |
| 모바일 반응형 | 데스크톱 전용 도구 (1280px+) |
| Web Worker 오프로딩 | 메인 스레드로 충분, 프로파일링 후 검토 |
| 네트워크 지연/대역폭 시뮬레이션 | worker 점유에 집중, 네트워크는 즉시로 가정 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SIM-01 | Phase 1 | Pending |
| SIM-02 | Phase 1 | Pending |
| SIM-03 | Phase 1 | Pending |
| SIM-04 | Phase 1 | Pending |
| POD-01 | Phase 1 | Pending |
| POD-02 | Phase 1 | Pending |
| POD-03 | Phase 1 | Pending |
| POD-04 | Phase 1 | Pending |
| POD-05 | Phase 1 | Pending |
| POD-06 | Phase 1 | Pending |
| HC-01 | Phase 1 | Pending |
| HC-02 | Phase 1 | Pending |
| HC-03 | Phase 1 | Pending |
| HC-04 | Phase 1 | Pending |
| HC-05 | Phase 1 | Pending |
| HC-06 | Phase 1 | Pending |
| HC-07 | Phase 1 | Pending |
| HC-08 | Phase 1 | Pending |
| LB-01 | Phase 1 | Pending |
| LB-02 | Phase 1 | Pending |
| LB-03 | Phase 1 | Pending |
| VIZ-01 | Phase 2 | Pending |
| VIZ-02 | Phase 2 | Pending |
| VIZ-03 | Phase 2 | Pending |
| VIZ-04 | Phase 2 | Pending |
| MET-01 | Phase 2 | Pending |
| MET-02 | Phase 2 | Pending |
| MET-03 | Phase 2 | Pending |
| MET-04 | Phase 2 | Pending |
| CTL-01 | Phase 3 | Pending |
| CTL-02 | Phase 3 | Pending |
| CTL-03 | Phase 3 | Pending |
| CTL-04 | Phase 3 | Pending |
| PAR-01 | Phase 3 | Pending |
| PAR-02 | Phase 3 | Pending |
| PAR-03 | Phase 3 | Pending |
| PAR-04 | Phase 3 | Pending |
| PAR-05 | Phase 3 | Pending |
| PAR-06 | Phase 3 | Pending |
| RPT-01 | Phase 4 | Pending |
| RPT-02 | Phase 4 | Pending |
| RPT-03 | Phase 4 | Pending |
| RPT-04 | Phase 4 | Pending |
| RPT-05 | Phase 4 | Pending |
| RPT-06 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-04-11*
*Last updated: 2026-04-11 after roadmap creation*
