import { useCallback } from 'react';
import { useMovieDetail } from '../components/detail/MovieDetailContext';

export const useStreamRegistry = () => {
  const { setStreamableSources } = useMovieDetail();

  const handleStreamingReady = useCallback((links: any[], sourceId: string) => {
    setStreamableSources(prev => {
        const next = { ...prev };
        for (const item of links) {
            const url = item.m3u8 || item.link_m3u8 || item.link_hls || item.url || item.link || item.embed || item.link_embed || item.magnet || '';
            if (!url) continue;

            const types: Set<string> = new Set();
            const source_type = (item.source_type || sourceId || '').toLowerCase();
            const rawType = (item.stream_type || item.source_type || '').toUpperCase();
            
            if (rawType === 'P2P' || url.startsWith('magnet:')) {
                types.add('P2P');
            } else if (rawType === 'FSHARE' || rawType === 'GDRIVE' || url.includes('fshare.vn') || url.includes('drive.google.com')) {
                types.add('DIRECT');
            } else {
                if (source_type === 'm3u8') types.add('HLS');
                if (item.m3u8 || item.link_m3u8 || item.link_hls || url.includes('.m3u8') || url.includes('hls')) types.add('HLS');
                if (item.embed || item.link_embed || url.includes('embed') || source_type === 'dailymotion') types.add('EMBED');
                if (types.size === 0) types.add('HLS');
            }

            for (const type of Array.from(types)) {
                const up = (item.provider || sourceId || '').toUpperCase();
                const ul = url.toLowerCase();
                let platform = up;
                if (type === 'P2P' || up.includes('TORRENT')) platform = 'TORRENT';
                else if (ul.includes('fshare.vn')) platform = 'FSHARE';
                else if (ul.includes('drive.google.com') || ul.includes('google.com/file')) platform = 'GDRIVE';
                else if (ul.includes('dailymotion.com')) platform = 'DAILYMOTION';
                else if (up.includes('KKPHIM')) platform = 'KKPHIM';
                else if (up.includes('OPHIM')) platform = 'OPHIM';

                const scraper = (item.provider || sourceId).toUpperCase();

                if (!next[type]) next[type] = {};
                if (!next[type][platform]) next[type][platform] = [];
                
                const serverKey = item.server || platform;
                let targetServer = next[type][platform].find(s => s.server_name === serverKey);
                
                if (!targetServer) {
                    targetServer = { server_name: serverKey, server_data: [] };
                    next[type][platform].push(targetServer);
                }

                const currentUrl = type === 'HLS' ? (item.m3u8 || item.link_m3u8 || url) : 
                                   type === 'EMBED' ? (item.embed || item.link_embed || url) : url;

                // Unified Episode Matching: if same name, merge links
                const epName = item.name || 'Tập mới';
                let existingEp = targetServer.server_data.find((e: any) => e.name === epName);

                if (existingEp) {
                    if (type === 'HLS') existingEp.m3u8 = currentUrl;
                    if (type === 'EMBED') existingEp.embed = currentUrl;
                    if (type === 'P2P') existingEp.magnet = currentUrl;
                } else {
                    targetServer.server_data.push({
                        name: epName,
                        m3u8: type === 'HLS' ? currentUrl : (item.m3u8 || item.link_m3u8 || ''),
                        embed: type === 'EMBED' ? currentUrl : (item.embed || item.link_embed || ''),
                        magnet: type === 'P2P' ? currentUrl : (item.magnet || ''),
                        isTorrent: type === 'P2P',
                        stream_type: type,
                        provider: platform,
                        scraper: scraper,
                        url: currentUrl
                    });
                }
            }
        }
        return next;
    });
  }, [setStreamableSources]);

  return { handleStreamingReady };
};
