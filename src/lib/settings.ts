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

const STORAGE_KEY = 'netspeed-settings';

export const DEFAULT_SETTINGS: SpeedtestSettings = {
  dlDuration: 10000,
  ulDuration: 10000,
  dlStreams: 3,
  ulStreams: 3,
  dlChunkSize: 2_000_000,
  ulChunkSize: 500_000,
  pingSamples: 6,
  autoSelectServer: true,
};

export function loadSettings(): SpeedtestSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: SpeedtestSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}
