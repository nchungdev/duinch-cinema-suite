import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Layout, Zap, Activity, Cloud, Settings, ChevronRight } from 'lucide-react';
import { useMovieDetail } from '../../context/MovieDetailContext';
import { api } from '../../api/config';

export const SourceMenu = () => {
    const { 
        streamableSources, activeType, activeProvider,
        userSettings, setUserSettings, setActiveType, setActiveProvider
    } = useMovieDetail();
    
    const [showMenu, setShowMenu] = useState(false);
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [popupPos, setPopupPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    const POPUP_W = 256;

    const openMenu = useCallback(() => {
        if (btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            // Button sits at ~2/3 of popup height → offset popup up so btn center = 2/3 * popupH
            const estimatedPopupH = 240;
            const top = Math.max(8, r.top + r.height / 2 - estimatedPopupH / 3);
            const spaceRight = window.innerWidth - r.right;
            if (spaceRight >= POPUP_W + 12) {
                setPopupPos({ top, left: r.right + 12 });
            } else {
                setPopupPos({ top, right: window.innerWidth - r.left + 12 });
            }
        }
        setShowMenu(s => !s);
    }, []);

    useEffect(() => {
        if (!showMenu) return;
        const handler = (e: MouseEvent) => {
            if (
                popupRef.current && !popupRef.current.contains(e.target as Node) &&
                btnRef.current  && !btnRef.current.contains(e.target as Node)
            ) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showMenu]);

    const groups = [
        { type: 'EMBED',  icon: <Layout className="w-2.5 h-2.5" />, sources: ['DAILYMOTION', 'KKPHIM', 'OPHIM', 'WEB'] },
        { type: 'HLS',    icon: <Zap className="w-2.5 h-2.5" />,    sources: ['KKPHIM', 'OPHIM', 'WEB'] },
        { type: 'P2P',    icon: <Activity className="w-2.5 h-2.5" />, sources: ['TORRENT'] },
        { type: 'DIRECT', icon: <Cloud className="w-2.5 h-2.5" />, sources: ['FSHARE', 'GDRIVE', 'WEB'] },
    ];

    const popup = showMenu ? createPortal(
        <div
            ref={popupRef}
            className="fixed w-64 bg-[#0c0c0e]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-3xl overflow-hidden flex flex-col z-[200] animate-slide-left"
            style={{ top: popupPos.top, ...(popupPos.left != null ? { left: popupPos.left } : { right: popupPos.right }) }}
        >
                    <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                        <div>
                            <span className="text-[8px] font-black uppercase tracking-[0.3em] text-blue-500/80">Transmissions</span>
                        </div>
                        <button 
                            onClick={async () => {
                                const newSettings = { ...userSettings, preferred_source: 'auto' };
                                setUserSettings(newSettings);
                                await api.post('/user/settings', newSettings);
                                setShowMenu(false);
                            }}
                            className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all ${
                                userSettings?.preferred_source === 'auto' 
                                    ? 'bg-blue-600/20 border-blue-500 text-blue-400' 
                                    : 'bg-white/5 border-white/10 text-gray-500 hover:text-white'
                            }`}
                        >
                            Auto
                        </button>
                    </div>

                    <div className="max-h-[70vh] overflow-y-auto custom-scrollbar p-2 space-y-4">
                        {groups.map((group) => {
                            const availableProviders = group.sources.filter(p => {
                                const count = streamableSources[group.type]?.[p]?.length ?? 0;
                                if (p === 'FSHARE' && !userSettings?.fshare_session) return false;
                                return count > 0;
                            });
                            const isGroupAvailable = availableProviders.length > 0;
                            const isExpanded = expandedGroup === group.type || (!expandedGroup && activeType === group.type);

                            if (!isGroupAvailable) return null;

                            return (
                                <div key={group.type} className="space-y-1.5">
                                    <div 
                                        className="px-2 flex items-center justify-between cursor-pointer group/header py-1 hover:bg-white/[0.02] rounded-lg transition-all"
                                        onClick={() => isGroupAvailable && setExpandedGroup(isExpanded ? null : group.type)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className={`p-1 rounded-md transition-all ${isExpanded ? 'bg-blue-500 text-white shadow-lg' : 'bg-blue-500/10 text-blue-500'}`}>
                                                {group.icon}
                                            </div>
                                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${isExpanded ? 'text-blue-400' : 'text-gray-500'}`}>{group.type}</span>
                                        </div>
                                        <ChevronRight className={`w-3 h-3 text-gray-700 transition-transform ${isExpanded ? 'rotate-90 text-blue-500' : ''}`} />
                                    </div>
                                    
                                    {isExpanded && (
                                        <div className="grid grid-cols-1 gap-1 pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                            {group.sources.map(provId => {
                                                const isActive = provId === activeProvider;
                                                const serverCount = streamableSources[group.type]?.[provId]?.length ?? 0;
                                                const isAvailable = serverCount > 0;

                                                if (!isAvailable) return null;
                                                if (provId === 'FSHARE' && !userSettings?.fshare_session) return null;

                                                const metaMap: any = {
                                                    KKPHIM:  { label: 'KKPhim', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
                                                    OPHIM:   { label: 'OPhim',  color: 'text-pink-400 bg-pink-500/10 border-pink-500/30' },
                                                    TORRENT: { label: 'Torrent', color: 'text-green-400 bg-green-500/10 border-green-500/30' },
                                                    FSHARE:  { label: 'Fshare', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
                                                    GDRIVE:  { label: 'G-Drive', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
                                                    DAILYMOTION: { label: 'DailyMotion', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
                                                    WEB: { label: 'Web/Cloud', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' }
                                                };
                                                const meta = metaMap[provId] || { label: provId, color: 'text-gray-400' };

                                                return (
                                                    <button 
                                                        key={provId}
                                                        onClick={async () => {
                                                            setActiveType(group.type);
                                                            setActiveProvider(provId);
                                                            setShowMenu(false);
                                                            setUserSettings({ ...userSettings, preferred_source: provId });
                                                            await api.post('/user/settings', { ...userSettings, preferred_source: provId });
                                                        }}
                                                        className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                                            isActive ? meta.color : 'border-transparent text-gray-500 hover:bg-white/5'
                                                        }`}
                                                    >
                                                        <div className="w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_10px_currentColor]" />
                                                        {meta.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
        </div>,
        document.body
    ) : null;

    return (
        <div className="relative">
            <button
                ref={btnRef}
                onClick={openMenu}
                className={`p-3 rounded-2xl transition-all duration-500 border ${
                    showMenu
                    ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_30px_rgba(37,99,235,0.4)]'
                    : 'bg-white/5 border-white/10 text-gray-500 hover:text-white hover:bg-white/10'
                }`}
            >
                <Settings className={`w-4 h-4 ${showMenu ? 'animate-spin-slow' : ''}`} />
            </button>
            {popup}
        </div>
    );
};
