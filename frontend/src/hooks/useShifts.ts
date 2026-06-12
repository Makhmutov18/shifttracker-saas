import { useState, useEffect, useCallback } from 'react';
import { getShifts, Shift } from '../utils/api';
import { getCurrentMonth, getCurrentYear } from '../utils/helpers';

export function useShifts(month?: number, year?: number) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const m = month || getCurrentMonth();
  const y = year || getCurrentYear();

  const fetchShifts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getShifts(m, y);
      setShifts(data);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки смен');
    } finally {
      setLoading(false);
    }
  }, [m, y]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  return { shifts, loading, error, refetch: fetchShifts };
}