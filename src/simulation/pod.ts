import {
  PodState,
  type ActiveRequest,
  type AcceptResult,
  type ProbeCounter,
  type ProbeConfig,
  type WorkerSnapshot,
  type PodSnapshot,
} from './types';

export interface ProbeResult {
  action: 'none' | 'remove_from_lb' | 'add_to_lb' | 'restart';
}

export class Pod {
  readonly id: number;
  state: PodState = PodState.READY;
  workers: (ActiveRequest | null)[];
  backlog: ActiveRequest[] = [];
  readonly maxBacklog: number;
  livenessCounter: ProbeCounter = { consecutiveFailures: 0, consecutiveSuccesses: 0 };
  readinessCounter: ProbeCounter = { consecutiveFailures: 0, consecutiveSuccesses: 0 };
  livenessHistory: boolean[] = [];
  readinessHistory: boolean[] = [];
  generation: number = 0;
  private livenessConfig: ProbeConfig;
  private readinessConfig: ProbeConfig;
  private readonly historySize: number = 10;

  constructor(
    id: number,
    workersPerPod: number,
    maxBacklog: number,
    livenessConfig: ProbeConfig,
    readinessConfig: ProbeConfig,
  ) {
    this.id = id;
    this.workers = new Array(workersPerPod).fill(null);
    this.maxBacklog = maxBacklog;
    this.livenessConfig = livenessConfig;
    this.readinessConfig = readinessConfig;
  }

  tryAccept(request: ActiveRequest): AcceptResult {
    if (this.state === PodState.RESTARTING) {
      return { status: 'rejected', reason: 'not_accepting' };
    }

    // Find first idle worker
    for (let i = 0; i < this.workers.length; i++) {
      if (this.workers[i] === null) {
        this.workers[i] = request;
        return { status: 'assigned', workerIndex: i };
      }
    }

    // Try backlog (FIFO: push to end)
    if (this.backlog.length < this.maxBacklog) {
      this.backlog.push(request);
      return { status: 'queued' };
    }

    return { status: 'rejected', reason: 'backlog_full' };
  }

  completeRequest(workerIndex: number, _currentTime: number): ActiveRequest | null {
    this.workers[workerIndex] = null;

    if (this.backlog.length > 0) {
      const next = this.backlog.shift()!;
      this.workers[workerIndex] = next;
      return next;
    }

    return null;
  }

  recordProbeResult(probeType: 'liveness' | 'readiness', success: boolean): ProbeResult {
    if (probeType === 'liveness') {
      if (success) {
        this.livenessCounter.consecutiveSuccesses++;
        this.livenessCounter.consecutiveFailures = 0;
      } else {
        this.livenessCounter.consecutiveFailures++;
        this.livenessCounter.consecutiveSuccesses = 0;
      }
      this.pushHistory(this.livenessHistory, success);

      if (this.livenessCounter.consecutiveFailures >= this.livenessConfig.failureThreshold) {
        return { action: 'restart' };
      }
    } else {
      // readiness
      this.pushHistory(this.readinessHistory, success);
      if (success) {
        this.readinessCounter.consecutiveSuccesses++;
        this.readinessCounter.consecutiveFailures = 0;

        if (
          this.readinessCounter.consecutiveSuccesses >= this.readinessConfig.successThreshold &&
          this.state === PodState.NOT_READY
        ) {
          this.state = PodState.READY;
          return { action: 'add_to_lb' };
        }
      } else {
        this.readinessCounter.consecutiveFailures++;
        this.readinessCounter.consecutiveSuccesses = 0;

        if (
          this.readinessCounter.consecutiveFailures >= this.readinessConfig.failureThreshold &&
          this.state === PodState.READY
        ) {
          this.state = PodState.NOT_READY;
          return { action: 'remove_from_lb' };
        }
      }
    }

    return { action: 'none' };
  }

  restart(): number {
    let dropped = 0;
    for (let i = 0; i < this.workers.length; i++) {
      if (this.workers[i] !== null) {
        dropped++;
        this.workers[i] = null;
      }
    }
    dropped += this.backlog.length;
    this.backlog = [];
    this.state = PodState.RESTARTING;
    this.generation++;
    this.livenessCounter = { consecutiveFailures: 0, consecutiveSuccesses: 0 };
    this.readinessCounter = { consecutiveFailures: 0, consecutiveSuccesses: 0 };
    this.livenessHistory = [];
    this.readinessHistory = [];
    return dropped;
  }

  initComplete(): void {
    this.state = PodState.NOT_READY;
    this.livenessCounter = { consecutiveFailures: 0, consecutiveSuccesses: 0 };
    this.readinessCounter = { consecutiveFailures: 0, consecutiveSuccesses: 0 };
  }

  getSnapshot(currentTime: number): PodSnapshot {
    const workers: WorkerSnapshot[] = this.workers.map((w) => {
      if (w === null) {
        return { busy: false, profileName: null, profileColor: null, progress: 0 };
      }
      const duration = w.endTime - w.startTime;
      const elapsed = currentTime - w.startTime;
      const progress = duration > 0 ? Math.max(0, Math.min(1, elapsed / duration)) : 1;
      return {
        busy: true,
        profileName: w.profileName,
        profileColor: w.profileColor,
        progress,
      };
    });

    return {
      id: this.id,
      state: this.state,
      workers,
      backlogSize: this.backlog.length,
      backlogMax: this.maxBacklog,
      livenessHistory: [...this.livenessHistory],
      readinessHistory: [...this.readinessHistory],
      generation: this.generation,
    };
  }

  private pushHistory(history: boolean[], value: boolean): void {
    history.push(value);
    if (history.length > this.historySize) {
      history.shift();
    }
  }
}
