import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ButtonGroup, Card, Switch, Skeleton } from '@heroui/react';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, Clock, Download, Copy, Eye, EyeOff, Globe, GaugeIcon, Heart, Info, Monitor, Moon, Rocket, Search, Server, Settings, Share2, Sun, WifiOff, Wrench, X } from 'lucide-react';
import { toPng } from 'html-to-image';
import Gauge from './components/Gauge';
import SpeedGraph from './components/SpeedGraph';
import SpeedReview, { SpeedReviewSkeleton } from './components/SpeedReview';
import DownDetector from './components/DownDetector';
import type { TestPhase, SpeedtestUpdate, SpeedtestResult, ProviderServer, SpeedtestSettings } from './lib/speedtest';
import { startSpeedtest, abortSpeedtest, getProviders, getServersForProvider, getFullServersForProvider, pickBestServer, haversineKm, getIPLocation } from './lib/speedtest';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './lib/settings';
import { fetchConnectionInfo, type ConnectionInfo } from './lib/connection';
import { fetchDnsInfo, type DnsInfo } from './lib/dns';

const PROVIDERS = getProviders();

function fmtSpeed(value: number): string {
  if (value < 1) return value.toFixed(1);
  if (value < 10) return value.toFixed(1);
  if (value < 1000) return Math.round(value).toString();
  return (value / 1000).toFixed(1);
}

function fmtSpeedBytes(value: number): string {
  const mbps = value / 8;
  if (mbps < 1) return mbps.toFixed(1);
  if (mbps < 10) return mbps.toFixed(1);
  if (mbps < 1000) return Math.round(mbps).toString();
  return (mbps / 1000).toFixed(1);
}

const row = (label: React.ReactNode, value: string, dark: boolean, color?: string) => (
  <div className="flex items-center justify-between py-2 gap-3">
    <span className={`text-xs ${dark ? 'text-white/35' : 'text-gray-500'} tracking-wider flex items-center gap-1.5 transition-colors duration-200 truncate min-w-0`}>{label}</span>
    <span className={`text-sm font-medium tabular-nums tracking-tight transition-all duration-200 text-right whitespace-nowrap ${color ? color : dark ? 'text-white/70' : 'text-gray-700'}`}>{value}</span>
  </div>
);

const pingColor = (ping: number): string => {
  if (ping <= 0) return 'dark:text-green-400';
  if (ping < 50) return 'dark:text-green-400';
  if (ping < 100) return 'dark:text-lime-400';
  if (ping < 150) return 'dark:text-yellow-400';
  if (ping < 200) return 'dark:text-orange-400';
  return 'dark:text-red-400';
};

const pingLabel = (ping: number): string => {
  if (ping <= 0) return '';
  if (ping < 20) return 'ideal';
  if (ping < 50) return 'excellent';
  if (ping < 100) return 'decent';
  if (ping < 150) return 'moderate';
  if (ping < 200) return 'high';
  return 'very high';
};

const sectionDivider = (dark: boolean) => (
  `my-0.5 border-t ${dark ? 'border-white/[0.04]' : 'border-gray-200'}`
);

interface TestData {
  phase: TestPhase;
  displaySpeed: number;
  downloadSpeed: number;
  uploadSpeed: number;
  ping: number;
  jitter: number;
  packetLoss: number;
  loadedLatency: number;
  dlProgress: number;
  ulProgress: number;
  downloadSamples: number[];
  uploadSamples: number[];
  serverName: string;
  error: string | null;
}

const INITIAL: TestData = {
  phase: 'idle',
  displaySpeed: 0,
  downloadSpeed: 0,
  uploadSpeed: 0,
  ping: 0,
  jitter: 0,
  packetLoss: 0,
  loadedLatency: 0,
  dlProgress: 0,
  ulProgress: 0,
  downloadSamples: [],
  uploadSamples: [],
  serverName: '',
  error: null,
};

function fmtConnType(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function fmtDownlink(mbps: number): string {
  if (mbps <= 0) return 'Unknown';
  return mbps.toFixed(1) + ' Mbps';
}

function maskIp(_ip: string): string {
  return '•••••••••••';
}

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('netspeed-theme') !== 'light');
  const [unitMbps, setUnitMbps] = useState(() => localStorage.getItem('netspeed-unit') !== 'MBs');
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [activeTab, setActiveTab] = useState<'speedtest' | 'downdetector'>('speedtest');
  const [testData, setTestData] = useState<TestData>(INITIAL);
  const [running, setRunning] = useState(false);
  const [settings, setSettings] = useState<SpeedtestSettings>(() => loadSettings());
  const [connInfo, setConnInfo] = useState<ConnectionInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sensitiveVisible, setSensitiveVisible] = useState(false);
  const [dnsInfo, setDnsInfo] = useState<DnsInfo | null>(null);

  const [providerId, setProviderId] = useState('cloudflare');
  const [servers, setServers] = useState<ProviderServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<ProviderServer | null>(null);
  const [serversLoading, setServersLoading] = useState(false);
  const [serverSearch, setServerSearch] = useState('');
  const [serverDropdownOpen, setServerDropdownOpen] = useState(false);
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number; country?: string } | null>(null);

  useEffect(() => {
    getIPLocation().then(setUserLoc);
  }, []);

  const sortedServers = useMemo(() => {
    const copy = [...servers];
    if (userLoc) {
      const userCountry = userLoc.country;
      if (userCountry) {
        const same = copy.filter(s => s.cc?.toUpperCase() === userCountry);
        const other = copy.filter(s => s.cc?.toUpperCase() !== userCountry);
        same.sort((a, b) => {
          if (a.lat == null || a.lon == null) return 1;
          if (b.lat == null || b.lon == null) return -1;
          return haversineKm(userLoc.lat, userLoc.lon, a.lat, a.lon) - haversineKm(userLoc.lat, userLoc.lon, b.lat, b.lon);
        });
        other.sort((a, b) => {
          if (a.lat == null || a.lon == null) return 1;
          if (b.lat == null || b.lon == null) return -1;
          return haversineKm(userLoc.lat, userLoc.lon, a.lat, a.lon) - haversineKm(userLoc.lat, userLoc.lon, b.lat, b.lon);
        });
        return [...same, ...other];
      }
      copy.sort((a, b) => {
        if (a.lat == null || a.lon == null) return 1;
        if (b.lat == null || b.lon == null) return -1;
        return haversineKm(userLoc.lat, userLoc.lon, a.lat, a.lon) - haversineKm(userLoc.lat, userLoc.lon, b.lat, b.lon);
      });
    } else {
      const region = navigator.language?.split('-')[1]?.toUpperCase();
      if (region) {
        copy.sort((a, b) => {
          const aMatch = a.cc?.toUpperCase() === region ? 0 : 1;
          const bMatch = b.cc?.toUpperCase() === region ? 0 : 1;
          return aMatch - bMatch;
        });
      }
    }
    return copy;
  }, [servers, userLoc]);

  const filteredServers = useMemo(() => {
    if (!serverSearch) return sortedServers;
    const q = serverSearch.toLowerCase();
    return sortedServers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.sponsor && s.sponsor.toLowerCase().includes(q)) ||
      s.host.toLowerCase().includes(q),
    );
  }, [sortedServers, serverSearch]);

  const dataRef = useRef<TestData>(INITIAL);
  const settingsRef = useRef(settings);
  const cardRef = useRef<HTMLDivElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);
  const modalCardRef = useRef<HTMLDivElement>(null);
  settingsRef.current = settings;

  useEffect(() => {
    fetchConnectionInfo().then(setConnInfo);
    fetchDnsInfo().then(setDnsInfo);
  }, []);

  const loadServers = useCallback(async (pid: string) => {
    setServersLoading(true);
    setServerSearch('');

    const list = await getServersForProvider(pid);
    setServers(list);

    if (list.length > 0) {
      if (settingsRef.current.autoSelectServer && list.length > 1) {
        const best = await pickBestServer(list, pid);
        setSelectedServer(best);
      } else {
        setSelectedServer(list[0]);
      }
    } else {
      setSelectedServer(null);
    }

    setServersLoading(false);

    getFullServersForProvider(pid).then(full => {
      if (full.length > list.length) {
        setServers(full);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadServers(providerId);
  }, [providerId, loadServers]);

  const updateFromEngine = useCallback((u: SpeedtestUpdate) => {
    const display = u.phase === 'upload' ? u.uploadSpeed : u.downloadSpeed;
    setTestData(prev => {
      const next: TestData = {
        phase: u.phase,
        displaySpeed: display,
        downloadSpeed: u.downloadSpeed,
        uploadSpeed: u.uploadSpeed,
        ping: u.ping,
        jitter: u.jitter,
        packetLoss: u.packetLoss,
        loadedLatency: prev.loadedLatency,
        dlProgress: u.dlProgress,
        ulProgress: u.ulProgress,
        downloadSamples: u.downloadSamples,
        uploadSamples: u.uploadSamples,
        serverName: u.serverName,
        error: null,
      };
      dataRef.current = next;
      return next;
    });
  }, []);

  const completeEngine = useCallback((r: SpeedtestResult) => {
    const prev = dataRef.current;
    setTestData({
      ...prev,
      phase: 'complete',
      displaySpeed: r.download,
      downloadSpeed: r.download,
      uploadSpeed: r.upload,
      ping: r.ping,
      jitter: r.jitter,
      packetLoss: r.packetLoss,
      loadedLatency: r.loadedLatency,
      error: null,
    });
    setRunning(false);
  }, []);

  const errorEngine = useCallback((msg: string) => {
    setTestData(prev => ({ ...prev, phase: 'idle', error: msg }));
    setRunning(false);
  }, []);

  const handleStart = useCallback(() => {
    if (!selectedServer) return;
    setTestData(INITIAL);
    dataRef.current = INITIAL;
    setRunning(true);
    startSpeedtest(providerId, selectedServer, updateFromEngine, completeEngine, errorEngine, settingsRef.current);
  }, [providerId, selectedServer, updateFromEngine, completeEngine, errorEngine]);

  const handleAbort = useCallback(() => {
    abortSpeedtest();
    setRunning(false);
    setTestData(prev => ({ ...INITIAL, serverName: prev.serverName }));
  }, []);

  const updateSetting = <K extends keyof SpeedtestSettings>(key: K, value: SpeedtestSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('netspeed-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    localStorage.setItem('netspeed-unit', unitMbps ? 'Mbps' : 'MBs');
  }, [unitMbps]);

  const isActive = testData.phase === 'discovering' || testData.phase === 'ping' || testData.phase === 'download' || testData.phase === 'upload';

  const autoStarted = useRef(false);

  useEffect(() => {
    if (autoStarted.current) return;
    if (!selectedServer || serversLoading) return;
    if (isActive) return;
    autoStarted.current = true;
    handleStart();
  }, [selectedServer, serversLoading, isActive, handleStart]);

  const unit = (v: number) => unitMbps ? v : v / 8;
  const unitLabel = unitMbps ? 'Mbps' : 'MB/s';

  const handleShare = useCallback(() => {
    if (testData.phase !== 'complete') return;
    setShowShareModal(true);
  }, [testData]);

  const captureToDataUrl = useCallback(async () => {
    if (!modalCardRef.current) return null;
    try {
      return await toPng(modalCardRef.current, { backgroundColor: '#0a0a0f', pixelRatio: 3, width: 1800 });
    } catch { return null }
  }, []);

  const handleCopyImage = useCallback(async () => {
    const dataUrl = await captureToDataUrl();
    if (!dataUrl) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [captureToDataUrl]);

  const handleDownloadImage = useCallback(async () => {
    const dataUrl = await captureToDataUrl();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `netspeed-${Date.now()}.png`;
    a.click();
  }, [captureToDataUrl]);

  const handleNativeShare = useCallback(async () => {
    const dataUrl = await captureToDataUrl();
    if (!dataUrl) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `netspeed-${Date.now()}.png`, { type: 'image/png' });
      await navigator.share({ title: 'NetSpeed Results', files: [file] });
    } catch {}
  }, [captureToDataUrl]);

  const SettingField = ({ label, key, suffix, placeholder }: {
    label: string; key: keyof SpeedtestSettings; suffix?: string; placeholder?: string;
  }) => (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-xs ${dark ? 'text-white/50' : 'text-gray-500'}`}>{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode="numeric"
          value={settings[key] as string | number}
          placeholder={placeholder}
          onChange={e => updateSetting(key, Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
          className={`w-24 px-2 py-1.5 text-xs font-semibold text-right tabular-nums rounded-lg outline-none transition-colors ${
            dark ? 'bg-white/[0.04] text-white/80 placeholder-white/15 focus:ring-1 focus:ring-white/20' : 'bg-gray-100 text-gray-800 placeholder-gray-400 focus:ring-1 focus:ring-gray-300'
          }`}
        />
        {suffix && <span className={`text-[10px] font-medium ${dark ? 'text-white/35' : 'text-gray-400'}`}>{suffix}</span>}
      </div>
    </div>
  );

  const SettingToggle = ({ label, key }: { label: string; key: keyof SpeedtestSettings }) => (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${dark ? 'text-white/50' : 'text-gray-500'}`}>{label}</span>
      <Switch
        isSelected={settings[key] as boolean}
        onValueChange={v => updateSetting(key, v)}
        color="accent"
        size="sm"
      />
    </div>
  );

  const isComplete = testData.phase === 'complete';
  const resultForReview = useMemo(() => {
    if (!isComplete) return null;
    return {
      download: testData.downloadSpeed,
      upload: testData.uploadSpeed,
      ping: testData.ping,
      jitter: testData.jitter,
      packetLoss: testData.packetLoss,
      loadedLatency: testData.loadedLatency,
    } as SpeedtestResult;
  }, [isComplete, testData]);

  return (
    <div
      className={`min-h-screen ${dark ? 'dark bg-[#0a0a0f]' : 'bg-gray-50'} antialiased font-sans transition-colors`}
    >
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3 sm:p-4" onClick={() => setShowAbout(false)}>
          <Card variant={dark ? 'shadow' : 'flat'} className={`w-full max-w-md max-h-[90vh] overflow-y-auto ${dark ? 'bg-[#12121a]' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <Card.Content className="flex flex-col gap-4 sm:gap-5 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold tracking-tight ${dark ? 'text-white' : 'text-gray-900'}`}>About NetSpeed</span>
                <button onClick={() => setShowAbout(false)} className={`p-1 ${dark ? 'text-white/40 hover:text-white/70' : 'text-gray-400 hover:text-gray-700'}`}><X size={16} /></button>
              </div>

              <div className={`text-xs sm:text-sm leading-relaxed ${dark ? 'text-white/60' : 'text-gray-600'}`}>
                <p className="mb-3">
                  <span className={`font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>NetSpeed</span> is a browser-based network speed test toolkit that tests
                  your connection against <span className="font-semibold">Cloudflare</span>'s global edge network and
                  <span className="font-semibold"> Ookla/Speedtest.net</span> ISP-hosted servers via WebSocket.
                  It measures download/upload speed, ping, jitter, and packet loss using parallel streams.
                  No data leaves your browser — results are not stored or shared.
                </p>

                <div className={`flex items-center gap-1.5 justify-center py-3 ${dark ? 'text-white/40' : 'text-gray-500'}`}>
                  <Wrench size={14} />
                  Built by <a href="https://github.com/itsmeadarsh2008" target="_blank" rel="noopener noreferrer" className={`underline underline-offset-2 ${dark ? 'text-white/50 hover:text-white' : 'text-gray-700 hover:text-gray-900'}`}>Adarsh</a> under <span className="font-semibold">NetSpeed</span>
                  <Rocket size={14} />
                </div>

                <div className={`h-px w-full my-3 ${dark ? 'bg-white/[0.06]' : 'bg-gray-200'}`} />

                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-500" />
                  <p className={dark ? 'text-white/60' : 'text-gray-600'}>
                    This project requires maintenance for better and accurate speedtesting using 3rd party providers to benchmark internet connections. Hoping some donations to keep the open source alive.
                  </p>
                </div>

                <div className="mt-4 flex justify-center">
                  <a href="https://github.com/sponsors/itsmeadarsh2008" target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                    dark ? 'bg-pink-500/10 text-pink-300 hover:bg-pink-500/20' : 'bg-pink-50 text-pink-600 hover:bg-pink-100'
                  }`}>
                    <Heart size={16} fill="currentColor" /> Sponsor on GitHub
                  </a>
                </div>
              </div>
            </Card.Content>
          </Card>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3 sm:p-4" onClick={() => setShowSettings(false)}>
          <Card variant={dark ? 'shadow' : 'flat'} className={`w-full max-w-xs sm:max-w-sm max-h-[90vh] overflow-y-auto ${dark ? 'bg-[#12121a]' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <Card.Content className="flex flex-col gap-4 sm:gap-5 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold tracking-tight ${dark ? 'text-white' : 'text-gray-900'}`}>Settings</span>
                <button onClick={() => setShowSettings(false)} className={`p-1 ${dark ? 'text-white/40 hover:text-white/70' : 'text-gray-400 hover:text-gray-700'}`}><X size={16} /></button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className={`text-xs font-medium ${dark ? 'text-white/40' : 'text-gray-500'} tracking-wider uppercase`}>{dark ? 'Dark' : 'Light'} Theme</span>
                <Switch isSelected={dark} onValueChange={setDark} color="accent" size="sm" />
              </div>

              <div className={`pt-2 ${sectionDivider(dark)}`} />

              <span className={`text-[10px] font-semibold tracking-widest uppercase ${dark ? 'text-white/25' : 'text-gray-400'}`}>Test Duration</span>
              <SettingField label="Download Duration" key="dlDuration" suffix="ms" placeholder="10000" />
              <SettingField label="Upload Duration" key="ulDuration" suffix="ms" placeholder="10000" />

              <div className={sectionDivider(dark)} />

              <span className={`text-[10px] font-semibold tracking-widest uppercase ${dark ? 'text-white/25' : 'text-gray-400'}`}>Parallel Streams</span>
              <SettingField label="Download Streams" key="dlStreams" placeholder="4" />
              <SettingField label="Upload Streams" key="ulStreams" placeholder="4" />

              <div className={sectionDivider(dark)} />

              <span className={`text-[10px] font-semibold tracking-widest uppercase ${dark ? 'text-white/25' : 'text-gray-400'}`}>Chunk Size</span>
              <SettingField label="Download Chunk" key="dlChunkSize" suffix="B" placeholder="5000000" />
              <SettingField label="Upload Chunk" key="ulChunkSize" suffix="B" placeholder="1000000" />

              <div className={sectionDivider(dark)} />

              <span className={`text-[10px] font-semibold tracking-widest uppercase ${dark ? 'text-white/25' : 'text-gray-400'}`}>Ping</span>
              <SettingField label="Ping Samples" key="pingSamples" placeholder="6" />

              <div className={sectionDivider(dark)} />

              <SettingToggle label="Auto-select Best Server" key="autoSelectServer" />

              <Button
                color="accent"
                size="sm"
                variant="flat"
                onPress={() => { setSettings({ ...DEFAULT_SETTINGS }); saveSettings(DEFAULT_SETTINGS); }}
                className="mt-2"
              >
                Reset to Defaults
              </Button>
            </Card.Content>
          </Card>
        </div>
      )}

      <main className={`${dark ? 'text-white/90' : 'text-gray-900'} w-full mx-auto px-3 lg:px-8 py-6 lg:py-10 flex flex-col items-center gap-4 sm:gap-5`}>
        <header className="w-full flex items-start justify-between">
          <div className="flex flex-col">
            <h1 className={`flex items-center gap-2 font-semibold tracking-tight ${dark ? 'text-white' : 'text-gray-900'}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0" aria-hidden="true">
                <path d="M4 17c2-3 5-5 8-5s6 2 8 5" stroke={dark ? '#00e5ff' : '#0891b2'} strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M4 7c2 3 5 5 8 5s6-2 8-5" stroke={dark ? '#00e5ff' : '#0891b2'} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.4" />
                <circle cx="12" cy="12" r="2" fill={dark ? '#00e5ff' : '#0891b2'} />
                <circle cx="12" cy="12" r="5" stroke={dark ? '#00e5ff' : '#0891b2'} strokeWidth="1.5" strokeDasharray="2 3" opacity="0.35" />
              </svg>
              NetSpeed
            </h1>
            <p className={`text-[10px] tracking-wider mt-0.5 ml-7 ${dark ? 'text-white/25' : 'text-gray-400'}`}>Browser Speed Test</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden lg:block">
              <ButtonGroup size="sm" variant="tertiary">
                {PROVIDERS.map(p => (
                  <Button
                    key={p.id}
                    isDisabled={isActive}
                    onPress={() => setProviderId(p.id)}
                    className={`${providerId === p.id
                      ? dark ? 'bg-white/10 text-white shadow-sm' : 'bg-gray-900 text-white shadow-sm'
                      : ''} text-[10px] font-semibold tracking-wider`}
                  >
                    {p.shortName}
                  </Button>
                ))}
              </ButtonGroup>
            </div>
            <a href="https://github.com/sponsors/itsmeadarsh2008" target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold tracking-wider rounded-lg transition-colors ${dark ? 'text-pink-300/70 hover:text-pink-300 hover:bg-white/8' : 'text-pink-500/70 hover:text-pink-500 hover:bg-gray-200'}`} title="Sponsor this project">
              <span>♥</span>
              <span>Sponsor</span>
            </a>
            <button
              onClick={() => setUnitMbps(prev => !prev)}
              className={`px-2 py-1 text-[10px] font-semibold tracking-wider rounded-lg transition-colors ${
                dark ? 'text-white/40 hover:text-white/70 hover:bg-white/8' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'
              }`}
              title="Toggle unit"
            >
              {unitLabel}
            </button>
            <button onClick={() => setShowAbout(true)} className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-white/40 hover:text-white/70 hover:bg-white/8' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'}`} title="About"><Info size={18} /></button>
            <button onClick={() => setShowSettings(true)} className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-white/40 hover:text-white/70 hover:bg-white/8' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'}`} title="Settings"><Settings size={18} /></button>
            <button onClick={() => setDark(prev => !prev)} className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-white/40 hover:text-white/70 hover:bg-white/8' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'}`}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          </div>
        </header>

          <div className="w-full lg:hidden">
          {servers.length > 1 && (
          <div className="w-full relative">
            <div className={`flex items-center gap-2 px-4 py-3.5 text-xs font-medium rounded-xl transition-colors ${serversLoading ? 'pulse-loading' : ''} ${
              dark ? 'bg-white/[0.03] text-white/70 border border-white/[0.06]' : 'bg-gray-100 text-gray-700 border border-gray-200'
            } focus-within:ring-1 focus-within:ring-accent`}>
              <Search size={14} strokeWidth={2.5} className={`shrink-0 ${dark ? 'text-white/25' : 'text-gray-400'}`} />
              <input
                type="text"
                aria-label="Search servers"
                value={serverSearch}
                onChange={e => { setServerSearch(e.target.value); setServerDropdownOpen(true); }}
                onFocus={() => setServerDropdownOpen(true)}
                placeholder={serversLoading ? 'Loading servers...' : `Search ${servers.length} servers...`}
                disabled={isActive || serversLoading}
                className={`flex-1 bg-transparent outline-none text-xs ${dark ? 'placeholder-white/20 text-white/80' : 'placeholder-gray-400 text-gray-800'}`}
              />
              {selectedServer && !serverSearch && !serverDropdownOpen && (
                <span className={`text-xs truncate ${dark ? 'text-white/35' : 'text-gray-400'}`}>
                  {selectedServer.sponsor || selectedServer.name}
                </span>
              )}
            </div>
            {serverDropdownOpen && !isActive && !serversLoading && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setServerDropdownOpen(false)} />
                <div className={`absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border shadow-lg ${
                  dark ? 'bg-[#16161e] border-white/[0.06]' : 'bg-white border-gray-200'
                }`}>
                  {filteredServers.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedServer(s); setServerSearch(''); setServerDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-3 text-xs font-medium transition-colors ${
                        selectedServer?.id === s.id
                          ? dark ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-900'
                          : dark ? 'text-white/60 hover:bg-white/[0.04]' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="block truncate">{s.sponsor ? `${s.name} — ${s.sponsor}` : s.name}</span>
                      <span className={`block truncate text-xs mt-0.5 ${dark ? 'text-white/20' : 'text-gray-400'}`}>{s.host}</span>
                    </button>
                  ))}
                  {filteredServers.length === 0 && (
                    <div className={`px-4 py-3 text-[10px] text-center ${dark ? 'text-white/25' : 'text-gray-400'}`}>No servers match "{serverSearch}"</div>
                  )}
                </div>
              </>
            )}
          </div>
          )}
          </div>

          <div className={`flex items-stretch gap-1 w-full rounded-xl p-0.5 lg:hidden ${dark ? 'bg-white/[0.03]' : 'bg-gray-100'}`}>
            <button
              onClick={() => setActiveTab('speedtest')}
              aria-label="Speed Test tab"
              className={`flex-1 px-3 py-2 text-[10px] font-semibold tracking-wider rounded-lg transition-all ${
                activeTab === 'speedtest'
                  ? dark ? 'bg-white/10 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
                  : dark ? 'text-white/40 hover:text-white/70' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Speed Test
            </button>
            <button
              onClick={() => setActiveTab('downdetector')}
              aria-label="Down Detector tab"
              className={`flex-1 px-3 py-2 text-[10px] font-semibold tracking-wider rounded-lg transition-all ${
                activeTab === 'downdetector'
                  ? dark ? 'bg-white/10 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
                  : dark ? 'text-white/40 hover:text-white/70' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Down Detector
            </button>
          </div>

        <div style={{ display: activeTab === 'speedtest' ? '' : 'none' }} className="lg:hidden">
          <ButtonGroup fullWidth size="sm" variant="tertiary">
            {PROVIDERS.map(p => (
              <Button
                key={p.id}
                isDisabled={isActive}
                onPress={() => setProviderId(p.id)}
                className={`${providerId === p.id
                  ? dark ? 'bg-white/10 text-white shadow-sm' : 'bg-gray-900 text-white shadow-sm'
                  : ''} text-[10px] font-semibold tracking-wider`}
              >
                {p.shortName}
              </Button>
            ))}
          </ButtonGroup>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden lg:flex items-stretch gap-1 rounded-lg p-0.5 shrink-0 ${dark ? 'bg-white/[0.03]' : 'bg-gray-100'}">
            <button
              onClick={() => setActiveTab('speedtest')}
              aria-label="Speed Test tab"
              className={`px-3 py-2 text-[10px] font-semibold tracking-wider rounded-md transition-all ${
                activeTab === 'speedtest'
                  ? dark ? 'bg-white/10 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
                  : dark ? 'text-white/40 hover:text-white/70' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Speed Test
            </button>
            <button
              onClick={() => setActiveTab('downdetector')}
              aria-label="Down Detector tab"
              className={`px-3 py-2 text-[10px] font-semibold tracking-wider rounded-md transition-all ${
                activeTab === 'downdetector'
                  ? dark ? 'bg-white/10 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
                  : dark ? 'text-white/40 hover:text-white/70' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Down Detector
            </button>
          </div>
        </div>

        <section style={{ display: activeTab === 'speedtest' ? '' : 'none' }} className="w-full">

          <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
            <div className="lg:col-span-2 flex flex-col gap-5">
              <div className="relative h-56 sm:h-64 lg:h-72 w-full">
                <div className="absolute inset-0 rounded-xl overflow-hidden">
                  <SpeedGraph download={unitMbps ? testData.downloadSamples : testData.downloadSamples.map(s => s / 8)} upload={unitMbps ? testData.uploadSamples : testData.uploadSamples.map(s => s / 8)} packetLoss={testData.packetLoss} dark={dark} unit={unitLabel} />
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Gauge phase={testData.phase} speed={unitMbps ? testData.displaySpeed : testData.displaySpeed / 8} dark={dark} unit={unitLabel} />
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap justify-center lg:justify-start">
                <div className="hidden lg:block lg:flex-1">
                {servers.length > 1 && (
                <div className="w-full relative">
                    <div className={`flex items-center gap-2 px-4 py-3.5 text-xs font-medium rounded-xl transition-colors ${serversLoading ? 'pulse-loading' : ''} ${
                      dark ? 'bg-white/[0.03] text-white/70 border border-white/[0.06]' : 'bg-gray-100 text-gray-700 border border-gray-200'
                    } focus-within:ring-1 focus-within:ring-accent`}>
                      <Search size={14} strokeWidth={2.5} className={`shrink-0 ${dark ? 'text-white/25' : 'text-gray-400'}`} />
                      <input
                      type="text"
                      aria-label="Search servers"
                      value={serverSearch}
                      onChange={e => { setServerSearch(e.target.value); setServerDropdownOpen(true); }}
                      onFocus={() => setServerDropdownOpen(true)}
                      placeholder={serversLoading ? 'Loading servers...' : `Search ${servers.length} servers...`}
                      disabled={isActive || serversLoading}
                      className={`flex-1 bg-transparent outline-none text-xs ${dark ? 'placeholder-white/20 text-white/80' : 'placeholder-gray-400 text-gray-800'}`}
                    />
                    {selectedServer && !serverSearch && !serverDropdownOpen && (
                      <span className={`text-xs truncate ${dark ? 'text-white/35' : 'text-gray-400'}`}>
                        {selectedServer.sponsor || selectedServer.name}
                      </span>
                    )}
                  </div>
                  {serverDropdownOpen && !isActive && !serversLoading && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setServerDropdownOpen(false)} />
                      <div className={`absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border shadow-lg ${
                        dark ? 'bg-[#16161e] border-white/[0.06]' : 'bg-white border-gray-200'
                      }`}>
                        {filteredServers.map(s => (
                          <button
                            key={s.id}
                            onClick={() => { setSelectedServer(s); setServerSearch(''); setServerDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-3 text-xs font-medium transition-colors ${
                              selectedServer?.id === s.id
                                ? dark ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-900'
                                : dark ? 'text-white/60 hover:bg-white/[0.04]' : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <span className="block truncate">{s.sponsor ? `${s.name} — ${s.sponsor}` : s.name}</span>
                            <span className={`block truncate text-xs mt-0.5 ${dark ? 'text-white/20' : 'text-gray-400'}`}>{s.host}</span>
                          </button>
                        ))}
                        {filteredServers.length === 0 && (
                          <div className={`px-4 py-3 text-[10px] text-center ${dark ? 'text-white/25' : 'text-gray-400'}`}>No servers match "{serverSearch}"</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                )}
                </div>
                <Button
                  color={isActive ? 'danger' : 'accent'}
                  size="lg"
                  onPress={isActive ? handleAbort : handleStart}
                  isDisabled={(!isActive && running) || serversLoading || !selectedServer}
                  className="min-w-[180px] h-14 text-base font-semibold tracking-wide rounded-full"
                  aria-label={isActive ? 'Abort speed test' : testData.phase === 'complete' ? 'Test Again' : 'Start speed test'}
                >
                  {isActive ? 'Abort' : testData.phase === 'complete' ? 'Test Again' : 'Start Test'}
                </Button>
              </div>

              {testData.error && (
                <div className={`text-xs font-medium ${dark ? 'text-red-400' : 'text-red-600'} animate-[fade-in_0.3s_ease-out]`}>{testData.error}</div>
              )}

              {resultForReview && <div className="hidden lg:block"><SpeedReview result={resultForReview} dark={dark} dnsInfo={dnsInfo} sensitiveVisible={sensitiveVisible} onToggleSensitive={() => setSensitiveVisible(prev => !prev)} /></div>}
              {isActive && <div className="hidden lg:block"><SpeedReviewSkeleton dark={dark} /></div>}
            </div>

            <div className="lg:col-span-1 min-w-0">
              <Card ref={cardRef} className={`w-full overflow-hidden ${dark ? 'bg-white/[0.015] ring-1 ring-white/[0.04]' : 'bg-white shadow-sm'}`}>
                <div className={`px-5 sm:px-6 xl:px-8`}>
                  <div className={`flex items-center justify-between py-4 border-b ${dark ? 'border-white/[0.04]' : 'border-gray-200'}`}>
                    <span className={`text-[10px] font-semibold ${dark ? 'text-white/25' : 'text-gray-400'} tracking-[0.15em] uppercase`}>Speed Test</span>
                    {testData.phase !== 'idle' && testData.phase !== 'complete' && (
                      <div className="flex gap-2.5">
                        {testData.dlProgress > 0 && <span className="text-[10px] tabular-nums text-sky-400">DL {Math.round(testData.dlProgress * 100)}%</span>}
                        {testData.ulProgress > 0 && <span className="text-[10px] tabular-nums text-green-400">UL {Math.round(testData.ulProgress * 100)}%</span>}
                      </div>
                    )}
                  </div>

                  <div className="py-4 space-y-1">
                    {row(<><ArrowDown size={15} strokeWidth={3} /> Download</>, testData.downloadSpeed > 0 ? `${fmtSpeed(unit(testData.downloadSpeed))} ${unitLabel}` : '--', dark, 'dark:text-cyan-400')}
                    {row(<><ArrowUp size={15} strokeWidth={3} /> Upload</>, testData.uploadSpeed > 0 ? `${fmtSpeed(unit(testData.uploadSpeed))} ${unitLabel}` : '--', dark, 'dark:text-green-400')}
                    <div className={`h-px my-1.5 ${dark ? 'bg-white/[0.03]' : 'bg-gray-100'}`} />
                    {row(<><Activity size={15} strokeWidth={3} /> Ping</>, testData.ping > 0 ? `${testData.ping.toFixed(1)} ms` : '--', dark, pingColor(testData.ping))}
                    {testData.ping > 0 && <span className={`block text-xs -mt-1 mb-1 ${dark ? 'text-white/20' : 'text-gray-400'} pl-7`}>{pingLabel(testData.ping)}</span>}
                    {row(<><GaugeIcon size={15} strokeWidth={3} /> Jitter</>, testData.jitter > 0 ? `${testData.jitter.toFixed(1)} ms` : '--', dark, 'dark:text-purple-400')}
                    {testData.loadedLatency > 0 && row(<><Clock size={15} strokeWidth={3} /> Loaded Latency</>, `${testData.loadedLatency.toFixed(1)} ms`, dark, 'dark:text-teal-400')}
                    {testData.phase !== 'idle' && row(<><WifiOff size={15} strokeWidth={3} /> Packet Loss</>, testData.packetLoss > 0 ? `${testData.packetLoss.toFixed(1)}%` : '0%', dark, 'dark:text-yellow-400')}
                    {testData.serverName && (() => {
                      const paren = testData.serverName.indexOf(' (');
                      if (paren !== -1) {
                        const sub = testData.serverName.slice(0, paren);
                        const main = testData.serverName.slice(paren + 2, -1);
                        return (
                          <div className="flex items-center justify-between py-1.5 gap-2">
                            <span className={`text-xs ${dark ? 'text-white/35' : 'text-gray-500'} tracking-wider flex items-center gap-1 transition-colors duration-200 truncate min-w-0`}><Server size={15} strokeWidth={2.5} /> Server</span>
                            <div className="text-right shrink-0">
                              <div className={`text-sm font-medium ${dark ? 'text-white/70' : 'text-gray-700'} tabular-nums tracking-tight transition-all duration-200 whitespace-nowrap`}>{main}</div>
                              <div className={`text-[10px] leading-tight -mt-0.5 text-right ${dark ? 'text-white/30' : 'text-gray-400'} max-w-[160px] truncate`}>{sub}</div>
                            </div>
                          </div>
                        );
                      }
                      return row(<><Server size={15} strokeWidth={3} /> Server</>, testData.serverName, dark);
                    })()}
                  </div>

                  {isComplete && (
                    <div className="py-3 border-t border-b mb-0">
                      <button
                        onClick={handleShare}
                        className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                          dark ? 'text-white/40 hover:text-white/70' : 'text-gray-400 hover:text-gray-700'
                        }`}
                      >
                        <Share2 size={13} strokeWidth={2.5} />
                        Share Results
                      </button>
                    </div>
                  )}

                  {connInfo && (
                    <>
                      <div className="py-4 space-y-1">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Globe size={14} strokeWidth={2.5} className={dark ? 'text-white/25' : 'text-gray-400'} />
                          <span className={`text-[10px] font-semibold tracking-widest uppercase ${dark ? 'text-white/25' : 'text-gray-400'}`}>Connection</span>
                          <button
                            onClick={() => setSensitiveVisible(prev => !prev)}
                            className={`ml-auto p-0.5 ${dark ? 'text-white/20 hover:text-white/50' : 'text-gray-400 hover:text-gray-600'}`}
                            title={sensitiveVisible ? 'Hide sensitive info' : 'Show sensitive info'}
                          >
                            {sensitiveVisible ? <EyeOff size={13} strokeWidth={2.5} /> : <Eye size={13} strokeWidth={2.5} />}
                          </button>
                        </div>
                        {row(<><Globe size={15} strokeWidth={3} /> IP Address</>, sensitiveVisible ? connInfo.ip : maskIp(connInfo.ip), dark)}
                        {connInfo.asn && row(<>ASN</>, connInfo.asn, dark)}
                        {row(<>ISP</>, connInfo.isp, dark)}
                        {(connInfo.city || connInfo.country) && row(<>Location</>, [connInfo.city, connInfo.region, connInfo.country].filter(Boolean).join(', '), dark)}
                        {dnsInfo && (() => {
                          const dnsValue = `${dnsInfo.provider} (${sensitiveVisible ? dnsInfo.ip : maskIp(dnsInfo.ip)})`;
                          const paren = dnsValue.indexOf(' (');
                          if (paren !== -1) {
                            const sub = dnsValue.slice(0, paren);
                            const main = dnsValue.slice(paren + 2, -1);
                            return (
                              <div className="flex items-center justify-between py-1.5 gap-2">
                                <span className={`text-xs ${dark ? 'text-white/35' : 'text-gray-500'} tracking-wider flex items-center gap-1 transition-colors duration-200`}><Search size={15} strokeWidth={3} /> DNS</span>
                                <div className="text-right shrink-0">
                                  <div className={`text-sm font-medium ${dark ? 'text-white/70' : 'text-gray-700'} tabular-nums tracking-tight transition-all duration-200 whitespace-nowrap`}>{main}</div>
                                  <div className={`text-[10px] leading-tight -mt-0.5 text-right ${dark ? 'text-white/30' : 'text-gray-400'}`}>{sub}</div>
                                  </div>
                                </div>
                            );
                          }
                          return row(<><Search size={15} strokeWidth={3} /> DNS</>, dnsValue, dark);
                        })()}
                      </div>

                      <div className={`h-px ${dark ? 'bg-white/[0.04]' : 'bg-gray-200'}`} />

                      <div className="py-4 space-y-1">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Monitor size={14} strokeWidth={2.5} className={dark ? 'text-white/25' : 'text-gray-400'} />
                          <span className={`text-[10px] font-semibold tracking-widest uppercase ${dark ? 'text-white/25' : 'text-gray-400'}`}>Client</span>
                        </div>
                        {row(<><Monitor size={15} strokeWidth={3} /> Browser</>, connInfo.browser, dark)}
                        {row(<>Platform</>, connInfo.platform, dark)}
                      </div>

                      {(connInfo.effectiveType !== 'Unknown' || connInfo.rtt > 0) && (
                        <>
                          <div className={`h-px ${dark ? 'bg-white/[0.04]' : 'bg-gray-200'}`} />
                  <div className="py-4 space-y-1">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Activity size={14} strokeWidth={2.5} className={dark ? 'text-white/25' : 'text-gray-400'} />
                              <span className={`text-[10px] font-semibold tracking-widest uppercase ${dark ? 'text-white/25' : 'text-gray-400'}`}>Network</span>
                            </div>
                            {connInfo.connectionType !== 'Unknown' && row(<>Connection</>, fmtConnType(connInfo.connectionType), dark)}
                            {connInfo.effectiveType !== 'Unknown' && row(<>Effective Type</>, connInfo.effectiveType.toUpperCase(), dark)}
                            {connInfo.rtt > 0 && row(<>Browser RTT</>, `${connInfo.rtt} ms`, dark)}
                            {connInfo.downlink > 0 && row(<>Browser Downlink</>, fmtDownlink(connInfo.downlink), dark)}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </Card>
            </div>
          </div>

          {resultForReview && <div className="block lg:hidden"><SpeedReview result={resultForReview} dark={dark} dnsInfo={dnsInfo} sensitiveVisible={sensitiveVisible} onToggleSensitive={() => setSensitiveVisible(prev => !prev)} /></div>}
          {isActive && <div className="block lg:hidden"><SpeedReviewSkeleton dark={dark} /></div>}
        </section>

        <section style={{ display: activeTab === 'downdetector' ? '' : 'none' }}>
          <DownDetector dark={dark} />
        </section>

        <footer className={`w-full text-center text-[10px] sm:text-xs ${dark ? 'text-white/15' : 'text-gray-400'}`}>
          NetSpeed &copy; {new Date().getFullYear()} &mdash; built by <a href="https://github.com/itsmeadarsh2008" target="_blank" rel="noopener noreferrer" className={`underline underline-offset-2 ${dark ? 'text-white/25 hover:text-white/50' : 'text-gray-500 hover:text-gray-700'}`}>Adarsh Gourab Mahalik</a>
        </footer>

      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowShareModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className={`relative z-10 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl ${dark ? 'bg-[#16161e] ring-1 ring-white/[0.06]' : 'bg-white ring-1 ring-gray-200'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Share Results</h2>
              <button onClick={() => setShowShareModal(false)} className={`p-1 rounded-lg transition-colors ${dark ? 'text-white/30 hover:text-white/60 hover:bg-white/8' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                <X size={16} />
              </button>
            </div>

            <div className="px-5 pb-2">
              <div className="rounded-xl overflow-hidden ring-1 ring-white/[0.06]" ref={modalCardRef}>
                <div className="bg-[#0a0a0f] text-white overflow-hidden" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  <div className="px-8 pt-8 pb-6">
                    <div className="flex items-center gap-2.5 mb-1">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 17c2-3 5-5 8-5s6 2 8 5" stroke="#00e5ff" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                        <path d="M4 7c2 3 5 5 8 5s6-2 8-5" stroke="#00e5ff" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.4" />
                        <circle cx="12" cy="12" r="2" fill="#00e5ff" />
                        <circle cx="12" cy="12" r="5" stroke="#00e5ff" strokeWidth="1.5" strokeDasharray="2 3" opacity="0.35" />
                      </svg>
                      <span className="text-lg font-semibold tracking-tight">NetSpeed</span>
                      <span className="text-[11px] text-white/30 tracking-wider ml-auto">Browser Speed Test</span>
                    </div>
                  </div>

                  <div className="px-8 pb-6">
                    <div className="flex items-center justify-center mb-4">
                      <svg width="200" height="120" viewBox="0 0 200 120" fill="none">
                        <path d="M20 100 A80 80 0 0 1 180 100" stroke="rgba(255,255,255,0.08)" strokeWidth="12" strokeLinecap="round" fill="none" />
                        <path d="M20 100 A80 80 0 0 1 180 100" stroke="url(#g)" strokeWidth="12" strokeLinecap="round" fill="none" strokeDasharray={`${Math.min(testData.downloadSpeed / 100, 1) * 251} 251`} />
                        <defs>
                          <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#00e5ff" />
                            <stop offset="100%" stopColor="#00e676" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>

                    <div className="text-center mb-6">
                      <div className="text-[56px] font-bold leading-none tracking-tight text-cyan-400">
                        {unitMbps && testData.downloadSpeed >= 1000 ? (testData.downloadSpeed / 1000).toFixed(1) : fmtSpeed(unit(testData.downloadSpeed))}
                        <span className="text-[20px] font-medium text-cyan-400/60 ml-1">{unitMbps && testData.downloadSpeed >= 1000 ? 'Gbps' : unitLabel}</span>
                      </div>
                      <div className="text-xs text-white/30 tracking-widest uppercase mt-1">Download</div>
                    </div>

                    <div className="h-px bg-white/5 mb-6" />

                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-[22px] font-bold tracking-tight text-green-400">
                          {testData.uploadSpeed > 0 ? (unitMbps && testData.uploadSpeed >= 1000 ? (testData.uploadSpeed / 1000).toFixed(1) : fmtSpeed(unit(testData.uploadSpeed))) : '—'}
                        </div>
                        <div className="text-[10px] text-white/30 tracking-wider uppercase mt-0.5">Upload</div>
                        <div className="text-[11px] text-green-400/60 font-medium">{testData.uploadSpeed > 0 ? (unitMbps && testData.uploadSpeed >= 1000 ? 'Gbps' : unitLabel) : ''}</div>
                      </div>
                      <div>
                        <div className={`text-[22px] font-bold tracking-tight ${pingColor(testData.ping).replace('dark:', '')}`}>{testData.ping > 0 ? testData.ping.toFixed(1) : '—'}</div>
                        <div className="text-[10px] text-white/30 tracking-wider uppercase mt-0.5">Ping</div>
                        <div className={`text-[11px] font-medium ${pingColor(testData.ping).replace('dark:', '').replace('-400', '-400/60')}`}>ms</div>
                      </div>
                      <div>
                        <div className="text-[22px] font-bold tracking-tight text-purple-400">{testData.jitter > 0 ? testData.jitter.toFixed(1) : '—'}</div>
                        <div className="text-[10px] text-white/30 tracking-wider uppercase mt-0.5">Jitter</div>
                        <div className="text-[11px] text-purple-400/60 font-medium">ms</div>
                      </div>
                    </div>

                    {(testData.packetLoss > 0 || testData.loadedLatency > 0) && (
                      <>
                        <div className="h-px bg-white/5 my-4" />
                        <div className="grid grid-cols-2 gap-4 text-center">
                          {testData.packetLoss > 0 && (
                            <div>
                              <div className="text-[22px] font-bold tracking-tight text-red-400">{testData.packetLoss.toFixed(1)}%</div>
                              <div className="text-[10px] text-white/30 tracking-wider uppercase mt-0.5">Packet Loss</div>
                            </div>
                          )}
                          {testData.loadedLatency > 0 && (
                            <div>
                              <div className="text-[22px] font-bold tracking-tight text-orange-400">{testData.loadedLatency.toFixed(1)}</div>
                              <div className="text-[10px] text-white/30 tracking-wider uppercase mt-0.5">Loaded Latency</div>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {connInfo && (
                      <>
                        <div className="h-px bg-white/5 my-4" />
                        <div className="px-0">
                          <div className="text-[10px] text-white/20 tracking-widest uppercase mb-3">Connection Details</div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-white/30">ISP</span>
                              <span className="text-[11px] text-white/60 font-medium">{connInfo.isp}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-white/30">IP Address</span>
                              <span className="text-[11px] text-white/60 font-medium">{sensitiveVisible ? connInfo.ip : maskIp(connInfo.ip)}</span>
                            </div>
                            {(connInfo.city || connInfo.country) && (
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] text-white/30">Location</span>
                                <span className="text-[11px] text-white/60 font-medium">{[connInfo.city, connInfo.region, connInfo.country].filter(Boolean).join(', ')}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-white/30">Browser</span>
                              <span className="text-[11px] text-white/60 font-medium">{connInfo.browser} &middot; {connInfo.platform}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="px-8 py-4 bg-white/[0.02] space-y-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-white/30">3rd Party Provider</span>
                      <span className="text-white/70 font-medium capitalize">{providerId === 'cloudflare' ? 'Cloudflare' : providerId === 'ookla' ? 'Ookla (Speedtest)' : providerId}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/30">Server</span>
                      <span className="text-white/70 font-medium">{testData.serverName || (providerId === 'cloudflare' ? 'Cloudflare Auto' : 'Default')}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                      <span className="text-white/20">{typeof window !== 'undefined' ? window.location.hostname : 'netspeed.app'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 pt-3 flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={handleCopyImage}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-[10px] font-semibold tracking-wider transition-colors ${
                    dark ? 'bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 ring-1 ring-white/[0.06]' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 ring-1 ring-gray-200'
                  }`}
                >
                  <Copy size={16} />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={handleDownloadImage}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-[10px] font-semibold tracking-wider transition-colors ${
                    dark ? 'bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 ring-1 ring-white/[0.06]' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 ring-1 ring-gray-200'
                  }`}
                >
                  <Download size={16} />
                  Download
                </button>
                <button
                  onClick={handleNativeShare}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-[10px] font-semibold tracking-wider transition-colors ${
                    dark ? 'bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 ring-1 ring-white/[0.06]' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 ring-1 ring-gray-200'
                  }`}
                >
                  <Share2 size={16} />
                  Share
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
