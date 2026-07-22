export interface CdnConfig {
  id: string;
  name: string;
  host: string;
  description: string;
  pingUrl: string;
  downloadUrl(bytes?: number): string;
}

export const CDNS: Record<string, CdnConfig>;
export const DEFAULT_CDN_ID: string;
export function getCdn(id?: string): CdnConfig;
export function validateCdnId(id?: string): string;
export function parseTestOptions(query?: Record<string, unknown>): { cdnId: string; duration: number; streams: number };
