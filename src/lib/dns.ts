export interface DnsInfo {
  ip: string;
  provider: string;
}

const KNOWN_DNS: Record<string, string> = {
  '1.1.1.1': 'Cloudflare',
  '1.0.0.1': 'Cloudflare',
  '8.8.8.8': 'Google',
  '8.8.4.4': 'Google',
  '208.67.222.222': 'OpenDNS (Cisco)',
  '208.67.220.220': 'OpenDNS (Cisco)',
  '9.9.9.9': 'Quad9',
  '9.9.9.10': 'Quad9',
  '149.112.112.112': 'Quad9',
  '149.112.112.10': 'Quad9',
  '76.76.19.19': 'Control D',
  '76.76.53.53': 'Control D',
  '185.228.168.9': 'CleanBrowsing',
  '185.228.169.9': 'CleanBrowsing',
  '94.140.14.14': 'AdGuard',
  '94.140.15.15': 'AdGuard',
  '4.2.2.1': 'Level3',
  '4.2.2.2': 'Level3',
  '4.2.2.3': 'Level3',
  '4.2.2.4': 'Level3',
  '208.67.222.123': 'OpenDNS FamilyShield',
  '208.67.220.123': 'OpenDNS FamilyShield',
  '64.6.64.6': 'Verisign',
  '64.6.65.6': 'Verisign',
  '77.88.8.8': 'Yandex',
  '77.88.8.1': 'Yandex',
  '8.26.56.26': 'Comodo SecureDNS',
  '8.20.247.20': 'Comodo SecureDNS',
  '84.200.69.80': 'DNS.WATCH',
  '84.200.70.40': 'DNS.WATCH',
  '37.235.1.174': 'FreeDNS',
  '37.235.1.177': 'FreeDNS',
  '91.239.100.100': 'UncensoredDNS',
  '89.233.43.71': 'UncensoredDNS',
  '74.82.42.42': 'Hurricane Electric',
  '195.46.39.39': 'SafeDNS',
  '195.46.39.40': 'SafeDNS',
  '81.218.119.11': 'GreenTeamDNS',
  '209.88.198.133': 'GreenTeamDNS',
  '156.154.70.1': 'Neustar (UltraDNS)',
  '156.154.71.1': 'Neustar (UltraDNS)',
  '45.90.28.0': 'NextDNS',
  '45.90.30.0': 'NextDNS',
  '103.247.36.36': 'CIRA Canadian Shield',
  '103.247.37.37': 'CIRA Canadian Shield',
  '80.80.80.80': 'Freenom World',
  '80.80.81.81': 'Freenom World',
  '216.146.35.35': 'Dyn',
  '216.146.36.36': 'Dyn',
  '38.132.106.139': 'Neustar (UltraDNS)',
  '194.187.251.67': 'CZ.NIC',
};

const CACHE_KEY = 'netspeed-dns';
const CACHE_TTL = 3600000;

export async function fetchDnsInfo(): Promise<DnsInfo | null> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }

    const res = await fetch('https://edns.ip-api.com/json');
    if (!res.ok) return null;
    const data = await res.json();
    const ip: string = data?.dns?.ip;
    if (!ip) return null;

    const provider = KNOWN_DNS[ip] || await resolveDnsOrg(ip) || 'Unknown';

    const info: DnsInfo = { ip, provider };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: info, ts: Date.now() })); } catch {}
    return info;
  } catch {
    return null;
  }
}

async function resolveDnsOrg(ip: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ipinfo.io/${ip}/json`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.org || '').replace(/^AS\d+\s+/, '') || null;
  } catch {
    return null;
  }
}
