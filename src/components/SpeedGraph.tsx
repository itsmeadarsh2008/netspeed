import { useEffect, useRef, useState } from 'react';

interface SpeedGraphProps {
  download: number[];
  upload: number[];
  packetLoss: number;
  dark?: boolean;
  unit?: string;
}

const W = 600;
const H = 240;
const PAD = { top: 20, right: 20, bottom: 28, left: 20 };
const GW = W - PAD.left - PAD.right;
const GH = H - PAD.top - PAD.bottom;

function smoothData(values: number[], window: number) {
  if (values.length <= window) return values;
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    let sum = 0;
    for (let j = start; j <= i; j++) sum += values[j];
    result.push(sum / (i - start + 1));
  }
  return result;
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

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpArrays(a: number[], b: number[], t: number) {
  const len = Math.max(a.length, b.length);
  const result: number[] = [];
  for (let i = 0; i < len; i++) {
    const va = i < a.length ? a[i] : 0;
    const vb = i < b.length ? b[i] : 0;
    result.push(lerp(va, vb, t));
  }
  return result;
}

export default function SpeedGraph({ download, upload, packetLoss, dark = true, unit = 'Mbps' }: SpeedGraphProps) {
  const allValues = [...download, ...upload];
  const targetCeiling = allValues.length > 0 ? pickCeiling(allValues) : 1000;

  const [animCeiling, setAnimCeiling] = useState(targetCeiling);
  const [animDownload, setAnimDownload] = useState<number[]>([]);
  const [animUpload, setAnimUpload] = useState<number[]>([]);

  const animRef = useRef({ dl: download, ul: upload, ceiling: targetCeiling });
  const targetRef = useRef({ dl: download, ul: upload, ceiling: targetCeiling });
  const rafRef = useRef<number>(0);

  animRef.current = { dl: animDownload, ul: animUpload, ceiling: animCeiling };
  targetRef.current = { dl: download, ul: upload, ceiling: targetCeiling };

  useEffect(() => {
    let running = true;

    function converged(a: number[], b: number[]) {
      const maxLen = Math.max(a.length, b.length);
      for (let i = 0; i < maxLen; i++) {
        const va = i < a.length ? a[i] : 0;
        const vb = i < b.length ? b[i] : 0;
        if (Math.abs(va - vb) > 1) return false;
      }
      return true;
    }

    function tick() {
      if (!running) return;
      const t = targetRef.current;
      const a = animRef.current;
      const spd = 0.1;
      const nextDl = lerpArrays(a.dl, t.dl, spd);
      const nextUl = lerpArrays(a.ul, t.ul, spd);
      const nextCeiling = lerp(a.ceiling, t.ceiling, spd);
      animRef.current = { dl: nextDl, ul: nextUl, ceiling: nextCeiling };
      setAnimDownload(nextDl);
      setAnimUpload(nextUl);
      setAnimCeiling(nextCeiling);
      if (
        Math.abs(nextCeiling - t.ceiling) > 1 ||
        !converged(nextDl, t.dl) ||
        !converged(nextUl, t.ul)
      ) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [download, upload, targetCeiling]);

  const ceiling = animCeiling;
  const win = 3;
  const sd = smoothData(animDownload, win);
  const su = smoothData(animUpload, win);

  const dlColor = dark ? '#00e5ff' : '#0891b2';
  const ulColor = dark ? '#00e676' : '#16a34a';

  const markCount = 5;
  const marks = Array.from({ length: markCount }, (_, i) =>
    (ceiling / (markCount - 1)) * (markCount - 1 - i),
  );

  function makePath(data: number[], ceiling: number) {
    if (data.length < 2) return '';
    const pts = data.map((v, i) => ({
      x: PAD.left + (i / (data.length - 1)) * GW,
      y: PAD.top + GH - Math.min(v / ceiling, 1) * GH,
    }));
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[Math.min(pts.length - 1, i + 1)];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const t = 0.25;
      const cp1x = p1.x + (p2.x - p0.x) * t;
      const cp1y = p1.y + (p2.y - p0.y) * t;
      const cp2x = p2.x - (p3.x - p1.x) * t;
      const cp2y = p2.y - (p3.y - p1.y) * t;
      d += `C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  function makeArea(data: number[], ceiling: number) {
    const line = makePath(data, ceiling);
    if (!line) return '';
    const lastX = PAD.left + GW;
    const firstX = PAD.left;
    return `${line}L${lastX},${PAD.top + GH}L${firstX},${PAD.top + GH}Z`;
  }

  function lastPos(data: number[], ceiling: number) {
    if (data.length < 2) return null;
    const i = data.length - 1;
    if (data[i] / ceiling < 0.02) return null;
    return {
      x: PAD.left + (i / (data.length - 1)) * GW,
      y: PAD.top + GH - Math.min(data[i] / ceiling, 1) * GH,
    };
  }

  const dlPath = makePath(sd, ceiling);
  const ulPath = makePath(su, ceiling);
  const dlArea = makeArea(sd, ceiling);
  const ulArea = makeArea(su, ceiling);
  const dlTip = lastPos(sd, ceiling);
  const ulTip = lastPos(su, ceiling);

  return (
    <div className="relative h-full w-full flex items-stretch">
      <div className={`flex flex-col justify-between py-2 pr-2 text-[9px] font-medium tabular-nums tracking-tight ${dark ? 'text-white/20' : 'text-gray-400'} pointer-events-none select-none`} style={{ paddingTop: PAD.top + 2, paddingBottom: PAD.bottom + 2 }}>
        {marks.map(m => <span key={m}>{fmtLabel(m, unit)}</span>)}
      </div>
      <div className="flex-1 relative min-w-0">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" className="h-full w-full">
          <defs>
            <linearGradient id="dlFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={dlColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={dlColor} stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="ulFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ulColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={ulColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {dlArea && <path d={dlArea} fill="url(#dlFill)" />}
          {ulArea && <path d={ulArea} fill="url(#ulFill)" />}
          {marks.filter(m => m > 0).map(m => {
            const y = PAD.top + GH - (m / ceiling) * GH;
            return <line key={m} x1={PAD.left} x2={PAD.left + GW} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="3 3" />;
          })}
          {sd.length > 1 && <path d={dlPath} fill="none" stroke={dlColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
          {su.length > 1 && <path d={ulPath} fill="none" stroke={ulColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
          {dlTip && <circle cx={dlTip.x} cy={dlTip.y} r="4.5" fill={dlColor} />}
          {ulTip && <circle cx={ulTip.x} cy={ulTip.y} r="4.5" fill={ulColor} />}
        </svg>
      </div>
    </div>
  );
}
