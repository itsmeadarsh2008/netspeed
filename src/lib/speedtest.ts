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

function connectOokla(host: string, signal?: AbortSignal): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${host}/ws`);
    ws.binaryType = 'arraybuffer';
    let closed = false;
    const timeout = setTimeout(() => {
      if (!closed) { closed = true; ws.close(); reject(new Error('timeout')); }
    }, 5000);
    const cleanup = () => { clearTimeout(timeout); closed = true; };

    if (signal?.aborted) { cleanup(); ws.close(); reject(new Error('aborted')); return; }
    const onAbort = () => { if (!closed) { closed = true; ws.close(); reject(new Error('aborted')); } };
    signal?.addEventListener('abort', onAbort, { once: true });

    ws.addEventListener('open', () => {
      if (closed) { ws.close(); return; }
      ws.send('HI');
    });
    ws.addEventListener('message', function handler(event) {
      if (typeof event.data !== 'string') return;
      if (event.data.startsWith('HELLO')) {
        ws.send('GETIP');
      } else if (event.data.startsWith('YOURIP')) {
        cleanup();
        ws.removeEventListener('message', handler);
        resolve(ws);
      }
    });
    ws.addEventListener('error', () => { if (!closed) { cleanup(); reject(new Error('ws error')); } });
    ws.addEventListener('close', () => { if (!closed) { cleanup(); reject(new Error('ws closed')); } });
  });
}

export async function rankServersByLatency(
  servers: ProviderServer[],
  providerId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ server: ProviderServer; latency: number }[]> {
  const CONCURRENCY = 8;
  const results: { server: ProviderServer; latency: number }[] = [];
  let done = 0;

  for (let i = 0; i < servers.length; i += CONCURRENCY) {
    const batch = servers.slice(i, i + CONCURRENCY);
    const pings = await Promise.allSettled(
      batch.map(async (server) => {
        const start = performance.now();
        if (providerId === 'ookla') {
          const ws = await connectOokla(server.host);
          ws.send(`PING ${Date.now()}_0`);
          await new Promise<string>((resolve, reject) => {
            const t = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 3000);
            ws.addEventListener('message', function mh(e) {
              if (typeof e.data === 'string' && e.data.startsWith('PONG')) {
                clearTimeout(t); ws.removeEventListener('message', mh); resolve(e.data);
              }
            });
            ws.addEventListener('close', () => { clearTimeout(t); reject(new Error('closed')); });
          });
          ws.close();
        } else {
          await fetch(`https://${server.host}/__down?bytes=1`, { cache: 'no-store' });
        }
        return { server, latency: performance.now() - start };
      }),
    );
    for (const r of pings) {
      if (r.status === 'fulfilled') results.push(r.value);
      done++;
      onProgress?.(done, servers.length);
    }
  }

  results.sort((a, b) => a.latency - b.latency);
  return results;
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
