import { useState, useEffect } from 'react';
import { CheckCircle2, Loader2, Sparkles, Database, Globe, HardDrive, Search, Cpu, Activity, Zap } from 'lucide-react';
import { api } from '../api/config';
import type { MediaLink } from '../api/config';

interface DiscoveryPipelineProps {
  slug: string;
  title: string;
}

interface Step {
  id: string;
  label: string;
  sub: string;
  status: 'pending' | 'active' | 'done';
  icon: any;
}

const INITIAL_STEPS: Step[] = [
  { id: 'tmdb', label: 'METADATA_EXTRACT', sub: 'SYNCING TMDB CLUSTER', status: 'pending', icon: <Database /> },
  { id: 'kkphim', label: 'STREAM_MAPPING', sub: 'HLS CDN DISCOVERY', status: 'pending', icon: <Globe /> },
  { id: 'local', label: 'NODE_AUDIT', sub: 'RAID SECTOR SCAN', status: 'pending', icon: <HardDrive /> },
  { id: 'fshare', label: 'FSHARE_SEARCH', sub: 'DEEP INDEX LOOKUP', status: 'pending', icon: <Search /> },
];

export const DiscoveryPipeline = ({ slug, title }: DiscoveryPipelineProps) => {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [linksFound, setLinksFound] = useState(0);
  const [fshareLinks, setFshareLinks] = useState<MediaLink[]>([]);

  const updateStep = (id: string, status: Step['status']) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  };

  useEffect(() => {
    const controller = new AbortController();
    const runDiscovery = async () => {
      // PRO MAX: Visualizing the tactical sync process
      updateStep('tmdb', 'active');
      setTimeout(() => updateStep('tmdb', 'done'), 600);
      
      setTimeout(() => {
        updateStep('kkphim', 'active');
        setTimeout(() => updateStep('kkphim', 'done'), 1000);
      }, 700);

      setTimeout(() => {
        updateStep('local', 'active');
        setTimeout(() => updateStep('local', 'done'), 1400);
      }, 1800);
      
      setTimeout(async () => {
        updateStep('fshare', 'active');
        try {
          const res = await api.get<{ fshare: MediaLink[], success: boolean }>(
            `/lookup/fshare-discovery/${slug}?title=${encodeURIComponent(title)}`,
            { signal: controller.signal }
          );
          if (res.data.success) {
            setLinksFound(res.data.fshare.length);
            setFshareLinks(res.data.fshare);
          }
        } catch (err: any) {
          if (err.name === 'CanceledError' || err.name === 'AbortError') return;
          console.error(err);
        } finally {
          updateStep('fshare', 'done');
        }
      }, 3200);
    };

    setSteps(INITIAL_STEPS);
    setLinksFound(0);
    runDiscovery();

    return () => controller.abort();
  }, [slug, title]);

  return (
    <div className="glass-dark p-12 rounded-[3.5rem] border border-blue-500/10 space-y-10 relative overflow-hidden group shadow-2xl">
      {/* Tactical Glow Elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-600/5 blur-[80px] pointer-events-none" />
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-8 relative z-10">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20">
                <Activity className="w-4 h-4 text-blue-500" />
             </div>
             <h3 className="text-2xl font-black uppercase italic tracking-tight font-outfit">Discovery Core</h3>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-600">Unified Sub-system Extraction Pipeline</p>
        </div>

        <div className="flex items-center gap-6">
            <StatsBlock icon={<Cpu />} label="Core State" value="Operational" color="text-green-500" />
            <div className="w-px h-8 bg-white/5" />
            <StatsBlock icon={<Zap />} label="Sources" value={linksFound > 0 ? `${linksFound} Found` : 'Scanning'} color={linksFound > 0 ? 'text-blue-500' : 'text-gray-500'} />
        </div>
      </div>

      {/* Interactive Action Links Section - Moved PRE-PIPELINE LOGS */}
      {/* Interactive Action Links Section - Moved PRE-PIPELINE LOGS */}
      {steps.every(s => s.status === 'done') && (
        <div className="pb-4 space-y-8 animate-cinema-fade border-b border-white/5 mb-8 relative z-10">
          {/* FShare Links */}
          {fshareLinks && fshareLinks.length > 0 && (
             <div className="space-y-4 pt-4">
               <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-green-500 mb-4 flex items-center gap-2">
                 <HardDrive className="w-3 h-3" /> Deep Index Extractions (FShare)
               </h4>
               <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                 {fshareLinks.map((link, idx) => (
                    <div key={idx} className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-4 rounded-xl bg-green-500/5 border border-green-500/10 hover:bg-green-500/10 transition-all group/link">
                       <span className="text-xs font-mono text-gray-400 truncate w-full xl:max-w-[50%] group-hover/link:text-gray-200 transition-colors" title={link.name}>{link.name}</span>
                       <div className="flex items-center justify-between xl:justify-end gap-6 w-full xl:w-auto">
                           <span className="text-[10px] font-black tracking-widest text-gray-500 uppercase whitespace-nowrap">{link.source || 'FShare'}</span>
                           <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600/20 text-green-500 border border-green-500/30 font-black uppercase tracking-[0.2em] text-[8px] hover:bg-green-600 hover:text-white transition-all shadow-lg hover:shadow-green-500/30 whitespace-nowrap cursor-copy">
                               <Activity className="w-3 h-3" /> Exe JDownloader
                           </button>
                       </div>
                    </div>
                 ))}
               </div>
             </div>
          )}
        </div>
      )}
      
      {/* Pipeline Grid Subsystem (Moved Down) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-1 relative z-10 transition-all">
        {steps.map((step) => (
          <div key={step.id} className={`flex items-center gap-6 p-6 rounded-[2rem] border transition-all duration-700 relative overflow-hidden group/item ${
            step.status === 'done' ? 'bg-green-500/5 border-green-500/10 hover:bg-green-500/10' : 
            step.status === 'active' ? 'bg-blue-600/10 border-blue-600/30' : 
            'bg-white/5 border-white/10 opacity-40'
          }`}>
            {step.status === 'active' && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-pulse" />
            )}

            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500 shadow-lg ${
              step.status === 'done' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 
              step.status === 'active' ? 'bg-blue-600/20 text-blue-500 border border-blue-500/30 shadow-blue-900/40' : 
              'bg-black/20 text-gray-700 border border-white/5'
            }`}>
              {step.status === 'active' ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <span className="group-hover/item:scale-110 transition-transform">{step.icon}</span>
              )}
            </div>
            
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-black uppercase tracking-[0.2em] transition-colors ${
                  step.status === 'pending' ? 'text-gray-700' : 'text-white'
                }`}>
                  {step.label}
                </span>
                {step.status === 'done' && (
                  <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                  </div>
                )}
              </div>
              <p className={`text-[9px] font-bold uppercase tracking-widest transition-opacity duration-500 ${step.status === 'pending' ? 'opacity-20' : 'opacity-50'}`}>
                {step.sub}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-6 relative z-10">
          <div className="px-6 py-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-widest text-gray-700">
                  <Sparkles className="w-3 h-3 text-blue-500/40" /> System Ready for Inception
              </div>
              <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className={`w-1 h-3 rounded-full ${steps.filter(s => s.status === 'done').length >= i ? 'bg-blue-500' : 'bg-white/10'}`} />
                  ))}
              </div>
          </div>
      </div>
    </div>
  );
};

function StatsBlock({ icon, label, value, color }: { icon: any, label: string, value: string, color: string }) {
    return (
        <div className="flex items-center gap-4">
            <div className="text-gray-600">{icon}</div>
            <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-700">{label}</span>
                <span className={`text-[10px] font-black uppercase tracking-widest ${color}`}>{value}</span>
            </div>
        </div>
    );
}
