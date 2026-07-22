import type { SpeedtestProvider, ProviderServer, SpeedtestUpdate, SpeedtestResult, TestPhase, SpeedtestSettings } from './types';

const BASE = 'https://speed.cloudflare.com';

async function runDownloadStreamCf(onBytes: (n: number) => void, signal: AbortSignal): Promise<void> {
  try {
    const response = await fetch(`${BASE}/__down?bytes=50000000`, { cache: 'no-store', signal });
    if (!response.ok || !response.body) return;
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      onBytes(value.byteLength);
    }
  } catch {
    if (signal.aborted) return;
  }
}

async function runUploadStreamCf(onBytes: (n: number) => void, signal: AbortSignal): Promise<void> {
  try {
    const payload = new Uint8Array(100000);
    const blob = new Blob([payload]);
    const response = await fetch(`${BASE}/__up`, { method: 'POST', cache: 'no-store', body: blob, signal, duplex: 'half' } as RequestInit);
    if (!response.ok) return;
    const total = Number(response.headers.get('x-ms-total') || response.headers.get('content-length') || 100000);
    onBytes(total);
  } catch {
    if (signal.aborted) return;
  }
}

export const cloudflareProvider: SpeedtestProvider = {
  id: 'cloudflare',
  name: 'Cloudflare',
  shortName: 'Cloudflare',
  description: 'Tests against Cloudflare\'s global edge network via HTTP',

  async discoverServers(): Promise<ProviderServer[]> {
    return [{
      id: 'cloudflare-auto',
      name: 'Cloudflare Auto',
      host: 'speed.cloudflare.com',
      sponsor: 'Cloudflare',
      provider: 'cloudflare',
    }];
  },

  async runTest(
    server: ProviderServer,
    onUpdate: (u: SpeedtestUpdate) => void,
    signal: AbortSignal,
    settings?: SpeedtestSettings,
  ): Promise<SpeedtestResult> {
    const DL_STREAMS = settings?.dlStreams ?? 3;
    const UL_STREAMS = settings?.ulStreams ?? 3;
    const DL_DURATION = settings?.dlDuration ?? 10000;
    const UL_DURATION = settings?.ulDuration ?? 10000;
    const PING_SAMPLES = settings?.pingSamples ?? 6;

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

    // --- Latency ---
    const pings: number[] = [];
    let pingFailures = 0;
    for (let i = 0; i < PING_SAMPLES; i++) {
      if (signal.aborted) return { download: 0, upload: 0, ping: 0, jitter: 0, packetLoss: 0, loadedLatency: 0 };
      const start = performance.now();
      try {
        await fetch(`${BASE}/__down?bytes=1`, { signal, cache: 'no-store' });
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
    let loadedLatency = 0;
    let pingTick = 0;
    let dlBytes = 0;
    const dlStart = performance.now();
    {
      const streamSignal = new AbortController();
      const onBytes = (n: number) => { dlBytes += n; };

      const streams = Array.from({ length: DL_STREAMS }, () =>
        runDownloadStreamCf(onBytes, streamSignal.signal).catch(() => {}),
      );

      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (signal.aborted) { streamSignal.abort(); clearInterval(interval); resolve(); return; }
          const elapsed = (performance.now() - dlStart) / 1000;
          const speed = elapsed > 0.1 ? (dlBytes / 1_000_000 * 8) / elapsed : 0;
          dlSamples.push(speed);
          pingTick++;
          if (pingTick % 4 === 0) {
            const pingStart = performance.now();
            fetch(`${BASE}/__down?bytes=1`, { cache: 'no-store', signal: AbortSignal.timeout(2000) })
              .then(() => { loadedLatency = Math.max(loadedLatency, performance.now() - pingStart); })
              .catch(() => {});
          }
          emit('download', { downloadSpeed: speed, dlProgress: Math.min(elapsed / (DL_DURATION / 1000), 1), ping, jitter, packetLoss, serverName: server.name });
          if (elapsed >= DL_DURATION / 1000) { streamSignal.abort(); clearInterval(interval); resolve(); }
        }, 200);
      });
      await Promise.all(streams);
    }

    if (signal.aborted) return { download: dlSamples.length > 0 ? dlSamples[dlSamples.length - 1] : 0, upload: 0, ping, jitter, packetLoss, loadedLatency };

    // --- Upload ---
    let ulBytes = 0;
    const ulStart = performance.now();
    {
      const streamSignal = new AbortController();
      const onBytes = (n: number) => { ulBytes += n; };

      const streams = Array.from({ length: UL_STREAMS }, () =>
        runUploadStreamCf(onBytes, streamSignal.signal).catch(() => {}),
      );

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

    const totalDl = dlSamples.length > 0 ? dlSamples[dlSamples.length - 1] : 0;
    const totalUl = ulSamples.length > 0 ? ulSamples[ulSamples.length - 1] : 0;

    emit('complete', { downloadSpeed: totalDl, uploadSpeed: totalUl, ping, jitter, packetLoss, serverName: server.name });
    return { download: totalDl, upload: totalUl, ping, jitter, packetLoss, loadedLatency };
  },
};
