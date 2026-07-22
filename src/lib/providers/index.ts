import type { SpeedtestProvider, TestPhase, SpeedtestUpdate, SpeedtestResult, SpeedtestSettings } from './types';
export type { TestPhase, SpeedtestUpdate, SpeedtestResult, SpeedtestSettings };
export type { ProviderServer, SpeedtestProvider } from './types';

import { cloudflareProvider } from './cloudflare';
import { ooklaProvider } from './ookla';

export const ALL_PROVIDERS: SpeedtestProvider[] = [
  cloudflareProvider,
  ooklaProvider,
];

export function getProvider(id: string): SpeedtestProvider | undefined {
  return ALL_PROVIDERS.find(p => p.id === id);
}
