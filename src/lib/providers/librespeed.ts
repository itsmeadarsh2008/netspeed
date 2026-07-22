import type { SpeedtestProvider, ProviderServer, SpeedtestUpdate, SpeedtestResult, TestPhase, SpeedtestSettings } from './types';

interface LibreSpeedServer {
  name: string;
  server: string;
  sponsor?: string;
  country?: string;
  cc?: string;
  lat?: number;
  lon?: number;
}

const SERVER_LIST_URL = 'https://librespeed.org/backend-servers/servers.php';

async function xhrGet(url: string, signal: AbortSignal, onProgress?: (n: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'arraybuffer';
    let prev = 0;
    xhr.onprogress = (e) => {
      if (onProgress && e.loaded > prev) {
        onProgress(e.loaded - prev);
        prev = e.loaded;
      }
    };
    xhr.onload = () => { onProgress?.(xhr.response.byteLength - prev); resolve(); };
    xhr.onerror = () => reject(new Error('xhr error'));
    xhr.onabort = () => reject(new Error('aborted'));
    xhr.open('GET', url);
    xhr.send();
    const onAbort = () => { xhr.abort(); };
    signal.addEventListener('abort', onAbort, { once: true });
    xhr.onloadend = () => signal.removeEventListener('abort', onAbort);
  });
}

async function xhrPost(url: string, body: Blob, signal: AbortSignal, onProgress?: (n: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let prev = 0;
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.loaded > prev) {
        onProgress(e.loaded - prev);
        prev = e.loaded;
      }
    };
    xhr.onload = () => resolve();
    xhr.onerror = () => reject(new Error('xhr error'));
    xhr.onabort = () => reject(new Error('aborted'));
    xhr.open('POST', url);
    xhr.send(body);
    const onAbort = () => { xhr.abort(); };
    signal.addEventListener('abort', onAbort, { once: true });
    xhr.onloadend = () => signal.removeEventListener('abort', onAbort);
  });
}

export const librespeedProvider: SpeedtestProvider = {
  id: 'librespeed',
  name: 'LibreSpeed',
  shortName: 'LibreSpeed',
  description: 'Tests against the global LibreSpeed network (self-hosted speed test instances)',

  async discoverServers(): Promise<ProviderServer[]> {
    const cached = sessionStorage.getItem('librespeed-servers');
    if (cached) {
      try { return JSON.parse(cached); } catch {}
    }
    try {
      const resp = await fetch(SERVER_LIST_URL, { signal: AbortSignal.timeout(10000) });
      const list: LibreSpeedServer[] = await resp.json();
      const servers = list.map((s, i) => ({
        id: `librespeed-${i}`,
        name: s.sponsor ? `${s.name} (${s.sponsor})` : s.name,
        host: s.server.replace(/\/+$/, ''),
        sponsor: s.sponsor || 'LibreSpeed',
        country: s.country || s.cc,
        lat: s.lat,
        lon: s.lon,
        provider: 'librespeed' as const,
      }));
      sessionStorage.setItem('librespeed-servers', JSON.stringify(servers));
      return servers;
    } catch {
      return [];
    }
  },

  async runTest(
    server: ProviderServer,
    onUpdate: (u: SpeedtestUpdate) => void,
    signal: AbortSignal,
    settings?: SpeedtestSettings,
  ): Promise<SpeedtestResult> {
    const base = server.host;
    const DL_STREAMS = settings?.dlStreams ?? 3;
    const UL_STREAMS = settings?.ulStreams ?? 3;
    const DL_DURATION = settings?.dlDuration ?? 10000;
    const UL_DURATION = settings?.ulDuration ?? 10000;
    const PING_SAMPLES = settings?.pingSamples ?? 6;
    const CK_SIZE = 100;

    const dlSamples: number[] = [];
    const ulSamples: number[] = [];

    const rand = () => Math.random().toString(36).slice(2);

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

    // --- Ping ---
    const pings: number[] = [];
    let pingFailures = 0;
    for (let i = 0; i < PING_SAMPLES; i++) {
      if (signal.aborted) return { download: 0, upload: 0, ping: 0, jitter: 0, packetLoss: 0, loadedLatency: 0 };
      const start = performance.now();
      try {
        await xhrGet(`${base}/empty.php?cors=true&r=${rand()}`, AbortSignal.timeout(3000));
        pings.push(performance.now() - start);
      } catch {
        pingFailures++;
      }
    }
    const sorted = [...pings].sort((a, b) => a - b);
    const ping = sorted[0] || 0;
    let jitter = 0;
    if (pings.length > 1) {
      let sum = 0;
      for (let i = 1; i < pings.length; i++) sum += Math.abs(pings[i] - pings[i - 1]);
      jitter = sum / (pings.length - 1);
    }
    const packetLoss = PING_SAMPLES > 0 ? (pingFailures / PING_SAMPLES) * 100 : 0;
    emit('ping', { ping, jitter, packetLoss, pingProgress: 1, serverName: server.name });
    if (signal.aborted) return { download: 0, upload: 0, ping, jitter, packetLoss, loadedLatency: 0 };

    // --- Download ---
    let dlBytes = 0;
    const dlStart = performance.now();
    {
      const streamSignal = new AbortController();
      const onBytes = (n: number) => { dlBytes += n; };

      const runStream = async () => {
        while (!signal.aborted && !streamSignal.signal.aborted) {
          try {
            await xhrGet(`${base}/garbage.php?cors=true&ckSize=${CK_SIZE}&r=${rand()}`, streamSignal.signal, onBytes);
          } catch {
            if (signal.aborted || streamSignal.signal.aborted) return;
          }
        }
      };
      const streams = Array.from({ length: DL_STREAMS }, () => runStream());

      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (signal.aborted) { streamSignal.abort(); clearInterval(interval); resolve(); return; }
          const elapsed = (performance.now() - dlStart) / 1000;
          const speed = elapsed > 0.1 ? (dlBytes / 1_000_000 * 8) / elapsed : 0;
          dlSamples.push(speed);
          emit('download', { downloadSpeed: speed, dlProgress: Math.min(elapsed / (DL_DURATION / 1000), 1), ping, jitter, packetLoss, serverName: server.name });
          if (elapsed >= DL_DURATION / 1000) { streamSignal.abort(); clearInterval(interval); resolve(); }
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
      const payload = new Blob([new Uint8Array(1_000_000)]);

      const runStream = async () => {
        while (!signal.aborted && !streamSignal.signal.aborted) {
          try {
            await xhrPost(`${base}/empty.php?cors=true&r=${rand()}`, payload, streamSignal.signal, onBytes);
          } catch {
            if (signal.aborted || streamSignal.signal.aborted) return;
          }
        }
      };
      const streams = Array.from({ length: UL_STREAMS }, () => runStream());

      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (signal.aborted) { streamSignal.abort(); clearInterval(interval); resolve(); return; }
          const elapsed = (performance.now() - ulStart) / 1000;
          const speed = elapsed > 0.1 ? (ulBytes / 1_000_000 * 8) / elapsed : 0;
          ulSamples.push(speed);
          emit('upload', { uploadSpeed: speed, ulProgress: Math.min(elapsed / (UL_DURATION / 1000), 1), ping, jitter, packetLoss, serverName: server.name });
          if (elapsed >= UL_DURATION / 1000) { streamSignal.abort(); clearInterval(interval); resolve(); }
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
