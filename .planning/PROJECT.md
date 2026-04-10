# Slow Request Simulator

## What This Is

EKS 환경에서 동기(synchronous) worker 기반 Pod들이 느린 요청(slow request)에 의해 어떻게 무너지고 복구되는지를 시뮬레이션하는 웹 기반 도구. 브라우저에서 이산 이벤트 시뮬레이션을 실행하며 배속 조절로 cascading failure 과정을 시각적으로 확인할 수 있다.

## Core Value

"slow request 비율이 X%일 때, Y초 후 서비스가 완전히 죽는다"를 시각적으로 확인하고, 복구까지의 시간을 측정할 수 있다.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 이산 이벤트 기반 시뮬레이션 엔진 (request arrival, completion, probe, restart 이벤트)
- [ ] Pod 상태 머신 (READY / NOT READY / RESTARTING)
- [ ] 동기 worker 모델 (요청 처리 중 worker 점유, backlog queue)
- [ ] Health check probe가 worker를 점유하는 현실적 모델
- [ ] Liveness probe (periodSeconds, timeoutSeconds, failureThreshold, successThreshold, initializeTime)
- [ ] Readiness probe (periodSeconds, timeoutSeconds, failureThreshold, successThreshold)
- [ ] Round-robin load balancer (확장 가능 전략 패턴)
- [ ] Request profile 설정 (name, latencyMs, ratio, color — 리스트 형태)
- [ ] 클러스터 설정 (podCount, workersPerPod, maxBacklogPerPod, rps)
- [ ] 실시간 Canvas 기반 Pod 상태 시각화 (worker 점유, backlog, probe 상태)
- [ ] 실시간 메트릭 차트 (worker usage, ready pods, 503 rate, 응답시간)
- [ ] 배속 조절 (0.5x ~ 100x)
- [ ] "요청 중단" 기능으로 복구 시간 측정
- [ ] 결과 리포트 (임계점, profile별 평균 응답시간, 503 비율, 복구시간)

### Out of Scope

- 백엔드 서버 — 순수 SPA로 완결
- 실제 EKS 연동 — 시뮬레이션 전용
- 다중 서비스/마이크로서비스 토폴로지 — 단일 서비스 Pod 집합만 모델링
- 비동기 worker 모델 — 동기 worker만 대상

## Context

- EKS 환경에서 동기 worker (gunicorn sync 등) 기반 서비스 운영 시, slow request로 인한 서비스 장애를 사전에 시뮬레이션하려는 목적
- Health check probe가 worker를 점유하므로 worker 포화 → probe timeout → cascading failure가 핵심 메커니즘
- 파라미터 조합에 따른 서비스 내성 한계점을 빠르게 찾는 것이 주요 사용 시나리오

## Constraints

- **Tech Stack**: React 18 + TypeScript + Vite + Canvas — 브라우저 전용 SPA
- **Performance**: 배속 최대 100x에서도 부드러운 시각화 필요 — 시뮬레이션/렌더링 분리 필수
- **No Server**: 정적 SPA로 배포 가능해야 함 (GitHub Pages / S3 / 로컬)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 시뮬레이션 엔진을 브라우저에서 실행 | 네트워크 지연 없이 배속 가능, WebSocket 불필요 | — Pending |
| Canvas 기반 렌더링 | SVG보다 다수 요소 렌더링 성능 우수 (pod 수십개 + request 수천개) | — Pending |
| Health check가 worker 점유 | 실제 gunicorn sync worker 동작과 일치, cascading failure 재현 핵심 | — Pending |
| Round-robin LB + 전략 패턴 | 당장은 RR만 필요, 나중에 least-connections 등 추가 가능 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-11 after initialization*
