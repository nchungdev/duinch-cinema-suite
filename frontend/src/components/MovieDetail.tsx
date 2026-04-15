import { useEffect, useState } from 'react';
import { api } from '../api/config';
import { ChevronLeft, Calendar, Clock, Play, Shield, Star, Info, Users, Tag, Layout, CloudDownload, Globe, HardDrive, Activity, ChevronDown } from 'lucide-react';
import { DiscoveryPipeline } from './DiscoveryPipeline';

interface MetaData {
  title: string;
  origin_name: string;
  thumb_url: string;
  poster: string;
  poster_url: string;
  content: string;
  year: number;
  time: string;
  quality: string;
  lang: string;
  type: string;
  category: { name: string }[];
  actor: string[];
  tmdb_seasons?: { season_number: number; name: string; episode_count: number }[];
}

interface DetailResponse {
  metadata: MetaData;
  local: { exists: boolean; path?: string };
  links?: {
    streaming?: any[];
    fshare?: any[];
    web?: any[];
  }
}

interface Props {
  slug: string;
  onBack: () => void;
}

export function MovieDetail({ slug, onBack }: Props) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeEmbed, setActiveEmbed] = useState<string | null>(null);
  const [activeServerIdx, setActiveServerIdx] = useState(0);
  const [activeEpisodeIdx, setActiveEpisodeIdx] = useState(0);
  const [activeSeasonIdx, setActiveSeasonIdx] = useState(0);
  const [seasonDropdownOpen, setSeasonDropdownOpen] = useState(false);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await api.get<DetailResponse>(`/metadata/${slug}`);
        setData(res.data);
      } catch (err) {
        console.error('Fetch detail failed:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [slug]);

  // Sync embed when server/episode changes or on first load
  useEffect(() => {
     if (data?.links?.streaming?.[activeServerIdx]?.server_data?.[activeEpisodeIdx]) {
         const ep = data.links.streaming[activeServerIdx].server_data[activeEpisodeIdx];
         if (ep.embed) {
             setActiveEmbed(ep.embed);
         }
     }
  }, [data, activeServerIdx, activeEpisodeIdx]);

  if (loading) return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6">
      <div className="w-16 h-16 border-2 border-blue-500/10 border-t-blue-500 rounded-full animate-spin shadow-[0_0_30px_rgba(37,99,235,0.2)]"></div>
      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500/60 animate-pulse">Synchronizing Metadata</span>
    </div>
  );

  if (!data) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6">
        <Info className="w-12 h-12 text-red-500/50" />
        <div className="text-center space-y-2">
            <h2 className="text-2xl font-black uppercase italic tracking-tighter">Transmission Failed</h2>
            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Resource not found in the current sector</p>
        </div>
        <button onClick={onBack} className="mt-4 px-8 py-3 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Return to Command</button>
    </div>
  );

  const { metadata, local } = data;

  // Compute season boundaries from TMDB seasons
  const tmdbSeasons = metadata.tmdb_seasons || [];
  const seasonBoundaries = tmdbSeasons.reduce<{ start: number; end: number; name: string; num: number }[]>((acc, s) => {
    const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
    acc.push({ start, end: start + s.episode_count, name: s.name, num: s.season_number });
    return acc;
  }, []);
  const currentSeason = seasonBoundaries[activeSeasonIdx];

  // Get episodes for current season (or all if no TMDB seasons)
  const getSeasonEpisodes = (serverData: any[]) => {
    if (!currentSeason || seasonBoundaries.length === 0) return serverData;
    return serverData.slice(currentSeason.start, currentSeason.end);
  };

  return (
    <div className="relative animate-cinema-fade space-y-16 pb-24">
      {/* Top Header Return Button */}
      <div className="w-full flex justify-start -mt-4 px-4 md:px-10 mb-8 max-w-screen-2xl mx-auto">
        <button 
          onClick={onBack}
          className="group/back flex items-center gap-3 text-blue-500/80 hover:text-blue-400 transition-all font-black uppercase tracking-[0.3em] text-[10px]"
        >
          <div className="w-8 h-8 rounded-full border border-blue-500/20 flex items-center justify-center group-hover/back:bg-blue-500/10 transition-all">
              <ChevronLeft className="w-4 h-4" />
          </div>
          Return to Galaxy
        </button>
      </div>

      {/* Main VOD Stage (Player + Episodes) */}
      {data.links?.streaming && data.links.streaming.length > 0 ? (
        <div className="flex flex-col xl:flex-row gap-8 w-full max-w-screen-2xl mx-auto px-4 md:px-10">
           {/* Left/Top: Native Player */}
           <div className="flex-1 w-full bg-[#030303] rounded-[2rem] shadow-[0_0_80px_rgba(37,99,235,0.1)] ring-1 ring-white/10 overflow-hidden relative aspect-video flex items-center justify-center group">
              {activeEmbed ? (
                 <iframe src={activeEmbed} allowFullScreen className="w-full h-full border-0 absolute inset-0 animate-cinema-fade" />
              ) : (
                 <div className="flex flex-col items-center gap-4 text-gray-500">
                    <Play className="w-16 h-16 opacity-30" />
                    <span className="text-[10px] uppercase tracking-[0.2em] font-black">Standing By</span>
                 </div>
              )}
           </div>

           {/* Right/Bottom: Optimized Episode Selector */}
           <div className="w-full xl:w-[400px] flex flex-col gap-4 max-h-[85vh] overflow-y-auto custom-scrollbar pr-2 pb-4 relative">
              {/* Season Selector (only if TMDB seasons exist) */}
              {seasonBoundaries.length > 1 && (
                <div className="relative">
                  <button 
                    onClick={() => setSeasonDropdownOpen(!seasonDropdownOpen)}
                    className="w-full flex items-center justify-between px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:border-blue-500/30 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">
                        S{currentSeason?.num || 1}
                      </span>
                      <span className="text-xs font-bold text-gray-300 truncate">
                        {currentSeason?.name || 'Season 1'}
                      </span>
                      <span className="text-[9px] text-gray-600 font-bold">
                        ({currentSeason ? currentSeason.end - currentSeason.start : 0} tập)
                      </span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${seasonDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {seasonDropdownOpen && (
                    <div className="absolute z-20 top-full mt-2 w-full max-h-[300px] overflow-y-auto custom-scrollbar rounded-xl bg-[#0a0a0a] border border-white/10 shadow-2xl">
                      {seasonBoundaries.map((s, idx) => (
                        <button
                          key={s.num}
                          onClick={() => { setActiveSeasonIdx(idx); setSeasonDropdownOpen(false); setActiveEpisodeIdx(0); }}
                          className={`w-full text-left px-5 py-3 flex items-center gap-3 transition-all border-b border-white/5 last:border-0 ${
                            idx === activeSeasonIdx 
                              ? 'bg-blue-600/10 text-blue-400' 
                              : 'hover:bg-white/5 text-gray-400'
                          }`}
                        >
                          <span className="text-[10px] font-black uppercase tracking-widest w-8 shrink-0">S{s.num}</span>
                          <span className="text-xs font-bold truncate flex-1">{s.name}</span>
                          <span className="text-[9px] text-gray-600 font-bold shrink-0">{s.end - s.start} tập</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Active Server Content */}
              {data.links.streaming[activeServerIdx] && (() => {
                const allEps = data.links.streaming[activeServerIdx].server_data;
                const filteredEps = getSeasonEpisodes(allEps);
                const offsetStart = currentSeason?.start || 0;
                
                return (
                 <div className="space-y-4 p-5 rounded-[2rem] bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2 truncate pr-2">
                           <Globe className="w-3 h-3 text-blue-500/50 shrink-0" /> {data.links.streaming[activeServerIdx].server_name}
                        </span>
                        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20 hover:scale-105 transition-all text-[8px] font-black uppercase tracking-widest shrink-0 shadow-lg hover:shadow-green-500/20">
                            <Activity className="w-3 h-3" /> Send All to JD
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {filteredEps.map((ep: any, localIdx: number) => {
                            const globalIdx = offsetStart + localIdx;
                            const epName = ep.name.toLowerCase().startsWith('tập') ? ep.name : `Tập ${ep.name}`;
                            const isPlaying = activeEpisodeIdx === globalIdx;
                            
                            return (
                                <div key={globalIdx} className={`flex items-stretch rounded-xl border transition-all group/stream shadow-sm ${isPlaying ? 'bg-blue-600/20 border-blue-500/50 shadow-blue-500/20' : 'bg-black/40 border-white/10 hover:border-blue-500/40 hover:bg-black/60'}`}>
                                    <button 
                                        onClick={() => {
                                           setActiveEpisodeIdx(globalIdx);
                                           if (!ep.embed) {
                                              window.open(ep.m3u8 || ep.link_m3u8, '_blank');
                                           }
                                        }}
                                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 hover:bg-blue-600/10 transition-all rounded-l-xl overflow-hidden"
                                    >
                                        {isPlaying && <Play className="w-2.5 h-2.5 text-blue-400 fill-blue-400 animate-pulse shrink-0" />}
                                        <span className={`text-[10px] font-bold transition-colors truncate ${isPlaying ? 'text-white' : 'text-gray-400 group-hover/stream:text-white'}`}>
                                            {epName}
                                        </span>
                                    </button>
                                    
                                    <div className="w-px bg-white/5 group-hover/stream:bg-blue-500/20 transition-colors" />
                                    
                                    <button 
                                        title="Send to JDownloader"
                                        className="px-2.5 hover:bg-green-500/20 transition-all rounded-r-xl flex items-center justify-center group/dl shrink-0"
                                    >
                                        <HardDrive className="w-3 h-3 text-gray-600 group-hover/dl:text-green-400 transition-colors" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                 </div>
                );
              })()}
           </div>
        </div>
      ) : (
        /* Cinematic Hero Section (Fallback when no stream links are available) */
        <div className="relative h-[65vh] -mx-10 -mt-20 overflow-hidden border-b border-white/5">
          <div className="absolute inset-0">
            <img 
              src={metadata.thumb_url || metadata.poster_url || metadata.poster} 
              className="w-full h-full object-cover scale-110 blur-3xl opacity-25 grayscale-[0.3]" 
              alt="backdrop" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-transparent" />
          </div>
        </div>
      )}

      {/* Detail Grid Layout */}
      <div className="max-w-screen-2xl mx-auto px-4 md:px-10 flex flex-col gap-10 pt-4">
        
        {/* Layer 2: Movie Profile + Personnel */}
        <div className="flex flex-col xl:flex-row gap-8 w-full items-stretch">
          <section className="flex-1 glass-dark p-8 md:p-12 rounded-[3.5rem] border border-white/5 shadow-inner animate-cinema-fade">
            <div className="flex flex-col md:flex-row gap-10 items-start">
              {/* Restored Hero Poster */}
              <div className="hidden md:block w-48 shrink-0 aspect-[2/3] rounded-[2rem] overflow-hidden shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] border border-white/10 group bg-[#050505]">
                <img 
                  src={metadata.poster_url || metadata.poster || metadata.thumb_url} 
                  className="w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-110" 
                  alt="poster"
                  onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/500x750?text=No+Poster'; }}
                />
              </div>

              {/* Metadata */}
              <div className="flex-1 space-y-6">
                <div className="space-y-4">
                   <div className="flex items-center gap-4">
                      <span className="px-3 py-1 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-widest">{metadata.quality || 'HD'}</span>
                      <div className="h-0.5 w-12 bg-white/10 rounded-full" />
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em]">{metadata.type || 'Movie'}</span>
                   </div>
                   
                   <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black italic uppercase tracking-tighter leading-[0.9] text-gradient font-outfit drop-shadow-2xl">
                      {metadata.title}
                   </h1>
                   
                   <p className="text-lg font-bold text-gray-500 uppercase tracking-[0.25em] opacity-60 font-inter">
                      {metadata.origin_name}
                   </p>
                </div>

                <div className="flex flex-wrap gap-3">
                   <HeroBadge icon={<Calendar className="text-blue-500" />} text={metadata.year?.toString() || 'Unknown'} />
                   <HeroBadge icon={<Clock className="text-purple-500" />} text={metadata.time || 'N/A'} />
                   <HeroBadge icon={<Star className="text-yellow-500" />} text={metadata.lang || 'N/A'} />
                   <HeroBadge icon={<Shield className="text-green-500" />} text="Official Source" />
                </div>

                {/* Manifest Summary (Now inline next to poster on large screens) */}
                <div className="pt-4 space-y-4">
                   <div className="flex items-center gap-4">
                      <div className="w-1.5 h-6 bg-blue-600 rounded-full shadow-[0_0_15px_#3b82f6]" />
                      <h2 className="text-xl font-black uppercase tracking-[0.2em] font-outfit text-gray-300">Manifest Summary</h2>
                   </div>
                   <p className="text-gray-400 leading-relaxed text-sm md:text-base font-medium font-inter opacity-90 text-justify" dangerouslySetInnerHTML={{ __html: metadata.content || 'No manifest content available.' }} />
                   
                   <div className="pt-2 flex flex-wrap gap-3">
                      {(metadata.category || []).map(cat => (
                        <div key={cat.name} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors cursor-crosshair">
                          {cat.name}
                        </div>
                      ))}
                   </div>
                </div>
              </div>
            </div>
          </section>

          {/* Right Side: Personnel Manifest (Cast) & Quick Specs */}
          <div className="w-full xl:w-[400px] shrink-0 h-full flex flex-col gap-8">
              <div className="glass-dark p-8 md:p-10 rounded-[3.5rem] border border-white/5 space-y-8 flex-1 bg-[#030303]/40">
                  <div className="flex items-center gap-3">
                      <Users className="w-5 h-5 text-blue-500/50" />
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-500">Personnel Manifest</h3>
                  </div>
                  <div className="space-y-4">
                      {(metadata.actor || []).slice(0, 5).map(a => (
                          <div key={a} className="flex items-center gap-4 group cursor-pointer transition-all">
                              <div className="w-10 h-10 rounded-[1rem] bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-black group-hover:bg-blue-600/30 group-hover:text-blue-200 transition-all duration-500 shadow-md">
                                  {a.charAt(0)}
                              </div>
                              <div className="flex flex-col">
                                  <span className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors">{a}</span>
                                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-600 group-hover:text-blue-500/60 transition-colors">Agent / Class A</span>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              {/* Server Tabs */}
              {(data?.links?.streaming?.length ?? 0) > 1 && (
                 <div className="flex gap-2 overflow-x-auto custom-scrollbar">
                    {data.links?.streaming?.map((server, idx) => (
                       <button 
                          key={idx}
                          onClick={() => setActiveServerIdx(idx)} 
                          className={`px-4 py-3 rounded-[1rem] flex-1 text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
                            idx === activeServerIdx 
                              ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 shadow-[0_0_15px_rgba(37,99,235,0.2)]' 
                              : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 border-transparent hover:border-white/10'
                          }`}
                       >
                           {server.server_name}
                       </button>
                    ))}
                 </div>
              )}

              {/* Quick Specs */}
              <div className="glass p-8 rounded-[3rem] border border-white/5 grid grid-cols-2 gap-6 bg-[#030303]/40">
                  <SpecItem icon={<Tag />} label="Format" value={metadata.type} />
                  <SpecItem icon={<Layout />} label="Display" value={metadata.quality} />
              </div>
          </div>
        </div>

        {/* Layer 3: System Tooling (Discovery Core + Storage Node) */}
        <div className="flex flex-col xl:flex-row gap-8 w-full items-stretch">
          
          {/* Left Side: Discovery Core */}
          <div className="flex-1">
            <DiscoveryPipeline 
              slug={slug} 
              title={metadata.origin_name || metadata.title}
            />
          </div>

          {/* Right Side: Storage Controller */}
          <div className="w-full xl:w-[400px] shrink-0 space-y-10">
            {/* Storage Node Status */}
            <div className={`glass-dark p-10 rounded-[3rem] border ${local.exists ? 'border-green-500/20 shadow-green-900/10 shadow-2xl' : 'border-blue-500/10 shadow-blue-900/10 shadow-2xl'} space-y-8 relative overflow-hidden group`}>
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
              
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-600">Storage Controller</span>
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${local.exists ? 'bg-green-500/20 text-green-500' : 'bg-blue-500/20 text-blue-500'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${local.exists ? 'bg-green-500' : 'bg-blue-500'}`} />
                    {local.exists ? 'Synced' : 'Remote'}
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                    <h3 className="text-2xl font-black uppercase italic font-outfit">
                    {local.exists ? 'Local Node' : 'Cloud Entry'}
                    </h3>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest opacity-60 leading-relaxed">
                        {local.exists ? 'Resource available in primary high-speed raid array.' : 'Resource identified in external cloud database. Retrieval required.'}
                    </p>
                </div>

                {local.exists && (
                  <div className="p-4 rounded-xl bg-black/40 border border-white/5 font-mono text-[9px] text-gray-500 break-all leading-tight">
                      {local.path}
                  </div>
                )}

                <button className={`w-full py-3.5 rounded-xl font-black uppercase tracking-[0.2em] text-[10px] transition-all duration-500 flex items-center justify-center gap-3 group/btn ${
                  local.exists 
                    ? 'bg-transparent text-green-400 border border-green-500/30 hover:bg-green-500/10' 
                    : 'bg-gradient-to-r from-blue-700 to-blue-500 text-white shadow-xl shadow-blue-900/30 hover:scale-[1.02] hover:shadow-blue-500/40 border border-blue-400/20'
                }`}>
                  {local.exists ? <Play className="w-4 h-4 fill-green-400" /> : <CloudDownload className="w-4 h-4 text-white drop-shadow-md" />}
                  {local.exists ? 'Execute Local Playback' : 'Initialize Retrieval'}
                </button>
              </div>
            </div>

            {/* Quick Specs */}
            <div className="glass p-8 rounded-[3rem] border border-white/5 grid grid-cols-2 gap-6 bg-[#030303]/40">
                <SpecItem icon={<Tag />} label="Format" value={metadata.type} />
                <SpecItem icon={<Layout />} label="Display" value={metadata.quality} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroBadge({ icon, text }: { icon: any, text: string }) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest backdrop-blur-xl hover:bg-white/10 transition-all cursor-default">
      <span className="opacity-80 scale-110">{icon}</span>
      <span className="text-gray-200">{text}</span>
    </div>
  );
}

function SpecItem({ icon, label, value }: { icon: any, label: string, value: string }) {
  return (
    <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-600">
            {icon} {label}
        </div>
        <div className="text-[10px] font-black uppercase tracking-wider text-gray-300">{value}</div>
    </div>
  );
}
