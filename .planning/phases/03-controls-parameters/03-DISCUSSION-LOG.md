# Phase 3: Controls & Parameters - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 03-controls-parameters
**Areas discussed:** 파라미터 편집 흐름, 배속 컨트롤 UX, 상태 표시 & 컨트롤 배치, Zustand 도입 & 상태 구조

---

## 파라미터 편집 흐름

| Option | Description | Selected |
|--------|-------------|----------|
| 시작 전만 수정 | 파라미터 입력 → Start → 실행 중 잠금. Reset으로 처음부터 다시 설정. | ✓ |
| 일부 실시간 수정 가능 | RPS와 배속은 실행 중 변경 가능, 클러스터/probe 설정은 잠금. | |
| 전부 실시간 수정 | 모든 파라미터 실시간 변경 — 엔진 hot-reload 필요. | |

**User's choice:** 시작 전만 수정 (Recommended)
**Notes:** 가장 단순하고 엔진 재생성 없이 깔끔한 모델

### Request Profile UI

| Option | Description | Selected |
|--------|-------------|----------|
| 인라인 리스트 | 각 profile이 한 줄, [+]로 추가, [×]로 삭제, 필드 직접 편집 | ✓ |
| 카드 형태 | 각 profile이 작은 카드, 클릭하면 편집 모드 | |
| Claude가 결정 | 좌측 패널 공간과 프로필 수를 고려해 적절히 선택 | |

**User's choice:** 인라인 리스트 (Recommended)
**Notes:** None

### Ratio 합계 처리

| Option | Description | Selected |
|--------|-------------|----------|
| 자동 정규화 | 비율을 자유롭게 입력하면 시작 시 자동으로 100%로 정규화 | ✓ |
| 실시간 경고 | 합계가 100%가 아니면 경고 표시, 시작 버튼 비활성화 | |

**User's choice:** 자동 정규화 (Recommended)
**Notes:** None

---

## 배속 컨트롤 UX

| Option | Description | Selected |
|--------|-------------|----------|
| 프리셋 버튼 + 슬라이더 | 자주 쓰는 배속(1x, 10x, 50x, 100x) 버튼 + 로그 스케일 슬라이더로 세밀한 조절 | ✓ |
| 슬라이더만 | 로그 스케일 슬라이더 하나로 단순하게 | |
| 프리셋 버튼만 | 고정 배속 버튼만 (0.5x, 1x, 5x, 10x, 50x, 100x) | |

**User's choice:** 프리셋 버튼 + 슬라이더 (Recommended)
**Notes:** None

### 배속 조절 가능 시점

| Option | Description | Selected |
|--------|-------------|----------|
| 실행 중에만 | 시작 전에는 배속 UI 비활성화, 기본 1x로 시작 | ✓ |
| 항상 조절 가능 | 시작 전에도 초기 배속 설정 가능 | |

**User's choice:** 실행 중에만 (Recommended)
**Notes:** None

---

## 상태 표시 & 컨트롤 배치

| Option | Description | Selected |
|--------|-------------|----------|
| 좌측 패널 상단 | 컨트롤 버튼 위에 상태 정보 배치. 좌측 패널이 "제어센터" 역할. | ✓ |
| 상단 바 | 페이지 최상단에 가로 바로 상태 표시 | |
| Claude가 결정 | 레이아웃을 Claude가 적절히 배치 | |

**User's choice:** 좌측 패널 상단 (Recommended)
**Notes:** None

### 좌측 패널 너비

| Option | Description | Selected |
|--------|-------------|----------|
| 고정 300px | 컨트롤+파라미터에 충분, 시각화 영역 최대화 (1280px에서 우측 980px) | ✓ |
| 고정 360px | 더 널찍한 필드, probe 설정에 유리 | |
| Claude가 결정 | 필드 수와 레이아웃 고려 Claude 판단 | |

**User's choice:** 고정 300px (Recommended)
**Notes:** None

### 컨트롤 버튼 상태별 노출

| Option | Description | Selected |
|--------|-------------|----------|
| 상태별 표시/숨김 | 현재 상태에 유효한 버튼만 보여줌 | ✓ |
| 전부 표시 + 비활성화 | 모든 버튼 항상 보이되, 사용 불가 시 disabled | |
| Claude가 결정 | UX 상황에 맞게 적절히 결정 | |

**User's choice:** 상태별 표시/숨김 (Recommended)
**Notes:** None

---

## Zustand 도입 & 상태 구조

| Option | Description | Selected |
|--------|-------------|----------|
| Zustand 도입 | config/playback 상태를 Zustand store로 관리. useSimulation hook을 store 기반으로 리팩터링. | ✓ |
| Hook으로 유지 | 기존 useSimulation hook에 상태 추가. Zustand 의존성 없이 단순 유지. | |
| Claude가 결정 | 코드 복잡도에 따라 판단 | |

**User's choice:** Zustand 도입 (Recommended)
**Notes:** None

### Store 분리

| Option | Description | Selected |
|--------|-------------|----------|
| 단일 store | config + playback + snapshot ref를 하나의 store. selector로 필요한 부분만 구독. | ✓ |
| 2개 store 분리 | configStore + simulationStore 분리 | |
| Claude가 결정 | 코드 구조 보고 판단 | |

**User's choice:** 단일 store (Recommended)
**Notes:** None

### Engine 연결 방식

| Option | Description | Selected |
|--------|-------------|----------|
| Store에 ref 저장 | store에 engine/loop 인스턴스 ref 저장, 액션이 store 내부에서 engine 직접 조작 | ✓ |
| Hook에서 연결 | engine/loop는 useRef, hook이 store와 engine 사이 브리지 | |
| Claude가 결정 | 구현 시 적절한 패턴 선택 | |

**User's choice:** Store에 ref 저장 (Recommended)
**Notes:** None

---

## Claude's Discretion

- 파라미터 폼의 섹션 분리/접기 방식
- 색상 선택 UI
- 기본값 설정
- 좌측 패널 내부 스크롤 처리

## Deferred Ideas

None — discussion stayed within phase scope
