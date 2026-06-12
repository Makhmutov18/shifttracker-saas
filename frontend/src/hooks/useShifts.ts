import { useState, useEffect, useCallback } from 'react';
import { getShifts, Shift } from '../utils/api';
import { getCurrentMonth, getCurrentYear } from '../utils/helpers';

export function useShifts(month?: number, year?: number) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  const m = month || getCurrentMonth();
  const y = year || getCurrentYear();

  const fetchShifts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getShifts(m, y);
      setShifts(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [m, y]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  return { shifts, loading, refetch: fetchShifts };
}