import { useEffect, useMemo } from 'react';
import { useMovieDetail } from '../components/detail/MovieDetailContext';

export const useStreamNavigation = () => {
  const { 
    streamableSources, mediaType, userSettings,
    activeType, setActiveType,
    activeProvider, setActiveProvider,
    activeServerIdx, setActiveServerIdx,
    activeEpisodeIdx, setActiveEpisodeIdx,
    activeSeasonIdx, setActiveSeasonIdx,
    streamingLinks, setStreamingLinks
  } = useMovieDetail();

  // Smart Source Selection Logic
  useEffect(() => {
    if (Object.keys(streamableSources).length === 0) return;

    const typesOrder = ['EMBED', 'HLS'];
    const preferred = userSettings?.preferred_source || 'auto';
    
    let targetType = activeType;
    let targetProvider = activeProvider;

    // Auto-selection if not set or preferred source changed
    if (!targetType || preferred !== 'auto') {
        let found = false;
        
        // 1. Try to find the preferred source across all types
        if (preferred !== 'auto') {
            for (const type of typesOrder) {
                if (streamableSources[type]?.[preferred]) {
                    targetType = type;
                    targetProvider = preferred;
                    found = true;
                    break;
                }
            }
        }

        // 2. Fallback to default priority if preferred not found or not set
        if (!found && !activeType) {
            for (const type of typesOrder) {
                const providers = Object.keys(streamableSources[type] || {});
                if (providers.length > 0) {
                    targetType = type;
                    targetProvider = providers[0];
                    break;
                }
            }
        }
    }

    if (targetType && targetType !== activeType) setActiveType(targetType);
    if (targetProvider && targetProvider !== activeProvider) setActiveProvider(targetProvider);
    
    const links = streamableSources[targetType]?.[targetProvider] || [];
    setStreamingLinks(links);
  }, [streamableSources, userSettings, activeType, activeProvider]);

  return { streamingLinks };
};
