import { api } from '../api/config';
import { useMovieDetail } from '../components/detail/MovieDetailContext';

export const useStreamResolvers = () => {
  const { 
    setUserSettings 
  } = useMovieDetail();

  const handleFshareLogin = async (email: string, password: string) => {
    try {
        await api.post('/stream/fshare/login', { email, password });
        const res = await api.get<{ data: any }>('/user/settings');
        setUserSettings(res.data);
        return true;
    } catch (err) {
        return false;
    }
  };

  return { handleFshareLogin };
};
