---
phase: 03-controls-parameters
reviewed: 2026-04-11T22:10:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - package.json
  - src/App.tsx
  - src/components/ClusterParams.tsx
  - src/components/ControlPanel.tsx
  - src/components/NumberInput.tsx
  - src/components/ParamSection.tsx
  - src/components/PlaybackControls.tsx
  - src/components/PodParams.tsx
  - src/components/ProbeParams.tsx
  - src/components/RequestProfileList.tsx
  - src/components/SpeedControl.tsx
  - src/components/StatusDisplay.tsx
  - src/components/TrafficParams.tsx
  - src/store/useSimulationStore.ts
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-04-11T22:10:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

The phase 3 implementation covers the full control panel UI: parameter sections (Cluster, Traffic, Request Profiles, Probes, Pod), playback controls, speed control with logarithmic slider, and a Zustand store binding everything together. The code is well-structured with clean component decomposition, proper disabled-state handling during simulation, and good accessibility attributes (aria-live, aria-label, aria-valuetext).

Key concerns: The `NumberInput` component does not enforce `min`/`max` constraints in its `onChange` handler, allowing invalid values (zero workers, negative pod counts) to reach the simulation engine. The `RequestProfileList` allows all ratios to be set to zero, which would produce a degenerate configuration. There is also a shared mutable reference risk in the store's empty chart data constant.

No security issues or critical bugs were found. No hardcoded secrets, no dangerous functions (eval/innerHTML), no debug artifacts.

## Warnings

### WR-01: NumberInput does not enforce min constraint in onChange handler

**File:** `src/components/NumberInput.tsx:18-19`
**Issue:** The `min` prop is only passed as an HTML attribute to `<input type="number">`, which merely provides a browser hint (visual spinner, validation on form submit). The `onChange` handler accepts any numeric value including values below `min`. A user can type `0` into "Workers / Pod" (min=1) or `-5` into "Pod Count" (min=1), and the value propagates directly to the Zustand store and ultimately to the simulation engine. Clearing the input field also produces `0` because `Number("")` returns `0` and `isNaN(0)` is false.

**Fix:** Clamp the value in the `onChange` handler:
```tsx
onChange={(e) => {
  const raw = e.target.value;
  if (raw === '' || raw === '-') return; // don't update on partial input
  const n = Number(raw);
  if (!isNaN(n)) {
    const clamped = min !== undefined ? Math.max(min, n) : n;
    onChange(clamped);
  }
}}
```

### WR-02: All request profile ratios can be set to zero, producing degenerate config

**File:** `src/store/useSimulationStore.ts:62-64`
**Issue:** `normalizeRatios` guards against `total === 0` by returning profiles unchanged. This means if a user sets all profile ratios to 0, the engine receives profiles where every ratio is 0. Depending on the engine's request generation logic, this could mean no requests are ever generated (silent failure) or a division-by-zero in weighted random selection.

**Fix:** Either prevent zero ratios in the UI by using `min={1}` for the ratio input (which requires WR-01 fix to be effective), or handle the zero-total case explicitly in `normalizeRatios`:
```ts
export function normalizeRatios(profiles: RequestProfile[]): RequestProfile[] {
  const total = profiles.reduce((sum, p) => sum + p.ratio, 0);
  if (total === 0) {
    // Equal distribution fallback
    const equal = 1 / profiles.length;
    return profiles.map(p => ({ ...p, ratio: equal }));
  }
  return profiles.map(p => ({ ...p, ratio: p.ratio / total }));
}
```

### WR-03: Array index used as React key for mutable list

**File:** `src/components/RequestProfileList.tsx:51`
**Issue:** `profiles.map((profile, idx) => <div key={idx}>...)` uses the array index as the React key. When profiles are added or removed from the middle of the list, React will misassociate DOM elements with the wrong profile data. This can cause stale input values to appear in the wrong row after deletion. Additionally, the `openColorIdx` state (which tracks which profile's color picker is open by index) will point to the wrong profile after a deletion.

**Fix:** Add a stable `id` field to `RequestProfile` (e.g., a counter or nanoid), or derive a stable key from the profile data:
```tsx
// Quick fix without changing the type:
{profiles.map((profile, idx) => (
  <div key={`${profile.name}-${profile.color}-${idx}`}>
```
A proper fix would add an `id` field to profiles and use that as the key.

### WR-04: Shared mutable array reference for empty chart data

**File:** `src/store/useSimulationStore.ts:67-74`
**Issue:** `EMPTY_DATA` is a single `[[], []]` array reference shared across all four chart data fields in `EMPTY_CHART_DATA`. If any downstream consumer (chart library, rendering callback) mutates the inner arrays (e.g., `data[0].push(...)`) rather than replacing them, the mutation would corrupt all four chart fields simultaneously since they share the same object reference.

**Fix:** Use a factory function to create distinct empty arrays for each field:
```ts
const emptyData = (): AlignedData => [[], []];

export const EMPTY_CHART_DATA: ChartData = {
  workerUsage: emptyData(),
  readyPods: emptyData(),
  rate503: emptyData(),
  responseTime: emptyData(),
};
```

## Info

### IN-01: addProfile generates potentially duplicate names

**File:** `src/components/RequestProfileList.tsx:31`
**Issue:** New profiles are named `profile${profiles.length + 1}`. If a user adds 3 profiles (profile1, profile2, profile3), deletes profile2, then adds a new profile, the new profile is named "profile3" (since `profiles.length` is now 2 again), duplicating the existing profile3's name.

**Fix:** Use a running counter instead of array length:
```ts
const maxNum = profiles.reduce((max, p) => {
  const m = p.name.match(/^profile(\d+)$/);
  return m ? Math.max(max, Number(m[1])) : max;
}, 0);
setProfiles([...profiles, { name: `profile${maxNum + 1}`, ... }]);
```

### IN-02: NumberInput lacks max prop support

**File:** `src/components/NumberInput.tsx:1-8`
**Issue:** The `NumberInputProps` interface defines `min` and `step` but not `max`. There is no way for consumers to set an upper bound. While not immediately needed by current consumers, the simulation has logical upper bounds (e.g., seed values, pod counts) that could benefit from bounds checking.

**Fix:** Add `max` to the interface and pass it through:
```tsx
interface NumberInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}
```

---

_Reviewed: 2026-04-11T22:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
