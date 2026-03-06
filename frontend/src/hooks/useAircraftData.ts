import { useState, useEffect, useCallback, useRef } from 'react';
import type { Aircraft } from '../types';
import { aircraftService } from '../services/api/aircraftService';

// Default to a smaller limit to ease OpenSky rate limits; backend also clamps
export const useAircraftData = (limit: number = 100) => {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const initialFetchDoneRef = useRef(false);

  const fetchAircraft = useCallback(async () => {
    try {
      // Only show loading on the very first fetch
      if (!initialFetchDoneRef.current) {
        setLoading(true);
      }
      setError(null);
      
      // Fetch aircraft within the configured limit (backend also clamps)
      const data = await aircraftService.getAllAircraft(limit);

      // Deduplicate by ICAO24 (fallback to callsign) to avoid React key collisions
      const seen = new Set<string>();
      const deduped: Aircraft[] = [];
      for (const plane of data.aircraft) {
        const key = plane.icao24 || plane.callsign;
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(plane);
      }

      setAircraft(deduped);
      setTotal(data.total);
      
      // Mark initial fetch as done
      if (!initialFetchDoneRef.current) {
        initialFetchDoneRef.current = true;
        setLoading(false);
      }
      
      console.log(`Fetched ${deduped.length} aircraft after dedupe (total reported: ${data.total})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch aircraft data');
      console.error('Error fetching aircraft:', err);
      
      // Hide loading on error after initial attempt
      if (!initialFetchDoneRef.current) {
        initialFetchDoneRef.current = true;
        setLoading(false);
      }
    }
  }, [limit]);

  useEffect(() => {
    fetchAircraft();
    
    // Set up polling every 10 seconds for aircraft animation
    // Matches backend cache duration (10s) and respects OpenSky API rate limits
    const interval = setInterval(fetchAircraft, 10000);
    
    return () => clearInterval(interval);
  }, [fetchAircraft]);

  return {
    aircraft,
    loading,
    error,
    refresh: fetchAircraft,
    total
  };
};