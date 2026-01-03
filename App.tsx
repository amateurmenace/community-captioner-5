
import React, { useState, useEffect, useCallback, useRef } from 'react';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import Analytics from './components/Analytics';
import ContextEngine from './components/ContextEngine';
import Overlay from './components/Overlay';
import OutputSettings from './components/OutputSettings';
import PrerecordedStudio from './components/PrerecordedStudio';
import GlobalSettings from './components/GlobalSettings';
import { AppState, Caption, DictionaryEntry, UILanguage, SessionStats, Session, ContextSettings } from './types';
import { Mic, FileVideo, Settings, Loader2 } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { translateText } from './services/geminiService';

// --- Helper Functions for Audio ---
function base64Encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function createPcmBlob(data: Float32Array): { data: string, mimeType: string } {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        const s = Math.max(-1, Math.min(1, data[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return {
        data: base64Encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
}

const initialStats: SessionStats = {
    durationSeconds: 0,
    totalWords: 0,
    averageConfidence: 0.95,
    confidenceHistory: [],
    correctionsMade: 0,
    wpmHistory: [],
    recentCorrections: [],
    systemHealth: 'healthy',
    latencyMs: 150,
    modeSwitches: []
};

function App() {
  // Initialize state with keys from localStorage if available
  const [appState, setAppState] = useState<AppState>({
    view: 'landing',
    isRecording: false,
    captions: [],
    interimText: '',
    dictionary: [],
    stats: initialStats,
    mode: 'balanced',
    audioSourceId: '',
    targetLanguage: 'en',
    outputMode: 'browser_overlay',
    overlaySettings: {
        fontFamily: 'sans-serif',
        fontSize: 36,
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.8)',
        x: 5,
        y: 80,
        width: 90,
        maxLines: 2,
        textAlign: 'center'
    },
    learningEnabled: true,
    notifications: [],
    activeContextName: null,
    profanityFilter: false,
    partialResults: true,
    speakerLabels: false,
    uiLanguage: 'en',
    pastSessions: [],
    contextSettings: { sensitivity: 80, acronymExpansion: true, dialect: 'general' },
    // Load config
    apiKey: localStorage.getItem('cc_api_key') || process.env.API_KEY || '',
    localServerUrl: localStorage.getItem('cc_local_url') || 'ws://localhost:9000'
  });

  const [showContextModal, setShowContextModal] = useState(false);
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [localModelLoaded, setLocalModelLoaded] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  
  // Audio Refs
  const recognitionRef = useRef<any>(null);
  const geminiContextRef = useRef<AudioContext | null>(null);
  const [currentStream, setCurrentStream] = useState<MediaStream | null>(null);
  const dictionaryRef = useRef(appState.dictionary);
  const targetLanguageRef = useRef(appState.targetLanguage);
  const profanityRef = useRef(appState.profanityFilter);
  const activeModeRef = useRef(appState.mode);
  
  // Resilience Strategy Tracker
  const resilienceStrategyRef = useRef<'browser' | 'cloud' | 'local'>('browser');

  // Sync refs
  useEffect(() => { dictionaryRef.current = appState.dictionary; }, [appState.dictionary]);
  useEffect(() => { targetLanguageRef.current = appState.targetLanguage; }, [appState.targetLanguage]);
  useEffect(() => { profanityRef.current = appState.profanityFilter; }, [appState.profanityFilter]);
  useEffect(() => { activeModeRef.current = appState.mode; }, [appState.mode]);

  // Check for OBS/Overlay URL parameters on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'output') {
        setAppState(prev => ({ ...prev, view: 'caption_output' }));
    }
  }, []);

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (appState.isRecording) {
      interval = setInterval(() => {
        setAppState(prev => {
            const lastWpm = prev.stats.wpmHistory.length > 0 ? prev.stats.wpmHistory[prev.stats.wpmHistory.length - 1].wpm : 0;
            const newLatency = Math.floor(100 + Math.random() * 200);
            return {
                ...prev,
                stats: {
                    ...prev.stats,
                    durationSeconds: prev.stats.durationSeconds + 1,
                    wpmHistory: prev.stats.durationSeconds % 5 === 0 
                      ? [...prev.stats.wpmHistory, { time: prev.stats.durationSeconds, wpm: lastWpm }]
                      : prev.stats.wpmHistory,
                    latencyMs: newLatency
                }
            };
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [appState.isRecording]);

  const setCaptions = useCallback((val: Caption[] | ((prev: Caption[]) => Caption[])) => {
      setAppState(prev => ({ ...prev, captions: typeof val === 'function' ? val(prev.captions) : val }));
  }, []);

  const setDictionary = useCallback((val: DictionaryEntry[] | ((prev: DictionaryEntry[]) => DictionaryEntry[])) => {
      setAppState(prev => ({ ...prev, dictionary: typeof val === 'function' ? val(prev.dictionary) : val }));
  }, []);

  const updateStats = useCallback((newWordCount: number, confidence: number, correctionDetail?: string) => {
      setAppState(prev => {
          const totalConfidence = (prev.stats.averageConfidence * prev.captions.length) + confidence;
          const newAvg = totalConfidence / (prev.captions.length + 1);
          const currentWpm = newWordCount * 12; 
          
          let newNotifications = [...prev.notifications];
          if (correctionDetail) {
             newNotifications.push({ id: Date.now().toString(), message: `Fixed: ${correctionDetail}`, type: 'correction', timestamp: Date.now() });
          }

          const newRecentCorrections = correctionDetail ? [`${correctionDetail}`, ...prev.stats.recentCorrections].slice(0, 10) : prev.stats.recentCorrections;
          return {
              ...prev,
              stats: {
                  ...prev.stats,
                  totalWords: prev.stats.totalWords + newWordCount,
                  averageConfidence: newAvg,
                  confidenceHistory: [...prev.stats.confidenceHistory, { time: prev.stats.durationSeconds, score: newAvg }],
                  correctionsMade: correctionDetail ? prev.stats.correctionsMade + 1 : prev.stats.correctionsMade,
                  wpmHistory: [...prev.stats.wpmHistory, { time: prev.stats.durationSeconds, wpm: currentWpm }],
                  recentCorrections: newRecentCorrections,
                  systemHealth: newAvg < 0.7 ? 'degraded' : 'healthy'
              },
              notifications: newNotifications
          };
      });
  }, []);

  const handleEditCaption = (id: string, newText: string) => {
    setAppState(prev => ({
        ...prev,
        captions: prev.captions.map(c => c.id === id ? { ...c, text: newText, isFinal: true, corrected: true } : c)
    }));
  };

  const processText = (text: string): { final: string, detail: string | null } => {
    let processed = text;
    let detail = null;

    const sortedDict = [...dictionaryRef.current].sort((a, b) => b.original.length - a.original.length);
    for (const entry of sortedDict) {
        const escapedOriginal = entry.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedOriginal}\\b`, 'gi');
        if (regex.test(processed)) {
            processed = processed.replace(regex, entry.replacement);
            detail = `${entry.original} → ${entry.replacement}`;
        }
    }

    if (profanityRef.current) {
        const badWords = ['damn', 'hell', 'crap', 'shit', 'fuck'];
        const pattern = new RegExp(`\\b(${badWords.join('|')})\\b`, 'gi');
        processed = processed.replace(pattern, '***');
    }

    return { final: processed, detail };
  };

  const finalizeCaption = (text: string, confidence: number = 0.95) => {
        const { final, detail } = processText(text);
        const newCaption: Caption = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            text: final,
            timestamp: Date.now(),
            confidence: confidence,
            isFinal: true,
            corrected: !!detail
        };

        if (targetLanguageRef.current !== 'en') {
            translateText(final, targetLanguageRef.current, appState.apiKey).then(t => {
                 setCaptions(prev => prev.map(c => c.id === newCaption.id ? { ...c, translatedText: t } : c));
            });
        }

        setCaptions(prev => [...prev, newCaption]);
        updateStats(final.split(' ').length, confidence, detail || undefined);
        setAppState(prev => ({...prev, interimText: ''}));
  };

  // --- RECORDING LOGIC ---
  useEffect(() => {
    let mounted = true;
    let stream: MediaStream | null = null;
    let audioProcessor: ScriptProcessorNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let geminiSessionPromise: Promise<any> | null = null;
    let recognition: any = null;
    let localWs: WebSocket | null = null;
    
    const cleanup = () => {
        if (stream) stream.getTracks().forEach(t => t.stop());
        if (audioProcessor) {
            audioProcessor.disconnect();
            audioProcessor.onaudioprocess = null;
        }
        if (source) source.disconnect();
        if (geminiContextRef.current) {
            geminiContextRef.current.close();
            geminiContextRef.current = null;
        }
        if (recognitionRef.current) {
            recognitionRef.current.onend = null;
            recognitionRef.current.onerror = null;
            try { recognitionRef.current.stop(); } catch(e) {}
            recognitionRef.current = null;
        }
        if (localWs) {
             localWs.close();
        }
        if (mounted) {
            setCurrentStream(null);
            setAppState(p => ({...p, interimText: ''}));
        }
    };

    if (!appState.isRecording) {
        cleanup();
        resilienceStrategyRef.current = 'browser'; // Reset strategy on stop
        return;
    }

    // Determine strategy based on Mode
    let strategy = 'browser'; // default
    if (appState.mode === 'cloud') strategy = 'cloud';
    else if (appState.mode === 'local') strategy = 'local';
    else if (appState.mode === 'resilience') strategy = resilienceStrategyRef.current; 

    const startRecording = async () => {
        // --- 1. LOCAL MODE (WebSocket to Whisper Server) ---
        if (strategy === 'local') {
             if (!appState.localServerUrl) {
                 alert("Local Server URL missing.");
                 setAppState(p => ({...p, isRecording: false}));
                 return;
             }
             
             try {
                 // Connect Audio
                 stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: appState.audioSourceId } });
                 if (!mounted) return;
                 setCurrentStream(stream);

                 // Connect WS
                 const ws = new WebSocket(appState.localServerUrl);
                 ws.binaryType = 'arraybuffer';
                 localWs = ws;
                 
                 ws.onopen = () => {
                     console.log("Local Whisper Connected");
                     const ctx = new AudioContext({ sampleRate: 16000 });
                     source = ctx.createMediaStreamSource(stream!);
                     audioProcessor = ctx.createScriptProcessor(4096, 1, 1);
                     
                     audioProcessor.onaudioprocess = (e) => {
                         if (ws.readyState === 1) {
                             const data = e.inputBuffer.getChannelData(0);
                             // Convert to 16-bit PCM for standard whisper.cpp server expectation
                             const pcm = new Int16Array(data.length);
                             for (let i = 0; i < data.length; i++) {
                                 pcm[i] = Math.max(-1, Math.min(1, data[i])) * 0x7FFF;
                             }
                             ws.send(pcm.buffer);
                         }
                     };
                     
                     source.connect(audioProcessor);
                     audioProcessor.connect(ctx.destination);
                     geminiContextRef.current = ctx; // reuse ref for cleanup
                 };
                 
                 ws.onmessage = (e) => {
                     try {
                         const data = JSON.parse(e.data);
                         if (data.text) {
                              finalizeCaption(data.text);
                         }
                     } catch (err) { console.error(err); }
                 };

                 ws.onerror = (e) => {
                     console.error("Local Server Error", e);
                     alert("Connection to Local Whisper Server failed.\n\nEnsure the server is running on port 9000 (or your configured port).");
                     setAppState(p => ({...p, isRecording: false}));
                 };

                 ws.onclose = () => {
                     console.log("Local Server Closed");
                 };

             } catch (e) {
                 alert("Microphone access failed or System Error.");
                 setAppState(p => ({...p, isRecording: false}));
             }
             // CRITICAL: Return here to ensure no fallback to other modes.
             return; 
        }

        // --- 2. CLOUD MODE (Gemini) ---
        if (strategy === 'cloud') {
            try {
                // Use Key from State (User Input) or Env
                const apiKey = appState.apiKey; 

                if (!apiKey) {
                    if (appState.mode === 'resilience') {
                        console.warn("Cloud failed (No Key), falling back to Local");
                        resilienceStrategyRef.current = 'browser'; // Fallback to browser, not local
                        startRecording(); 
                        return;
                    }
                    // Prompt user to enter key
                    alert("No API Key found. Please enter one in Settings > Cloud Access.");
                    setAppState(p => ({...p, isRecording: false}));
                    setShowGlobalSettings(true);
                    return;
                }

                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: appState.audioSourceId ? { exact: appState.audioSourceId } : undefined,
                        channelCount: 1,
                        sampleRate: 16000, 
                    }
                });
                if (!mounted) { cleanup(); return; }
                setCurrentStream(stream);

                const ai = new GoogleGenAI({ apiKey: apiKey });
                geminiSessionPromise = ai.live.connect({
                    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                    config: {
                        responseModalities: [Modality.AUDIO], 
                        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                        inputAudioTranscription: {}, 
                    },
                    callbacks: {
                        onopen: () => { console.log('Gemini Live Connected'); },
                        onmessage: (msg: LiveServerMessage) => {
                            if (!mounted) return;
                            const content = msg.serverContent;
                            if (content?.inputTranscription?.text) {
                                setAppState(prev => {
                                    const newVal = prev.interimText + content.inputTranscription.text;
                                    if (newVal.length > 5 && newVal.match(/[.!?]$/)) {
                                        finalizeCaption(newVal, 1.0);
                                        return {...prev, interimText: ''};
                                    }
                                    return {...prev, interimText: newVal};
                                });
                            }
                            if (content?.turnComplete) {
                                setAppState(prev => {
                                    if (prev.interimText.trim()) finalizeCaption(prev.interimText, 1.0);
                                    return {...prev, interimText: ''}; 
                                });
                            }
                        },
                        onclose: () => { console.log('Gemini Live Closed'); },
                        onerror: (err) => { 
                             console.error('Gemini Live Error', err);
                             if (appState.mode === 'resilience') {
                                 cleanup();
                                 resilienceStrategyRef.current = 'browser'; // Fallback
                                 setAppState(p => ({
                                     ...p,
                                     notifications: [...p.notifications, { id: Date.now().toString(), message: `Cloud failed, switching to Browser`, type: 'mode_switch', timestamp: Date.now() }]
                                 }));
                                 startRecording();
                             } else {
                                 alert("Cloud Connection Lost.");
                                 setAppState(p => ({...p, isRecording: false}));
                             }
                        }
                    }
                });

                geminiContextRef.current = new AudioContext({ sampleRate: 16000 });
                source = geminiContextRef.current.createMediaStreamSource(stream);
                audioProcessor = geminiContextRef.current.createScriptProcessor(4096, 1, 1);
                
                audioProcessor.onaudioprocess = (e) => {
                    const inputData = e.inputBuffer.getChannelData(0);
                    const pcmBlob = createPcmBlob(inputData);
                    if (geminiSessionPromise) {
                         geminiSessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                    }
                };

                source.connect(audioProcessor);
                audioProcessor.connect(geminiContextRef.current.destination);
                
            } catch (err) {
                console.error(err);
                if (appState.mode === 'resilience') {
                     resilienceStrategyRef.current = 'browser';
                     startRecording();
                } else {
                    setAppState(p => ({...p, isRecording: false}));
                }
            }
            return;
        } 
        
        // --- 3. BROWSER / LOCAL (WebSpeech) ---
        try {
            if (!('webkitSpeechRecognition' in window)) {
                alert("Web Speech API not supported.");
                setAppState(p => ({...p, isRecording: false}));
                return;
            }

            stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: appState.audioSourceId ? { exact: appState.audioSourceId } : undefined }
            });
            if (!mounted) { cleanup(); return; }
            setCurrentStream(stream);

            const SpeechRecognition = (window as any).webkitSpeechRecognition;
            recognition = new SpeechRecognition();
            recognition.continuous = true; 
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => { console.log("WebSpeech Started"); };
            
            recognition.onerror = (event: any) => {
                console.error("WebSpeech Error", event.error);
                if (appState.mode === 'resilience' && event.error !== 'no-speech' && event.error !== 'aborted') {
                    cleanup();
                    resilienceStrategyRef.current = 'cloud';
                    setAppState(p => ({
                        ...p,
                        notifications: [...p.notifications, { id: Date.now().toString(), message: `Browser failed (${event.error}), switching to Cloud`, type: 'mode_switch', timestamp: Date.now() }]
                    }));
                    setTimeout(startRecording, 500); 
                }
            };
            
            recognition.onend = () => {
                 if (mounted && appState.isRecording) {
                     try { recognition.start(); } catch(e) {}
                 }
            };

            recognition.onresult = (event: any) => {
                if (!mounted) return;
                let interim = '';
                let final = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) final += event.results[i][0].transcript;
                    else interim += event.results[i][0].transcript;
                }

                if (final) finalizeCaption(final, 0.9);
                
                if (interim) {
                     const { final: corrected } = processText(interim);
                     setAppState(p => ({...p, interimText: corrected}));
                } else {
                     setAppState(p => ({...p, interimText: ''}));
                }
            };

            try { recognition.start(); } catch(e) {}
            recognitionRef.current = recognition;

        } catch (err) {
            console.error("Setup Error", err);
            if (appState.mode === 'resilience') {
                resilienceStrategyRef.current = 'cloud';
                startRecording();
            } else {
                setAppState(p => ({...p, isRecording: false}));
            }
        }
    };

    startRecording();
    return cleanup;
  }, [appState.isRecording, appState.mode, appState.audioSourceId, localModelLoaded, appState.apiKey]);

  // Helper to get text for overlay/preview
  const getLastCaptionText = () => {
    const lastCaption = appState.captions.length > 0 ? appState.captions[appState.captions.length - 1] : null;
    let text = lastCaption 
      ? (appState.targetLanguage !== 'en' && lastCaption.translatedText ? lastCaption.translatedText : lastCaption.text) 
      : '';
    
    if (appState.interimText && appState.targetLanguage === 'en') {
        text += (text ? ' ' : '') + appState.interimText;
    }
    return text;
  };

  const handleEndSession = () => {
      setAppState(prev => ({
          ...prev,
          isRecording: false,
          view: 'analytics'
      }));
  };

  const handleExitAnalytics = () => {
       setAppState(prev => {
          const newSession: Session = {
              id: Date.now().toString(),
              date: Date.now(),
              name: prev.activeContextName || `Session ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
              stats: prev.stats,
              captions: prev.captions,
              activeContextName: prev.activeContextName
          };
          
          return {
              ...prev,
              view: 'dashboard',
              pastSessions: [newSession, ...prev.pastSessions],
              captions: [],
              stats: initialStats,
              interimText: '',
              notifications: []
          };
       });
  };

  if (appState.view === 'caption_output') {
      return (
        <Overlay 
            currentCaption={getLastCaptionText()} 
            isPartial={!!appState.interimText} 
            settings={appState.overlaySettings}
            onBack={() => setAppState(prev => ({...prev, view: 'dashboard'}))}
        />
      );
  }

  // --- CHOICE SCREEN (Live vs Prerecorded) ---
  if (appState.view === 'choice') {
      return (
          <div className="h-screen bg-cream flex flex-col items-center justify-center p-8 animate-fade-in relative">
              <button onClick={() => setAppState(p => ({...p, view: 'landing'}))} className="absolute top-8 left-8 text-stone-500 font-bold">Back</button>
              
              <h1 className="text-4xl font-display font-bold text-forest-dark mb-12">Choose Your Workflow</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
                  <div 
                    onClick={() => setAppState(p => ({...p, view: 'dashboard'}))}
                    className="bg-white p-8 rounded-2xl border-2 border-stone-200 hover:border-sage-500 hover:shadow-xl cursor-pointer transition-all group"
                  >
                      <div className="bg-sage-100 w-16 h-16 rounded-full flex items-center justify-center text-forest-dark mb-6 group-hover:scale-110 transition-transform"><Mic size={32} /></div>
                      <h2 className="text-2xl font-bold text-stone-800 mb-2">Live Session</h2>
                      <p className="text-stone-500 leading-relaxed">
                          Real-time captioning for meetings, events, or broadcasts. Uses microphone input or loopback audio.
                      </p>
                  </div>

                  <div 
                    onClick={() => setAppState(p => ({...p, view: 'prerecorded'}))}
                    className="bg-white p-8 rounded-2xl border-2 border-stone-200 hover:border-sage-500 hover:shadow-xl cursor-pointer transition-all group"
                  >
                      <div className="bg-sage-100 w-16 h-16 rounded-full flex items-center justify-center text-forest-dark mb-6 group-hover:scale-110 transition-transform"><FileVideo size={32} /></div>
                      <h2 className="text-2xl font-bold text-stone-800 mb-2">Prerecorded Video</h2>
                      <p className="text-stone-500 leading-relaxed">
                          Upload video or audio files. Uses Cloud AI for maximum accuracy and post-processing context correction.
                      </p>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="relative h-screen w-full bg-cream text-forest-dark font-sans overflow-hidden">
      
      {/* Local Model Loading Overlay */}
      {isModelLoading && (
          <div className="fixed inset-0 z-[70] bg-black/80 flex flex-col items-center justify-center text-white backdrop-blur-sm animate-fade-in">
              <Loader2 size={48} className="animate-spin text-sage-400 mb-6" />
              <h2 className="text-2xl font-bold mb-2">Loading Whisper Model...</h2>
              <p className="text-stone-400 text-sm">Downloading model shards (80MB) to browser cache.</p>
              <div className="w-64 h-2 bg-stone-700 rounded-full mt-6 overflow-hidden">
                  <div className="h-full bg-sage-400 animate-slide-up w-2/3"></div>
              </div>
          </div>
      )}

      {/* Floating Settings Button */}
      <button 
        onClick={() => setShowGlobalSettings(true)}
        className="fixed bottom-6 right-6 z-50 bg-white p-4 rounded-full shadow-xl border border-stone-200 text-stone-600 hover:text-forest-dark hover:scale-110 transition-all hover:bg-stone-50"
        title="Settings"
      >
        <Settings size={28} />
      </button>

      {appState.view === 'landing' && <LandingPage onStart={() => setAppState(p => ({...p, view: 'choice'}))} />}
      
      {appState.view === 'dashboard' && (
        <Dashboard 
            isRecording={appState.isRecording}
            setIsRecording={(v) => setAppState(p => ({...p, isRecording: v}))}
            captions={appState.captions}
            setCaptions={setCaptions}
            interimText={appState.interimText}
            setInterimText={(v) => setAppState(p => ({...p, interimText: v}))}
            dictionary={appState.dictionary}
            mode={appState.mode}
            setMode={(v) => setAppState(p => ({...p, mode: v}))}
            audioSourceId={appState.audioSourceId}
            setAudioSourceId={(v) => setAppState(p => ({...p, audioSourceId: v}))}
            stats={appState.stats}
            updateStats={updateStats}
            onOpenContext={() => setShowContextModal(true)}
            onEndSession={handleEndSession}
            openObsView={() => setShowOutputModal(true)}
            targetLanguage={appState.targetLanguage}
            setTargetLanguage={(v) => setAppState(p => ({...p, targetLanguage: v}))}
            goHome={() => setAppState(prev => ({ ...prev, view: 'landing' }))}
            notifications={appState.notifications}
            activeContextName={appState.activeContextName}
            uiLanguage={appState.uiLanguage}
            profanityFilter={appState.profanityFilter}
            currentStream={currentStream}
            onEditCaption={handleEditCaption}
        />
      )}

      {appState.view === 'prerecorded' && (
          <PrerecordedStudio 
             onBack={() => setAppState(p => ({...p, view: 'choice'}))}
             onComplete={(captions) => setAppState(p => ({...p, captions, view: 'analytics', activeContextName: 'Prerecorded Session'}))}
             dictionary={appState.dictionary}
             apiKey={appState.apiKey}
             localServerUrl={appState.localServerUrl}
          />
      )}

      {appState.view === 'analytics' && (
          <Analytics 
             currentCaptions={appState.captions} 
             currentStats={appState.stats} 
             pastSessions={appState.pastSessions}
             onBack={handleExitAnalytics}
             apiKey={appState.apiKey}
          />
      )}

      {/* Modals */}
      <GlobalSettings 
        isOpen={showGlobalSettings} 
        onClose={() => setShowGlobalSettings(false)} 
        appState={appState}
        setAppState={setAppState}
      />

      {showContextModal && (
          <ContextEngine 
            dictionary={appState.dictionary}
            setDictionary={setDictionary}
            onClose={() => setShowContextModal(false)}
            learningEnabled={appState.learningEnabled}
            setLearningEnabled={(v) => setAppState(p => ({...p, learningEnabled: v}))}
            activeContextName={appState.activeContextName}
            setActiveContextName={(v) => setAppState(p => ({...p, activeContextName: v}))}
            profanityFilter={appState.profanityFilter}
            setProfanityFilter={(v) => setAppState(p => ({...p, profanityFilter: v}))}
            partialResults={appState.partialResults}
            setPartialResults={(v) => setAppState(p => ({...p, partialResults: v}))}
            speakerLabels={appState.speakerLabels}
            setSpeakerLabels={(v) => setAppState(p => ({...p, speakerLabels: v}))}
          />
      )}

      {showOutputModal && (
          <OutputSettings 
             settings={appState.overlaySettings}
             setSettings={(v) => setAppState(p => ({...p, overlaySettings: v}))}
             outputMode={appState.outputMode}
             setOutputMode={(v) => setAppState(p => ({...p, outputMode: v}))}
             onClose={() => setShowOutputModal(false)}
             onLaunch={() => { setShowOutputModal(false); setAppState(p => ({...p, view: 'caption_output'})); }}
             previewText={getLastCaptionText()}
          />
      )}
    </div>
  );
}

export default App;
