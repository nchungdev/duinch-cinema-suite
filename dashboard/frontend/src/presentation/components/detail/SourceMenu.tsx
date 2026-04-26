import { useState, useRef, useEffect } from 'react';
import { Settings, Check, Zap, Layout, Activity, Cloud } from 'lucide-react';
import { useMediaDetail } from '../../context/MediaDetailContext';
import { api } from '../../../api/config';

export const SourceMenu = () => {
    const { 
        streamableSources, activeType, activeProvider,
        userSettings, setUserSettings, setActiveType, setActiveProvider
    } = useMediaDetail();
    
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showMenu) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showMenu]);

    const providers = [
        { id: 'KKPHIM', label: 'KKPhim', type: 'HLS', icon: <Zap className="w-3 h-3" /> },
        { id: 'OPHIM',  label: 'OPhim',  type: 'HLS', icon: <Zap className="w-3 h-3" /> },
        { id: 'DAILYMOTION', label: 'D-Motion', type: 'EMBED', icon: <Layout className="w-3 h-3" /> },
        { id: 'TORRENT', label: 'Torrent', type: 'P2P', icon: <Activity className="w-3 h-3" /> },
        { id: 'FSHARE', label: 'Fshare', type: 'DIRECT', icon: <Cloud className="w-3 h-3" /> },
    ];

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setShowMenu(!showMenu)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                    showMenu 
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg' 
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
            >
                <Settings className={`w-3.5 h-3.5 ${showMenu ? 'animate-spin-slow' : ''}`} />
                <span className="text-[9px] font-black uppercase tracking-widest">
                    {activeProvider || 'Source'}
                </span>
            </button>
            {showMenu && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-[#0c0c0e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-2 space-y-1">
                        <div className="px-3 py-2 border-b border-white/5 mb-1">
                            <span className="text-[7px] font-black uppercase tracking-[0.3em] text-gray-500">Select Provider</span>
                        </div>
                        {providers.map((p) => {
                            const isAvailable = (streamableSources[p.type]?.[p.id]?.length ?? 0) > 0;
                            const isActive = activeProvider === p.id && activeType === p.type;
                            if (!isAvailable) return null;
                            return (
                                <button
                                    key={`${p.type}-${p.id}`}
                                    onClick={async () => {
                                        setActiveType(p.type);
                                        setActiveProvider(p.id);
                                        setShowMenu(false);
                                        const newSettings = { ...userSettings, preferred_source: p.id };
                                        setUserSettings(newSettings);
                                        await api.post('/user/settings', newSettings);
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${
                                        isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        {p.icon}
                                        {p.label}
                                    </div>
                                    {isActive && <Check className="w-3 h-3" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
