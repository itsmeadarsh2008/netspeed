export interface ConnectionInfo {
  ip: string;
  isp: string;
  asn: string;
  city: string;
  region: string;
  country: string;
  loc: string;
  timezone: string;
  browser: string;
  platform: string;
  connectionType: string;
  effectiveType: string;
  rtt: number;
  downlink: number;
}

const CACHE_KEY = 'netspeed-connection';
const CACHE_TTL = 3600000;

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Safari/')) return 'Safari';
  return 'Unknown';
}

function getNetworkInfo() {
  const c = (navigator as any).connection;
  if (!c) return { connectionType: 'Unknown', effectiveType: 'Unknown', rtt: 0, downlink: 0 };
  return {
    connectionType: c.type || 'Unknown',
    effectiveType: c.effectiveType || 'Unknown',
    rtt: c.rtt || 0,
    downlink: c.downlink || 0,
  };
}

export async function fetchConnectionInfo(): Promise<ConnectionInfo> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }

    const res = await fetch('https://ipinfo.io/json');
    const d = res.ok ? await res.json() : {};
    const net = getNetworkInfo();

    const info: ConnectionInfo = {
      ip: d.ip || 'Unknown',
      isp: (d.org || '').replace(/^AS\d+\s+/, '') || 'Unknown',
      asn: (d.org || '').startsWith('AS') ? (d.org || '').split(' ')[0] : '',
      city: d.city || '',
      region: d.region || '',
      country: d.country || '',
      loc: d.loc || '',
      timezone: d.timezone || '',
      browser: detectBrowser(),
      platform: navigator.platform || 'Unknown',
      ...net,
    };

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: info, ts: Date.now() }));
    } catch {}

    return info;
  } catch {
    const net = getNetworkInfo();
    return {
      ip: 'Unknown',
      isp: 'Unknown',
      asn: '',
      city: '', region: '', country: '', loc: '', timezone: '',
      browser: detectBrowser(),
      platform: navigator.platform || 'Unknown',
      ...net,
    };
  }
}
