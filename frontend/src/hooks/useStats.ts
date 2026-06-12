import { useState, useEffect } from 'react';
import { getMonthlyStats, MonthlyStats } from '../utils/api';
import { getCurrentMonth, getCurrentYear } from '../utils/helpers';

export function useStats(month?: number, year?: number) {
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const m = month || getCurrentMonth();
  const y = year || getCurrentYear();

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        setLoading(true);
        setError(null);
        const data = await getMonthlyStats(m, y);
        if (!cancelled) setStats(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Ошибка загрузки статистики');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStats();
    return () => { cancelled = true; };
  }, [m, y]);

  return { stats, loading, error };
}