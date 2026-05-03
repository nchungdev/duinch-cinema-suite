import { api } from '@shared/api/config';
import type { MovieMetadata, MediaLink } from '@shared/api/config';

export const startDownload = async (link: MediaLink, metadata: MovieMetadata) => {
  try {
    const res = await api.post('/downloader/add', {
      url: link.url,
      name: link.name,
      title: metadata.title,
      origin_name: metadata.origin_name,
      year: metadata.year,
      media_type: metadata.media_type,
    });
    return res.data;
  } catch (err) {
    console.error('Download initiation failed:', err);
    throw err;
  }
};
