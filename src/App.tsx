import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Switch } from '@heroui/react';
import { Activity, Download, Eye, EyeOff, Globe, Moon, Monitor, Search, Settings, Share2, Sun, X } from 'lucide-react';
import { toPng } from 'html-to-image';
import Gauge from './components/Gauge';
import SpeedGraph from './components/SpeedGraph';
import SpeedReview from './components/SpeedReview';
import type { TestPhase, SpeedtestUpdate, SpeedtestResult, ProviderServer, SpeedtestSettings } from './lib/speedtest';
import { startSpeedtest, abortSpeedtest, getProviders, getServersForProvider, pickBestServer } from './lib/speedtest';
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

const row = (label: string, value: string, dark: boolean) => (
  <div className="flex items-center justify-between py-1.5">
    <span className={`text-xs ${dark ? 'text-white/35' : 'text-gray-500'} tracking-wider transition-colors duration-200`}>{label}</span>
    <span className={`text-sm font-medium ${dark ? 'text-white/70' : 'text-gray-700'} tabular-nums tracking-tight transition-all duration-200`}>{value}</span>
  </div>
);

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
  const [testData, setTestData] = useState<TestData>(INITIAL);
  const [running, setRunning] = useState(false);
  const [settings, setSettings] = useState<SpeedtestSettings>(() => loadSettings());
  const [connInfo, setConnInfo] = useState<ConnectionInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [sensitiveVisible, setSensitiveVisible] = useState(false);
  const [dnsInfo, setDnsInfo] = useState<DnsInfo | null>(null);

  const [providerId, setProviderId] = useState(PROVIDERS[0]?.id ?? 'cloudflare');
  const [servers, setServers] = useState<ProviderServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<ProviderServer | null>(null);
  const [serversLoading, setServersLoading] = useState(false);
  const [serverSearch, setServerSearch] = useState('');
  const [serverDropdownOpen, setServerDropdownOpen] = useState(false);

  const filteredServers = useMemo(() => {
    if (!serverSearch) return servers;
    const q = serverSearch.toLowerCase();
    return servers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.sponsor && s.sponsor.toLowerCase().includes(q)) ||
      s.host.toLowerCase().includes(q),
    );
  }, [servers, serverSearch]);

  const dataRef = useRef<TestData>(INITIAL);
  const settingsRef = useRef(settings);
  const cardRef = useRef<HTMLDivElement>(null);
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

  const unit = (v: number) => unitMbps ? v : v / 8;
  const unitLabel = unitMbps ? 'Mbps' : 'MB/s';

  const handleShare = useCallback(async () => {
    if (testData.phase !== 'complete' || !cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { backgroundColor: dark ? '#0a0a0f' : '#f9fafb' });
      const blob = await (await fetch(dataUrl)).blob();
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `netspeed-${Date.now()}.png`;
        a.click();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  }, [testData, dark]);

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
    <div className={`min-h-screen ${dark ? 'dark bg-[#0a0a0f]' : 'bg-gray-50'} antialiased font-sans transition-colors`}>
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

      <div className={`${dark ? 'text-white/90' : 'text-gray-900'} w-full max-w-lg lg:max-w-7xl mx-auto px-4 lg:px-8 py-6 lg:py-10 flex flex-col items-center gap-4 sm:gap-5`}>
        <header className="w-full flex items-start justify-between">
          <div className="flex flex-col">
            <span className={`flex items-center gap-2 font-semibold tracking-tight ${dark ? 'text-white' : 'text-gray-900'}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                <path d="M14 3L12 10L18 8L8 21L10 14L4 16L14 3Z" fill={dark ? '#00e5ff' : '#0891b2'} stroke={dark ? '#00e5ff' : '#0891b2'} strokeWidth="0.5" strokeLinejoin="round"/>
              </svg>
              NetSpeed
            </span>
            <span className={`text-[10px] tracking-wider mt-0.5 ml-7 ${dark ? 'text-white/25' : 'text-gray-400'}`}>built by Adarsh</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUnitMbps(prev => !prev)}
              className={`px-2 py-1 text-[10px] font-semibold tracking-wider rounded-lg transition-colors ${
                dark ? 'text-white/40 hover:text-white/70 hover:bg-white/8' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'
              }`}
              title="Toggle unit"
            >
              {unitLabel}
            </button>
            <button onClick={() => setShowSettings(true)} className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-white/40 hover:text-white/70 hover:bg-white/8' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'}`} title="Settings"><Settings size={18} /></button>
            <button onClick={() => setDark(prev => !prev)} className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-white/40 hover:text-white/70 hover:bg-white/8' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'}`}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          </div>
        </header>

        <div className="flex items-stretch gap-1.5 w-full">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              disabled={isActive}
              onClick={() => setProviderId(p.id)}
              className={`flex-1 px-3 py-2 text-xs font-semibold tracking-wider rounded-xl transition-all ${
                providerId === p.id
                  ? dark ? 'bg-white/10 text-white shadow-sm' : 'bg-gray-900 text-white shadow-sm'
                  : dark ? 'bg-white/[0.03] text-white/40 hover:text-white/70 hover:bg-white/[0.06]' : 'bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
            >
              {p.shortName}
            </button>
          ))}
        </div>

        {servers.length > 1 && (
          <div className="w-full relative">
            <div className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium rounded-xl transition-colors ${
              dark ? 'bg-white/[0.03] text-white/70 border border-white/[0.06]' : 'bg-gray-100 text-gray-700 border border-gray-200'
            } focus-within:ring-1 focus-within:ring-accent`}>
              <Search size={13} className={`shrink-0 ${dark ? 'text-white/25' : 'text-gray-400'}`} />
              <input
                type="text"
                value={serverSearch}
                onChange={e => { setServerSearch(e.target.value); setServerDropdownOpen(true); }}
                onFocus={() => setServerDropdownOpen(true)}
                placeholder={serversLoading ? 'Loading servers...' : `Search ${servers.length} servers...`}
                disabled={isActive || serversLoading}
                className={`flex-1 bg-transparent outline-none placeholder:text-[10px] ${dark ? 'placeholder-white/20 text-white/80' : 'placeholder-gray-400 text-gray-800'}`}
              />
              {selectedServer && !serverSearch && !serverDropdownOpen && (
                <span className={`text-[10px] truncate max-w-[120px] ${dark ? 'text-white/35' : 'text-gray-400'}`}>
                  {selectedServer.sponsor || selectedServer.name}
                </span>
              )}
            </div>
            {serverDropdownOpen && !isActive && !serversLoading && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setServerDropdownOpen(false)} />
                <div className={`absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-xl border shadow-lg ${
                  dark ? 'bg-[#16161e] border-white/[0.06]' : 'bg-white border-gray-200'
                }`}>
                  {filteredServers.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedServer(s); setServerSearch(''); setServerDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                        selectedServer?.id === s.id
                          ? dark ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-900'
                          : dark ? 'text-white/60 hover:bg-white/[0.04]' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="block truncate">{s.sponsor ? `${s.name} — ${s.sponsor}` : s.name}</span>
                      <span className={`block truncate text-[9px] mt-0.5 ${dark ? 'text-white/20' : 'text-gray-400'}`}>{s.host}</span>
                    </button>
                  ))}
                  {filteredServers.length === 0 && (
                    <div className={`px-3 py-3 text-[10px] text-center ${dark ? 'text-white/25' : 'text-gray-400'}`}>No servers match "{serverSearch}"</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {serversLoading && (
          <span className={`text-[10px] tracking-wider ${dark ? 'text-white/30' : 'text-gray-400'}`}>Loading servers...</span>
        )}

        <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6 items-start">
          <div className="lg:col-span-2 flex flex-col gap-5">
            <div className="relative h-48 sm:h-56 lg:h-60 w-full">
              <div className="absolute inset-0 rounded-xl overflow-hidden">
                <SpeedGraph download={unitMbps ? testData.downloadSamples : testData.downloadSamples.map(s => s / 8)} upload={unitMbps ? testData.uploadSamples : testData.uploadSamples.map(s => s / 8)} packetLoss={testData.packetLoss} dark={dark} unit={unitLabel} />
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Gauge phase={testData.phase} speed={unitMbps ? testData.displaySpeed : testData.displaySpeed / 8} dark={dark} unit={unitLabel} />
              </div>
            </div>

            <div className="flex justify-center lg:justify-start">
              <Button
                color={isActive ? 'danger' : 'accent'}
                size="lg"
                onPress={isActive ? handleAbort : handleStart}
                isDisabled={(!isActive && running) || serversLoading || !selectedServer}
                className="min-w-[180px] h-14 text-base font-semibold tracking-wide rounded-full"
              >
                {isActive ? 'Abort' : testData.phase === 'complete' ? 'Test Again' : 'Start Test'}
              </Button>
            </div>

            {testData.error && (
              <div className={`text-xs font-medium ${dark ? 'text-red-400' : 'text-red-600'} animate-[fade-in_0.3s_ease-out]`}>{testData.error}</div>
            )}

            {resultForReview && <div className="hidden lg:block"><SpeedReview result={resultForReview} dark={dark} dnsInfo={dnsInfo} sensitiveVisible={sensitiveVisible} onToggleSensitive={() => setSensitiveVisible(prev => !prev)} /></div>}
          </div>

          <div className="min-w-0">
            <Card ref={cardRef} variant="transparent" className={`w-full overflow-hidden ${dark ? 'bg-white/[0.012] ring-1 ring-white/[0.03]' : 'bg-white/65 shadow-sm'}`}>
              <Card.Content className="p-0">
                <div className={`flex items-center justify-between px-3 sm:px-4 pb-1 mb-2 border-b ${dark ? 'border-white/[0.04]' : 'border-gray-200'}`}>
                  <span className={`text-[10px] font-semibold ${dark ? 'text-white/25' : 'text-gray-400'} tracking-[0.15em] uppercase`}>Speed Test</span>
                  {testData.phase !== 'idle' && testData.phase !== 'complete' && (
                    <div className="flex gap-3">
                      {testData.dlProgress > 0 && <span className="text-[10px] tabular-nums text-sky-400">DL {Math.round(testData.dlProgress * 100)}%</span>}
                      {testData.ulProgress > 0 && <span className="text-[10px] tabular-nums text-green-400">UL {Math.round(testData.ulProgress * 100)}%</span>}
                    </div>
                  )}
                </div>
                <div className="px-4 pb-4">
                  {row('Download', testData.downloadSpeed > 0 ? `${fmtSpeed(unit(testData.downloadSpeed))} ${unitLabel}` : '--', dark)}
                  {row('Upload', testData.uploadSpeed > 0 ? `${fmtSpeed(unit(testData.uploadSpeed))} ${unitLabel}` : '--', dark)}
                  {row('Ping', testData.ping > 0 ? `${testData.ping.toFixed(1)} ms` : '--', dark)}
                  {row('Jitter', testData.jitter > 0 ? `${testData.jitter.toFixed(1)} ms` : '--', dark)}
                  {testData.phase !== 'idle' && row('Packet Loss', testData.packetLoss > 0 ? `${testData.packetLoss.toFixed(1)}%` : '0%', dark)}
                  {testData.loadedLatency > 0 && row('Loaded Latency', `${testData.loadedLatency.toFixed(1)} ms`, dark)}
                  {testData.serverName && (() => {
                    const paren = testData.serverName.indexOf(' (');
                    if (paren !== -1) {
                      const sub = testData.serverName.slice(0, paren);
                      const main = testData.serverName.slice(paren);
                      return (
                        <div className="flex items-center justify-between py-1.5">
                          <span className={`text-xs ${dark ? 'text-white/35' : 'text-gray-500'} tracking-wider transition-colors duration-200`}>Server</span>
                          <div className="text-right">
                            <div className={`text-sm font-medium ${dark ? 'text-white/70' : 'text-gray-700'} tabular-nums tracking-tight transition-all duration-200`}>{main}</div>
                            <div className={`text-[10px] leading-tight -mt-0.5 ${dark ? 'text-white/30' : 'text-gray-400'}`}>{sub}</div>
                          </div>
                        </div>
                      );
                    }
                    return row('Server', testData.serverName, dark);
                  })()}
                </div>

                {isComplete && (
                  <div className="px-4 pb-4">
                    <div className={`border-t ${dark ? 'border-white/[0.04]' : 'border-gray-200'} mb-3`} />
                    <button
                      onClick={handleShare}
                      className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                        dark ? 'text-white/40 hover:text-white/70' : 'text-gray-400 hover:text-gray-700'
                      }`}
                    >
                      <Share2 size={12} />
                      {copied ? 'Copied to Clipboard' : 'Share Results'}
                    </button>
                  </div>
                )}

                {connInfo && (
                  <>
                    <div className={`mx-2 border-t ${dark ? 'border-white/[0.04]' : 'border-gray-200'}`} />
                    <div className="px-4 pb-4 pt-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Globe size={11} className={dark ? 'text-white/25' : 'text-gray-400'} />
                        <span className={`text-[10px] font-semibold tracking-widest uppercase ${dark ? 'text-white/25' : 'text-gray-400'}`}>Connection</span>
                        <button
                          onClick={() => setSensitiveVisible(prev => !prev)}
                          className={`ml-auto p-0.5 ${dark ? 'text-white/20 hover:text-white/50' : 'text-gray-400 hover:text-gray-600'}`}
                          title={sensitiveVisible ? 'Hide sensitive info' : 'Show sensitive info'}
                        >
                          {sensitiveVisible ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                      {row('IP Address', sensitiveVisible ? connInfo.ip : maskIp(connInfo.ip), dark)}
                      {connInfo.asn && row('ASN', connInfo.asn, dark)}
                      {row('ISP', connInfo.isp, dark)}
                      {(connInfo.city || connInfo.country) && row('Location', [connInfo.city, connInfo.region, connInfo.country].filter(Boolean).join(', '), dark)}
                      {dnsInfo && (() => {
                        const dnsValue = `${dnsInfo.provider} (${sensitiveVisible ? dnsInfo.ip : maskIp(dnsInfo.ip)})`;
                        const paren = dnsValue.indexOf(' (');
                        if (paren !== -1) {
                          const sub = dnsValue.slice(0, paren);
                          const main = dnsValue.slice(paren);
                          return (
                            <div className="flex items-center justify-between py-1.5">
                              <span className={`text-xs ${dark ? 'text-white/35' : 'text-gray-500'} tracking-wider transition-colors duration-200`}>DNS</span>
                              <div className="text-right">
                                <div className={`text-sm font-medium ${dark ? 'text-white/70' : 'text-gray-700'} tabular-nums tracking-tight transition-all duration-200`}>{main}</div>
                                <div className={`text-[10px] leading-tight -mt-0.5 ${dark ? 'text-white/30' : 'text-gray-400'}`}>{sub}</div>
                              </div>
                            </div>
                          );
                        }
                        return row('DNS', dnsValue, dark);
                      })()}
                    </div>

                    <div className={`mx-2 border-t ${dark ? 'border-white/[0.04]' : 'border-gray-200'}`} />
                    <div className="px-4 pb-4 pt-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Monitor size={11} className={dark ? 'text-white/25' : 'text-gray-400'} />
                        <span className={`text-[10px] font-semibold tracking-widest uppercase ${dark ? 'text-white/25' : 'text-gray-400'}`}>Client</span>
                      </div>
                      {row('Browser', connInfo.browser, dark)}
                      {row('Platform', connInfo.platform, dark)}
                    </div>

                    {(connInfo.effectiveType !== 'Unknown' || connInfo.rtt > 0) && (
                      <>
                        <div className={`mx-2 border-t ${dark ? 'border-white/[0.04]' : 'border-gray-200'}`} />
                        <div className="px-4 pb-4 pt-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Activity size={11} className={dark ? 'text-white/25' : 'text-gray-400'} />
                            <span className={`text-[10px] font-semibold tracking-widest uppercase ${dark ? 'text-white/25' : 'text-gray-400'}`}>Network</span>
                          </div>
                          {connInfo.connectionType !== 'Unknown' && row('Connection', fmtConnType(connInfo.connectionType), dark)}
                          {connInfo.effectiveType !== 'Unknown' && row('Effective Type', connInfo.effectiveType.toUpperCase(), dark)}
                          {connInfo.rtt > 0 && row('Browser RTT', `${connInfo.rtt} ms`, dark)}
                          {connInfo.downlink > 0 && row('Browser Downlink', fmtDownlink(connInfo.downlink), dark)}
                        </div>
                      </>
                    )}
                  </>
                )}
              </Card.Content>
            </Card>
          </div>
        </div>

        {resultForReview && <div className="block lg:hidden"><SpeedReview result={resultForReview} dark={dark} dnsInfo={dnsInfo} sensitiveVisible={sensitiveVisible} onToggleSensitive={() => setSensitiveVisible(prev => !prev)} /></div>}

        <div className={`w-full text-center text-[9px] sm:text-[10px] leading-relaxed ${dark ? 'text-white/20' : 'text-gray-400'} tracking-wider`}>
          <p className="mb-3">
            <span className="font-semibold">NetSpeed</span> is a browser-based network speed test toolkit that tests
            your connection against <span className="font-semibold">Cloudflare</span>'s global edge network and
            <span className="font-semibold"> Ookla/Speedtest.net</span> ISP-hosted servers via WebSocket.
            It measures download/upload speed, ping, jitter, and packet loss using parallel streams.
            No data leaves your browser — results are not stored or shared.
          </p>
          <p>
            built by <a href="https://github.com/itsmeadarsh2008" target="_blank" rel="noopener noreferrer" className={`${dark ? 'text-white/30 hover:text-white/60' : 'text-gray-500 hover:text-gray-700'} underline underline-offset-2`}>Adarsh</a> under <span className="font-semibold">NetSpeed</span>
          </p>
        </div>
      </div>
    </div>
  );
}
