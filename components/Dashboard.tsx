
import React, { useState, useEffect, useRef } from 'react';
import { Mic, StopCircle, Home, Activity, Play, Globe, Layout, ShieldCheck, Zap, Lock, CloudLightning, Wifi, Info, Captions, ExternalLink, Link as LinkIcon, Copy, Monitor, Network, Check, Pause, X, Download, ShieldAlert, Edit2, Clock, Signal, AlertTriangle } from 'lucide-react';
import { Caption, DictionaryEntry, OperationMode, SessionStats, Notification, AudioDevice, UILanguage } from '../types';
import { useTranslation } from '../utils/i18n';
import GlobalSettings from './GlobalSettings'; // Import for direct control if needed

interface DashboardProps {
  isRecording: boolean;
  setIsRecording: (val: boolean) => void;
  captions: Caption[];
  setCaptions: React.Dispatch<React.SetStateAction<Caption[]>>;
  interimText: string;
  setInterimText: (val: string) => void;
  dictionary: DictionaryEntry[];
  mode: OperationMode;
  setMode: (val: OperationMode) => void;
  stats: SessionStats;
  updateStats: (words: number, confidence: number, correction?: string) => void;
  onOpenContext: () => void;
  onEndSession: () => void;
  openObsView: () => void;
  targetLanguage: string;
  setTargetLanguage: (lang: string) => void;
  goHome: () => void;
  notifications: Notification[];
  audioSourceId: string;
  setAudioSourceId: (val: string) => void;
  activeContextName: string | null;
  uiLanguage: UILanguage;
  profanityFilter: boolean;
  currentStream: MediaStream | null; 
  onEditCaption: (id: string, newText: string) => void;
}

// --- Logo Component ---
const BrandLogo = () => (
    <div className="flex items-center gap-2">
        <svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="transform hover:scale-105 transition-transform opacity-90 hover:opacity-100">
            <rect x="8" y="12" width="32" height="6" rx="3" fill="#3A574A" />
            <rect x="8" y="22" width="24" height="6" rx="3" fill="#64947F" />
            <rect x="8" y="32" width="16" height="6" rx="3" fill="#A3C0B0" />
        </svg>
        <div className="flex flex-col leading-none select-none">
            <span className="font-display font-bold text-sm tracking-tight text-forest-dark uppercase">Community Captioner</span>
            <span className="font-bold text-[10px] text-forest-dark opacity-60 ml-0.5">[CC]</span>
        </div>
    </div>
);

// Advanced Dual-Mode Waveform Visualizer
const LiveWaveform = ({ stream, isRecording }: { stream: MediaStream | null, isRecording: boolean }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const rafRef = useRef<number | null>(null);
    
    // History for rolling waveform
    const historyRef = useRef<number[]>(new Array(100).fill(0));

    useEffect(() => {
        if (!stream || !canvasRef.current) return;

        const init = async () => {
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new AudioContext();
            }
            const ctx = audioContextRef.current;
            
            if (sourceRef.current) try { sourceRef.current.disconnect(); } catch(e) {}
            if (analyserRef.current) try { analyserRef.current.disconnect(); } catch(e) {}

            analyserRef.current = ctx.createAnalyser();
            analyserRef.current.smoothingTimeConstant = 0.3; // Responsive
            analyserRef.current.fftSize = 256;
            
            sourceRef.current = ctx.createMediaStreamSource(stream);
            sourceRef.current.connect(analyserRef.current);
            
            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            const canvas = canvasRef.current;
            const canvasCtx = canvas?.getContext('2d');

            if (!canvas || !canvasCtx) return;

            const draw = () => {
                if (!analyserRef.current) return;
                rafRef.current = requestAnimationFrame(draw);

                analyserRef.current.getByteFrequencyData(dataArray);

                // Calculate average volume
                let sum = 0;
                for(let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;
                
                // Boost the visual gain so normal speech (~-20dB) shows up around 50% height
                // Base normalized is 0..1. Multiplying by 2.5 makes 0.2 (typical speech) -> 0.5
                const normalizedVol = Math.min(1.0, (average / 255) * 2.5);

                canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

                if (isRecording) {
                    // MODE 2: ROLLING GAIN HISTORY (Smooth Graph)
                    // Update history
                    historyRef.current.push(normalizedVol);
                    historyRef.current.shift();

                    canvasCtx.lineWidth = 2;
                    canvasCtx.strokeStyle = '#4D7563'; // sage-600
                    canvasCtx.fillStyle = 'rgba(77, 117, 99, 0.2)'; // sage-600 with opacity
                    
                    canvasCtx.beginPath();
                    canvasCtx.moveTo(0, canvas.height);

                    // Draw the area
                    for (let i = 0; i < historyRef.current.length; i++) {
                        const x = (i / historyRef.current.length) * canvas.width;
                        const h = historyRef.current[i] * canvas.height;
                        // Smooth bezier curve effect
                        // Simple line for now for performance
                        canvasCtx.lineTo(x, canvas.height - h);
                    }
                    
                    canvasCtx.lineTo(canvas.width, canvas.height);
                    canvasCtx.closePath();
                    canvasCtx.fill();
                    
                    // Stroke the top line
                    canvasCtx.beginPath();
                    for (let i = 0; i < historyRef.current.length; i++) {
                         const x = (i / historyRef.current.length) * canvas.width;
                         const h = historyRef.current[i] * canvas.height;
                         if (i===0) canvasCtx.moveTo(x, canvas.height - h);
                         else canvasCtx.lineTo(x, canvas.height - h);
                    }
                    canvasCtx.stroke();

                } else {
                    // MODE 1: IDLE VOLUME METER (Bars)
                    const barWidth = (canvas.width / 5) - 2;
                    const meterLevel = normalizedVol; 

                    for (let i = 0; i < 5; i++) {
                         const x = i * (barWidth + 2);
                         const threshold = (i + 1) * 0.2;
                         
                         // Determine height based on overall volume
                         let barHeight = 0;
                         if (meterLevel > threshold - 0.2) {
                             // This segment is active
                             // Calculate partial height if it's the top segment
                             if (meterLevel < threshold) {
                                 barHeight = ((meterLevel - (threshold - 0.2)) / 0.2) * canvas.height;
                             } else {
                                 barHeight = canvas.height;
                             }
                         }
                         
                         // Base style
                         canvasCtx.fillStyle = '#E0E0DC'; // stone-200
                         canvasCtx.fillRect(x, 0, barWidth, canvas.height);

                         // Active style overlay
                         if (barHeight > 0) {
                             canvasCtx.fillStyle = i > 3 ? '#EAB308' : '#4D7563'; // Yellow for peak, Sage for normal
                             canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                         }
                    }
                }
            };

            draw();
        };

        init();

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [stream, isRecording]);

    if (!stream) return <div className="w-24 h-8 bg-stone-100 rounded-lg flex items-center justify-center text-[10px] text-stone-400 font-bold">No Audio</div>;

    return (
        <canvas ref={canvasRef} width={100} height={32} className="rounded-lg bg-stone-50 border border-stone-200" />
    );
};

// Custom Tooltip Component - Positioned Below
const Tooltip: React.FC<{ children: React.ReactNode, text: React.ReactNode }> = ({ children, text }) => (
    <div className="relative group flex items-center justify-center">
        {children}
        <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 w-max max-w-xs px-3 py-2 bg-stone-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl whitespace-normal text-center">
            {text}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-1 border-4 border-transparent border-b-stone-800"></div>
        </div>
    </div>
);

const LinkModal = ({ onClose }: { onClose: () => void }) => {
    const origin = window.location.origin;
    const outputUrl = `${origin}?view=output`;
    const [copied, setCopied] = useState<string|null>(null);

    const copyToClip = (text: string, type: string) => {
        navigator.clipboard.writeText(text);
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl">
                <h3 className="text-xl font-bold font-display mb-2 flex items-center gap-2">
                    <LinkIcon size={20} className="text-sage-500" /> Output URL Selection
                </h3>
                <p className="text-stone-500 mb-6 text-sm">Choose the URL format based on where you are running your broadcast software (OBS, vMix).</p>

                <div className="space-y-4">
                    <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 hover:border-sage-400 transition-colors">
                        <div className="flex items-center gap-3 mb-2">
                            <Monitor size={18} className="text-stone-400" />
                            <span className="font-bold text-stone-700">Same Machine</span>
                            <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Fastest</span>
                        </div>
                        <div className="flex gap-2">
                            <input readOnly value={outputUrl} className="flex-1 text-xs bg-white border border-stone-200 rounded p-2 text-stone-500 font-mono" />
                            <button onClick={() => copyToClip(outputUrl, 'local')} className="p-2 bg-stone-200 hover:bg-forest-dark hover:text-white rounded transition-colors">
                                {copied === 'local' ? <Check size={16} /> : <Copy size={16} />}
                            </button>
                        </div>
                    </div>

                    <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 hover:border-sage-400 transition-colors">
                        <div className="flex items-center gap-3 mb-2">
                            <Network size={18} className="text-stone-400" />
                            <span className="font-bold text-stone-700">Same Network (LAN)</span>
                        </div>
                        <p className="text-xs text-stone-500 mb-2">Replace <span className="font-mono bg-white px-1">localhost</span> with your computer's IP (e.g., 192.168.1.5)</p>
                        <div className="flex gap-2">
                             <input readOnly value={outputUrl.replace('localhost', '[YOUR-IP-ADDRESS]')} className="flex-1 text-xs bg-white border border-stone-200 rounded p-2 text-stone-500 font-mono" />
                             <button onClick={() => copyToClip(outputUrl.replace('localhost', 'YOUR_IP_HERE'), 'net')} className="p-2 bg-stone-200 hover:bg-forest-dark hover:text-white rounded transition-colors">
                                {copied === 'net' ? <Check size={16} /> : <Copy size={16} />}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-forest-dark text-white font-bold rounded-lg hover:bg-forest-light">Close</button>
                </div>
            </div>
        </div>
    );
};

const Dashboard: React.FC<DashboardProps> = ({
  isRecording,
  setIsRecording,
  captions,
  setCaptions,
  interimText,
  mode,
  setMode,
  stats,
  updateStats,
  onOpenContext,
  onEndSession,
  openObsView,
  targetLanguage,
  setTargetLanguage,
  goHome,
  audioSourceId,
  setAudioSourceId,
  activeContextName,
  uiLanguage,
  profanityFilter,
  currentStream,
  onEditCaption,
  notifications
}) => {
  const t = useTranslation(uiLanguage);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showCorrections, setShowCorrections] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  
  // Settings Trigger Logic
  const [openSettingsTab, setOpenSettingsTab] = useState<'cloud' | 'local' | null>(null);

  // Audio Device Enumeration
  useEffect(() => {
    const getDevices = async () => {
        try {
            const permStream = await navigator.mediaDevices.getUserMedia({ audio: true }); 
            permStream.getTracks().forEach(track => track.stop());
            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices.filter(d => d.kind === 'audioinput').map(d => ({
                deviceId: d.deviceId,
                label: d.label || `Microphone ${d.deviceId.slice(0, 5)}...`
            }));
            setAudioDevices(inputs);
            if (inputs.length > 0 && !audioSourceId) {
                setAudioSourceId(inputs[0].deviceId);
            }
        } catch (err) {
            console.error("Error fetching audio devices", err);
        }
    };
    getDevices();
  }, []);

  // Preview Stream Management for Volume Meter
  useEffect(() => {
    if (isRecording) {
        if (previewStream) {
            previewStream.getTracks().forEach(t => t.stop());
            setPreviewStream(null);
        }
        return;
    }

    let localStream: MediaStream | null = null;
    let active = true;

    const startPreview = async () => {
        if (!audioSourceId) return;
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: audioSourceId } }
            });
            if (active) {
                setPreviewStream(localStream);
            } else {
                localStream.getTracks().forEach(t => t.stop());
            }
        } catch (e) {
            console.warn("Preview stream failed", e);
        }
    };

    startPreview();

    return () => {
        active = false;
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
        }
        setPreviewStream(null);
    };
  }, [audioSourceId, isRecording]);

  useEffect(() => {
    if (scrollRef.current && !editingId) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [captions, interimText, editingId]);

  const handleModeSwitch = (newMode: OperationMode) => {
      if (isRecording) return;
      
      const apiKey = localStorage.getItem('cc_api_key') || process.env.API_KEY;
      const localUrl = localStorage.getItem('cc_local_url') || 'ws://localhost:9000';

      // 1. Cloud / Resilience Requirements
      if (newMode === 'cloud' || newMode === 'resilience') {
          if (!apiKey) {
              const confirm = window.confirm("This mode requires a Google Gemini API Key.\n\nOpen Settings to configure it now?");
              if (confirm) setOpenSettingsTab('cloud');
              return;
          }
          setMode(newMode); // Safe to switch if key exists
          return;
      }

      // 2. Local Requirements - STRICT CHECK
      if (newMode === 'local') {
          // Check server status
          const ws = new WebSocket(localUrl);
          let isOpen = false;
          
          ws.onopen = () => {
             isOpen = true;
             ws.close();
             setMode(newMode); // Server is alive, safe to switch.
          };
          
          ws.onerror = () => {
             if (isOpen) return; // ignore if already opened
             const confirm = window.confirm(
                 `Could not connect to Local Server at ${localUrl}.\n\n` + 
                 `To use Local Mode, you must run the specialized server application (see User Guide).\n\n` + 
                 `Open the Setup Guide now?`
             );
             if (confirm) {
                 setOpenSettingsTab('local'); // Open guide
             }
             // CRITICAL: Do NOT switch mode. Strict privacy enforcement.
          };
          
          return;
      }

      // 3. Balanced (Browser)
      setMode(newMode);
  };

  const MetricCard = ({ label, value, colorClass, icon: Icon }: any) => (
      <Tooltip text={`Real-time statistic for ${label}`}>
          <div className="flex flex-col items-start px-4 border-r border-stone-100 last:border-0 cursor-help min-w-[100px]">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  {Icon && <Icon size={10} />} {label}
              </span>
              <span className={`text-xl font-display font-bold leading-none transition-colors duration-300 ${colorClass}`}>{value}</span>
          </div>
      </Tooltip>
  );

  const formatDuration = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const lastNotification = notifications.length > 0 ? notifications[notifications.length - 1] : null;
  const activeStream = isRecording ? currentStream : previewStream;

  return (
    <div className="flex flex-col h-full bg-cream relative">

      {/* Top Bar */}
      <div className="h-24 border-b border-stone-200 bg-white/90 backdrop-blur flex items-center justify-between px-8 shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-6">
          <Tooltip text="Return to the main landing page">
              <button onClick={goHome} className="p-2 hover:bg-stone-100 rounded-xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center">
                <BrandLogo />
              </button>
          </Tooltip>
          
          <div id="metrics" className="hidden lg:flex items-center bg-stone-50 rounded-xl p-2 border border-stone-100 shadow-inner">
               <MetricCard 
                    label="Duration" 
                    value={formatDuration(stats.durationSeconds)} 
                    colorClass="text-stone-800"
                    icon={Clock}
                />
               <MetricCard 
                    label={t.latency} 
                    value={`${stats.latencyMs}ms`} 
                    colorClass={stats.latencyMs > 400 ? "text-red-500 animate-pulse" : "text-stone-800"} 
                    icon={Signal}
               />
               <MetricCard 
                    label={t.wpm} 
                    value={`${stats.wpmHistory.length > 0 ? Math.round(stats.wpmHistory[stats.wpmHistory.length - 1].wpm) : 0}`} 
                    colorClass="text-stone-800" 
               />
               <MetricCard 
                    label={t.confidence} 
                    value={`${(stats.averageConfidence * 100).toFixed(0)}%`} 
                    colorClass={stats.averageConfidence > 0.9 ? "text-green-600" : "text-yellow-600"} 
               />
          </div>
        </div>

        <div className="flex items-center gap-6">
           
           <div className="flex flex-col items-end gap-1">
                <Tooltip text="Manage dictionary definitions, scrape websites for context, and configure engine settings.">
                    <button id="context-btn" onClick={onOpenContext} className="flex items-center gap-2 px-4 py-2 bg-sage-50 hover:bg-sage-100 text-forest-dark text-xs font-bold rounded-lg border border-sage-200 transition-colors shadow-sm">
                        <ShieldCheck size={14} /> Context Engine
                    </button>
                </Tooltip>
                
                {activeContextName && (
                    <Tooltip text="Click to view corrections log">
                        <button onClick={() => setShowCorrections(!showCorrections)} className="flex items-center gap-1.5 bg-white text-forest-dark px-2 py-1 rounded border border-stone-200 text-[10px] font-bold hover:bg-stone-50 transition-colors shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="max-w-[100px] truncate">{activeContextName}</span>
                            <span className="bg-sage-100 text-forest-dark px-1 rounded text-[9px] ml-1">{stats.correctionsMade}</span>
                        </button>
                    </Tooltip>
                )}
           </div>

           <div id="output-btn" className="hidden md:flex items-center gap-2 bg-stone-100 rounded-xl p-1.5 border border-stone-200">
              <div className="px-2 flex items-center gap-1 border-r border-stone-300/50">
                  <Globe size={14} className="text-stone-500" />
                  <select 
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className="bg-transparent text-xs font-bold text-stone-700 outline-none cursor-pointer py-1 w-20"
                  >
                      <option value="en">English</option>
                      <option value="es">Español</option>
                      <option value="fr">Français</option>
                  </select>
              </div>
              <Tooltip text="Generate a URL for OBS or vMix">
                  <button onClick={() => setShowLinkModal(true)} className="p-2 hover:bg-white text-stone-600 rounded-lg transition-all shadow-sm">
                    <LinkIcon size={16} />
                  </button>
              </Tooltip>
              <Tooltip text="Configure size, font, and colors of the output">
                  <button onClick={openObsView} className="flex items-center gap-2 px-4 py-1.5 hover:bg-white text-xs font-bold text-stone-600 rounded-lg transition-all shadow-sm">
                    <Layout size={16} /> Caption Settings + Output
                  </button>
              </Tooltip>
           </div>
           
          <Tooltip text="Pauses the recording (Stop) or Finishes the session completely.">
             <button 
                onClick={() => isRecording ? setIsRecording(false) : setIsRecording(true)} 
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-lg transform hover:-translate-y-0.5 ${isRecording ? 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100' : 'bg-forest-dark text-white hover:bg-forest-light'}`}
             >
                {isRecording ? <><Pause size={20} /> Stop</> : <><Play size={20} /> Start</>}
             </button>
          </Tooltip>

          <Tooltip text="End current session and view analytics.">
            <button 
                onClick={onEndSession}
                className="flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-all shadow-sm"
            >
                <Download size={20} /> End
            </button>
          </Tooltip>

        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Corrections Sidebar (Conditional) */}
        {showCorrections && (
            <div className="w-80 bg-white border-r border-stone-200 absolute left-0 top-0 bottom-0 z-20 shadow-2xl animate-slide-right flex flex-col">
                <div className="p-4 border-b border-stone-200 flex justify-between items-center bg-stone-50">
                    <h3 className="font-bold text-forest-dark flex items-center gap-2"><ShieldCheck size={16} /> Corrections Log</h3>
                    <button onClick={() => setShowCorrections(false)}><X size={16} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {stats.recentCorrections.map((c, i) => (
                        <div key={i} className="text-xs bg-sage-50 p-3 rounded-lg border border-sage-100 font-mono text-stone-700">
                            {c}
                        </div>
                    ))}
                    {stats.recentCorrections.length === 0 && <p className="text-stone-400 text-xs italic text-center mt-10">No corrections yet.</p>}
                </div>
            </div>
        )}

        {/* Caption Feed */}
        <div className={`flex-1 flex flex-col p-8 overflow-hidden relative ${targetLanguage !== 'en' ? 'grid grid-cols-2 gap-8' : ''}`}>
          
          {/* Notification Banner */}
          {lastNotification && Date.now() - lastNotification.timestamp < 4000 && (
             <div 
                onClick={() => setShowCorrections(true)}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-forest-dark text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 cursor-pointer animate-slide-down hover:scale-105 transition-transform"
             >
                 <ShieldCheck size={18} className="text-sage-300" />
                 <div>
                     <span className="text-xs font-bold text-sage-300 block uppercase tracking-wider">Context Engine Active</span>
                     <span className="text-sm font-medium">{lastNotification.message}</span>
                 </div>
             </div>
          )}

          {/* Column 1: Original */}
          <div className="flex flex-col h-full relative">
               {targetLanguage !== 'en' && <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-2">Original (English)</h3>}
               
               <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-4 pb-32 custom-scrollbar">
                    {captions.length === 0 && !interimText && (
                        <div className="h-full flex flex-col items-center justify-center text-stone-400 select-none">
                            <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 transition-all duration-500 ${isRecording ? 'bg-red-50 scale-110 shadow-red-100 shadow-xl' : 'bg-white shadow-sm'}`}>
                                <Mic size={40} className={`transition-colors duration-300 ${isRecording ? "text-red-500" : "text-stone-300"}`} />
                            </div>
                            {isRecording ? (
                                 <p className="text-3xl font-display font-bold text-forest-dark mb-2 animate-pulse">Listening...</p>
                            ) : (
                                <div className="text-center">
                                     <p className="text-4xl sm:text-5xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-forest-dark via-sage-500 to-forest-dark bg-300% animate-gradient mb-2 pb-2">
                                        Ready to caption<span className="text-sage-500 animate-pulse">|</span>
                                     </p>
                                     <p className="text-sm text-stone-400">Click 'Start' to begin</p>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {captions.map((cap) => (
                        <div key={cap.id} className="group relative p-4 rounded-2xl hover:bg-white transition-all border border-transparent hover:border-stone-100 hover:shadow-sm">
                            <div 
                                contentEditable={editingId === cap.id}
                                onBlur={(e) => {
                                    onEditCaption(cap.id, e.currentTarget.textContent || "");
                                    setEditingId(null);
                                }}
                                suppressContentEditableWarning
                                className={`text-2xl leading-relaxed font-medium outline-none ${cap.corrected ? 'text-forest-dark' : 'text-stone-800'} ${editingId === cap.id ? 'bg-stone-50 p-2 rounded ring-2 ring-sage-400' : ''}`}
                            >
                                {cap.text}
                            </div>
                            
                            <button 
                                onClick={() => setEditingId(cap.id)}
                                className="absolute top-2 right-2 text-stone-300 hover:text-forest-dark opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Edit2 size={16} />
                            </button>
                        </div>
                    ))}
                    {interimText && (
                        <div className="p-4 bg-white/50 border-2 border-dashed border-stone-200 rounded-2xl animate-pulse">
                            <p className="text-2xl leading-relaxed text-stone-400 font-medium">{interimText}</p>
                        </div>
                    )}
               </div>
          </div>

          {/* Column 2: Translated (if active) */}
          {targetLanguage !== 'en' && (
              <div className="flex flex-col h-full border-l border-stone-200 pl-8">
                  <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-2">Translated ({targetLanguage.toUpperCase()})</h3>
                  <div className="flex-1 overflow-y-auto space-y-4 pr-4 pb-32 custom-scrollbar">
                       {captions.map((cap) => (
                           <div key={`trans-${cap.id}`} className="p-4 rounded-2xl hover:bg-sage-50 transition-all">
                               <p className="text-2xl leading-relaxed font-medium text-forest-dark">
                                   {cap.translatedText || <span className="opacity-30 animate-pulse">...</span>}
                               </p>
                           </div>
                       ))}
                  </div>
              </div>
          )}
          
          {/* Controls Bar */}
          <div className="absolute bottom-8 left-8 right-8 flex justify-center z-10 pointer-events-none">
             <div className="bg-white/90 backdrop-blur-md border border-stone-200 rounded-2xl p-3 shadow-2xl flex items-center gap-4 pointer-events-auto">
                
                <Tooltip text="Select Audio Source">
                    <div className="flex items-center gap-3 px-3">
                        <LiveWaveform stream={activeStream} isRecording={isRecording} />
                        <select 
                            value={audioSourceId} 
                            onChange={(e) => setAudioSourceId(e.target.value)}
                            className="text-sm font-bold text-stone-700 bg-transparent outline-none max-w-[200px] truncate cursor-pointer"
                            disabled={isRecording}
                        >
                            {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                        </select>
                    </div>
                </Tooltip>
                
                <div className="w-px h-10 bg-stone-200"></div>

                <div className="flex items-center gap-2 bg-stone-50 rounded-xl px-2 py-1">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider px-2">Mode</label>
                    <div className="flex items-center gap-1">
                        {(['balanced', 'local', 'resilience', 'cloud'] as OperationMode[]).map((m) => (
                            <Tooltip 
                                key={m} 
                                text={
                                    m === 'local' 
                                    ? <span className="text-left block"><b>Local Mode</b><br/>Privacy First. Runs entirely on-device.<br/><i>Pros: No Data leaves network.</i><br/><i>Cons: Requires Local Server.</i></span> 
                                    : m === 'cloud' 
                                    ? <span className="text-left block"><b>Cloud Mode</b><br/>Uses Gemini 1.5 Flash API.<br/><i>Pros: High Accuracy, Context Aware.</i><br/><i>Cons: Costs money, requires Internet.</i></span> 
                                    : m === 'resilience'
                                    ? <span className="text-left block"><b>Resilience Mode</b><br/>Starts with Browser. Falls back to Cloud on error.<br/><i>Pros: Maximum Uptime.</i></span>
                                    : <span className="text-left block"><b>Balanced Mode</b><br/>Standard Browser API Mode.<br/><i>Best for general use.</i></span>
                                }
                            >
                                <button 
                                    onClick={() => handleModeSwitch(m)}
                                    className={`p-2.5 rounded-lg transition-all ${mode === m ? 'bg-white shadow-md text-forest-dark ring-1 ring-stone-200' : 'text-stone-400 hover:bg-stone-100'}`}
                                >
                                    {m === 'balanced' && <Zap size={20} />}
                                    {m === 'cloud' && <Wifi size={20} />}
                                    {m === 'local' && <Lock size={20} />}
                                    {m === 'resilience' && <ShieldAlert size={20} />}
                                </button>
                            </Tooltip>
                        ))}
                    </div>
                </div>
             </div>
          </div>
        </div>
      </div>
      
      {showLinkModal && <LinkModal onClose={() => setShowLinkModal(false)} />}
      
      {/* Auto-Open Settings Modal for Configuration */}
      <GlobalSettings 
        isOpen={!!openSettingsTab}
        onClose={() => setOpenSettingsTab(null)}
        initialTab={openSettingsTab === 'cloud' ? 'cloud' : 'local'}
        appState={{...stats, ...{apiKey: localStorage.getItem('cc_api_key'), localServerUrl: localStorage.getItem('cc_local_url')}} as any} 
        setAppState={() => {}} // Dummy as we rely on localStorage persistence inside GlobalSettings for this flow
      />
    </div>
  );
};

export default Dashboard;
