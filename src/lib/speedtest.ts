import { getProvider, ALL_PROVIDERS } from './providers';
import type { ProviderServer, SpeedtestUpdate, SpeedtestResult, TestPhase, SpeedtestSettings } from './providers';
export type { TestPhase, SpeedtestUpdate, SpeedtestResult, SpeedtestSettings };
export type { ProviderServer } from './providers';

let abortFlag = false;
let currentTest: { providerId: string; signal: AbortController } | null = null;

export function getProviders() {
  return ALL_PROVIDERS;
}

export async function getServersForProvider(providerId: string): Promise<ProviderServer[]> {
  const provider = getProvider(providerId);
  if (!provider) return [];
  try {
    return await provider.discoverServers();
  } catch {
    return [];
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pingOokla(host: string): Promise<number> {
  const start = performance.now();
  const attempt = (secure: boolean): Promise<number> => {
    return new Promise((resolve, reject) => {
      const scheme = secure ? 'wss' : 'ws';
      const ws = new WebSocket(`${scheme}://${host}/ws`);
      let done = false;
      const timeout = setTimeout(() => {
        if (!done) { done = true; ws.close(); reject(new Error('timeout')); }
      }, 2000);
      ws.addEventListener('open', () => {
        if (done) return;
        ws.send('HI');
      });
      ws.addEventListener('message', function handler(e) {
        if (typeof e.data !== 'string') return;
        if (e.data.startsWith('HELLO')) ws.send('GETIP');
        else if (e.data.startsWith('YOURIP')) {
          clearTimeout(timeout);
          ws.removeEventListener('message', handler);
          done = true;
          ws.close();
          resolve(performance.now() - start);
        }
      });
      ws.addEventListener('error', () => { if (!done) { clearTimeout(timeout); done = true; ws.close(); reject(new Error('ws error')); } });
    });
  };
  return attempt(true).catch(() => attempt(false));
}

async function getIPLocation(): Promise<{ lat: number; lon: number; country?: string } | null> {
  try {
    const res = await fetch('https://ip-api.com/json/', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 'success') {
      return { lat: data.lat, lon: data.lon, country: data.countryCode };
    }
    return null;
  } catch {
    return null;
  }
}

export function getUserLocation(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => reject(err),
      { timeout: 5000, enableHighAccuracy: false },
    );
  });
}

function getUserCountryFromLocale(): string | null {
  const region = navigator.language?.split('-')[1]?.toUpperCase();
  if (region && region.length === 2) return region;
  for (const lang of navigator.languages ?? []) {
    const r = lang.split('-')[1]?.toUpperCase();
    if (r && r.length === 2) return r;
  }
  return null;
}

export async function pickBestServer(
  servers: ProviderServer[],
  providerId: string,
): Promise<ProviderServer> {
  if (servers.length <= 1) return servers[0];

  let userLoc: { lat: number; lon: number } | null = null;
  let userCountry: string | null = null;

  const ipLoc = await getIPLocation();
  if (ipLoc) {
    userLoc = { lat: ipLoc.lat, lon: ipLoc.lon };
    userCountry = ipLoc.country ?? null;
  }

  if (!userLoc) {
    try { userLoc = await getUserLocation(); } catch {}
  }

  if (!userCountry) {
    userCountry = getUserCountryFromLocale();
  }

  let candidates = servers;
  if (userCountry) {
    const same = servers.filter(s => s.cc?.toUpperCase() === userCountry);
    if (same.length > 0) candidates = same;
  }

  if (userLoc) {
    candidates = [...candidates].sort((a, b) => {
      const da = (a.lat != null && a.lon != null) ? haversineKm(userLoc!.lat, userLoc!.lon, a.lat, a.lon) : Infinity;
      const db = (b.lat != null && b.lon != null) ? haversineKm(userLoc!.lat, userLoc!.lon, b.lat, b.lon) : Infinity;
      return da - db;
    });
  }

  const topN = candidates.slice(0, 3);
  if (topN.length === 1) return topN[0];

  const results = await Promise.allSettled(
    topN.map(async s => {
      const latency = await pingOokla(s.host);
      return { server: s, latency };
    })
  );

  const valid = results
    .filter((r): r is PromiseFulfilledResult<{ server: ProviderServer; latency: number }> => r.status === 'fulfilled')
    .sort((a, b) => a.value.latency - b.value.latency);

  if (valid.length > 0) return valid[0].value.server;
  return candidates[0];
}

export function abortSpeedtest() {
  abortFlag = true;
  if (currentTest) {
    currentTest.signal.abort();
    currentTest = null;
  }
}

export async function startSpeedtest(
  providerId: string,
  server: ProviderServer,
  onUpdate: (u: SpeedtestUpdate) => void,
  onComplete: (r: SpeedtestResult) => void,
  onError: (msg: string) => void,
  settings?: SpeedtestSettings,
) {
  abortFlag = false;
  const provider = getProvider(providerId);
  if (!provider) {
    onError(`Unknown provider: ${providerId}`);
    return;
  }

  const signal = new AbortController();
  currentTest = { providerId, signal };

  try {
    const result = await provider.runTest(server, onUpdate, signal.signal, settings);
    if (!signal.signal.aborted) {
      onComplete(result);
    }
  } catch (err) {
    if (!abortFlag && !signal.signal.aborted) {
      onError(`Test failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  } finally {
    currentTest = null;
  }
}
