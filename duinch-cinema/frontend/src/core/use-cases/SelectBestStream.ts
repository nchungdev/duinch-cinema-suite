/**
 * Use Case: SelectBestStream
 * Logic nghiệp vụ để quyết định nguồn phát nào là tốt nhất dựa trên sở thích người dùng
 * và tính khả dụng của dữ liệu.
 */

export interface StreamSelectionResult {
  type: string;
  provider: string;
  serverIdx: number;
}

export class SelectBestStream {
  /**
   * Tính toán điểm số cho từng server để tìm nguồn khớp nhất
   */
  execute(
    streamableSources: Record<string, Record<string, any[]>>,
    activeEpisodeIdx: number,
    seasonBoundaries: any[],
    userSettings: any,
    currentSelection?: { type: string; provider: string; serverIdx: number }
  ): StreamSelectionResult | null {
    if (Object.keys(streamableSources).length === 0) return null;

    const pinnedType = userSettings?.preferred_type;
    const pinnedProvider = userSettings?.preferred_provider;
    const pinnedAudio = userSettings?.preferred_audio;
    const pinnedServerName = userSettings?.preferred_server;

    const currentSeason = seasonBoundaries.find(s => activeEpisodeIdx >= s.start && activeEpisodeIdx < s.end);
    const targetSeasonNum = currentSeason?.season_number;
    
    const extractNum = (name: string) => { 
        const d = name?.toString().replace(/\D/g, ''); 
        return d ? parseInt(d) : null; 
    };
    const localEpNum = currentSeason ? activeEpisodeIdx - currentSeason.start + 1 : activeEpisodeIdx + 1;

    interface ScoredServer extends StreamSelectionResult {
        score: number;
    }

    const candidates: ScoredServer[] = [];

    // Duyệt qua toàn bộ giỏ dữ liệu
    Object.entries(streamableSources).forEach(([type, providers]) => {
        Object.entries(providers as any).forEach(([provider, rawList]) => {
            const items = rawList as any[];
            let servers: any[] = [];
            
            if (items.length > 0 && 'servers' in items[0]) {
                items.forEach((col: any) => {
                    (col.servers || []).forEach((srv: any) => {
                        servers.push({ ...srv, season: col.order });
                    });
                });
            } else {
                servers = items;
            }

            servers.forEach((server, srvIdx) => {
                // Chỉ xét server có chứa tập hiện tại
                const globalEpNum = activeEpisodeIdx + 1;
                const hasEpisode = (server.server_data || []).some((e: any) => {
                    const epNum = extractNum(e.name);
                    const isCorrectSeason = (!e.season && !server.season) || 
                                           (Number(e.season) === targetSeasonNum) || 
                                           (Number(server.season) === targetSeasonNum);
                    
                    // Khớp số tập: Thử cả số tuyệt đối (517) và tương đối (1)
                    return epNum !== null && (epNum === globalEpNum || epNum === localEpNum) && isCorrectSeason;
                });

                if (!hasEpisode) return;

                let score = 0;

                // 1. Khớp thông tin Pinned (Trọng số cực cao)
                if (pinnedType === type) score += 1000;
                if (pinnedProvider === provider) score += 2000; 
                if (pinnedAudio === server.audio_type) score += 1500;
                if (pinnedServerName === server.server_name) score += 3000; 

                // 2. Ưu tiên HLS (+500)
                if (type === 'HLS') score += 500;
                
                // 3. Ưu tiên thứ tự mặc định HLS > EMBED (+ một chút điểm để phân tách)
                if (type === 'HLS') score += 50;
                else if (type === 'EMBED') score += 10;

                // 4. Giữ nguyên lựa chọn hiện tại (+100)
                if (currentSelection && 
                    currentSelection.type === type && 
                    currentSelection.provider === provider && 
                    currentSelection.serverIdx === srvIdx) {
                    score += 100;
                }

                candidates.push({ type, provider, serverIdx: srvIdx, score });
            });
        });
    });

    if (candidates.length === 0) return null;

    // Sắp xếp theo điểm số giảm dần
    candidates.sort((a, b) => b.score - a.score);
    
    return candidates[0];
  }
}
