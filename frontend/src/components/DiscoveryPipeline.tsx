import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Loader2, Sparkles } from 'lucide-react';
import { api } from '../api/config';
import type { MediaLink } from '../api/config';

interface DiscoveryPipelineProps {
  slug: string;
  title: string;
  onLinksFound: (links: MediaLink[]) => void;
}

interface Step {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done';
}

const INITIAL_STEPS: Step[] = [
  { id: 'tmdb', label: 'Phase 1: TMDB Sync', status: 'pending' },
  { id: 'kkphim', label: 'Phase 2: KKPhim Stream', status: 'pending' },
  { id: 'local', label: 'Phase 3: Storage Audit', status: 'pending' },
  { id: 'fshare', label: 'Phase 4: Fshare Discovery', status: 'pending' },
];

export const DiscoveryPipeline = ({ slug, title, onLinksFound }: DiscoveryPipelineProps) => {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);

  const updateStep = (id: string, status: Step['status']) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  };

  useEffect(() => {
    const runDiscovery = async () => {
      // Simulate/Trigger API phases
      // In the real app, Phase 1-3 are handled by the initial metadata fetch
      // Phase 4 is the explicit async discovery
      updateStep('tmdb', 'done');
      updateStep('kkphim', 'done');
      updateStep('local', 'done');
      
      updateStep('fshare', 'active');
      try {
        const res = await api.get<{ fshare: MediaLink[], success: boolean }>(
          `/lookup/fshare-discovery/${slug}/?title=${encodeURIComponent(title)}`
        );
        if (res.data.success) {
          onLinksFound(res.data.fshare);
          updateStep('fshare', 'done');
        }
      } catch (err) {
        updateStep('fshare', 'done');
      }
    };

    runDiscovery();
  }, [slug, title]);

  return (
    <div className="glass p-8 rounded-[40px] border border-blue-500/10 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[9px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">
          <Sparkles className="w-3 h-3" /> Discovery Pipeline
        </h3>
      </div>
      
      <div className="space-y-4">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-4 text-[10px] font-mono transition-colors duration-300">
            {step.status === 'done' ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : step.status === 'active' ? (
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            ) : (
              <Circle className="w-4 h-4 text-gray-700" />
            )}
            <span className={step.status === 'active' ? 'text-white font-black' : 'text-gray-500'}>
              {step.label}
              {step.status === 'active' && <span className="ml-2 animate-pulse">...</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
