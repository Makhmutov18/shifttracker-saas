import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage, getShifts, Shift } from '../utils/api';
import { getCurrentMonth, getCurrentYear } from '../utils/helpers';

export function useShifts(month?: number, year?: number, venueId?: string) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const m = month || getCurrentMonth();
  const y = year || getCurrentYear();

  const fetchShifts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getShifts(m, y, venueId);
      setShifts(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Не удалось загрузить смены.'));
    } finally {
      setLoading(false);
    }
  }, [m, y, venueId]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  return { shifts, loading, error, refetch: fetchShifts };
}
