import { useState, useMemo } from 'react';
import { Zap, Globe, Layout, Box, Magnet, ChevronRight, Pin } from 'lucide-react';
import { useMediaDetail } from '../../context/MediaDetailContext';
import { useCloudViewModel } from '../../view-models/CloudViewModel';
import { CloudButtons } from '../discovery/CloudActions';
import type { CloudTarget } from '../../../services/cloudTargets';
import { useDownloader } from '../../hooks/useDownloader';
import { useToast } from '../../context/ToastContext';
import { api } from '../../../api/config';

const TYPE_LABELS: Record<string, string> = {
    'HLS':    'Native HLS Stream',
    'EMBED':  'Third-party Player',
    'P2P':    'Peer-to-Peer (Torrent)',
    'DIRECT': 'Cloud Direct Link',
};

export const MovieGallery = () => {
    const cloudTargets = useCloudViewModel();
    const downloader   = useDownloader();
    const { showToast } = useToast();

    const {
        streamableSources,
        activeType, setActiveType,
        activeProvider, setActiveProvider,
        activeServerIdx, setActiveServerIdx,
        activeEmbed, setActiveEmbed,
        userSettings, setUserSettings,
    } = useMediaDetail();

    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        'HLS': true, 'EMBED': false, 'P2P': true, 'DIRECT': true,
    });

    const preferredType     = (userSettings as any)?.preferred_type     as string | undefined;
    const preferredProvider = (userSettings as any)?.preferred_provider as string | undefined;
    const preferredAudio    = (userSettings as any)?.preferred_audio    as string | undefined;
    const preferredServer   = (userSettings as any)?.preferred_server   as string | undefined;

    const savePreferredSource = async (type: string, provider: string, audio?: string, serverName?: string) => {
        const next = { ...(userSettings || {}), preferred_type: type, preferred_provider: provider, preferred_audio: audio, preferred_server: serverName };
        setUserSettings(next);
        try { await api.post('/user/settings', { preferred_type: type, preferred_provider: provider, preferred_audio: audio, preferred_server: serverName }); showToast('Đã ghim nguồn phát', 'success'); } catch {}
    };

    const handleDownloadRequest = async (url: string, name: string) => {
        const isJdOnline = await downloader.checkJDStatus();
        if (isJdOnline) {
            const ok = await downloader.sendToJD(url, name);
            if (ok) { showToast(`Đã gửi tới JDownloader: ${name}`, 'success'); return; }
            showToast('Lỗi kết nối JDownloader. Tải bằng trình duyệt...', 'error');
        } else {
            showToast('JDownloader Offline. Tải bằng trình duyệt...', 'info');
        }
        downloader.downloadInBrowser(url, name);
    };

    // Build flat node list grouped by type — movie: lấy server_data[0] (phim lẻ chỉ có 1 tập)
    const groupedNodes = useMemo(() => {
        const groups: Record<string, any[]> = {};
        const sources = streamableSources || {};

        Object.entries(sources).forEach(([type, providers]) => {
            Object.entries(providers as any).forEach(([provider, rawList]) => {
                const items = rawList as any[];
                // streamableSources cho movie là flat server list từ ViewModel
                // (mỗi item = { server_name, audio_type, season, server_data: [...] })
                const servers = items;

                servers.forEach((srv: any, srvIdx: number) => {
                    // Movie: take the first available episode entry
                    const ep = (srv.server_data || [])[0];
                    if (!ep) return;
                    const link = type === 'HLS'
                        ? (ep.m3u8 || ep.link_m3u8 || ep.url)
                        : (ep.embed || ep.link_embed || ep.url || ep.m3u8);
                    if (!link) return;
                    if (!groups[type]) groups[type] = [];
                    groups[type].push({ type, provider, server: srv, episode: ep, srvIdx, resolvedLink: link });
                });
            });
        });
        return groups;
    }, [streamableSources]);

    // Determine which node is currently selected
    const selectedNodeKey = useMemo(() => {
        if (!activeEmbed) return null;
        const sig = (url?: string) => {
            if (!url) return null;
            const parts = url.split('/').filter(Boolean);
            if (parts.length < 2) return null;
            const last = parts[parts.length - 1];
            return last === 'index.m3u8' ? parts[parts.length - 2] : last;
        };
        const activeSig = sig(activeEmbed);

        for (const [type, nodes] of Object.entries(groupedNodes)) {
            for (const node of nodes) {
                const epSig = sig(node.resolvedLink);
                if (activeSig && epSig && activeSig === epSig) return `${type}:${node.provider}:${node.srvIdx}`;
                if (preferredServer && node.server.server_name === preferredServer &&
                    preferredType === type && preferredProvider === node.provider)
                    return `${type}:${node.provider}:${node.srvIdx}`;
            }
        }
        return null;
    }, [activeEmbed, groupedNodes, preferredServer, preferredType, preferredProvider]);

    const toggleGroup = (type: string) =>
        setExpandedGroups(prev => ({ ...prev, [type]: !prev[type] }));

    const handleCloudAction = (node: any, target: CloudTarget) => {
        const link = node.episode.m3u8 || node.episode.link_m3u8 || node.episode.url || node.episode.magnet;
        const name = node.episode.name || node.server.server_name;
        if (link) handleDownloadRequest(link, name);
    };

    const hasAnySources = Object.keys(groupedNodes).length > 0;

    return (
        <div className="flex h-full bg-[#0a0a0c] overflow-hidden rounded-3xl border border-white/5 shadow-2xl">
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] shrink-0">
                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-blue-500/60">Available Transmissions</span>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4">
                    {!hasAnySources ? (
                        <div className="py-12 text-center opacity-20 text-[9px] font-black uppercase italic tracking-widest">
                            Waiting for Discovery Engine...
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {Object.entries(groupedNodes).map(([type, nodes]) => (
                                <div key={type} className="space-y-1">
                                    {/* Group header */}
                                    <button
                                        onClick={() => toggleGroup(type)}
                                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 rounded-xl transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-1.5 h-1.5 rounded-full ${expandedGroups[type] ? 'bg-blue-500' : 'bg-gray-700'}`} />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                                                {TYPE_LABELS[type] || type}
                                            </span>
                                        </div>
                                        <ChevronRight className={`w-3 h-3 text-gray-700 transition-transform ${expandedGroups[type] ? 'rotate-90' : ''}`} />
                                    </button>

                                    {/* Node rows */}
                                    {expandedGroups[type] && (
                                        <div className="space-y-1.5 pl-4">
                                            {nodes.map((node, idx) => {
                                                const nodeKey   = `${node.type}:${node.provider}:${node.srvIdx}`;
                                                const isSelected = nodeKey === selectedNodeKey;
                                                const isPinned   = preferredType === node.type &&
                                                                   preferredProvider === node.provider &&
                                                                   preferredAudio === node.server.audio_type &&
                                                                   preferredServer === node.server.server_name;

                                                return (
                                                    <div
                                                        key={idx}
                                                        onClick={() => {
                                                            setActiveType(node.type);
                                                            setActiveProvider(node.provider);
                                                            setActiveServerIdx(node.srvIdx);
                                                            if (node.resolvedLink) setActiveEmbed(node.resolvedLink);
                                                        }}
                                                        className={`group flex items-center justify-between p-3 rounded-2xl transition-all border cursor-pointer ${
                                                            isSelected
                                                                ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                                                                : 'bg-white/5 border-white/5 hover:border-blue-500/30 hover:bg-white/[0.07]'
                                                        }`}
                                                    >
                                                        {/* Left: icon + name */}
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                                                                isSelected ? 'bg-blue-600 text-white' : 'bg-black/40 text-blue-500 group-hover:text-white'
                                                            }`}>
                                                                {node.type === 'HLS'    ? <Zap    className="w-3.5 h-3.5" /> :
                                                                 node.type === 'P2P'    ? <Magnet className="w-3.5 h-3.5" /> :
                                                                 node.type === 'DIRECT' ? <Box    className="w-3.5 h-3.5" /> :
                                                                                          <Layout className="w-3.5 h-3.5" />}
                                                            </div>
                                                            <div className="flex flex-col min-w-0">
                                                                <span className={`text-[11px] font-black uppercase tracking-wider truncate ${isSelected ? 'text-blue-400' : 'text-white'}`}>
                                                                    {node.server.server_name}
                                                                </span>
                                                                {node.server.audio_type && (
                                                                    <span className="text-[7px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                                                                        {node.server.audio_type}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Right: pin + cloud — stopPropagation để không trigger play */}
                                                        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                                                            <button
                                                                onClick={() => savePreferredSource(node.type, node.provider, node.server.audio_type, node.server.server_name)}
                                                                className={`p-2.5 rounded-xl transition-all border ${
                                                                    isPinned
                                                                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                                                                        : 'bg-white/5 border-white/10 text-gray-500 hover:text-amber-400 hover:border-amber-500/30 opacity-0 group-hover:opacity-100'
                                                                }`}
                                                                title={isPinned ? 'Đã ghim' : 'Ghim nguồn này'}
                                                            >
                                                                <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
                                                            </button>

                                                            <CloudButtons
                                                                targets={cloudTargets}
                                                                compact={true}
                                                                onDeviceAction={() => {
                                                                    const ep = node.episode;
                                                                    const link = ep.m3u8 || ep.link_m3u8 || ep.url || ep.magnet;
                                                                    const name = ep.name || node.server.server_name;
                                                                    if (link) handleDownloadRequest(link, name);
                                                                }}
                                                                onCloudAction={(target: CloudTarget) => handleCloudAction(node, target)}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Vertical side label */}
            <div className="w-8 shrink-0 bg-white/[0.01] flex items-center justify-center relative overflow-hidden border-l border-white/5">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/5 to-transparent opacity-50" />
                <span className="whitespace-nowrap -rotate-90 text-[7px] font-black uppercase tracking-[0.5em] text-gray-700 select-none">
                    Transmission Feed
                </span>
            </div>
        </div>
    );
};
