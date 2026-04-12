# Requirements: Slow Request Simulator

**Defined:** 2026-04-12
**Core Value:** "slow request 비율이 X%일 때, Y초 후 서비스가 완전히 죽는다"를 시각적으로 확인하고, 복구까지의 시간을 측정할 수 있다.

## v1.1 Requirements

Requirements for v1.1 Statistical Optimizer. Each maps to roadmap phases.

### Math Engine

- [ ] **MATH-01**: 사용자가 트래픽 조건(RPS, request profile)을 입력하면 M/M/c/K 큐잉 모델로 차단확률(P_block), 대기시간(Wq), 이용률(ρ)을 계산할 수 있다
- [ ] **MATH-02**: 계산 시 health check probe가 worker를 점유하는 효과를 반영하여 유효 서비스율을 보정한다
- [ ] **MATH-03**: workersPerPod × podCount 범위를 자동 sweep하여 각 조합의 안정성 지표를 계산한다
- [ ] **MATH-04**: Kneedle 알고리즘으로 비용 대비 안정성 변곡점(knee point)을 자동 탐색한다

### Optimizer UI

- [ ] **OPTUI-01**: 사용자가 트래픽 파라미터(RPS, slow request 비율, request latency 프로필)를 입력할 수 있는 폼을 제공한다
- [ ] **OPTUI-02**: 최적 workersPerPod, podCount, maxBacklog 추천값을 카드 형태로 표시한다
- [ ] **OPTUI-03**: uPlot으로 리소스(총 worker 수) vs 차단확률 그래프를 그리고 knee point를 마커로 표시한다
- [ ] **OPTUI-04**: 시뮬레이터의 현재 설정값을 optimizer 입력에 자동 pre-fill할 수 있다

### Navigation

- [ ] **NAV-01**: 시뮬레이터와 옵티마이저 간 탭 전환 UI를 제공하며, 전환 시 각 뷰의 상태가 유지된다 (keepMounted)

## v1.2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Visualization

- **VIZ-01**: pods x workers 2D 히트맵으로 안정성을 격자 시각화
- **VIZ-02**: +/-slow request 비율 민감도 분석 테이블

### Advanced Modeling

- **MODEL-01**: Hyperexponential 분포로 bimodal latency를 정확하게 모델링

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Web Worker 오프로딩 | sweep 계산이 <10ms로 충분히 빠름 |
| 서버사이드 계산 | 순수 SPA 제약 유지 |
| React Router | 단순 탭 전환에 50KB+ 라이브러리 불필요 |
| 새 npm 수학 라이브러리 (mathjs, jstat) | 큐잉 공식은 ~80줄 순수 TS로 구현 가능, 번들 비용 대비 이점 없음 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MATH-01 | Phase 5 | Pending |
| MATH-02 | Phase 5 | Pending |
| MATH-03 | Phase 5 | Pending |
| MATH-04 | Phase 5 | Pending |
| OPTUI-01 | Phase 7 | Pending |
| OPTUI-02 | Phase 7 | Pending |
| OPTUI-03 | Phase 7 | Pending |
| OPTUI-04 | Phase 7 | Pending |
| NAV-01 | Phase 6 | Pending |

**Coverage:**
- v1.1 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-11 after roadmap creation*
