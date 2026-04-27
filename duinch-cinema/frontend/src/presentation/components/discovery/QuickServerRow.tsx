import React, { useState, useRef, useLayoutEffect, useMemo, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { ChevronDown, Globe, HardDrive } from 'lucide-react';
import { CloudButtons, CloudIcon } from './CloudActions';
import type { CloudTarget } from '../../../services/cloudTargets';

interface QuickServerRowProps {
  serverName: string; 
  episodes: any[]; 
  color?: string; 
  cloudTargets: CloudTarget[];
  sourceBadge?: string | null;
}

export const QuickServerRow: React.FC<QuickServerRowProps> = ({ 
  serverName, episodes, color = 'text-orange-400', cloudTargets, sourceBadge 
}) => {
  const [open,     setOpen]     = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focusIndex, setFocusIndex] = useState(0);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  type SeasonGroupItem = { ep: any; index: number };
  type SeasonGroup = { season: number; items: SeasonGroupItem[] };

  const seasonGroups = useMemo(() => {
    const acc: SeasonGroup[] = [];
    episodes.forEach((ep, index) => {
        const rawSeason = Number(ep?.season);
        const season = (Number.isFinite(rawSeason) && rawSeason > 0) ? rawSeason : 1;
        const existing = acc.find(group => group.season === season);
        if (existing) {
            existing.items.push({ ep, index });
        } else {
            acc.push({ season, items: [{ ep, index }] });
        }
    });
    
    const final = [...acc];
    final.sort((a, b) => a.season - b.season);
    return final;
  }, [episodes]);

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
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
          <Globe className={`w-3 h-3 ${color} shrink-0`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-300 truncate">{serverName}</span>
          {sourceBadge && (
            <span className="text-[6px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/5 text-gray-500 shrink-0">
              {sourceBadge}
            </span>
          )}
          <span className="text-[9px] font-bold text-gray-600 shrink-0">
            ({episodes.length} tập)
          </span>
        </button>

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
            count={selectMode ? selected.size : undefined}
            onDeviceAction={() => {
                if (selectMode) handleBatchDownload();
            }}
            onCloudAction={(target) => {
                alert(`Gửi ${selected.size || 1} tập tới ${target.label}`);
            }}
          />

          <button onClick={() => setOpen(o => !o)} className="p-1 rounded-lg hover:bg-white/8 transition-all">
            <ChevronDown className={`w-3.5 h-3.5 text-gray-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/5 px-3 pb-3 pt-2 space-y-1.5 animate-cinema-fade">
          {seasonGroups.map(group => (
            <div key={group.season} className="space-y-1.5">
              <div className="flex items-center gap-2 px-1 pt-1">
                <span className={`text-[8px] font-black uppercase tracking-[0.25em] ${color}`}>
                  Mùa {group.season}
                </span>
                <span className="text-[7px] font-bold uppercase tracking-widest text-gray-600">
                  {group.items.length} tập
                </span>
              </div>

              <div
                ref={gridRef}
                tabIndex={0}
                onKeyDown={handleGridKeyDown}
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 outline-none"
              >
                {group.items.map(({ ep, index }) => {
                  const isSelected = selected.has(index);
                  const epLabel = ep.name || `Tập ${String(index + 1).padStart(2, '0')}`;
                  const epUrl = ep.link_m3u8 || ep.link_embed;
                  return (
                    <div key={`${group.season}-${index}`} className={`flex items-stretch rounded-lg border transition-all ${
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
                                onClick={() => epUrl && onDownload?.(epUrl, epLabel)}
                                className="px-1.5 flex items-center justify-center border-l border-white/5 hover:bg-white/10 transition-all group/dev">
                                <HardDrive className="w-2.5 h-2.5 text-gray-600 group-hover/dev:text-gray-300 transition-colors" />
                            </button>
                            {cloudTargets.map((t, ti) => (
                                <button key={t.id} title={t.label}
                                    onClick={() => alert(`Gửi tập ${epLabel} tới ${t.label}`)}
                                    className={`px-1.5 flex items-center justify-center border-l border-white/5 transition-all ${ti === cloudTargets.length - 1 ? 'rounded-r-lg' : ''} hover:bg-white/10 group/ct`}>
                                    <span className={`text-gray-600 group-hover/ct:${t.color} transition-colors`}>
                                        <CloudIcon icon={t.icon} />
                                    </span>
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
          ))}
        </div>
      )}
    </div>
  );
};
