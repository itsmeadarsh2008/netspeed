import NumberFlow from '@number-flow/react';
import type { TestPhase } from '../lib/speedtest';

interface GaugeProps {
  phase: TestPhase;
  speed: number;
  dark: boolean;
  unit: string;
}

const phaseLabel: Record<TestPhase, string> = {
  idle: 'Ready',
  discovering: 'Finding servers',
  ping: 'Finding server',
  download: 'Downloading',
  upload: 'Uploading',
  complete: 'Complete',
};

function speedColor(speed: number, dark: boolean): string {
  if (speed >= 100) return dark ? 'text-white' : 'text-black';
  if (speed >= 10) return dark ? 'text-gray-300' : 'text-gray-600';
  return dark ? 'text-gray-500' : 'text-gray-400';
}

function accentColor(speed: number, dark: boolean): string {
  if (speed >= 100) return dark ? 'text-white/60' : 'text-black/60';
  if (speed >= 10) return dark ? 'text-gray-300/60' : 'text-gray-600/60';
  return dark ? 'text-gray-500/60' : 'text-gray-400/60';
}

export default function Gauge({ phase, speed, dark, unit }: GaugeProps) {
  const isActive = phase === 'discovering' || phase === 'ping' || phase === 'download' || phase === 'upload';
  const isIdle = phase === 'idle';
  const isComplete = phase === 'complete';
  const showValue = (isActive || isComplete) && speed > 0;

  const mainColor = isActive || isComplete ? speedColor(speed, dark) : dark ? 'text-white/80' : 'text-gray-800';
  const subColor = isActive || isComplete ? accentColor(speed, dark) : dark ? 'text-white/35' : 'text-gray-400';
  const labelColor = isComplete
    ? dark ? 'text-[#00e676]/50' : 'text-gray-500'
    : isActive
    ? dark ? 'text-[#00e5ff]/50' : 'text-gray-500'
    : dark ? 'text-white/25' : 'text-gray-400';

  return (
    <div className="flex flex-col items-center select-none">
      <span className={`flex items-baseline gap-0.5 text-7xl sm:text-8xl font-light tabular-nums tracking-tight transition-all duration-200 ease-out ${mainColor}`}>
        {showValue ? (
          <NumberFlow
            value={speed}
            format={{ minimumFractionDigits: 0, maximumFractionDigits: 1 }}
            transformTiming={{ duration: 1000, easing: 'ease-out' }}
            spinTiming={{ duration: 1000, easing: 'ease-out' }}
            opacityTiming={{ duration: 250 }}
            className="tabular-nums"
          />
        ) : (
          <span className="tabular-nums">--</span>
        )}
      </span>
      <span className={`text-base sm:text-lg font-medium tracking-widest mt-1 transition-all duration-200 ease-out ${subColor}`}>
        {unit}
      </span>
      <span className={`text-xs sm:text-sm font-semibold tracking-wider mt-2 uppercase transition-all duration-200 ease-out ${labelColor}`}>
        {phaseLabel[phase]}
      </span>
    </div>
  );
}
