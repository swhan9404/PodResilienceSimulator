import { useSimulationStore } from '../store/useSimulationStore';

const MIN_SPEED = 0.5;
const MAX_SPEED = 100;
const MIN_LOG = Math.log(MIN_SPEED);
const MAX_LOG = Math.log(MAX_SPEED);

function sliderToSpeed(position: number): number {
  const speed = Math.exp(MIN_LOG + (position / 100) * (MAX_LOG - MIN_LOG));
  return Math.round(speed * 10) / 10;
}

function speedToSlider(speed: number): number {
  return ((Math.log(speed) - MIN_LOG) / (MAX_LOG - MIN_LOG)) * 100;
}

export function SpeedControl() {
  const speed = useSimulationStore((s) => s.speed);
  const setSpeed = useSimulationStore((s) => s.setSpeed);
  const playback = useSimulationStore((s) => s.playback);
  const disabled = playback !== 'running' && playback !== 'stopped_requests';

  return (
    <div className={disabled ? 'opacity-50' : ''}>
      {/* Preset buttons row */}
      <div className="flex gap-2 mb-2">
        {[1, 10, 50, 100].map((preset) => (
          <button
            key={preset}
            onClick={() => setSpeed(preset)}
            disabled={disabled}
            className={`w-11 h-7 rounded text-sm font-semibold cursor-pointer disabled:cursor-not-allowed ${
              speed === preset
                ? 'bg-[#3B82F6] text-white'
                : 'bg-[var(--bg-dominant)] text-[var(--text-primary)] border border-[var(--border-color)]'
            }`}
          >
            {preset}x
          </button>
        ))}
      </div>
      {/* Slider + speed display */}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={speedToSlider(speed)}
          onChange={(e) => setSpeed(sliderToSpeed(Number(e.target.value)))}
          disabled={disabled}
          className="flex-1"
          aria-label="Simulation speed"
          aria-valuetext={`${speed}x`}
        />
        <span className="text-sm text-[var(--text-primary)] w-14 text-right font-semibold">{speed}x</span>
      </div>
    </div>
  );
}
