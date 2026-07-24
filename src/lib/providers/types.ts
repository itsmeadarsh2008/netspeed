export type TestPhase = 'idle' | 'discovering' | 'ping' | 'download' | 'upload' | 'complete';

export interface SpeedtestUpdate {
  phase: TestPhase;
  downloadSpeed: number;
  uploadSpeed: number;
  ping: number;
  jitter: number;
  packetLoss: number;
  dlProgress: number;
  ulProgress: number;
  pingProgress: number;
  downloadSamples: number[];
  uploadSamples: number[];
  serverName: string;
}

export interface SpeedtestResult {
  download: number;
  upload: number;
  ping: number;
  jitter: number;
  packetLoss: number;
  loadedLatency: number;
}

export interface ProviderServer {
  id: string;
  name: string;
  host: string;
  sponsor: string;
  country?: string;
  cc?: string;
  lat?: number;
  lon?: number;
  provider: string;
}

export interface SpeedtestSettings {
  dlDuration: number;
  ulDuration: number;
  dlStreams: number;
  ulStreams: number;
  dlChunkSize: number;
  ulChunkSize: number;
  pingSamples: number;
  autoSelectServer: boolean;
}

export interface SpeedtestProvider {
  id: string;
  name: string;
  shortName: string;
  description: string;
  discoverServers(): Promise<ProviderServer[]>;
  loadFullServers?(): Promise<ProviderServer[]>;
  runTest(
    server: ProviderServer,
    onUpdate: (u: SpeedtestUpdate) => void,
    signal: AbortSignal,
    settings?: SpeedtestSettings,
  ): Promise<SpeedtestResult>;
}
