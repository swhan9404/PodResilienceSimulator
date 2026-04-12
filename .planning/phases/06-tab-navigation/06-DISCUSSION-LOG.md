# Phase 6: Tab Navigation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 06-tab-navigation
**Areas discussed:** Tab bar placement & style, ControlPanel scope, Background activity indicator

---

## Tab Bar Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Page top header | Full width above ControlPanel. Simulator/Optimizer as distinct views. Best navigation visibility. | ✓ |
| Main content area top | Inside main area, right of sidebar. Sidebar stays fixed, only content switches. | |
| ControlPanel top embedded | Tab switch UI inside sidebar. Sidebar content changes per tab. | |

**User's choice:** Page top header (recommended)
**Notes:** None

## Tab Bar Style

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal text tabs | Blends with dark UI. Active tab with underline or subtle background. App title included. | ✓ |
| Card-style button tabs | Rounded corner button style. More visually prominent active tab. Dashboard feel. | |
| Claude's discretion | Let Claude decide based on existing Tailwind dark theme. | |

**User's choice:** Minimal text tabs (recommended)
**Notes:** None

## App Title in Tab Bar

| Option | Description | Selected |
|--------|-------------|----------|
| App title + tabs | "Slow Request Simulator" on left, tabs on right. Clear app identity. | ✓ |
| Tabs only | No title, just tabs. Clean and minimal. | |
| Claude's discretion | Let Claude decide based on layout. | |

**User's choice:** App title + tabs (recommended)
**Notes:** None

## ControlPanel Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Independent sidebar per tab | Simulator keeps ControlPanel, Optimizer gets own sidebar. Both keepMounted. Clean separation. | ✓ |
| Shared sidebar | One sidebar that changes content per tab. Requires ControlPanel refactoring. | |
| Simulator-only sidebar | Simulator has sidebar, Optimizer is full-width. Simple but inconsistent layout. | |

**User's choice:** Independent sidebar per tab (recommended)
**Notes:** Phase 6 creates placeholder for Optimizer sidebar; Phase 7 fills it.

## Background Activity Indicator

| Option | Description | Selected |
|--------|-------------|----------|
| Status badge on tab | Green dot or small badge on Simulator tab label when running. Minimal visual hint. | ✓ |
| Status area in tab bar | Text like "Simulation running (32.5s)" in tab bar. More info but more complex. | |
| No indicator | No visual hint. User checks by switching back. Simplest. | |
| Claude's discretion | Let Claude decide appropriate approach. | |

**User's choice:** Status badge on tab (recommended)
**Notes:** Badge driven by existing `playback` state from useSimulationStore.

---

## Claude's Discretion

- Exact CSS mechanism for hiding inactive tab (visibility/position vs display)
- Tab bar height/padding details
- Placeholder content for Optimizer view
- Transition animation (if any)

## Deferred Ideas

None — discussion stayed within phase scope
