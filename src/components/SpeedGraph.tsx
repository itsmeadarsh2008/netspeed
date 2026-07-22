interface SpeedGraphProps {
  download: number[];
  upload: number[];
  packetLoss: number;
  dark?: boolean;
  unit?: string;
}

const WIDTH = 600;
const HEIGHT = 170;

function pathFor(samples: number[], ceiling: number) {
  if (samples.length === 0) return '';
  return samples.map((value, index) => {
    const x = samples.length === 1 ? WIDTH / 2 : (index / (samples.length - 1)) * WIDTH;
    const y = HEIGHT - Math.min(value / ceiling, 1) * HEIGHT;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function pickCeiling(values: number[]): number {
  const max = Math.max(1, ...values);
  const order = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / order;
  let nice: number;
  if (normalized <= 1.5) nice = 1.5;
  else if (normalized <= 3) nice = 3;
  else if (normalized <= 7) nice = 7;
  else nice = 10;
  return nice * order * 1.15;
}

function fmtLabel(v: number, unit: string): string {
  const suffix = unit === 'MB/s' ? 'B/s' : 'bps';
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + ' G' + suffix;
  if (v >= 1) return Math.round(v) + ' ' + unit;
  return v.toFixed(1) + ' ' + unit;
}

export default function SpeedGraph({ download, upload, packetLoss, dark = true, unit = 'Mbps' }: SpeedGraphProps) {
  const allValues = [...download, ...upload];
  const ceiling = allValues.length > 0 ? pickCeiling(allValues) : 1000;
  const markCount = 5;
  const marks = Array.from({ length: markCount }, (_, i) =>
    (ceiling / (markCount - 1)) * (markCount - 1 - i),
  );
  const gridOpacity = dark ? '0.08' : '0.12';
  const markOpacity = dark ? '0.2' : '0.3';
  const labelColor = dark ? 'text-white/20' : 'text-gray-400';
  const dlColor = dark ? '#00e5ff' : '#000000';
  const ulColor = dark ? '#00e676' : '#9ca3af';
  const plColor = '#eab308';
  const dlPath = pathFor(download, ceiling);
  const ulPath = pathFor(upload, ceiling);
  const plY = HEIGHT - Math.min(packetLoss / 100, 1) * HEIGHT;
  return (
    <div className="relative h-full w-full flex items-stretch">
      <div className={`flex flex-col justify-between py-1 pr-2 text-[9px] font-medium tabular-nums tracking-tight ${labelColor} pointer-events-none select-none`}>
        {marks.map(m => <span key={m}>{fmtLabel(m, unit)}</span>)}
      </div>
      <div className="flex-1 relative min-w-0">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" className="h-full w-full">
          {marks.filter(m => m > 0).map(m => {
            const y = HEIGHT - (m / ceiling) * HEIGHT;
            return <line key={m} x1="0" x2={WIDTH} y1={y} y2={y} stroke="currentColor" strokeOpacity={markOpacity} strokeWidth="1" strokeDasharray="3 3" />;
          })}
          <line x1="0" x2={WIDTH} y1={HEIGHT} y2={HEIGHT} stroke="currentColor" strokeOpacity={gridOpacity} strokeWidth="1" />
          {download.length > 1 && <path d={dlPath} fill="none" stroke={dlColor} strokeOpacity="1" strokeWidth="2.25" vectorEffect="non-scaling-stroke" style={{ transition: 'd 0.3s ease' }} />}
          {upload.length > 1 && <path d={ulPath} fill="none" stroke={ulColor} strokeOpacity="1" strokeWidth="2.25" vectorEffect="non-scaling-stroke" style={{ transition: 'd 0.3s ease' }} />}
          <line x1="0" x2={WIDTH} y1={plY} y2={plY} stroke={plColor} strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className={`absolute top-1.5 right-2 flex items-center gap-2.5 pointer-events-none ${dark ? 'text-white/40' : 'text-gray-500'}`}>
          <span className="flex items-center gap-1 text-[10px] font-medium tracking-wide">
            <span className="w-2.5 h-[2.5px] rounded-sm" style={{ backgroundColor: dlColor }} />
            Download
          </span>
          <span className="flex items-center gap-1 text-[10px] font-medium tracking-wide">
            <span className="w-2.5 h-[2.5px] rounded-sm" style={{ backgroundColor: ulColor }} />
            Upload
          </span>
          <span className="flex items-center gap-1 text-[10px] font-medium tracking-wide">
            <span className="w-2.5 h-[2.5px] rounded-sm" style={{ backgroundColor: plColor }} />
            Loss {packetLoss.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
