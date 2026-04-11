import { useEffect, useRef, useState } from 'react';
import { PodRenderer } from './PodRenderer';

export interface PodCanvasProps {
  rendererRef: React.MutableRefObject<PodRenderer | null>;
  onRendererReady?: (renderer: PodRenderer | null) => void;
  onCanvasResize?: (width: number, height: number) => void;
}

function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}

export function PodCanvas({ rendererRef, onRendererReady, onCanvasResize }: PodCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const [showLegend, setShowLegend] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = setupCanvas(canvas);
    const renderer = new PodRenderer(ctx);
    rendererRef.current = renderer;
    onRendererReady?.(renderer);

    const rect = canvas.getBoundingClientRect();
    prevSizeRef.current = { width: rect.width, height: rect.height };
    onCanvasResize?.(rect.width, rect.height);

    // Detect dark mode
    const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleDarkChange = () => {
      // Re-draw will pick up new theme on next frame
    };
    darkMq.addEventListener('change', handleDarkChange);

    // ResizeObserver with dimension comparison to avoid infinite loop (Pitfall 4)
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const prev = prevSizeRef.current;
        if (Math.abs(width - prev.width) < 1 && Math.abs(height - prev.height) < 1) {
          continue;
        }
        prevSizeRef.current = { width, height };
        setupCanvas(canvas);
        rendererRef.current = new PodRenderer(canvas.getContext('2d')!);
        onRendererReady?.(rendererRef.current);
        onCanvasResize?.(width, height);
      }
    });
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      darkMq.removeEventListener('change', handleDarkChange);
      rendererRef.current = null;
      onRendererReady?.(null);
    };
  }, [rendererRef, onRendererReady, onCanvasResize]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: '300px' }}
      />
      <div className="mt-2">
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          {showLegend ? '▲ Hide Legend' : '▼ Show Legend'}
        </button>
        {showLegend && (
          <div className="mt-1 text-xs text-gray-500 flex gap-6">
            <span><b>BL</b> — Backlog (queued / max)</span>
            <span><b>L</b> — Liveness probe (+success / xfail)</span>
            <span><b>R</b> — Readiness probe (+success / xfail)</span>
          </div>
        )}
      </div>
    </div>
  );
}
