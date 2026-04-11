# Phase 2: Visualization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 02-visualization
**Areas discussed:** Pod Canvas 레이아웃, Chart 구성 및 배치, 렌더링 루프 설계, 전체 화면 레이아웃

---

## Pod Canvas 레이아웃

### Pod 배치 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 그리드 (Recommended) | N열 그리드로 배치, Pod 수 늘어나면 자동 줄바꿈 | |
| 수평 1열 | 가로로 나란히 배치, 스크롤 필요 | |
| Claude 재량 | Pod 수에 따라 적절히 결정 | ✓ |

**User's choice:** Claude 재량
**Notes:** Pod 수에 따라 1열 또는 그리드 자동 결정

### Worker slot 표현

| Option | Description | Selected |
|--------|-------------|----------|
| 개별 셀 (Recommended) | Worker마다 네모난 셀, idle=회색, 처리중=profile color | ✓ |
| 점유율 바 | 전체 worker를 하나의 progress bar로 표시 | |
| Claude 재량 | Worker 수에 따라 결정 | |

**User's choice:** 개별 셀 (Recommended)

### Backlog 시각화

| Option | Description | Selected |
|--------|-------------|----------|
| Fill bar (Recommended) | 수평 bar로 비율 표시, 가득 차면 빨간색 | |
| 숫자만 | "BL: 7/10" 텍스트만 표시 | ✓ |
| Claude 재량 | 적절히 결정 | |

**User's choice:** 숫자만

---

## Chart 구성 및 배치

### 시간 윈도우

| Option | Description | Selected |
|--------|-------------|----------|
| 고정 60초 (Recommended) | 최근 60초만 표시, 스크롤링 없음 | ✓ |
| 전체 시뮬레이션 | 시작부터 전체 히스토리 표시 | |
| Claude 재량 | 적절히 결정 | |

**User's choice:** 고정 60초 (Recommended)

### 차트 배치

| Option | Description | Selected |
|--------|-------------|----------|
| 2x2 그리드 (Recommended) | 4개 차트를 2열 2행으로 배치 | ✓ |
| 4열 1행 | 가로로 나란히, 세로로 관대 | |
| Claude 재량 | 적절히 결정 | |

**User's choice:** 2x2 그리드 (Recommended)

---

## 렌더링 루프 설계

### Engine-UI 연결 방식

| Option | Description | Selected |
|--------|-------------|----------|
| rAF 기반 (Recommended) | requestAnimationFrame으로 매 프레임 step+render | ✓ |
| setInterval + rAF 분리 | 시뮬레이션과 렌더링 독립 실행 | |
| Claude 재량 | 성능과 단순성 균형 | |

**User's choice:** rAF 기반 (Recommended)

### Chart 업데이트 빈도

| Option | Description | Selected |
|--------|-------------|----------|
| 매 프레임 (Recommended) | Canvas와 동일하게 60fps 업데이트 | |
| 쓰로틀링 (1초/회) | metrics 샘플 주기와 맞춤, 성능 안전 | ✓ |
| Claude 재량 | 프로파일링 후 결정 | |

**User's choice:** 쓰로틀링 (1초/회)

---

## 전체 화면 레이아웃

### 화면 분할 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 상하 분할 (Recommended) | 위: Pod Canvas, 아래: 2x2 Charts | ✓ |
| 좌우 분할 | 좌: Pod Canvas, 우: Charts | |
| Claude 재량 | 화면 비율에 따라 결정 | |

**User's choice:** 상하 분할 (Recommended)

---

## Claude's Discretion

- Pod 그리드 열 수 (Pod 수에 따라 자동)
- Canvas 내부 spacing, padding, font size
- uPlot chart 색상 및 스타일링

## Deferred Ideas

None
