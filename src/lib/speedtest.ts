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
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${host}/ws`);
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) { done = true; ws.close(); reject(new Error('timeout')); }
    }, 1500);
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
    ws.addEventListener('error', () => { if (!done) { clearTimeout(timeout); done = true; reject(new Error('ws error')); } });
  });
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

function rankByGeo(
  servers: ProviderServer[],
  userLat: number,
  userLon: number,
): ProviderServer[] {
  return [...servers].sort((a, b) => {
    const da = (a.lat != null && a.lon != null) ? haversineKm(userLat, userLon, a.lat, a.lon) : Infinity;
    const db = (b.lat != null && b.lon != null) ? haversineKm(userLat, userLon, b.lat, b.lon) : Infinity;
    return da - db;
  });
}

export async function pickBestServer(
  servers: ProviderServer[],
  providerId: string,
): Promise<ProviderServer> {
  if (servers.length <= 1) return servers[0];

  const notFound = servers.find(s => s.lat == null || s.lon == null) !== undefined;
  const manualTest = servers.length <= 5 || notFound;

  let candidates: ProviderServer[];
  if (manualTest) {
    candidates = servers;
  } else {
    try {
      const loc = await getUserLocation();
      candidates = rankByGeo(servers, loc.lat, loc.lon).slice(0, 8);
    } catch {
      candidates = servers.slice(0, 8);
    }
  }

  const results: { server: ProviderServer; latency: number }[] = [];
  const pings = await Promise.allSettled(
    candidates.map(async (s) => {
      const start = performance.now();
      if (providerId === 'ookla') {
        await pingOokla(s.host);
      } else {
        await fetch(`https://${s.host}/__down?bytes=1`, { cache: 'no-store', signal: AbortSignal.timeout(1500) });
      }
      return { server: s, latency: performance.now() - start };
    }),
  );
  for (const r of pings) {
    if (r.status === 'fulfilled') results.push(r.value);
  }

  results.sort((a, b) => a.latency - b.latency);
  return results.length > 0 ? results[0].server : candidates[0];
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
