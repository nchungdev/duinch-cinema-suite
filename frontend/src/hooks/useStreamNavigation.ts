import { useEffect } from 'react';
import { useMovieDetail } from '../components/detail/MovieDetailContext';
import { SelectBestStream } from '../core/use-cases/SelectBestStream';

export const useStreamNavigation = () => {
  const { 
    streamableSources, userSettings,
    activeType, setActiveType,
    activeProvider, setActiveProvider,
    activeServerIdx, setActiveServerIdx,
    setStreamingLinks
  } = useMovieDetail();

  // Smart Source Selection
  useEffect(() => {
    const selector = new SelectBestStream();
    const result = selector.execute(
        streamableSources, 
        userSettings?.preferred_source || 'auto',
        activeType
    );

    if (result) {
        if (result.type !== activeType) setActiveType(result.type);
        if (result.provider !== activeProvider) setActiveProvider(result.provider);
        
        const links = streamableSources[result.type]?.[result.provider] || [];
        setStreamingLinks(links);

        // Safety: ensure server index is valid
        if (links.length > 0 && activeServerIdx >= links.length) {
            setActiveServerIdx(0);
        }
    }
  }, [streamableSources, userSettings, activeType, activeProvider, activeServerIdx, setActiveType, setActiveProvider, setStreamingLinks, setActiveServerIdx]);

  return {};
};
