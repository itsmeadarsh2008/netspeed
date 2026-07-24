import type { SpeedtestProvider, ProviderServer, SpeedtestUpdate, SpeedtestResult, TestPhase, SpeedtestSettings } from './types';

interface OoklaServer {
  id?: number;
  name: string;
  host: string;
  sponsor: string;
  country?: string;
  cc?: string;
  lat?: number;
  lon?: number;
}

const EMBEDDED_SERVERS: OoklaServer[] = [
  { id: 99901, name: 'Agartala', host: 'bsnlooklaagt.mywire.org.prod.hosts.ooklaserver.net:8080', sponsor: 'BSNL', country: 'India', cc: 'IN', lat: 23.83, lon: 91.28 },
  { id: 99902, name: 'Ahmedabad', host: 'bsnlooklaahb.mywire.org.prod.hosts.ooklaserver.net:8080', sponsor: 'BSNL', country: 'India', cc: 'IN', lat: 23.02, lon: 72.57 },
  { id: 99903, name: 'Ahmedabad (Jio)', host: 'speedahm1.jioconnect.com:8080', sponsor: 'Jio', country: 'India', cc: 'IN', lat: 23.02, lon: 72.57 },
  { id: 99904, name: 'Mumbai (Jio)', host: 'speedbom1.jioconnect.com:8080', sponsor: 'Jio', country: 'India', cc: 'IN', lat: 19.08, lon: 72.88 },
  { id: 99905, name: 'Bangalore (Jio)', host: 'speedblr1.jioconnect.com:8080', sponsor: 'Jio', country: 'India', cc: 'IN', lat: 12.97, lon: 77.59 },
  { id: 99906, name: 'Chennai (Jio)', host: 'speedmaa1.jioconnect.com:8080', sponsor: 'Jio', country: 'India', cc: 'IN', lat: 13.08, lon: 80.27 },
  { id: 99907, name: 'Mumbai (Airtel)', host: 'speedmum01.mum1.airtel.com:8080', sponsor: 'Airtel', country: 'India', cc: 'IN', lat: 19.08, lon: 72.88 },
  { id: 99908, name: 'Delhi (Airtel)', host: 'speeddel01.del2.airtel.com:8080', sponsor: 'Airtel', country: 'India', cc: 'IN', lat: 28.70, lon: 77.10 },
  { id: 99909, name: 'London (Clouvider)', host: 'lon.speedtest.clouvider.net:8080', sponsor: 'Clouvider', country: 'UK', cc: 'GB', lat: 51.51, lon: -0.13 },
  { id: 99910, name: 'New York (Clouvider)', host: 'nyc.speedtest.clouvider.net:8080', sponsor: 'Clouvider', country: 'US', cc: 'US', lat: 40.71, lon: -74.01 },
  { id: 99911, name: 'New York (Comcast)', host: 'nyc.speedtest.comcast.net:8080', sponsor: 'Comcast', country: 'US', cc: 'US', lat: 40.71, lon: -74.01 },
  { id: 99912, name: 'Miami (Comcast)', host: 'mia.speedtest.comcast.net:8080', sponsor: 'Comcast', country: 'US', cc: 'US', lat: 25.76, lon: -80.19 },
  { id: 99913, name: 'Los Angeles (Comcast)', host: 'lax.speedtest.comcast.net:8080', sponsor: 'Comcast', country: 'US', cc: 'US', lat: 34.05, lon: -118.24 },
  { id: 99914, name: 'Toronto (Rogers)', host: 'speedtest.toronto.rogers.com:8080', sponsor: 'Rogers', country: 'Canada', cc: 'CA', lat: 43.65, lon: -79.38 },
  { id: 99915, name: 'Vancouver (Telus)', host: 'telusspeed01.telus.com:8080', sponsor: 'Telus', country: 'Canada', cc: 'CA', lat: 49.28, lon: -123.12 },
  { id: 99916, name: 'London (BT)', host: 'speedtestlondon.bt.com:8080', sponsor: 'BT', country: 'UK', cc: 'GB', lat: 51.51, lon: -0.13 },
  { id: 99917, name: 'Manchester (BT)', host: 'speedtestmanchester.bt.com:8080', sponsor: 'BT', country: 'UK', cc: 'GB', lat: 53.48, lon: -2.24 },
  { id: 99918, name: 'Frankfurt (Deutsche Telekom)', host: 'speedtest.telekom.de:8080', sponsor: 'Deutsche Telekom', country: 'Germany', cc: 'DE', lat: 50.11, lon: 8.68 },
  { id: 99919, name: 'Amsterdam (KPN)', host: 'speedamsterdam.kpn.com:8080', sponsor: 'KPN', country: 'Netherlands', cc: 'NL', lat: 52.37, lon: 4.90 },
  { id: 99920, name: 'Paris (Orange)', host: 'speedtestparis.orange.com:8080', sponsor: 'Orange', country: 'France', cc: 'FR', lat: 48.86, lon: 2.35 },
  { id: 99921, name: 'Singapore (Singtel)', host: 'speedtest.singtel.com:8080', sponsor: 'Singtel', country: 'Singapore', cc: 'SG', lat: 1.35, lon: 103.82 },
  { id: 99922, name: 'Sydney (Telstra)', host: 'speedtestsyd.telstra.com:8080', sponsor: 'Telstra', country: 'Australia', cc: 'AU', lat: -33.87, lon: 151.21 },
  { id: 99923, name: 'Melbourne (Optus)', host: 'speedtestoptusmel.optus.com:8080', sponsor: 'Optus', country: 'Australia', cc: 'AU', lat: -37.81, lon: 144.96 },
  { id: 99924, name: 'Tokyo (SoftBank)', host: 'tokyo.speedtest.softbank.jp:8080', sponsor: 'SoftBank', country: 'Japan', cc: 'JP', lat: 35.68, lon: 139.69 },
  { id: 99925, name: 'Seoul (SK Broadband)', host: 'speedtest.skbroadband.com:8080', sponsor: 'SK Broadband', country: 'South Korea', cc: 'KR', lat: 37.57, lon: 126.98 },
  { id: 99926, name: 'São Paulo (Vivo)', host: 'speedtest.vivo.com.br:8080', sponsor: 'Vivo', country: 'Brazil', cc: 'BR', lat: -23.55, lon: -46.63 },
  { id: 99927, name: 'Dubai (du)', host: 'speedtest.du.ae:8080', sponsor: 'du', country: 'UAE', cc: 'AE', lat: 25.20, lon: 55.27 },
  { id: 99928, name: 'Johannesburg (MTN)', host: 'speedtest.mtn.co.za:8080', sponsor: 'MTN', country: 'South Africa', cc: 'ZA', lat: -26.20, lon: 28.04 },
  { id: 99929, name: 'Moscow (Rostelecom)', host: 'speedtest.rostelecom.ru:8080', sponsor: 'Rostelecom', country: 'Russia', cc: 'RU', lat: 55.75, lon: 37.62 },
  { id: 99930, name: 'Jakarta (Telkomsel)', host: 'speedtest.telkomsel.co.id:8080', sponsor: 'Telkomsel', country: 'Indonesia', cc: 'ID', lat: -6.21, lon: 106.85 },
];

const GITHUB_RAW = 'https://raw.githubusercontent.com/crazyuploader/Speedtest-Servers/main/data';
const ISP_SLUGS = [
  '3bb', 'act-fibernet', 'airtel', 'ais', 'alliance-broadband-services-pvt-ltd', 'allo',
  'asianet-broadband', 'aussie-broadband', 'balifiber', 'bell-canada',
  'bharat-sanchar-nigam-ltd', 'bharti-airtel', 'biznet', 'bt', 'cbn', 'celcom',
  'cellcard', 'citranet', 'claro', 'cmc-telecom', 'comcast', 'converge-ict',
  'deutsche-telekom', 'digi', 'dito', 'eastern-communications', 'entel', 'excitel',
  'fareastone', 'fdcservers.net', 'firstmedia', 'fpt-telecom', 'globalxtreme',
  'globe-telecom', 'gmedia', 'gtpl-broadband-pvt-ltd', 'hathway', 'hypernet',
  'indosat', 'ishan-netsol', 'izzi', 'jio', 'keralavision-broadband-ltd', 'kpn',
  'lao-telecom', 'lintasarta', 'm1', 'matrix-nap', 'maxis', 'meo', 'metfone',
  'mobily', 'mora-telematika', 'movistar', 'mtn', 'myrepublic', 'nos', 'nusanet',
  'onebroadband', 'ooredoo', 'optus', 'orange-romania', 'orange', 'pldt',
  'powergrid-corporation-of-india-ltd', 'proximus', 'radius-telecoms',
  'railtel-corporation-of-india-ltd', 'rogers', 'sctv', 'seatel', 'sfr',
  'shyam-spectra', 'simba', 'sinet', 'singtel', 'siti-broadband', 'sky-fiber',
  'smart-axiata', 'smartfren', 'spark', 'sptel', 'stc', 'taiwan-mobile',
  'tata-communications', 'tata-play-fiber', 'tata-teleservices-ltd',
  'telekom-malaysia', 'telkomsel', 'telstra', 'telus', 'tigo', 'time',
  'truemove-h', 'turkcell', 'u-mobile', 'unified-national-networks', 'unitel',
  'vi-india', 'viettel', 'viewqwest', 'vnpt', 'vodacom', 'vodafone', 'yes-5g',
  'you-broadband-india', 'ytl-broadband',
];

const BATCH_SIZE = 50;

const CACHE_KEY = 'netspeed-ookla-servers';
const CACHE_TTL = 604800000; // 7 days

function getCachedServers(): OoklaServer[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function setCachedServers(servers: OoklaServer[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: servers, ts: Date.now() }));
  } catch {}
}

function parseServer(s: any, slug: string): OoklaServer | null {
  const key = s.host || s.url;
  if (!key) return null;
  return {
    id: s.id,
    name: s.name || 'Unknown',
    host: s.host || s.url?.replace(/^https?:\/\//, '').replace(/\/speedtest\/?$/, ''),
    sponsor: s.sponsor || slug,
    country: s.country,
    cc: s.cc,
    lat: s.lat,
    lon: s.lon,
  };
}

async function fetchBatch(slugs: string[]): Promise<OoklaServer[]> {
  const results = await Promise.allSettled(
    slugs.map(slug =>
      fetch(`${GITHUB_RAW}/${slug}/servers.json`).then(res => {
        if (!res.ok) return [];
        return res.json().then(data => (data.servers || []).map((s: any) => parseServer(s, slug)).filter(Boolean));
      })
    )
  );
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

async function fetchFromGitHub(): Promise<OoklaServer[]> {
  const all: OoklaServer[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < ISP_SLUGS.length; i += BATCH_SIZE) {
    const batch = ISP_SLUGS.slice(i, i + BATCH_SIZE);
    const servers = await fetchBatch(batch);
    for (const s of servers) {
      if (s && s.host && !seen.has(s.host)) {
        seen.add(s.host);
        all.push(s);
      }
    }
  }
  return all;
}

async function discoverServers(): Promise<OoklaServer[]> {
  const cached = getCachedServers();
  if (cached && cached.length > 0) return cached;

  fetchFromGitHub().then(fetched => {
    if (fetched && fetched.length > 0) {
      setCachedServers(fetched);
    }
  }).catch(() => {});

  return EMBEDDED_SERVERS;
}

function connectOokla(host: string, secure?: boolean, signal?: AbortSignal): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const scheme = secure ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${host}/ws`);
    ws.binaryType = 'arraybuffer';
    let closed = false;
    const timeout = setTimeout(() => {
      if (!closed) { closed = true; ws.close(); reject(new Error('connect timeout')); }
    }, 3000);
    const cleanup = () => { clearTimeout(timeout); closed = true; };

    const onAbort = () => {
      if (!closed) { closed = true; ws.close(); reject(new Error('aborted')); }
    };
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
        signal?.removeEventListener('abort', onAbort);
        ws.removeEventListener('message', handler);
        resolve(ws);
      }
    });
    ws.addEventListener('error', () => { if (!closed) { cleanup(); signal?.removeEventListener('abort', onAbort); reject(new Error('ws error')); } });
    ws.addEventListener('close', () => { if (!closed) { cleanup(); signal?.removeEventListener('abort', onAbort); reject(new Error('ws closed')); } });
  });
}

async function connectOoklaWithFallback(host: string, signal?: AbortSignal): Promise<WebSocket> {
  try {
    return await connectOokla(host, true, signal);
  } catch {
    return await connectOokla(host, false, signal);
  }
}

function onWsMsg<T>(ws: WebSocket, predicate: (e: MessageEvent) => T | null, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err?: Error, val?: T) => {
      if (done) return;
      done = true;
      ws.removeEventListener('message', onMsg);
      ws.removeEventListener('close', onClose);
      ws.removeEventListener('error', onClose);
      sigCleanup?.();
      if (err) reject(err);
      else resolve(val!);
    };
    const onMsg = (event: MessageEvent) => {
      const result = predicate(event);
      if (result !== null) finish(undefined, result);
    };
    const onClose = () => finish(new Error('ws disconnected'));
    ws.addEventListener('message', onMsg);
    ws.addEventListener('close', onClose);
    ws.addEventListener('error', onClose);
    let sigCleanup: (() => void) | undefined;
    if (signal) {
      const onAbort = () => finish(new Error('aborted'));
      signal.addEventListener('abort', onAbort, { once: true });
      sigCleanup = () => signal.removeEventListener('abort', onAbort);
    }
  });
}

function waitForText(ws: WebSocket, signal?: AbortSignal): Promise<string> {
  return onWsMsg(ws, (e) => typeof e.data === 'string' ? e.data as string : null, signal);
}

function waitForBinary(ws: WebSocket, signal?: AbortSignal): Promise<ArrayBuffer> {
  return onWsMsg(ws, (e) => typeof e.data !== 'string' ? e.data as ArrayBuffer : null, signal);
}

async function safeClose(ws: WebSocket) {
  try { ws.close(); } catch {}
}

function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

async function testServerLatency(host: string, samples: number): Promise<{ latency: number; jitter: number; packetLoss: number } | null> {
  let ws: WebSocket | null = null;
  try {
    ws = await connectOoklaWithFallback(host, AbortSignal.timeout(5000));
    const pings: number[] = [];
    let failures = 0;
    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      ws.send(`PING ${Date.now()}_${i}`);
      try { await waitForText(ws, timeoutSignal(4000)); pings.push(performance.now() - start); }
      catch { failures++; }
    }
    safeClose(ws);
    ws = null;
    if (pings.length === 0) return null;
    const sorted = [...pings].sort((a, b) => a - b);
    const latency = sorted[0];
    let jitter = 0;
    if (pings.length > 1) {
      let sum = 0;
      for (let i = 1; i < pings.length; i++) sum += Math.abs(pings[i] - pings[i - 1]);
      jitter = sum / (pings.length - 1);
    }
    const packetLoss = samples > 0 ? (failures / samples) * 100 : 0;
    return { latency, jitter, packetLoss };
  } catch {
    if (ws) safeClose(ws);
    return null;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function runDownloadStream(host: string, onBytes: (n: number) => void, signal: AbortSignal, chunkSize = 2_000_000): Promise<void> {
  let ws: WebSocket | null = null;
  try {
    ws = await connectOoklaWithFallback(host, AbortSignal.timeout(5000));
    while (!signal.aborted) {
      ws.send(`DOWNLOAD ${chunkSize}`);
      let received = 0;
      while (received < chunkSize) {
        if (signal.aborted) return;
        const timeout = AbortSignal.timeout(10000);
        const combined = AbortSignal.any([signal, timeout]);
        const data = await waitForBinary(ws, combined);
        onBytes(data.byteLength);
        received += data.byteLength;
      }
    }
  } catch {
    if (signal.aborted) return;
  } finally {
    if (ws) safeClose(ws);
  }
}

async function runUploadStream(host: string, onBytes: (n: number) => void, signal: AbortSignal, chunkSize = 500_000): Promise<void> {
  let ws: WebSocket | null = null;
  try {
    ws = await connectOoklaWithFallback(host, AbortSignal.timeout(5000));
    const payload = new ArrayBuffer(chunkSize);
    while (!signal.aborted) {
      ws.send(`UPLOAD ${chunkSize}`);
      ws.send(payload);
      onBytes(chunkSize);
      const timeout = AbortSignal.timeout(10000);
      const combined = AbortSignal.any([signal, timeout]);
      await waitForText(ws, combined);
    }
  } catch {
    if (signal.aborted) return;
  } finally {
    if (ws) safeClose(ws);
  }
}

export const ooklaProvider: SpeedtestProvider = {
  id: 'ookla',
  name: 'Speedtest.net (Ookla)',
  shortName: 'Ookla',
  description: 'Tests against ISP-hosted Speedtest.net servers (BSNL, Jio, Airtel, etc.)',

  async discoverServers(): Promise<ProviderServer[]> {
    const servers = await discoverServers();
    return servers.map(s => ({
      id: String(s.id || s.host),
      name: s.sponsor ? `${s.name} (${s.sponsor})` : s.name,
      host: s.host,
      sponsor: s.sponsor,
      country: s.country,
      cc: s.cc,
      lat: s.lat,
      lon: s.lon,
      provider: 'ookla',
    }));
  },

  async runTest(
    server: ProviderServer,
    onUpdate: (u: SpeedtestUpdate) => void,
    signal: AbortSignal,
    settings?: SpeedtestSettings,
  ): Promise<SpeedtestResult> {
    const host = server.host;
    const dlStreams = settings?.dlStreams ?? 3;
    const ulStreams = settings?.ulStreams ?? 3;
    const dlDuration = settings?.dlDuration ?? 10000;
    const ulDuration = settings?.ulDuration ?? 10000;
    const dlChunk = settings?.dlChunkSize ?? 2_000_000;
    const ulChunk = settings?.ulChunkSize ?? 500_000;
    const pingSamples = settings?.pingSamples ?? 6;

    const dlSamples: number[] = [];
    const ulSamples: number[] = [];

    const emit = (phase: TestPhase, data: Partial<SpeedtestUpdate>) => {
      if (signal.aborted) return;
      onUpdate({
        phase,
        downloadSpeed: data.downloadSpeed ?? 0,
        uploadSpeed: data.uploadSpeed ?? 0,
        ping: data.ping ?? 0,
        jitter: data.jitter ?? 0,
        packetLoss: data.packetLoss ?? 0,
        dlProgress: data.dlProgress ?? 0,
        ulProgress: data.ulProgress ?? 0,
        pingProgress: data.pingProgress ?? 0,
        downloadSamples: dlSamples,
        uploadSamples: ulSamples,
        serverName: data.serverName ?? server.name,
      });
    };

    const pingRes = await testServerLatency(host, pingSamples);
    const ping = pingRes?.latency ?? 0;
    const jitter = pingRes?.jitter ?? 0;
    const packetLoss = pingRes?.packetLoss ?? 0;
    emit('ping', { ping, jitter, packetLoss, pingProgress: 1, serverName: server.name });
    if (signal.aborted) return { download: 0, upload: 0, ping, jitter, packetLoss, loadedLatency: 0 };

    // --- Download ---
    let dlBytes = 0;
    const dlStart = performance.now();
    {
      const streamSignal = new AbortController();
      const onBytes = (n: number) => { dlBytes += n; };
      const streams = Array.from({ length: dlStreams }, () =>
        runDownloadStream(host, onBytes, streamSignal.signal, dlChunk).catch(() => {}),
      );

      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (signal.aborted) { streamSignal.abort(); clearInterval(interval); resolve(); return; }
          const elapsed = (performance.now() - dlStart) / 1000;
          const speed = elapsed > 0.1 ? (dlBytes / 1_000_000 * 8) / elapsed : 0;
          dlSamples.push(speed);
          emit('download', { downloadSpeed: speed, dlProgress: Math.min(elapsed / (dlDuration / 1000), 1), ping, jitter, packetLoss, serverName: server.name });
          if (elapsed >= dlDuration / 1000) { streamSignal.abort(); clearInterval(interval); resolve(); }
        }, 200);
      });
      await Promise.all(streams);
    }

    if (signal.aborted) return { download: dlSamples.length > 0 ? dlSamples[dlSamples.length - 1] : 0, upload: 0, ping, jitter, packetLoss, loadedLatency: 0 };

    // --- Upload ---
    let ulBytes = 0;
    const ulStart = performance.now();
    {
      const streamSignal = new AbortController();
      const onBytes = (n: number) => { ulBytes += n; };
      const streams = Array.from({ length: ulStreams }, () =>
        runUploadStream(host, onBytes, streamSignal.signal, ulChunk).catch(() => {}),
      );

      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (signal.aborted) { streamSignal.abort(); clearInterval(interval); resolve(); return; }
          const elapsed = (performance.now() - ulStart) / 1000;
          const speed = elapsed > 0.1 ? (ulBytes / 1_000_000 * 8) / elapsed : 0;
          ulSamples.push(speed);
          emit('upload', { uploadSpeed: speed, ulProgress: Math.min(elapsed / (ulDuration / 1000), 1), ping, jitter, packetLoss, serverName: server.name });
          if (elapsed >= ulDuration / 1000) { streamSignal.abort(); clearInterval(interval); resolve(); }
        }, 200);
      });
      await Promise.all(streams);
    }

    const finalDl = dlSamples.length > 0 ? dlSamples[dlSamples.length - 1] : 0;
    const finalUl = ulSamples.length > 0 ? ulSamples[ulSamples.length - 1] : 0;

    emit('complete', { downloadSpeed: finalDl, uploadSpeed: finalUl, ping, jitter, packetLoss, serverName: server.name });
    return { download: finalDl, upload: finalUl, ping, jitter, packetLoss, loadedLatency: 0 };
  },
};
