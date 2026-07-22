export const CDNS = {
  nperf: {
    id: 'nperf',
    name: 'nPerf',
    host: 'localhost',
    description: 'Local nPerf-style measurement backend',
    pingUrl: '/api/ping',
    downloadUrl: (bytes = 8 * 1024 * 1024) => `/api/download?bytes=${bytes}`,
  },
};

export const DEFAULT_CDN_ID = 'nperf';

export function getCdn(id) {
  return CDNS[id] ?? CDNS[DEFAULT_CDN_ID];
}

export function validateCdnId(id) {
  return typeof id === 'string' && Object.hasOwn(CDNS, id) ? id : DEFAULT_CDN_ID;
}

export function parseTestOptions(query = {}) {
  const number = (value, fallback, min, max) => {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
  };

  return {
    cdnId: validateCdnId(query.cdn),
    duration: number(query.duration, 8000, 3000, 30000),
    streams: number(query.streams, 16, 1, 64),
  };
}
