
import React, { useState, useMemo, useRef } from 'react';
import { Caption, SessionStats, Session } from '../types';
import { Download, Clock, Type, Home, History, Calendar, Search, FileText, Activity, Zap, ChevronDown, ChevronUp, Tag, BarChart, X, PieChart, Sparkles, Key, Loader2, Quote, ArrowDown, Bot, List, AlignLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, BarChart as RechartsBarChart, Bar, Label, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';
import { generateSessionAnalysis } from '../services/geminiService';

interface AnalyticsProps {
  currentCaptions: Caption[];
  currentStats: SessionStats;
  pastSessions: Session[];
  onBack: () => void;
  apiKey?: string;
}

// Simple Word Cloud Component
const WordCloud = ({ text, onWordClick }: { text: string, onWordClick: (word: string) => void }) => {
    const words = useMemo(() => {
        const raw: string[] = text.toLowerCase().match(/\b(\w+)\b/g) || [];
        const counts: Record<string, number> = {};
        const stopWords = new Set(['the', 'and', 'to', 'of', 'a', 'in', 'is', 'that', 'for', 'it', 'as', 'was', 'with', 'on', 'at', 'by', 'an', 'be', 'this', 'which', 'or', 'from', 'but', 'not', 'are', 'your', 'we', 'can', 'you']);
        
        raw.forEach(w => {
            if (!stopWords.has(w) && w.length > 3) {
                counts[w] = (counts[w] || 0) + 1;
            }
        });

        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(([text, value]) => ({ text, value }));
    }, [text]);

    const maxVal = words[0]?.value || 1;

    return (
        <div className="flex flex-wrap gap-2 justify-center p-4">
            {words.map((w, i) => (
                <span 
                    key={i}
                    onClick={() => onWordClick(w.text)}
                    className="cursor-pointer hover:text-forest-dark hover:underline transition-all text-stone-600 font-display font-bold"
                    style={{ fontSize: `${Math.max(0.8, (w.value / maxVal) * 2.5)}rem`, opacity: 0.6 + (w.value/maxVal)*0.4 }}
                >
                    {w.text}
                </span>
            ))}
        </div>
    );
};

const Analytics: React.FC<AnalyticsProps> = ({ currentCaptions, currentStats, pastSessions, onBack, apiKey }) => {
  const [activeSessionId, setActiveSessionId] = useState<string | 'current'>('current');
  const [searchTerm, setSearchTerm] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  
  // AI Analysis State
  const [analysis, setAnalysis] = useState<{ summary: string, highlights: any[] } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [tempKey, setTempKey] = useState(apiKey || '');
  
  // Refs for scrolling
  const aiSectionRef = useRef<HTMLDivElement>(null);

  // Determine which data to show
  let activeData = null;
  
  if (activeSessionId === 'current') {
      activeData = { captions: currentCaptions, stats: currentStats, name: 'Current Session', date: Date.now() };
  } else {
      activeData = pastSessions.find(s => s.id === activeSessionId) 
        ? { ...pastSessions.find(s => s.id === activeSessionId)! }
        : null;
  }
  
  // Fallback if current session is empty (e.g. direct nav)
  if ((!activeData || activeData.captions.length === 0) && pastSessions.length > 0) {
      if (activeSessionId === 'current') {
         const lastSession = pastSessions[0];
         activeData = { ...lastSession };
      }
  }

  const handleGenerateSummary = async () => {
      const keyToUse = tempKey || apiKey;
      if (!keyToUse) {
          setShowKeyPrompt(true);
          return;
      }
      
      if (!activeData || activeData.captions.length === 0) return;

      setIsAnalyzing(true);
      try {
          // Save key if entered freshly
          if (tempKey && tempKey !== apiKey) {
              localStorage.setItem('cc_api_key', tempKey);
          }
          
          const result = await generateSessionAnalysis(activeData.captions, keyToUse);
          setAnalysis(result);
          setShowKeyPrompt(false);
      } catch (e) {
          alert("Analysis failed. Check your API Key.");
          setShowKeyPrompt(true);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const scrollToAI = () => {
      if (aiSectionRef.current) {
          aiSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (!analysis && !isAnalyzing) {
          handleGenerateSummary();
      }
  };

  const handleDownload = (format: 'srt' | 'txt' | 'json' | 'vtt') => {
      if (!activeData || activeData.captions.length === 0) {
          alert("No data to download.");
          return;
      }
      let content = '';
      const filename = `${activeData.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.${format}`;

      if (format === 'json') {
          content = JSON.stringify({ ...activeData.captions, analysis }, null, 2);
      } else if (format === 'txt') {
          content = activeData.captions.map(c => c.text).join(' ');
          if (analysis) {
              content = `SUMMARY:\n${analysis.summary}\n\nHIGHLIGHTS:\n${analysis.highlights.map(h => `- "${h.quote}"`).join('\n')}\n\nTRANSCRIPT:\n` + content;
          }
      } else if (format === 'srt') {
          content = activeData.captions.map((c, i) => {
              const start = new Date(c.timestamp).toISOString().substr(11, 12).replace('.', ',');
              const end = new Date(c.timestamp + 2000).toISOString().substr(11, 12).replace('.', ','); 
              return `${i + 1}\n${start} --> ${end}\n${c.text}\n\n`;
          }).join('');
      } else if (format === 'vtt') {
          content = "WEBVTT\n\n" + activeData.captions.map((c, i) => {
              const start = new Date(c.timestamp).toISOString().substr(11, 12);
              const end = new Date(c.timestamp + 2000).toISOString().substr(11, 12); 
              return `${start} --> ${end}\n${c.text}\n\n`;
          }).join('');
      }

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  };

  if (!activeData || (activeData.captions.length === 0 && activeSessionId === 'current' && pastSessions.length === 0)) {
       return (
           <div className="h-full bg-cream flex flex-col items-center justify-center text-center p-8">
               <div className="bg-stone-100 p-6 rounded-full mb-6 text-stone-400">
                   <Activity size={48} />
               </div>
               <h2 className="text-2xl font-bold font-display text-forest-dark mb-2">No Session Data</h2>
               <p className="text-stone-500 mb-8">Start a recording session to see analytics here.</p>
               <button onClick={onBack} className="bg-forest-dark text-white px-6 py-3 rounded-xl font-bold">Return to Dashboard</button>
           </div>
       );
  }

  const filteredCaptions = activeData.captions.filter(c => c.text.toLowerCase().includes(searchTerm.toLowerCase()));
  const fullText = activeData.captions.map(c => c.text).join(' ');

  // Pie Chart Data: Speech vs Silence (approximated from WPM history)
  let speakingTime = 0;
  let silenceTime = 0;
  if (activeData.stats.wpmHistory.length > 0) {
      activeData.stats.wpmHistory.forEach(h => {
          if (h.wpm > 5) speakingTime += 5; // Assuming 5s interval
          else silenceTime += 5;
      });
  } else {
      // Fallback approximation if no history
      const duration = activeData.stats.durationSeconds;
      const estimatedSpeech = activeData.captions.length * 3; // Approx 3s per caption
      speakingTime = Math.min(duration, estimatedSpeech);
      silenceTime = Math.max(0, duration - speakingTime);
  }
  
  const pieData = [
      { name: 'Speech', value: speakingTime, color: '#4D7563' },
      { name: 'Silence', value: silenceTime, color: '#E5E7EB' },
  ];

  return (
    <div className="h-full bg-cream flex font-sans text-forest-dark overflow-hidden">
       
       {/* Sidebar: History */}
       <div className={`bg-white border-r border-stone-200 flex flex-col shrink-0 transition-all duration-300 ${historyOpen ? 'w-80' : 'w-16'}`}>
           <div className="p-4 border-b border-stone-200 bg-stone-50 flex flex-col items-center">
               <button onClick={onBack} className="p-2 text-stone-500 hover:text-forest-dark hover:bg-white rounded-lg transition-colors mb-4" title="Return to Dashboard">
                    <Home size={20} />
               </button>
               <button onClick={() => setHistoryOpen(!historyOpen)} className="p-2 text-stone-500 hover:text-forest-dark hover:bg-white rounded-lg transition-colors" title="Toggle History">
                   {historyOpen ? <History size={20} className="text-sage-500" /> : <History size={20} />}
               </button>
           </div>
           
           {historyOpen && (
               <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2 animate-fade-in">
                   <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Sessions</h3>
                   {currentCaptions.length > 0 && (
                       <button 
                        onClick={() => setActiveSessionId('current')}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${activeSessionId === 'current' ? 'bg-sage-50 border-sage-500 shadow-sm' : 'bg-transparent border-stone-200 hover:bg-white'}`}
                       >
                           <div className="font-bold text-sm text-forest-dark">Current Session</div>
                           <div className="text-xs text-stone-500">{new Date().toLocaleTimeString()}</div>
                       </button>
                   )}
                   {pastSessions.map(session => (
                       <button 
                        key={session.id}
                        onClick={() => setActiveSessionId(session.id)}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${activeSessionId === session.id ? 'bg-stone-100 border-stone-400' : 'bg-transparent border-stone-200 hover:bg-white'}`}
                       >
                            <div className="font-bold text-sm truncate text-stone-800">{session.name}</div>
                            <div className="text-xs text-stone-500">{new Date(session.date).toLocaleDateString()}</div>
                       </button>
                   ))}
               </div>
           )}
       </div>

       {/* Main Content */}
       <div className="flex-1 flex flex-col overflow-hidden bg-stone-50/50 relative">
           {/* Key Prompt Modal */}
           {showKeyPrompt && (
               <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                   <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
                       <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Key size={20} className="text-forest-dark" /> Cloud Access Required</h3>
                       <p className="text-sm text-stone-500 mb-4">To generate AI summaries, you need a Google Gemini API Key.</p>
                       <input 
                           type="password" 
                           value={tempKey}
                           onChange={(e) => setTempKey(e.target.value)}
                           placeholder="Enter API Key..."
                           className="w-full border border-stone-200 rounded-lg p-2 mb-4 outline-none focus:border-sage-500"
                       />
                       <div className="flex justify-end gap-2">
                           <button onClick={() => setShowKeyPrompt(false)} className="text-sm font-bold text-stone-500 hover:text-stone-800 px-3 py-2">Cancel</button>
                           <button onClick={handleGenerateSummary} className="bg-forest-dark text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-forest-light">Save & Generate</button>
                       </div>
                   </div>
               </div>
           )}

           {/* Header */}
           <div className="h-20 border-b border-stone-200 flex items-center justify-between px-8 bg-white shrink-0 shadow-sm">
               <div>
                   <h1 className="text-2xl font-bold font-display text-forest-dark">{activeData.name}</h1>
                   <div className="text-xs text-stone-500 flex items-center gap-4 mt-1">
                       <span className="flex items-center gap-1"><Clock size={12} /> {Math.floor(activeData.stats.durationSeconds / 60)}m {activeData.stats.durationSeconds % 60}s</span>
                       <span className="flex items-center gap-1"><Type size={12} /> {activeData.stats.totalWords} words</span>
                       <span className="flex items-center gap-1"><Activity size={12} /> {Math.round(activeData.stats.averageConfidence * 100)}% confidence</span>
                   </div>
               </div>
               
               <div className="flex gap-2">
                   <button 
                       onClick={scrollToAI}
                       className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-forest-dark to-forest-light text-white rounded-lg text-xs font-bold hover:shadow-lg transition-all shadow-md mr-2 animate-slide-up"
                   >
                       {isAnalyzing ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                       {analysis ? "View AI Report" : "Generate AI Report"}
                   </button>

                   {['TXT', 'SRT', 'JSON', 'VTT'].map(fmt => (
                        <button 
                            key={fmt} 
                            onClick={() => handleDownload(fmt as any)}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 text-stone-600 rounded-lg text-xs font-bold hover:bg-stone-50 transition-colors shadow-sm"
                        >
                            <Download size={14} /> {fmt}
                        </button>
                   ))}
               </div>
           </div>

           {/* Dashboard Grid */}
           <div className="flex-1 overflow-y-auto p-8 custom-scrollbar scroll-smooth">
               <div className="space-y-8 pb-32">
                   
                   {/* Top Row: 3 Graphs */}
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-64">
                       {/* Graph 1: Pace */}
                       <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm flex flex-col">
                           <h3 className="text-sm font-bold text-stone-400 uppercase mb-4 flex items-center gap-2"><Zap size={16} /> Pace (WPM)</h3>
                           <div className="flex-1 w-full min-h-0">
                               <ResponsiveContainer width="100%" height="100%">
                                   <AreaChart data={activeData.stats.wpmHistory} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                                        <defs>
                                            <linearGradient id="colorWpm" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#4D7563" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#4D7563" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis dataKey="time" hide={true} />
                                        <YAxis hide={false} width={30} tick={{fontSize: 10, fill: '#9ca3af'}} />
                                        <ChartTooltip contentStyle={{ backgroundColor: '#1C1917', border: 'none', borderRadius: '8px', color: '#fff' }} labelStyle={{ display: 'none' }} />
                                        <Area type="monotone" dataKey="wpm" stroke="#4D7563" fillOpacity={1} fill="url(#colorWpm)" />
                                   </AreaChart>
                               </ResponsiveContainer>
                           </div>
                       </div>

                       {/* Graph 2: Confidence */}
                       <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm flex flex-col">
                            <h3 className="text-sm font-bold text-stone-400 uppercase mb-4 flex items-center gap-2"><BarChart size={16} /> Confidence Stability</h3>
                            <div className="flex-1 w-full min-h-0">
                                {activeData.stats.confidenceHistory && activeData.stats.confidenceHistory.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={activeData.stats.confidenceHistory} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                                <XAxis dataKey="time" hide={true} />
                                                <YAxis hide={false} domain={[0.5, 1]} width={30} tick={{fontSize: 10, fill: '#9ca3af'}} />
                                                <ChartTooltip contentStyle={{ backgroundColor: '#1C1917', border: 'none', borderRadius: '8px', color: '#fff' }} labelStyle={{ display: 'none' }} />
                                                <Line type="step" dataKey="score" stroke="#EAB308" strokeWidth={2} dot={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex items-center justify-center h-full text-stone-300 text-xs">No data yet</div>
                                )}
                            </div>
                       </div>

                       {/* Graph 3: Composition */}
                       <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm flex flex-col overflow-hidden relative">
                           <h3 className="text-sm font-bold text-stone-400 uppercase mb-4 flex items-center gap-2"><PieChart size={16} /> Session Composition</h3>
                           <div className="flex-1 w-full min-h-0 flex items-center justify-center relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RechartsPieChart>
                                        <Pie
                                            data={pieData}
                                            innerRadius={40}
                                            outerRadius={60}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                    </RechartsPieChart>
                                </ResponsiveContainer>
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                                    <span className="text-lg font-bold text-forest-dark">{Math.round((speakingTime / (speakingTime + silenceTime)) * 100) || 0}%</span>
                                    <span className="block text-[10px] text-stone-400 uppercase">Speech</span>
                                </div>
                           </div>
                       </div>
                   </div>

                   {/* Middle Row: Content Analysis */}
                   <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
                       {/* Left Column: Word Cloud */}
                       <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm flex flex-col">
                           <h3 className="text-sm font-bold text-stone-400 uppercase mb-4 flex items-center gap-2"><Tag size={16} /> Key Topics</h3>
                           <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <WordCloud text={fullText} onWordClick={setSearchTerm} />
                           </div>
                       </div>

                       {/* Right Column: Transcript */}
                       <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 shadow-sm flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-stone-100 flex justify-between items-center bg-stone-50">
                                <h3 className="text-sm font-bold text-stone-500 uppercase flex items-center gap-2"><FileText size={16} /> Transcript Search</h3>
                                <div className="relative">
                                    <input 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Filter keywords..."
                                        className="bg-white border border-stone-200 text-stone-700 text-sm rounded-lg pl-9 pr-4 py-2 focus:border-sage-400 outline-none w-64 transition-all"
                                    />
                                    <Search size={14} className="absolute left-3 top-3 text-stone-400" />
                                    {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-3 text-stone-400 hover:text-stone-800"><X size={14} /></button>}
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-6 space-y-4 font-serif text-lg leading-relaxed text-stone-800 custom-scrollbar">
                                {filteredCaptions.map((caption) => (
                                    <div key={caption.id} className="group hover:bg-stone-50 p-3 rounded-lg -ml-3 transition-colors flex gap-4">
                                        <div className="flex flex-col items-end gap-1 shrink-0 w-20 pt-1">
                                            <span className="text-xs font-sans font-bold text-stone-400">
                                                {new Date(caption.timestamp).toLocaleTimeString([], {minute:'2-digit', second:'2-digit'})}
                                            </span>
                                            {caption.confidence < 0.8 && (
                                                <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded font-sans font-bold">Low Conf</span>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <p className={searchTerm && caption.text.toLowerCase().includes(searchTerm.toLowerCase()) ? "bg-yellow-100 inline" : ""}>
                                                {caption.text}
                                            </p>
                                            {caption.translatedText && (
                                                <p className="text-sm text-stone-500 mt-1 font-sans">{caption.translatedText}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {filteredCaptions.length === 0 && (
                                    <div className="text-center text-stone-400 italic mt-20 flex flex-col items-center">
                                        <Search size={48} className="mb-4 opacity-20" />
                                        No results found.
                                    </div>
                                )}
                            </div>
                       </div>
                   </div>

                   {/* Bottom Row: AI Cards */}
                   <div ref={aiSectionRef} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Summary Card */}
                        <div 
                            onClick={() => !analysis && !isAnalyzing && handleGenerateSummary()}
                            className={`min-h-[400px] p-8 rounded-3xl border transition-all relative overflow-hidden group flex flex-col ${
                                analysis 
                                ? 'bg-white border-stone-200' 
                                : 'bg-[#6B5B95] border-transparent text-white shadow-xl cursor-pointer hover:scale-[1.01]'
                            }`}
                        >
                             {!analysis ? (
                                <div className="flex flex-col items-center justify-center flex-1 text-center">
                                    <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-sm group-hover:scale-110 transition-transform">
                                        <Bot size={32} />
                                    </div>
                                    <h3 className="text-3xl font-display font-bold mb-2">Generate Executive Summary</h3>
                                    <p className="text-white/80 max-w-sm leading-relaxed mb-8">
                                        Use Gemini to process the full transcript and produce a concise summary of all topics discussed.
                                    </p>
                                    <button disabled={isAnalyzing} className="bg-white text-[#6B5B95] px-8 py-3 rounded-xl font-bold hover:bg-stone-50 transition-colors flex items-center gap-2">
                                        {isAnalyzing ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />} 
                                        {isAnalyzing ? "Processing..." : "Generate with AI"}
                                    </button>
                                </div>
                             ) : (
                                <div className="flex flex-col h-full">
                                    <h3 className="text-sm font-bold text-forest-dark uppercase mb-4 flex items-center gap-2">
                                        <AlignLeft size={16} /> Executive Summary
                                    </h3>
                                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                                        <p className="text-lg leading-relaxed text-stone-700 whitespace-pre-wrap">{analysis.summary}</p>
                                    </div>
                                </div>
                             )}
                        </div>

                        {/* Highlights Card */}
                         <div 
                            onClick={() => !analysis && !isAnalyzing && handleGenerateSummary()}
                            className={`min-h-[400px] p-8 rounded-3xl border transition-all relative overflow-hidden group flex flex-col ${
                                analysis 
                                ? 'bg-white border-stone-200' 
                                : 'bg-[#6B5B95] border-transparent text-white shadow-xl cursor-pointer hover:scale-[1.01]'
                            }`}
                        >
                            {!analysis ? (
                                <div className="flex flex-col items-center justify-center flex-1 text-center">
                                    <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-sm group-hover:scale-110 transition-transform">
                                        <List size={32} />
                                    </div>
                                    <h3 className="text-3xl font-display font-bold mb-2">Extract Key Highlights</h3>
                                    <p className="text-white/80 max-w-sm leading-relaxed mb-8">
                                        Identify the most important quotes, decisions, and action items from the session automatically.
                                    </p>
                                    <button disabled={isAnalyzing} className="bg-white text-[#6B5B95] px-8 py-3 rounded-xl font-bold hover:bg-stone-50 transition-colors flex items-center gap-2">
                                        {isAnalyzing ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />} 
                                        {isAnalyzing ? "Processing..." : "Generate with AI"}
                                    </button>
                                </div>
                             ) : (
                                <div className="flex flex-col h-full">
                                    <h3 className="text-sm font-bold text-forest-dark uppercase mb-4 flex items-center gap-2">
                                        <Quote size={16} /> Key Highlights
                                    </h3>
                                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                                        {analysis.highlights.map((h, i) => (
                                            <div key={i} className="bg-sage-50 p-4 rounded-xl border border-sage-100">
                                                <p className="text-forest-dark font-medium text-lg italic mb-2">"{h.quote}"</p>
                                                {h.context && <p className="text-sm text-stone-500 font-sans">{h.context}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                             )}
                        </div>
                   </div>

               </div>
           </div>
       </div>
    </div>
  );
};

export default Analytics;
