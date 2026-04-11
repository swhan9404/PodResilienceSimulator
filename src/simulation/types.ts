// --- Event System (per D-01, D-02, D-03) ---
export type EventType =
  | 'REQUEST_ARRIVAL'
  | 'REQUEST_COMPLETE'
  | 'LIVENESS_PROBE'
  | 'READINESS_PROBE'
  | 'PROBE_TIMEOUT'
  | 'PROBE_COMPLETE'
  | 'POD_RESTART'
  | 'POD_INIT_COMPLETE';

export interface SimEvent {
  time: number;              // integer milliseconds (per D-01, SIM-04)
  type: EventType;
  podId?: number;
  requestId?: number;
  workerIndex?: number;
  probeType?: 'liveness' | 'readiness';
  generation?: number;       // for tombstone pattern (event cancellation on restart)
}

// --- Pod Model (per D-04, POD-01) ---
export enum PodState {
  READY = 'READY',
  NOT_READY = 'NOT_READY',
  RESTARTING = 'RESTARTING',
}

// --- Request Profile (per SIM-03) ---
export interface RequestProfile {
  name: string;
  latencyMs: number;         // integer ms
  ratio: number;             // 0..1, all profiles sum to 1.0
  color: string;             // hex color for visualization
}

// --- Probe Configuration ---
export interface ProbeConfig {
  periodSeconds: number;
  timeoutSeconds: number;
  failureThreshold: number;
  successThreshold: number;
}

// --- Simulation Configuration ---
export interface SimulationConfig {
  podCount: number;               // >= 1
  workersPerPod: number;          // >= 1
  maxBacklogPerPod: number;       // >= 0
  rps: number;                    // requests per second, > 0
  requestProfiles: RequestProfile[];
  livenessProbe: ProbeConfig;
  readinessProbe: ProbeConfig;
  initializeTimeMs: number;       // integer ms for pod restart init
  seed: number;                   // PRNG seed for determinism
}

// --- Worker (per POD-02) ---
export interface ActiveRequest {
  requestId: number;
  profileName: string;
  profileColor: string;
  startTime: number;             // sim time when worker started processing
  endTime: number;               // sim time when processing completes
  isProbe: boolean;
  probeType?: 'liveness' | 'readiness';
}

// --- Probe Counter (per HC-05, HC-06, HC-07) ---
export interface ProbeCounter {
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

// --- Accept Result (per POD-03, POD-04, D-09) ---
export type AcceptResult =
  | { status: 'assigned'; workerIndex: number }
  | { status: 'queued' }
  | { status: 'rejected'; reason: 'backlog_full' | 'not_accepting' };

// --- Snapshot Types (per D-12) ---
export interface WorkerSnapshot {
  busy: boolean;
  profileName: string | null;
  profileColor: string | null;
  progress: number;              // 0..1, how far through processing
}

export interface PodSnapshot {
  id: number;
  state: PodState;
  workers: WorkerSnapshot[];
  backlogSize: number;
  backlogMax: number;
  livenessHistory: boolean[];    // recent probe results, newest last
  readinessHistory: boolean[];
  generation: number;
}

export interface MetricsSample {
  time: number;                  // sim time in ms
  totalRequests: number;
  total503s: number;
  droppedByRestart: number;
  readyPodCount: number;
  activeWorkerCount: number;
  totalWorkerCount: number;
  perProfileResponseTime: Record<string, { sum: number; count: number }>;
}

export interface SimulationSnapshot {
  clock: number;                 // current sim time in integer ms
  pods: PodSnapshot[];
  stats: {
    totalRequests: number;
    total503s: number;
    droppedByRestart: number;
    readyPodCount: number;
    activeWorkerCount: number;
    totalWorkerCount: number;
  };
  metrics: MetricsSample[];
  phase: 'running' | 'stopped_requests' | 'recovered' | 'finished';
}

// --- Load Balancer Strategy (per D-10, LB-03) ---
export interface LoadBalancerStrategy {
  name: string;
  selectPod(readyPodIds: number[]): number;  // returns pod id
  reset(): void;
}
