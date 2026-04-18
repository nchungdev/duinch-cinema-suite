import { useCallback } from 'react';
import { useMovieDetail } from '../components/detail/MovieDetailContext';
import { StreamLink } from '../domain/models/StreamLink';

export const useStreamRegistry = () => {
  const { setStreamableSources } = useMovieDetail();

  const handleStreamingReady = useCallback((links: any[], sourceId: string) => {
    setStreamableSources(prev => {
        const next = { ...prev };
        
        for (const rawData of links) {
            const link = new StreamLink({ ...rawData, provider: rawData.provider || sourceId });
            const url = link.bestUrl;
            if (!url) continue;

            const type = link.type;
            const platform = link.provider;
            const serverKey = link.server;

            if (!next[type]) next[type] = {};
            if (!next[type][platform]) next[type][platform] = [];
            
            let targetServer = next[type][platform].find((s: any) => s.server_name === serverKey);
            if (!targetServer) {
                targetServer = { server_name: serverKey, server_data: [] };
                next[type][platform].push(targetServer);
            }

            // Unified Episode Matching: if same name, merge links
            const epName = link.name;
            let existingEp = targetServer.server_data.find((e: any) => e.name === epName);

            if (existingEp) {
                if (link.hlsUrl)   existingEp.m3u8 = link.hlsUrl;
                if (link.embedUrl) existingEp.embed = link.embedUrl;
                if (link.isP2P)    existingEp.magnet = url;
            } else {
                targetServer.server_data.push({
                    name: epName,
                    m3u8: link.hlsUrl || '',
                    embed: link.embedUrl || '',
                    magnet: link.isP2P ? url : '',
                    isTorrent: link.isP2P,
                    stream_type: type,
                    provider: platform,
                    scraper: (rawData.provider || sourceId).toUpperCase(),
                    url: url
                });
            }
        }
        return next;
    });
  }, [setStreamableSources]);

  return { handleStreamingReady };
};
