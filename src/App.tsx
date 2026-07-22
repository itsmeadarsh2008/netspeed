import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Switch } from '@heroui/react';
import { Activity, Globe, Moon, Monitor, Search, Settings, Sun, X } from 'lucide-react';
import Gauge from './components/Gauge';
import SpeedGraph from './components/SpeedGraph';
import type { TestPhase, SpeedtestUpdate, SpeedtestResult, ProviderServer, SpeedtestSettings } from './lib/speedtest';
import { startSpeedtest, abortSpeedtest, getProviders, getServersForProvider, getUserLocation, rankServersByGeo } from './lib/speedtest';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './lib/settings';
import { fetchConnectionInfo, type ConnectionInfo } from './lib/connection';

const PROVIDERS = getProviders();

function fmtSpeed(value: number): string {
  if (value < 1) return value.toFixed(1);
  if (value < 10) return value.toFixed(1);
  if (value < 1000) return Math.round(value).toString();
  return (value / 1000).toFixed(1);
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

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('netspeed-theme') !== 'light');
  const [showSettings, setShowSettings] = useState(false);
  const [testData, setTestData] = useState<TestData>(INITIAL);
  const [running, setRunning] = useState(false);
  const [settings, setSettings] = useState<SpeedtestSettings>(() => loadSettings());
  const [connInfo, setConnInfo] = useState<ConnectionInfo | null>(null);

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
  settingsRef.current = settings;

  useEffect(() => {
    fetchConnectionInfo().then(setConnInfo);
  }, []);

  const loadServers = useCallback(async (pid: string) => {
    setServersLoading(true);
    setServerSearch('');
    const list = await getServersForProvider(pid);
    if (list.length > 0) {
      let sorted = list;
      if (settingsRef.current.autoSelectServer && list.length > 1) {
        try {
          const userLoc = await getUserLocation();
          sorted = rankServersByGeo(list, userLoc.lat, userLoc.lon);
        } catch {}
      }
      setServers(sorted);
      setSelectedServer(sorted[0]);
    } else {
      setServers([]);
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

  const isActive = testData.phase === 'discovering' || testData.phase === 'ping' || testData.phase === 'download' || testData.phase === 'upload';

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

  return (
    <div className={`min-h-screen ${dark ? 'dark bg-[#0a0a0f]' : 'bg-gray-50'} antialiased font-sans transition-colors`}>
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowSettings(false)}>
          <Card variant={dark ? 'shadow' : 'flat'} className={`w-full max-w-sm max-h-[90vh] overflow-y-auto ${dark ? 'bg-[#12121a]' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <Card.Content className="flex flex-col gap-5 p-5">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold tracking-tight ${dark ? 'text-white' : 'text-gray-900'}`}>Settings</span>
                <button onClick={() => setShowSettings(false)} className={`p-1 ${dark ? 'text-white/40 hover:text-white/70' : 'text-gray-400 hover:text-gray-700'}`}><X size={16} /></button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className={`text-xs font-medium ${dark ? 'text-white/40' : 'text-gray-500'} tracking-wider uppercase`}>Dark Theme</span>
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

      <div className={`${dark ? 'text-white/90' : 'text-gray-900'} w-full max-w-lg mx-auto px-5 py-8 sm:py-10 flex flex-col items-center gap-5`}>
        <header className="w-full flex items-start justify-between">
          <div className="flex flex-col">
            <span className={`flex items-center gap-2 font-semibold tracking-tight ${dark ? 'text-white' : 'text-gray-900'}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                <path d="M14 3L12 10L18 8L8 21L10 14L4 16L14 3Z" fill={dark ? '#00e5ff' : '#0891b2'} stroke={dark ? '#00e5ff' : '#0891b2'} strokeWidth="0.5" strokeLinejoin="round"/>
              </svg>
              NetSpeed
            </span>
            <span className={`text-[10px] tracking-wider mt-0.5 ml-7 ${dark ? 'text-white/25' : 'text-gray-400'}`}>Network Speed Toolkit</span>
          </div>
          <div className="flex items-center gap-2">
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

        <div className="relative h-48 sm:h-56 w-full">
          <div className="absolute inset-0 rounded-xl overflow-hidden">
            <SpeedGraph download={testData.downloadSamples} upload={testData.uploadSamples} packetLoss={testData.packetLoss} dark={dark} />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Gauge phase={testData.phase} speed={testData.displaySpeed} dark={dark} />
          </div>
        </div>

        <Button
          color={isActive ? 'danger' : 'accent'}
          size="lg"
          onPress={isActive ? handleAbort : handleStart}
          isDisabled={(!isActive && running) || serversLoading || !selectedServer}
          className="min-w-[180px] h-14 text-base font-semibold tracking-wide rounded-full"
        >
          {isActive ? 'Abort' : testData.phase === 'complete' ? 'Test Again' : 'Start Test'}
        </Button>

        {testData.error && (
          <div className={`text-xs font-medium ${dark ? 'text-red-400' : 'text-red-600'} text-center max-w-xs animate-[fade-in_0.3s_ease-out]`}>{testData.error}</div>
        )}

        <Card variant="transparent" className={`w-full overflow-hidden ${dark ? 'bg-white/[0.012] ring-1 ring-white/[0.03]' : 'bg-white/65 shadow-sm'}`}>
          <Card.Content className="p-0">
            <div className={`flex items-center justify-between px-2 pb-1 mb-2 border-b ${dark ? 'border-white/[0.04]' : 'border-gray-200'}`}>
              <span className={`text-[10px] font-semibold ${dark ? 'text-white/25' : 'text-gray-400'} tracking-[0.15em] uppercase`}>Speed Test</span>
              {testData.phase !== 'idle' && testData.phase !== 'complete' && (
                <div className="flex gap-3">
                  {testData.dlProgress > 0 && <span className="text-[10px] tabular-nums text-sky-400">DL {Math.round(testData.dlProgress * 100)}%</span>}
                  {testData.ulProgress > 0 && <span className="text-[10px] tabular-nums text-green-400">UL {Math.round(testData.ulProgress * 100)}%</span>}
                </div>
              )}
            </div>
            <div className="px-4 pb-4">
              {row('Download', testData.downloadSpeed > 0 ? `${fmtSpeed(testData.downloadSpeed)} Mbps` : '--', dark)}
              {row('Upload', testData.uploadSpeed > 0 ? `${fmtSpeed(testData.uploadSpeed)} Mbps` : '--', dark)}
              {row('Ping', testData.ping > 0 ? `${testData.ping.toFixed(1)} ms` : '--', dark)}
              {row('Jitter', testData.jitter > 0 ? `${testData.jitter.toFixed(1)} ms` : '--', dark)}
              {testData.phase !== 'idle' && row('Packet Loss', testData.packetLoss > 0 ? `${testData.packetLoss.toFixed(1)}%` : '0%', dark)}
              {testData.serverName && row('Server', testData.serverName, dark)}
            </div>

            {connInfo && (
              <>
                <div className={`mx-2 border-t ${dark ? 'border-white/[0.04]' : 'border-gray-200'}`} />
                <div className="px-4 pb-4 pt-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Globe size={11} className={dark ? 'text-white/25' : 'text-gray-400'} />
                    <span className={`text-[10px] font-semibold tracking-widest uppercase ${dark ? 'text-white/25' : 'text-gray-400'}`}>Connection</span>
                  </div>
                  {row('IP Address', connInfo.ip, dark)}
                  {connInfo.asn && row('ASN', connInfo.asn, dark)}
                  {row('ISP', connInfo.isp, dark)}
                  {(connInfo.city || connInfo.country) && row('Location', [connInfo.city, connInfo.region, connInfo.country].filter(Boolean).join(', '), dark)}
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

        <div className={`flex flex-col items-center text-[10px] ${dark ? 'text-white/20' : 'text-gray-400'} tracking-wider gap-1`}>
          <span>Network Speed Toolkit</span>
          <span className={`mt-1 ${dark ? 'text-white/15' : 'text-gray-400'}`}>Cloudflare | Ookla Speedtest.net</span>
        </div>
      </div>
    </div>
  );
}
