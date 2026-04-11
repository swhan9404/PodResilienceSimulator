# Phase 4: Report - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 04-report
**Areas discussed:** Report 트리거 & 라이프사이클, Report 배치 & UI 구조, 데이터 표현 방식

---

## Report 트리거 & 라이프사이클

### Q1: 리포트가 언제 표시되나요?

| Option | Description | Selected |
|--------|-------------|----------|
| recovered 자동 표시 | Stop Requests 후 모든 Pod가 Ready로 복구되면 자동으로 리포트 표시. 엔진의 phase='recovered' 상태를 트리거로 사용 | ✓ |
| Show Report 버튼 | 시뮬레이션 종료/복구 후 [Show Report] 버튼이 나타나고 클릭 시 표시 | |
| 둘 다 (auto + 중간 확인) | recovered 시 자동 표시되지만, 실행 중에도 현재까지의 스냅샷 리포트를 보는 버튼 제공 | |

**User's choice:** recovered 자동 표시
**Notes:** 추가 조작 없이 자연스러운 플로우

### Q2: Stop Requests 없이 시뮬레이션을 계속 돌리는 경우 리포트는?

| Option | Description | Selected |
|--------|-------------|----------|
| 복구 시에만 표시 | recovered 상태에만 리포트 표시. Stop Requests를 안 누르면 리포트도 없음 | ✓ |
| Reset 시에도 표시 | Reset 버튼을 누를 때도 그 시점까지의 리포트를 보여줌 | |
| Pause 시에도 표시 | Pause 상태에서도 중간 리포트 확인 가능 | |

**User's choice:** 복구 시에만 표시
**Notes:** RPT-04(복구시간)이 핵심이므로 복구 플로우를 강제하는 것이 자연스러움

---

## Report 배치 & UI 구조

### Q1: 리포트가 화면 어디에 표시되나요?

| Option | Description | Selected |
|--------|-------------|----------|
| 시각화 영역 대체 | recovered 시 Pod Canvas + Charts 영역을 리포트로 교체. 좌측 패널은 그대로 유지 | ✓ |
| 하단 추가 섹션 | Charts 아래에 리포트 섹션 추가. Canvas+Charts는 유지 | |
| 모달/오버레이 | 화면 중앙에 모달로 리포트 표시. 배경에 시각화 유지 | |

**User's choice:** 시각화 영역 대체
**Notes:** 시뮬레이션 종료 후 시각화는 더 이상 업데이트되지 않으므로 교체가 자연스러움

---

## 데이터 표현 방식

### Q1: RPT-01~03 degradation timeline을 어떻게 표현하나요?

| Option | Description | Selected |
|--------|-------------|----------|
| 세로 타임라인 | 시간축을 세로로 배치하고 각 이벤트를 마커로 표시. 시간 간격이 직관적으로 보임 | ✓ |
| 테이블 형식 | 단순 테이블로 이벤트명/시점/설명 나열 | |
| 카드 + 타임라인 조합 | 상단에 핵심 수치 카드, 하단에 타임라인 | |

**User's choice:** 세로 타임라인
**Notes:** 스토리텔링 순서로 시뮬레이션 시작부터 복구까지의 전체 흐름을 한눈에 파악

### Q2: RPT-04~06 summary stats를 어떻게 표현하나요?

| Option | Description | Selected |
|--------|-------------|----------|
| 카드 그리드 | 핵심 수치를 큰 숫자 카드로. Profile별 응답시간은 별도 테이블 | ✓ |
| 테이블만 | 모든 수치를 하나의 테이블로 표시 | |
| Claude 재량 | 타임라인과 어울리는 형태로 Claude가 결정 | |

**User's choice:** 카드 그리드
**Notes:** 복구시간, 503 비율, 총 처리 수를 큰 숫자로 강조

### Q3: 리포트 내 타임라인과 카드의 배치 순서는?

| Option | Description | Selected |
|--------|-------------|----------|
| 타임라인 먼저 | 위: degradation 타임라인 → 아래: summary 카드/테이블 | ✓ |
| 카드 먼저 | 위: summary 카드 → 아래: degradation 타임라인 | |
| 좌우 분할 | 좌: 타임라인, 우: 카드/테이블 | |

**User's choice:** 타임라인 먼저
**Notes:** 스토리텔링 순서 — 먼저 무슨 일이 일어났는지, 그다음 결과 요약

---

## Claude's Discretion

- 타임라인 시각적 디테일 (마커 스타일, 색상, 간격 비례 여부)
- 카드 그리드 열 수 및 크기
- Critical event timestamp 수집 방식 (엔진 내부 vs 별도 collector)
- Profile 테이블 정렬 및 스타일링

## Deferred Ideas

None — discussion stayed within phase scope
