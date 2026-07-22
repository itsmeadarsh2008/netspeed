import type { SpeedtestResult } from '../lib/speedtest';
import type { DnsInfo } from '../lib/dns';
import { Shield, Wifi, Zap, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface ReviewProps {
  result: SpeedtestResult;
  dark: boolean;
  dnsInfo: DnsInfo | null;
  sensitiveVisible: boolean;
  onToggleSensitive: () => void;
}

function speedGrade(dl: number): { label: string; color: string; desc: string } {
  if (dl >= 200) return { label: 'Excellent', color: 'text-emerald-400', desc: 'Blazing fast — handles anything you throw at it.' };
  if (dl >= 100) return { label: 'Great', color: 'text-sky-400', desc: 'Very fast — 4K streaming, gaming, large downloads with ease.' };
  if (dl >= 50) return { label: 'Good', color: 'text-blue-400', desc: 'Solid performance — smooth HD/4K streaming, gaming, video calls.' };
  if (dl >= 20) return { label: 'Fair', color: 'text-amber-400', desc: 'Adequate — HD streaming works; gaming may have hiccups.' };
  return { label: 'Poor', color: 'text-red-400', desc: 'Sluggish — streaming may buffer; gaming & video calls may struggle.' };
}

function whatYouCanDo(dl: number): string[] {
  const items: string[] = [];
  if (dl >= 100) items.push('4K/8K streaming on multiple devices');
  if (dl >= 50) items.push('Competitive gaming with minimal lag');
  if (dl >= 25) items.push('Multiple HD video calls (Zoom/Meet)');
  if (dl >= 10) items.push('HD streaming (Netflix, YouTube)');
  if (dl >= 5) items.push('Video calls, music streaming, browsing');
  if (dl < 5) items.push('Basic browsing, email, standard definition video');
  if (dl < 25 && dl >= 5) items.push('Large downloads may take time');
  return items;
}

function bufferbloatGrade(loaded: number, idle: number): { label: string; color: string; pct: number } {
  if (idle <= 0) return { label: 'N/A', color: 'text-gray-400', pct: 0 };
  const pct = ((loaded - idle) / idle) * 100;
  if (pct < 10) return { label: 'A — None', color: 'text-emerald-400', pct };
  if (pct < 30) return { label: 'B — Minor', color: 'text-sky-400', pct };
  if (pct < 60) return { label: 'C — Noticeable', color: 'text-amber-400', pct };
  if (pct < 100) return { label: 'D — Significant', color: 'text-orange-400', pct };
  return { label: 'F — Severe', color: 'text-red-400', pct };
}

function getRecommendations(r: SpeedtestResult, dns: DnsInfo | null): { icon: typeof Info; text: string }[] {
  const recs: { icon: typeof Info; text: string }[] = [];
  if (r.packetLoss > 2) recs.push({ icon: AlertTriangle, text: `High packet loss (${r.packetLoss.toFixed(1)}%). Check WiFi signal strength, replace cables, or contact your ISP.` });
  if (r.jitter > 20) recs.push({ icon: AlertTriangle, text: `High jitter (${r.jitter.toFixed(1)}ms). Try a wired connection, reduce background activity, or switch ISPs if persistent.` });
  if (r.ping > 100) recs.push({ icon: AlertTriangle, text: `High latency (${r.ping.toFixed(0)}ms). Gaming & real-time apps may lag. Consider a wired connection or a plan with lower latency.` });
  if (r.loadedLatency > 0 && r.ping > 0) {
    const bb = ((r.loadedLatency - r.ping) / r.ping) * 100;
    if (bb > 60) recs.push({ icon: Shield, text: 'Significant bufferbloat. Enable QoS/CoDel on your router, reduce buffer sizes, or upgrade to a modern router.' });
  }
  if (dns && dns.provider !== 'Cloudflare' && dns.provider !== 'Google') {
    recs.push({ icon: Zap, text: `Your DNS (${dns.provider}) may be slower. Try Cloudflare (1.1.1.1) or Google (8.8.8.8) for faster lookups.` });
  }
  recs.push({ icon: Wifi, text: 'For best results, use Ethernet (WiFi adds 2-10ms latency & reduces throughput).' });
  recs.push({ icon: CheckCircle, text: 'Restart your router monthly to clear stale connections and ARP tables.' });
  return recs;
}

function maskIp(_ip: string): string {
  return '•••••••••••';
}

export default function SpeedReview({ result, dark, dnsInfo, sensitiveVisible, onToggleSensitive }: ReviewProps) {
  const grade = speedGrade(result.download);
  const activities = whatYouCanDo(result.download);
  const bb = bufferbloatGrade(result.loadedLatency, result.ping);
  const recs = getRecommendations(result, dnsInfo);

  const text = (s: string) => `${dark ? 'text-white/70' : 'text-gray-700'}`;
  const muted = (s: string) => `${dark ? 'text-white/35' : 'text-gray-400'}`;

  const dnsIp = dnsInfo ? (sensitiveVisible ? dnsInfo.ip : maskIp(dnsInfo.ip)) : null;

  return (
    <div className={`mt-4 ${dark ? 'bg-white/[0.012] ring-1 ring-white/[0.03]' : 'bg-white/65 shadow-sm'} rounded-xl p-4 w-full`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-[10px] font-semibold ${muted('')} tracking-[0.15em] uppercase flex items-center gap-1.5`}>
          <Info size={11} /> Speed Review
        </span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs font-bold ${muted('')}`}>Speed</span>
        <span className={`text-xs font-bold ${grade.color}`}>{grade.label}</span>
        <span className={`text-[10px] ${muted('')} leading-tight`}>{grade.desc}</span>
      </div>

      <div className="mb-3">
        <span className={`text-[10px] font-semibold ${muted('')} tracking-widest uppercase block mb-1`}>What This Means</span>
        <ul className={`text-[11px] leading-relaxed ${text('')}`}>
          {activities.map((a, i) => <li key={i} className="list-disc list-inside">{a}</li>)}
        </ul>
      </div>

      {result.loadedLatency > 0 && (
        <div className="mb-3">
          <span className={`text-[10px] font-semibold ${muted('')} tracking-widest uppercase block mb-1`}>Bufferbloat <span className="font-normal normal-case">(latency under load)</span></span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${bb.color}`}>{bb.label}</span>
            <span className={`text-[10px] ${muted('')}`}>
              Idle {result.ping.toFixed(0)}ms → Loaded {result.loadedLatency.toFixed(0)}ms
              {bb.pct > 0 && ` (${bb.pct.toFixed(0)}% increase)`}
            </span>
          </div>
        </div>
      )}

      {dnsInfo && (
        <div className="mb-3">
          <span className={`text-[10px] font-semibold ${muted('')} tracking-widest uppercase block mb-1`}>DNS Resolver</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${text('')}`}>{dnsInfo.provider}</span>
            <span className={`text-[10px] ${muted('')}`}>{dnsIp}</span>
            <button onClick={onToggleSensitive} className={`p-0.5 ${muted('')} hover:${dark ? 'text-white/60' : 'text-gray-600'}`}>
              {sensitiveVisible ? <Shield size={11} /> : <Shield size={11} />}
            </button>
          </div>
        </div>
      )}

      <div>
        <span className={`text-[10px] font-semibold ${muted('')} tracking-widest uppercase block mb-1.5`}>Recommendations</span>
        <div className="flex flex-col gap-1.5">
          {recs.map((r, i) => {
            const Icon = r.icon;
            return (
              <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
                <Icon size={11} className={`shrink-0 mt-0.5 ${muted('')}`} />
                <span className={text('')}>{r.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
