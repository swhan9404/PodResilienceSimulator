# Slow Request Simulator - 기획서

## 개요

EKS 환경에서 동기(synchronous) worker 기반 Pod들이 느린 요청(slow request)에 의해 어떻게 무너지고 복구되는지를 시뮬레이션하는 웹 기반 도구.

**핵심 가치**: "slow request 비율이 X%일 때, Y초 후 서비스가 완전히 죽는다"를 시각적으로 확인할 수 있다.

---

## 시뮬레이션 모델

### 구성 요소

```
[Request Generator] → [Load Balancer (RR)] → [Pod 1] → [Worker 1..N] + [Backlog Queue]
                                             → [Pod 2] → [Worker 1..N] + [Backlog Queue]
                                             → ...
                                             → [Pod M] → [Worker 1..N] + [Backlog Queue]
```

### Request 처리 흐름

1. Request Generator가 설정된 RPS로 요청 생성
2. 각 요청은 request profile 목록에서 비율에 따라 처리시간이 결정됨
3. Load Balancer가 **ready 상태인 Pod**에 Round-Robin으로 분배
4. Pod 내 유휴 worker가 있으면 즉시 할당 (worker는 처리시간 동안 점유)
5. 유휴 worker가 없으면 backlog queue에 적재
6. backlog가 max_backlog에 도달하면 해당 요청은 **reject (503)**
7. 모든 Pod가 ready가 아니면 요청은 즉시 **503**

### Health Check 모델

Health check probe는 **일반 요청과 동일하게 worker를 점유**한다.

#### Liveness Probe

```
매 periodSeconds 마다:
  1. Pod에 probe 요청 전송 (일반 요청처럼 worker/backlog 경쟁)
  2. timeoutSeconds 내 응답 → success, 초과 → failure
  3. 연속 failureThreshold회 failure → Pod RESTART
     - 진행 중인 모든 요청 drop
     - backlog 전체 drop
     - initializeTime 동안 Not Ready + Not Live 상태
     - initializeTime 경과 후 → probe 재개
  4. 연속 successThreshold회 success → live 상태 유지
```

#### Readiness Probe

```
매 periodSeconds 마다:
  1. Pod에 probe 요청 전송 (일반 요청처럼 worker/backlog 경쟁)
  2. timeoutSeconds 내 응답 → success, 초과 → failure
  3. 연속 failureThreshold회 failure → Pod를 LB에서 제외 (Not Ready)
     - Pod는 계속 실행 중 (기존 요청 처리 계속)
     - 새 요청은 받지 않음
  4. 연속 successThreshold회 success → Pod를 LB에 복귀 (Ready)
```

#### Probe 처리 상세

- probe 요청은 worker가 필요함 (처리 시간은 무시할 수 있을 정도로 짧다고 가정: 1ms)
- 유휴 worker 없으면 backlog에 들어감
- backlog도 가득 차면 probe 자체가 즉시 failure (timeout 기다리지 않고)
- probe가 backlog에서 대기 중 timeoutSeconds 초과 시 failure

### Pod 상태 머신

```
                    ┌─────────────────────────────────┐
                    │                                  │
                    ▼                                  │
  ┌──────────┐  initializeTime  ┌─────────┐  readiness  ┌─────────┐
  │RESTARTING│ ───────────────→ │NOT READY│ ──success──→ │  READY  │
  └──────────┘                  └─────────┘  Threshold   └─────────┘
       ▲                             ▲            │            │
       │                             │            │            │
       │                        readiness    readiness    liveness
       │                        failure      failure      failure
       │                        Threshold    Threshold    Threshold
       │                             │            │            │
       │                             │            ▼            │
       │                             │      ┌─────────┐       │
       │                             └──────│NOT READY│       │
       │                                    └─────────┘       │
       │                                                      │
       └──────────────────────────────────────────────────────┘
                         liveness failureThreshold
```

### 복구 시뮬레이션

- 사용자가 **"요청 중단"** 버튼을 누르면 RPS → 0
- 이 시점부터 측정 시작
- 모든 Pod가 Ready 상태로 복귀하면 복구 완료
- **복구 시간** = 요청 중단 시점 ~ 전체 Pod Ready 복귀 시점

---

## 입력 파라미터

### Cluster 설정

| 파라미터 | 타입 | 설명 | 예시 |
|----------|------|------|------|
| `podCount` | number | Pod 수 | 5 |
| `workersPerPod` | number | Pod당 동기 worker 수 | 4 |
| `maxBacklogPerPod` | number | Pod당 최대 대기열 크기 | 10 |

### Traffic 설정

| 파라미터 | 타입 | 설명 | 예시 |
|----------|------|------|------|
| `rps` | number | 초당 전체 요청 수 | 100 |

### Request Profile 설정 (리스트)

| 파라미터 | 타입 | 설명 | 예시 |
|----------|------|------|------|
| `name` | string | 프로필 이름 | "normal", "slow-api", "very-slow" |
| `latencyMs` | number | 처리 시간 (ms) | 50, 5000, 30000 |
| `ratio` | number | 전체 요청 중 비율 (합 = 1.0) | 0.8, 0.15, 0.05 |
| `color` | string | 시각화 색상 | "#4CAF50", "#FF9800", "#F44336" |

예시 구성:
```
[
  { name: "normal",    latencyMs: 50,    ratio: 0.80, color: "#4CAF50" },
  { name: "slow-api",  latencyMs: 5000,  ratio: 0.15, color: "#FF9800" },
  { name: "very-slow", latencyMs: 30000, ratio: 0.05, color: "#F44336" }
]
```

### Liveness Probe 설정

| 파라미터 | 타입 | 설명 | 기본값 |
|----------|------|------|--------|
| `periodSeconds` | number | probe 주기 | 10 |
| `timeoutSeconds` | number | 응답 대기 시간 | 5 |
| `failureThreshold` | number | 연속 실패 → restart | 3 |
| `successThreshold` | number | 연속 성공 → live | 1 |

### Readiness Probe 설정

| 파라미터 | 타입 | 설명 | 기본값 |
|----------|------|------|--------|
| `periodSeconds` | number | probe 주기 | 10 |
| `timeoutSeconds` | number | 응답 대기 시간 | 5 |
| `failureThreshold` | number | 연속 실패 → not ready | 3 |
| `successThreshold` | number | 연속 성공 → ready | 1 |

### Pod 설정

| 파라미터 | 타입 | 설명 | 기본값 |
|----------|------|------|--------|
| `initializeTime` | number (ms) | restart 후 초기화 시간 | 30000 |

### 시뮬레이션 제어

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `speed` | number | 배속 (0.5x ~ 100x) |
| `duration` | number (s) | 최대 시뮬레이션 시간 |

---

## 출력 / 시각화

### 1. 실시간 시각화 (메인 Canvas)

**Pod 상태 대시보드** — 각 Pod를 시각적으로 표현

```
┌─ Pod 1 [READY] ──────────────────────┐
│ Worker 1: ██████████ (slow-api 5s)   │
│ Worker 2: ██ (normal 50ms)           │
│ Worker 3: idle                       │
│ Worker 4: ████████████████ (very-slow)│
│ Backlog: [■■■□□□□□□□] 3/10          │
│ Liveness:  ✓✓✓  Readiness: ✓✓✓      │
└───────────────────────────────────────┘

┌─ Pod 2 [NOT READY] ──────────────────┐
│ Worker 1: ████████████████ (very-slow)│
│ Worker 2: ████████████████ (very-slow)│
│ Worker 3: ██████████ (slow-api 5s)   │
│ Worker 4: ██████████ (slow-api 5s)   │
│ Backlog: [■■■■■■■■■■] 10/10 FULL    │
│ Liveness:  ✓✗✗  Readiness: ✗✗✗      │
└───────────────────────────────────────┘

┌─ Pod 3 [RESTARTING] ─────────────────┐
│ ░░░░░ Initializing... 12s/30s ░░░░░  │
└───────────────────────────────────────┘
```

요소별 시각화:
- **Worker**: 처리 중인 요청의 color + 진행률 바
- **Backlog**: 큐 점유율 바 (색상으로 요청 타입 구분)
- **Probe 상태**: 최근 N회 결과를 ✓/✗ 로 표시
- **Pod 상태**: 테두리 색상으로 구분 (Ready=green, NotReady=yellow, Restarting=red)

### 2. 실시간 메트릭 차트 (하단)

시간축 그래프로 다음 지표를 표시:

- **Active Workers %**: 전체 worker 중 요청 처리 중인 비율
- **Backlog 총량**: 전체 Pod backlog 합계
- **Ready Pod 수**: 시간에 따른 Ready Pod 개수 변화
- **요청별 평균 응답시간**: request profile별 이동평균 응답시간
- **503 비율**: 시간 구간별 reject된 요청 비율
- **RPS (actual)**: 실제 처리된 요청/초

### 3. 결과 리포트 (시뮬레이션 종료 후)

| 지표 | 설명 |
|------|------|
| 첫 Readiness 실패 시점 | 최초로 Pod가 Not Ready가 되는 시각 |
| 첫 Liveness 실패 (restart) 시점 | 최초 Pod restart 시각 |
| 전체 서비스 다운 시점 | 모든 Pod가 Not Ready → 503 시작 시각 |
| 서비스 다운까지 소요 시간 | 시뮬레이션 시작 ~ 전체 다운 |
| 복구 시간 | 요청 중단 ~ 전체 Pod Ready 복원 |
| Request Profile별 평균 응답시간 | 각 프로필의 평균 (큐 대기 포함) |
| 총 처리 요청 수 | 정상 처리된 요청 |
| 총 503 요청 수 | reject된 요청 |
| 503 비율 | reject / total |

---

## UI 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│  Slow Request Simulator                          [▶ Start] [⏸] │
│                                         Speed: [<] 10x [>]     │
├──────────────────────┬──────────────────────────────────────────┤
│                      │                                          │
│   Parameters Panel   │         Simulation Canvas                │
│                      │                                          │
│  ┌─ Cluster ───────┐ │  ┌─Pod1─┐ ┌─Pod2─┐ ┌─Pod3─┐ ┌─Pod4─┐  │
│  │ Pods: [5]       │ │  │██░░  │ │████  │ │████  │ │░░░░  │  │
│  │ Workers: [4]    │ │  │BL:3  │ │BL:10 │ │BL:8  │ │INIT  │  │
│  │ Backlog: [10]   │ │  └──────┘ └──────┘ └──────┘ └──────┘  │
│  └─────────────────┘ │                                          │
│                      │  Elapsed: 45.2s  503s: 127  Ready: 2/5  │
│  ┌─ Traffic ───────┐ │                                          │
│  │ RPS: [100]      │ │  [Stop Requests] ← 복구 측정용           │
│  └─────────────────┘ │                                          │
│                      ├──────────────────────────────────────────┤
│  ┌─ Request ───────┐ │                                          │
│  │ + Add Profile   │ │         Metrics Charts                   │
│  │ normal  50ms 80%│ │                                          │
│  │ slow  5000ms 15%│ │  ── Worker Usage % ──────────────────── │
│  │ vslow 30s    5% │ │  ── Ready Pods ──────────────────────── │
│  └─────────────────┘ │  ── 503 Rate ────────────────────────── │
│                      │  ── Avg Response Time (per profile) ─── │
│  ┌─ Probes ────────┐ │                                          │
│  │ Liveness:       │ │                                          │
│  │  period: [10]   │ │                                          │
│  │  timeout: [5]   │ │                                          │
│  │  failTh: [3]    │ │                                          │
│  │  succTh: [1]    │ │                                          │
│  │                 │ │                                          │
│  │ Readiness:      │ │                                          │
│  │  period: [10]   │ │                                          │
│  │  timeout: [5]   │ │                                          │
│  │  failTh: [3]    │ │                                          │
│  │  succTh: [1]    │ │                                          │
│  └─────────────────┘ │                                          │
│                      │                                          │
│  ┌─ Pod ───────────┐ │                                          │
│  │ initTime: [30s] │ │                                          │
│  └─────────────────┘ │                                          │
│                      │                                          │
├──────────────────────┴──────────────────────────────────────────┤
│                      Result Report (after simulation)           │
│  First Not Ready: 12.3s | First Restart: 35.1s | Down: 48.7s   │
│  Recovery: 62.0s | Total 503: 1,247 (12.4%) | Avg RT: ...      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 기술 스택

| 구성 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | React 18 + TypeScript | 컴포넌트 기반 UI |
| 빌드 | Vite | 빠른 HMR, 가벼운 번들 |
| 시각화 (Pod) | HTML Canvas | 다수 요소 렌더링 성능 |
| 차트 | lightweight chart lib 또는 Canvas 직접 | 실시간 스트리밍 차트 |
| 상태관리 | zustand 또는 React ref | 시뮬레이션 상태는 ref로 고속 업데이트 |
| 스타일 | Tailwind CSS | 빠른 레이아웃 |
| 배포 | 정적 SPA (별도 서버 불필요) | GitHub Pages / S3 / 로컬 |

### 시뮬레이션 엔진 설계

```
SimulationEngine (class)
├── clock: number (현재 시뮬레이션 시간 ms)
├── eventQueue: PriorityQueue<Event>  ← 이산 이벤트 큐
├── pods: Pod[]
├── loadBalancer: LoadBalancer
├── metrics: MetricsCollector
│
├── step(deltaMs)        ← 한 스텝 진행
├── run(speed)           ← requestAnimationFrame 루프
├── pause() / resume()
├── stopRequests()       ← 복구 측정 시작
│
└── Events:
    ├── RequestArrival    ← RPS 기반 주기적 생성
    ├── RequestComplete   ← worker 해제
    ├── LivenessProbe     ← periodSeconds 주기
    ├── ReadinessProbe    ← periodSeconds 주기
    ├── ProbeTimeout      ← timeoutSeconds 후 실패 판정
    ├── PodRestart        ← liveness 실패 시
    └── PodInitComplete   ← initializeTime 후 복귀
```

### 성능 최적화 전략

1. **시뮬레이션과 렌더링 분리**: 시뮬레이션은 가능한 빠르게, 렌더링은 60fps 캡
2. **배속 처리**: 1프레임당 `deltaTime * speed`만큼 시뮬레이션 시간 진행
3. **Canvas 렌더링**: DOM 업데이트 최소화, dirty region만 재렌더링
4. **메트릭 샘플링**: 차트 데이터는 일정 간격으로 샘플링 (전체 이벤트를 그리지 않음)
5. **React 상태 최소화**: 시뮬레이션 코어는 React 외부에서 동작, 렌더링 시점에만 snapshot 전달

---

## 시뮬레이션 시나리오 예시

### 시나리오: "slow request 15%가 서비스를 죽이는가?"

**설정**:
- Pod 3개, Worker 4개/pod, Backlog 10개/pod
- RPS: 60 (pod당 20)
- Request: normal 50ms (85%), slow 5s (15%)
- Liveness: period=10s, timeout=5s, failureThreshold=3
- Readiness: period=10s, timeout=5s, failureThreshold=3
- initializeTime: 30s

**예상 전개**:
1. 0~10s: slow request가 worker를 점유하기 시작, backlog 서서히 증가
2. 10~30s: worker 대부분 점유, backlog 포화, readiness probe timeout 시작
3. 30~40s: readiness failureThreshold 도달, Pod들이 Not Ready로 전환
4. 40~50s: 남은 Ready Pod에 부하 집중 → 연쇄 실패
5. ~50s: 전체 Pod Not Ready → 503 시작
6. 요청 중단 후: initializeTime + probe 성공 대기 → 복구

---

## Load Balancer 확장 구조

```typescript
interface LoadBalancerStrategy {
  name: string;
  selectPod(readyPods: Pod[]): Pod;
}

class RoundRobinStrategy implements LoadBalancerStrategy {
  name = "round-robin";
  private index = 0;
  selectPod(readyPods: Pod[]): Pod {
    const pod = readyPods[this.index % readyPods.length];
    this.index++;
    return pod;
  }
}

// 추후 확장
// class LeastConnectionsStrategy implements LoadBalancerStrategy { ... }
// class RandomStrategy implements LoadBalancerStrategy { ... }
```

---

## 파일 구조 (예상)

```
src/
├── main.tsx
├── App.tsx
├── simulation/
│   ├── engine.ts            # SimulationEngine 코어
│   ├── events.ts            # 이벤트 타입 정의
│   ├── pod.ts               # Pod 상태 머신
│   ├── worker.ts            # Worker 모델
│   ├── load-balancer.ts     # LB 전략 패턴
│   ├── metrics.ts           # 메트릭 수집기
│   └── types.ts             # 공통 타입
├── components/
│   ├── ParameterPanel.tsx   # 좌측 설정 패널
│   ├── SimulationCanvas.tsx # 메인 Canvas 시각화
│   ├── MetricsChart.tsx     # 하단 실시간 차트
│   ├── ResultReport.tsx     # 결과 리포트
│   ├── Controls.tsx         # 시작/정지/배속 컨트롤
│   └── RequestProfileEditor.tsx # 요청 프로필 편집
├── hooks/
│   └── useSimulation.ts     # 시뮬레이션 <-> React 연결
└── utils/
    └── priority-queue.ts    # 이벤트 큐 자료구조
```
