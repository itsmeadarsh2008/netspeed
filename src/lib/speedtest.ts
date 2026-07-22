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

export function rankServersByGeo(
  servers: ProviderServer[],
  userLat: number,
  userLon: number,
): ProviderServer[] {
  return [...servers].sort((a, b) => {
    const distA = (a.lat != null && a.lon != null) ? haversineKm(userLat, userLon, a.lat, a.lon) : Infinity;
    const distB = (b.lat != null && b.lon != null) ? haversineKm(userLat, userLon, b.lat, b.lon) : Infinity;
    return distA - distB;
  });
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
