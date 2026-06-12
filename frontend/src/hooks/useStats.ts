import { useState, useEffect } from 'react';
import { getMonthlyStats, MonthlyStats } from '../utils/api';
import { getCurrentMonth, getCurrentYear } from '../utils/helpers';

export function useStats(month?: number, year?: number) {
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [loading, setLoading] = useState(true);

  const m = month || getCurrentMonth();
  const y = year || getCurrentYear();

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        setLoading(true);
        const data = await getMonthlyStats(m, y);
        if (!cancelled) setStats(data);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStats();
    return () => { cancelled = true; };
  }, [m, y]);

  return { stats, loading };
}