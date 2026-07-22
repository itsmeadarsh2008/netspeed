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
