# Phase 6: Tab Navigation - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Tab switching UI between Simulator and Optimizer views with keepMounted state preservation. Both views remain mounted in the DOM at all times (CSS visibility toggle). Simulator's RAF loop and Canvas refs must survive tab switches intact.

</domain>

<decisions>
## Implementation Decisions

### Tab Bar Placement & Layout
- **D-01:** Tab bar at page top, full width, above the ControlPanel/sidebar area. Acts as the primary navigation header.
- **D-02:** App title ("Slow Request Simulator") displayed on the left side of the tab bar. Tabs ("Simulator", "Optimizer") to the right of the title.
- **D-03:** Minimal text tab style — subtle underline or background color on active tab. Consistent with existing dark theme (CSS custom properties: `--bg-dominant`, `--bg-secondary`, `--border-color`).

### ControlPanel Scope
- **D-04:** Each tab has its own independent sidebar (keepMounted). Simulator tab keeps the current `ControlPanel`. Optimizer tab gets a separate sidebar component (Phase 7 will implement the Optimizer input form; Phase 6 provides a placeholder).
- **D-05:** Both sidebars remain mounted in the DOM alongside their main content, toggled by CSS visibility with the tab switch.

### Background Activity Indicator
- **D-06:** When simulation is running and user is on the Optimizer tab, the "Simulator" tab label shows a status badge (green dot or small indicator) to signal background activity.
- **D-07:** Badge visibility driven by the existing `playback` state from `useSimulationStore` — show when playback is `'running'`.

### keepMounted Mechanism (Carried Forward)
- **D-08:** CSS visibility toggle (`visibility: hidden` + `position: absolute` or `display: none` with caution). NOT conditional rendering (`{activeTab === 'sim' && <Sim />}`). This preserves Canvas refs, RAF loop, and uPlot instances across tab switches.
- **D-09:** No React Router — simple Zustand state (`activeTab: 'simulator' | 'optimizer'`) controls which view is visible.

### Claude's Discretion
- Exact CSS mechanism for hiding inactive tab content (visibility/position vs display, as long as RAF loop and Canvas survive)
- Tab bar height and padding details
- Placeholder content for Optimizer view (Phase 7 replaces it)
- Transition animation between tabs (if any — keep minimal)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Codebase
- `src/App.tsx` — Current layout structure (ControlPanel sidebar + main content area). Must be refactored to add tab bar and dual-view container.
- `src/components/ControlPanel.tsx` — Simulator's sidebar component. Stays as-is, wrapped in the Simulator tab view.
- `src/store/useSimulationStore.ts` — Contains `playback` state used for background activity badge. Tab state (`activeTab`) should be added here or in a new lightweight store.
- `src/visualization/PodCanvas.tsx` — Canvas component that must survive tab switches (keepMounted critical path).
- `src/visualization/MetricsCharts.tsx` — uPlot charts that must survive tab switches.

### Requirements
- `.planning/REQUIREMENTS.md` §Navigation — NAV-01: tab switching with state preservation (keepMounted)
- `.planning/ROADMAP.md` §Phase 6 — Success criteria (especially #2: simulation survives tab switch, #3: CSS visibility not conditional rendering)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useSimulationStore` (Zustand) — Can be extended with `activeTab` state, or a new store can be created
- CSS custom properties (`--bg-dominant`, `--bg-secondary`, `--border-color`) — Tab bar styling should use these
- Tailwind CSS classes — All existing components use Tailwind; tab bar should follow same pattern

### Established Patterns
- Zustand selectors for state access (`useSimulationStore((s) => s.field)`)
- Component structure: functional components with props, no class components
- Layout: `min-w-[1280px]`, `flex` layout with sidebar + main area

### Integration Points
- `App.tsx` is the only file that needs structural changes — wrap existing content in tab containers, add tab bar header
- Phase 7 will replace the Optimizer placeholder with actual input form, chart, and recommendation cards
- `useSimulationStore.playback` drives the background activity badge — no new data source needed

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

Key constraints:
- Tab switch must be instant (no loading states — both views are always mounted)
- Existing `min-w-[1280px]` layout constraint should be maintained
- Phase 6 scope is navigation only — Optimizer view content is Phase 7

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-tab-navigation*
*Context gathered: 2026-04-13*
