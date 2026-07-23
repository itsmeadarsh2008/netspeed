import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@heroui/react';
import { Globe, RefreshCw, Clock, AlertTriangle, Search, Star, Plus, ExternalLink, X, Heart, Activity, Wifi, WifiOff, GaugeIcon, Trash2, Filter, ArrowUpDown, CheckCircle, AlertCircle } from 'lucide-react';

type SiteStatus = 'up' | 'down' | 'unknown';

interface Site {
  id: string;
  name: string;
  url: string;
  status: SiteStatus;
  latency: number | null;
  checkedAt: number | null;
  favorite: boolean;
}

interface OutageEntry {
  site: string;
  url: string;
  up: boolean;
  latency: number;
  timestamp: number;
}

const PRESET_SITES: Omit<Site, 'status' | 'latency' | 'checkedAt' | 'favorite'>[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com' },
  { id: 'github', name: 'GitHub', url: 'https://github.com' },
  { id: 'cloudflare', name: 'Cloudflare', url: 'https://www.cloudflare.com' },
  { id: 'amazon', name: 'Amazon', url: 'https://www.amazon.com' },
  { id: 'reddit', name: 'Reddit', url: 'https://www.reddit.com' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com' },
  { id: 'x', name: 'X (Twitter)', url: 'https://x.com' },
  { id: 'microsoft', name: 'Microsoft', url: 'https://www.microsoft.com' },
  { id: 'apple', name: 'Apple', url: 'https://www.apple.com' },
  { id: 'netflix', name: 'Netflix', url: 'https://www.netflix.com' },
  { id: 'meta', name: 'Meta', url: 'https://www.meta.com' },
  { id: 'openai', name: 'OpenAI', url: 'https://www.openai.com' },
];

const CHECK_TIMEOUT = 10000;
const STORAGE_KEY = 'netspeed-outages-v3';
const FAVORITES_KEY = 'netspeed-dd-favorites';
const CUSTOM_SITES_KEY = 'netspeed-dd-custom';
const MAX_HISTORY = 500;
const MAX_DISPLAY_HISTORY = 120;

function loadHistory(): OutageEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(entries: OutageEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_HISTORY)));
  } catch {}
}

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveFavorites(ids: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

function loadCustomSites(): Omit<Site, 'status' | 'latency' | 'checkedAt' | 'favorite'>[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCustomSites(sites: Omit<Site, 'status' | 'latency' | 'checkedAt' | 'favorite'>[]) {
  localStorage.setItem(CUSTOM_SITES_KEY, JSON.stringify(sites));
}

function fmtTime(ts: number | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function fmtLatency(ms: number | null): string {
  if (ms === null) return '—';
  return `${ms}ms`;
}

function uptimePercent(entries: OutageEntry[], siteName: string): number {
  const siteEntries = entries.filter(e => e.site === siteName);
  if (siteEntries.length === 0) return 100;
  return Math.round((siteEntries.filter(e => e.up).length / siteEntries.length) * 100);
}

async function checkSite(url: string, signal: AbortSignal): Promise<{ up: boolean; latency: number }> {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT);
  signal.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    await fetch(url, { method: 'GET', mode: 'no-cors', signal: controller.signal });
    const latency = performance.now() - start;
    return { up: true, latency: Math.round(latency) };
  } catch {
    const latency = performance.now() - start;
    return { up: false, latency: Math.round(latency) };
  } finally {
    clearTimeout(timer);
  }
}

function PolkaDot({ status, size = 10, animated = false }: { status: SiteStatus; size?: number; animated?: boolean }) {
  const fill = status === 'up' ? '#22c55e' : status === 'down' ? '#ef4444' : '#6b7280';
  const opacity = status === 'unknown' ? 0.25 : 1;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" className={`shrink-0 ${animated && status !== 'unknown' ? 'transition-all duration-300' : ''}`} style={{ opacity }}>
      <circle cx="5" cy="5" r="3.5" fill={fill} />
      <circle cx="5" cy="5" r="5" fill="none" stroke={fill} strokeWidth="0.5" strokeOpacity="0.3" />
      <circle cx="1.5" cy="1.5" r="0.8" fill={fill} fillOpacity="0.15" />
      <circle cx="8.5" cy="8.5" r="0.8" fill={fill} fillOpacity="0.15" />
    </svg>
  );
}

function LatencyBar({ latency, maxLatency = 500 }: { latency: number | null; maxLatency?: number }) {
  if (latency === null) return <div className="w-full h-1 rounded-full bg-gray-200 dark:bg-white/5" />;
  const pct = Math.min((latency / maxLatency) * 100, 100);
  const color = latency < 100 ? '#22c55e' : latency < 300 ? '#3b82f6' : '#eab308';
  return (
    <div className="w-full h-1 rounded-full bg-gray-200 dark:bg-white/5 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

type FilterMode = 'all' | 'up' | 'down';
type SortMode = 'default' | 'latency' | 'name';

export default function DownDetector({ dark }: { dark: boolean }) {
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const [customSites, setCustomSites] = useState<Omit<Site, 'status' | 'latency' | 'checkedAt' | 'favorite'>[]>(loadCustomSites);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sort, setSort] = useState<SortMode>('default');
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  const allSites: Omit<Site, 'status' | 'latency' | 'checkedAt' | 'favorite'>[] = useMemo(() => [
    ...PRESET_SITES,
    ...customSites,
  ], [customSites]);

  const [siteStatuses, setSiteStatuses] = useState<Record<string, { status: SiteStatus; latency: number | null; checkedAt: number | null }>>({});
  const [checking, setChecking] = useState(false);
  const [checkingSingle, setCheckingSingle] = useState<string | null>(null);
  const [history, setHistory] = useState<OutageEntry[]>(loadHistory);
  const [showOutages, setShowOutages] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hasAutoChecked = useRef(false);

  useEffect(() => { saveHistory(history); }, [history]);
  useEffect(() => { saveFavorites(favorites); }, [favorites]);
  useEffect(() => { saveCustomSites(customSites); }, [customSites]);

  useEffect(() => {
    if (hasAutoChecked.current) return;
    hasAutoChecked.current = true;
    const timer = setTimeout(() => checkAll(), 500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  }, []);

  const addCustom = useCallback(() => {
    const name = customName.trim();
    let url = customUrl.trim();
    if (!name || !url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    const id = 'custom-' + Date.now();
    setCustomSites(prev => [...prev, { id, name, url }]);
    setCustomName('');
    setCustomUrl('');
    setShowAddCustom(false);
  }, [customName, customUrl]);

  const removeCustom = useCallback((id: string) => {
    setCustomSites(prev => prev.filter(s => s.id !== id));
    setFavorites(prev => prev.filter(f => f !== id));
  }, []);

  const checkAll = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const results: OutageEntry[] = [];

    for (const site of allSites) {
      if (abortRef.current.signal.aborted) break;
      const { up, latency } = await checkSite(site.url, abortRef.current.signal);
      setSiteStatuses(prev => ({
        ...prev,
        [site.id]: { status: up ? 'up' : 'down', latency, checkedAt: Date.now() },
      }));
      results.push({ site: site.name, url: site.url, up, latency, timestamp: Date.now() });
      if (results.length < allSites.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    setHistory(prev => [...prev, ...results]);
    setChecking(false);
  }, [checking, allSites]);

  const checkOne = useCallback(async (site: Omit<Site, 'status' | 'latency' | 'checkedAt' | 'favorite'>) => {
    setCheckingSingle(site.id);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { up, latency } = await checkSite(site.url, abortRef.current.signal);
    setSiteStatuses(prev => ({
      ...prev,
      [site.id]: { status: up ? 'up' : 'down', latency, checkedAt: Date.now() },
    }));
    setHistory(prev => [...prev, { site: site.name, url: site.url, up, latency, timestamp: Date.now() }]);
    setCheckingSingle(null);
  }, []);

  const mergedSites = useMemo(() => {
    return allSites.map(s => ({
      ...s,
      status: siteStatuses[s.id]?.status ?? 'unknown' as SiteStatus,
      latency: siteStatuses[s.id]?.latency ?? null,
      checkedAt: siteStatuses[s.id]?.checkedAt ?? null,
      favorite: favorites.includes(s.id),
    }));
  }, [allSites, siteStatuses, favorites]);

  const filteredSites = useMemo(() => {
    let result = mergedSites;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(s => s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q));
    }
    if (filter === 'up') result = result.filter(s => s.status === 'up');
    if (filter === 'down') result = result.filter(s => s.status === 'down');
    return result;
  }, [mergedSites, search, filter]);

  const sortedSites = useMemo(() => {
    const arr = [...filteredSites];
    arr.sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      if (a.status === 'down' && b.status !== 'down') return -1;
      if (a.status !== 'down' && b.status === 'down') return 1;
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'latency') {
        const la = a.latency ?? 9999;
        const lb = b.latency ?? 9999;
        return la - lb;
      }
      return 0;
    });
    return arr;
  }, [filteredSites, sort]);

  const recentHistory = history.slice(-MAX_DISPLAY_HISTORY);
  const checkedCount = Object.keys(siteStatuses).length;
  const upCount = Object.values(siteStatuses).filter(s => s.status === 'up').length;
  const downCount = Object.values(siteStatuses).filter(s => s.status === 'down').length;
  const unknownCount = allSites.length - checkedCount;
  const lastChecked = Math.max(...Object.values(siteStatuses).map(s => s.checkedAt ?? 0), 0);
  const overallStatus: SiteStatus = downCount > 0 ? 'down' : checkedCount === allSites.length ? 'up' : 'unknown';

  const hoverBg = dark ? 'hover:bg-white/8' : 'hover:bg-gray-100';
  const border = dark ? 'border-white/[0.04]' : 'border-gray-200';
  const cardBg = dark ? 'bg-white/[0.012] ring-1 ring-white/[0.03]' : 'bg-white/65 shadow-sm';
  const muted = dark ? 'text-white/25' : 'text-gray-400';
  const mutedMore = dark ? 'text-white/60' : 'text-gray-600';

  const statusLabel = overallStatus === 'up' ? 'All systems operational' : downCount > 0 ? `${downCount} site${downCount > 1 ? 's' : ''} down` : 'Checking...';
  const statusColor = overallStatus === 'up' ? 'text-green-500' : overallStatus === 'down' ? 'text-red-500' : 'text-gray-400';

  return (
    <div className="w-full flex flex-col gap-3 sm:gap-4">
      {/* Summary Banner */}
      <Card variant="transparent" className={`overflow-hidden ${cardBg}`}>
        <Card.Content className="p-0">
          <div className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 px-4 sm:px-5 py-4`}>
            <div className="flex items-center gap-3 flex-1">
              <PolkaDot status={overallStatus} size={16} animated />
              <div>
                <div className={`flex items-center gap-2 ${statusColor}`}>
                  <span className={`text-sm font-semibold tracking-tight ${dark ? 'text-white' : 'text-gray-900'}`}>
                    {overallStatus === 'up' ? 'All Operational' : overallStatus === 'down' ? 'Outage Detected' : 'Status Unknown'}
                  </span>
                  {overallStatus === 'up' && <CheckCircle size={14} className="text-green-500" />}
                  {overallStatus === 'down' && <AlertCircle size={14} className="text-red-500" />}
                </div>
                <span className={`text-[10px] ${muted}`}>{statusLabel}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 sm:gap-6 text-xs">
              <div className="flex items-center gap-1.5">
                <Wifi size={12} className="text-green-500" />
                <span className={`tabular-nums font-medium ${dark ? 'text-white/70' : 'text-gray-700'}`}>{upCount}</span>
                <span className={muted}>up</span>
              </div>
              {downCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <WifiOff size={12} className="text-red-500" />
                  <span className={`tabular-nums font-medium text-red-500`}>{downCount}</span>
                  <span className={muted}>down</span>
                </div>
              )}
              {unknownCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <Activity size={12} className={muted} />
                  <span className={`tabular-nums font-medium ${mutedMore}`}>{unknownCount}</span>
                  <span className={muted}>pending</span>
                </div>
              )}
              <div className={`hidden sm:block w-px h-4 ${border}`} />
              <div className="hidden sm:flex items-center gap-1.5">
                <Clock size={12} className={muted} />
                <span className={`tabular-nums ${mutedMore}`}>{lastChecked > 0 ? fmtTime(lastChecked) : 'not checked'}</span>
              </div>
            </div>
            <button
              onClick={checkAll}
              disabled={checking}
              className={`sm:ml-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold tracking-wider transition-colors ${
                checking ? 'opacity-50' : ''
              } ${dark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
            >
              <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
              {checking ? 'Checking...' : 'Check All'}
            </button>
          </div>
          {lastChecked > 0 && (
            <div className={`sm:hidden px-4 pb-3 flex items-center gap-1.5 text-[10px] ${muted}`}>
              <Clock size={10} />
              <span>Last checked {fmtTime(lastChecked)}</span>
            </div>
          )}
        </Card.Content>
      </Card>

      {/* Toolbar */}
      <Card variant="transparent" className={`overflow-hidden ${cardBg}`}>
        <Card.Content className="p-0">
          <div className="px-3 sm:px-4 py-2.5 flex items-center gap-2 flex-wrap">
            <div className={`flex items-center gap-1.5 flex-1 min-w-[160px] px-2.5 py-1.5 rounded-lg text-xs ${dark ? 'bg-white/[0.03] text-white/40 border border-white/[0.06]' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
              <Search size={12} strokeWidth={2.5} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search sites..."
                className="flex-1 bg-transparent outline-none text-xs"
              />
              {search && (
                <button onClick={() => setSearch('')} className={`p-0.5 ${dark ? 'hover:text-white/70' : 'hover:text-gray-600'}`}>
                  <X size={12} />
                </button>
              )}
            </div>

            <div className={`flex items-center gap-1 px-1.5 py-1 rounded-lg ${dark ? 'bg-white/[0.03] border border-white/[0.06]' : 'bg-gray-100 border border-gray-200'}`}>
              {(['all', 'up', 'down'] as FilterMode[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2 py-0.5 text-[10px] font-semibold tracking-wider rounded-md transition-colors ${
                    filter === f
                      ? dark ? 'bg-white/10 text-white' : 'bg-white text-gray-900 shadow-sm'
                      : dark ? 'text-white/30 hover:text-white/60' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'up' ? 'Up' : 'Down'}
                </button>
              ))}
            </div>

            <button
              onClick={() => setSort(s => s === 'default' ? 'name' : s === 'name' ? 'latency' : 'default')}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold tracking-wider transition-colors ${
                sort !== 'default' ? (dark ? 'bg-white/10 text-white' : 'bg-white text-gray-900 shadow-sm') : (dark ? 'text-white/30 hover:text-white/60 hover:bg-white/8' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200')
              }`}
              title={`Sort by: ${sort}`}
            >
              <ArrowUpDown size={11} />
              <span className="hidden sm:inline">{sort === 'default' ? 'Default' : sort === 'name' ? 'Name' : 'Latency'}</span>
            </button>

            <button
              onClick={() => setShowAddCustom(prev => !prev)}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold tracking-wider transition-colors ${dark ? 'text-white/30 hover:text-white/60 hover:bg-white/8' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}
              title="Add custom site"
            >
              <Plus size={11} />
              <span className="hidden sm:inline">Add Site</span>
            </button>

            <button
              onClick={() => setShowOutages(prev => !prev)}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold tracking-wider transition-colors ${showOutages ? (dark ? 'bg-white/10 text-white' : 'bg-white text-gray-900 shadow-sm') : (dark ? 'text-white/30 hover:text-white/60 hover:bg-white/8' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200')}`}
              title={showOutages ? 'Hide outages' : 'Show outages'}
            >
              <Clock size={11} />
              <span className="hidden sm:inline">History</span>
            </button>
          </div>

          {showAddCustom && (
            <div className={`mx-3 sm:mx-4 mb-3 p-2.5 rounded-lg ${dark ? 'bg-white/[0.03] border border-white/[0.06]' : 'bg-gray-50 border border-gray-200'}`}>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="Site name (e.g. My Site)"
                  className={`flex-1 px-2.5 py-1.5 text-xs rounded-lg outline-none ${dark ? 'bg-white/[0.03] text-white/70 border border-white/[0.06] placeholder-white/20' : 'bg-white text-gray-700 border border-gray-200 placeholder-gray-400'}`}
                />
                <input
                  type="text"
                  value={customUrl}
                  onChange={e => setCustomUrl(e.target.value)}
                  placeholder="URL (e.g. example.com)"
                  className={`flex-1 px-2.5 py-1.5 text-xs rounded-lg outline-none ${dark ? 'bg-white/[0.03] text-white/70 border border-white/[0.06] placeholder-white/20' : 'bg-white text-gray-700 border border-gray-200 placeholder-gray-400'}`}
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { setShowAddCustom(false); setCustomName(''); setCustomUrl(''); }}
                    className={`flex-1 sm:flex-none px-2.5 py-1.5 text-[10px] font-semibold rounded-lg transition-colors ${dark ? 'text-white/40 hover:text-white/60' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addCustom}
                    disabled={!customName.trim() || !customUrl.trim()}
                    className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-semibold rounded-lg transition-colors ${!customName.trim() || !customUrl.trim() ? 'opacity-40' : ''} ${dark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
                  >
                    Add Site
                  </button>
                </div>
              </div>
            </div>
          )}
        </Card.Content>
      </Card>

      {/* Sites Grid */}
      {sortedSites.length === 0 ? (
        <Card variant="transparent" className={`overflow-hidden ${cardBg}`}>
          <Card.Content className="p-0">
            <div className="flex flex-col items-center justify-center py-10 px-4">
              <Globe size={32} className={`mb-2 ${muted}`} />
              <span className={`text-xs font-medium ${mutedMore}`}>
                {search ? `No sites matching "${search}"` : 'No sites to check'}
              </span>
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className={`mt-2 text-[10px] font-semibold ${dark ? 'text-white/40 hover:text-white/60' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Clear search
                </button>
              )}
            </div>
          </Card.Content>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
          {sortedSites.map(site => {
            const uptime = uptimePercent(history, site.name);
            const isChecking = checkingSingle === site.id;
            return (
              <div
                key={site.id}
                className={`rounded-xl transition-all duration-200 ${cardBg} ${hoverBg} ${
                  site.status === 'down' ? 'ring-1 ring-red-500/20' : ''
                } ${site.favorite ? 'ring-1 ring-amber-400/15' : ''}`}
              >
                <div className="p-3 sm:p-3.5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button
                        onClick={() => toggleFavorite(site.id)}
                        className={`p-0.5 shrink-0 transition-colors ${site.favorite ? 'text-amber-400' : dark ? 'text-white/15 hover:text-white/30' : 'text-gray-300 hover:text-gray-500'}`}
                        title={site.favorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star size={12} fill={site.favorite ? 'currentColor' : 'none'} />
                      </button>
                      <PolkaDot status={site.status} size={11} animated />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <img src={`https://www.google.com/s2/favicons?domain=${site.url}&sz=16`} alt="" className="w-3.5 h-3.5 shrink-0 rounded" />
                      <span className={`text-xs font-semibold truncate ${dark ? 'text-white/80' : 'text-gray-800'}`}>{site.name}</span>
                          {site.favorite && <Heart size={7} className="text-amber-400 shrink-0" fill="currentColor" />}
                        </div>
                        <span className={`block text-[9px] truncate ${muted}`}>{site.url.replace(/^https?:\/\//, '')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => checkOne(site)}
                        disabled={checking || isChecking}
                        className={`px-2 py-1 text-[9px] font-semibold tracking-wider rounded-md transition-colors ${
                          checking || isChecking ? 'opacity-40' : ''
                        } ${dark ? 'text-white/30 hover:text-white/60 hover:bg-white/8' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}
                      >
                        {isChecking ? (
                          <RefreshCw size={10} className="animate-spin" />
                        ) : site.status === 'unknown' ? (
                          'check'
                        ) : (
                          'recheck'
                        )}
                      </button>
                      {site.id.startsWith('custom-') && (
                        <button
                          onClick={() => removeCustom(site.id)}
                          className={`p-1 ${dark ? 'text-white/15 hover:text-red-400' : 'text-gray-300 hover:text-red-500'}`}
                          title="Remove custom site"
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                      <a href={site.url} target="_blank" rel="noopener noreferrer" className={`p-1 ${dark ? 'text-white/15 hover:text-white/40' : 'text-gray-300 hover:text-gray-500'}`} title={`Open ${site.name}`}>
                        <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[10px]">
                    <div className="flex items-center gap-1">
                      <GaugeIcon size={9} className={muted} />
                      <span className={`tabular-nums font-medium ${site.status === 'up' ? (dark ? 'text-white/60' : 'text-gray-600') : site.status === 'down' ? 'text-red-400' : muted}`}>
                        {site.status === 'unknown' ? '—' : fmtLatency(site.latency)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock size={9} className={muted} />
                      <span className={muted}>{fmtTime(site.checkedAt)}</span>
                    </div>
                    {history.filter(e => e.site === site.name).length > 0 && (
                      <div className="flex items-center gap-1 ml-auto">
                        <Activity size={9} className={muted} />
                        <span className={`tabular-nums ${uptime >= 99 ? 'text-green-500' : uptime >= 90 ? 'text-amber-500' : 'text-blue-500'}`}>
                          {uptime}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-2">
                    <LatencyBar latency={site.latency} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Outage Timeline */}
      {showOutages && (
        <Card variant="transparent" className={`overflow-hidden ${cardBg}`}>
          <Card.Content className="p-0">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2.5">
                <span className={`text-[10px] font-semibold tracking-widest uppercase ${muted}`}>Outage Timeline</span>
                <span className={`text-[10px] ${muted}`}>{recentHistory.length} checks</span>
              </div>
              {recentHistory.length === 0 ? (
                <div className={`text-[10px] ${muted} text-center py-8`}>
                  No check history yet. Run a check to see results.
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-0.5 h-10 sm:h-12 mb-2">
                    {recentHistory.map((entry, i) => (
                      <div
                        key={i}
                        className="flex-1 h-full rounded-sm transition-all relative group"
                        style={{
                          backgroundColor: entry.up
                            ? dark ? 'rgba(34,197,94,0.3)' : 'rgba(34,197,94,0.4)'
                            : dark ? 'rgba(251,191,36,0.35)' : 'rgba(251,191,36,0.45)',
                          minWidth: 2,
                        }}
                        title={`${entry.site}: ${entry.up ? 'UP' : 'LATENCY SPIKE'} (${entry.latency}ms) at ${new Date(entry.timestamp).toLocaleTimeString()}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[8px] tracking-wider uppercase mb-3">
                    <span className={muted}>
                      {recentHistory.length > 0 ? new Date(recentHistory[0].timestamp).toLocaleTimeString() : ''}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        <span className={muted}>Up</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        <span className={muted}>Latency</span>
                      </span>
                    </div>
                    <span className={muted}>now</span>
                  </div>

                  {/* Per-site breakdown */}
                  <div className={`border-t ${border} pt-3 mt-1`}>
                    <span className={`text-[10px] font-semibold tracking-widest uppercase mb-2 block ${muted}`}>Per-Site Uptime</span>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {allSites.map(site => {
                        const siteEntries = history.filter(e => e.site === site.name);
                        if (siteEntries.length === 0) return null;
                        const pct = uptimePercent(history, site.name);
                        const status = siteStatuses[site.id]?.status ?? 'unknown';
                        return (
                          <div key={site.id} className="flex items-center gap-2 text-[10px]">
                    <PolkaDot status={status} size={7} />
                    <img src={`https://www.google.com/s2/favicons?domain=${site.url}&sz=16`} alt="" className="w-3 h-3 shrink-0 rounded" />
                    <span className={`flex-1 truncate ${dark ? 'text-white/60' : 'text-gray-600'}`}>{site.name}</span>
                    <div className="w-24 h-1.5 rounded-full bg-gray-200 dark:bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: pct + '%',
                          backgroundColor: pct >= 99 ? '#22c55e' : pct >= 90 ? '#eab308' : '#3b82f6',
                        }}
                      />
                    </div>
                    {(() => {
                      const cls = pct >= 99 ? 'text-green-500' : pct >= 90 ? 'text-amber-500' : 'text-blue-500';
                      return <span className={'tabular-nums w-8 text-right font-medium ' + cls}>{pct}%</span>;
                    })()}
                    <span className={`tabular-nums w-12 text-right ${muted}`}>{siteEntries.length}</span>
                  </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card.Content>
        </Card>
      )}

      {/* Down Alert */}
      {downCount > 0 && (
        <Card variant="transparent" className={`overflow-hidden ${dark ? 'ring-1 ring-red-500/20' : 'shadow-sm'}`}>
          <Card.Content className="p-0">
            <div className={`flex items-start gap-2.5 px-4 py-3 ${dark ? 'bg-red-500/5' : 'bg-red-50'}`}>
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-500" />
              <div className="flex-1 min-w-0">
                <span className={`text-xs font-semibold ${dark ? 'text-red-400' : 'text-red-700'}`}>
                  {downCount} site{downCount > 1 ? 's' : ''} currently down
                </span>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  {sortedSites.filter(s => s.status === 'down').map(s => (
                    <span key={s.id} className={`text-[10px] ${dark ? 'text-red-300/70' : 'text-red-500'}`}>
                      {s.name} ({fmtLatency(s.latency)})
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={checkAll}
                disabled={checking}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                  checking ? 'opacity-40' : ''
                } ${dark ? 'bg-red-500/10 text-red-300 hover:bg-red-500/20' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
              >
                {checking ? '...' : 'Recheck'}
              </button>
            </div>
          </Card.Content>
        </Card>
      )}
    </div>
  );
}
