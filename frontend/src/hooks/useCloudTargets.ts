import { useState, useEffect } from 'react';
import { getEnabledTargets, type CloudTarget } from '../services/cloudTargets';

/**
 * Returns the list of enabled cloud targets, updating live when the user
 * changes settings (listens for the 'cloud-targets-changed' event).
 */
export function useCloudTargets(): CloudTarget[] {
  const [targets, setTargets] = useState<CloudTarget[]>(getEnabledTargets);

  useEffect(() => {
    const refresh = () => setTargets(getEnabledTargets());
    window.addEventListener('cloud-targets-changed', refresh);
    return () => window.removeEventListener('cloud-targets-changed', refresh);
  }, []);

  return targets;
}
