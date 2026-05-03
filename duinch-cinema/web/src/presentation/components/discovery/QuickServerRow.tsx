import React, { useState, useRef, useLayoutEffect, useMemo, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { ChevronDown, Globe, HardDrive } from 'lucide-react';
import { CloudButtons, CloudIcon } from './CloudActions';
import type { CloudTarget } from '@shared/services/cloudTargets';

interface QuickServerRowProps {
  serverName: string; 
  audioType?: string;
  episodes: any[]; 
  color?: string; 
  cloudTargets: CloudTarget[];
  sourceBadge?: string | null;
  onBrowserDownload?: (url: string, name: string) => void;
  onCloudDownload?: (url: string, name: string) => void;
  isJdOnline?: boolean;
}

export const QuickServerRow: React.FC<QuickServerRowProps> = ({ 
  serverName, audioType, episodes = [], color = 'text-orange-400', cloudTargets, sourceBadge, onBrowserDownload, onCloudDownload, isJdOnline = false 
}) => {
  const [open,     setOpen]     = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focusIndex, setFocusIndex] = useState(0);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const handleBatchDownload = (mode: 'browser' | 'cloud') => {
    if (selected.size === 0) return;
    const selectedEps = Array.from(selected).map(i => episodes[i]);
    selectedEps.forEach(ep => {
        const url = ep.m3u8 || ep.link_m3u8;
        if (url) {
            if (mode === 'browser') onBrowserDownload?.(url, ep.name || `${serverName} Ep`);
            else onCloudDownload?.(url, ep.name || `${serverName} Ep`);
        }
    });
  };

  const toggleEp = (i: number) => {
    setSelected(prev => {
        const s = new Set(prev);
        if (s.has(i)) s.delete(i);
        else s.add(i);
        return s;
    });
  };

  const toggleAll = () => {
    setSelected(prev => (prev.size === episodes.length ? new Set() : new Set(episodes.map((_, i) => i))));
  };

  const selectRange = (from: number, to: number) => {
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    setSelected(prev => {
      const next = new Set(prev);
      for (let i = start; i <= end; i += 1) next.add(i);
      return next;
    });
  };

  const handleEpisodePointerSelect = (index: number, e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.shiftKey) {
      const anchor = rangeAnchor ?? focusIndex ?? index;
      selectRange(anchor, index);
      setFocusIndex(index);
    }
  };

  const handleEpisodeClick = (index: number, e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.shiftKey) {
      const anchor = rangeAnchor ?? focusIndex ?? index;
      selectRange(anchor, index);
      setFocusIndex(index);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      toggleEp(index);
      setRangeAnchor(index);
      setFocusIndex(index);
      return;
    }

    toggleEp(index);
    setRangeAnchor(index);
    setFocusIndex(index);
  };

  const handleGridKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!open || episodes.length === 0) return;
    const columns = 4;
    let nextIndex = focusIndex;

    if (e.key === 'ArrowRight') nextIndex = Math.min(episodes.length - 1, focusIndex + 1);
    else if (e.key === 'ArrowLeft') nextIndex = Math.max(0, focusIndex - 1);
    else if (e.key === 'ArrowDown') nextIndex = Math.min(episodes.length - 1, focusIndex + columns);
    else if (e.key === 'ArrowUp') nextIndex = Math.max(0, focusIndex - columns);
    else return;

    e.preventDefault();
    setFocusIndex(nextIndex);

    if (e.shiftKey) {
      const anchor = rangeAnchor ?? focusIndex;
      selectRange(anchor, nextIndex);
    }
  };

  useLayoutEffect(() => {
    if (!open) return;
    setFocusIndex(prev => Math.min(prev, Math.max(episodes.length - 1, 0)));
  }, [open, episodes.length]);

  const allSelected = selected.size === episodes.length && episodes.length > 0;
  const selectMode  = selected.size > 0;

  return (
    <div className={`rounded-xl border transition-all overflow-hidden ${
      open ? 'bg-white/5 border-white/10' : 'bg-black/30 border-white/5 hover:border-white/10'
    }`}>
      <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap">
        <div onClick={() => setOpen(o => !o)} className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group">
          <div className={`w-10 h-10 flex items-center justify-center rounded-2xl transition-all border ${
            open 
              ? 'bg-blue-600 border-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.4)] text-white' 
              : 'bg-white/5 border-white/10 text-gray-400 group-hover:bg-white/10 group-hover:text-blue-400'
          }`}>
            <Globe className={`w-5 h-5 ${open ? 'animate-pulse' : ''}`} />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white truncate">{serverName}</span>
              {audioType && (
                <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                    audioType === 'Lồng Tiếng' ? 'bg-pink-600/20 text-pink-400 border-pink-500/20' : 'bg-green-600/20 text-green-400 border-green-500/20'
                }`}>
                  {audioType}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {sourceBadge && (
                <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-400 border border-blue-500/20">
                  {sourceBadge}
                </span>
              )}
              <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                {episodes.length} Episodes Available
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {open && (
            <button onClick={toggleAll}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all ${
                allSelected
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                  : 'bg-white/5 text-gray-500 border-white/10 hover:text-gray-300'
              }`}>
              {allSelected ? 'Bỏ chọn' : 'Chọn tất cả'}
            </button>
          )}
          
          <CloudButtons 
            targets={cloudTargets}
            isCloudDisabled={!isJdOnline}
            count={selectMode ? selected.size : undefined}
            onDeviceAction={() => {
                if (selectMode) handleBatchDownload('browser');
            }}
            onCloudAction={(target) => {
                if (selectMode) handleBatchDownload('cloud');
                else console.log("Direct cloud action for target:", target);
            }}
          />

          <button onClick={() => setOpen(o => !o)} className="p-1 rounded-lg hover:bg-white/8 transition-all">
            <ChevronDown className={`w-3.5 h-3.5 text-gray-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/5 px-3 pb-3 pt-2 space-y-1.5 animate-cinema-fade">
              <div
                ref={gridRef}
                tabIndex={0}
                onKeyDown={handleGridKeyDown}
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 outline-none"
              >
                {episodes.map((ep, index) => {
                  const isSelected = selected.has(index);
                  const epLabel = ep.name || `Tập ${String(index + 1).padStart(2, '0')}`;
                  const epUrl = ep.m3u8;
                  return (
                    <div key={index} className={`flex items-stretch rounded-lg border transition-all ${
                      isSelected ? 'bg-blue-600/20 border-blue-500/40' : 'bg-black/30 border-white/8 hover:border-white/15'
                    }`}>
                      <button
                        onClick={(e) => handleEpisodeClick(index, e)}
                        onMouseEnter={(e) => handleEpisodePointerSelect(index, e)}
                        className="flex-1 flex items-center gap-2 px-2.5 py-2 min-w-0 hover:bg-white/5 rounded-l-lg transition-all">
                        <div className={`w-3.5 h-3.5 rounded shrink-0 border flex items-center justify-center transition-all ${
                          isSelected ? 'bg-blue-500 border-blue-400' : 'border-white/20'
                        }`}>
                          {isSelected && <span className="text-[7px] text-white font-black leading-none">✓</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[9px] font-bold text-gray-300 truncate block">{epLabel}</span>
                        </div>
                      </button>
                      {!selectMode && (
                        <>
                          <div className="flex items-stretch">
                            <button 
                                title="Device" 
                                onClick={() => epUrl && onBrowserDownload?.(epUrl, epLabel)}
                                className="w-9 flex items-center justify-center border-l border-white/5 hover:bg-white/10 transition-all group/dev active:scale-90">
                                <HardDrive className="w-3.5 h-3.5 text-gray-500 group-hover/dev:text-white transition-colors" />
                            </button>
                            {cloudTargets.map((t, ti) => (
                                <button key={t.id} title={t.label}
                                    disabled={!isJdOnline}
                                    onClick={() => epUrl && onCloudDownload?.(epUrl, epLabel)}
                                    className={`w-9 flex items-center justify-center border-l border-white/5 transition-all ${ti === cloudTargets.length - 1 ? 'rounded-r-lg' : ''} hover:bg-white/10 group/ct ${!isJdOnline ? 'opacity-20 cursor-not-allowed' : ''} active:scale-90`}>
                                    <div className="relative">
                                        <CloudIcon icon={t.icon} cls="w-3.5 h-3.5 text-gray-500 group-hover/ct:text-blue-400 transition-colors" />
                                        {isJdOnline && (
                                            <span className="absolute -top-1 -right-1 w-1 h-1 bg-green-500 rounded-full animate-ping" />
                                        )}
                                    </div>
                                </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
        </div>
      )}
    </div>
  );
};
