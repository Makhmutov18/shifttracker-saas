import { useState, useEffect, useCallback } from 'react';
import { getExpenses, Expense } from '../utils/api';
import { getCurrentMonth, getCurrentYear } from '../utils/helpers';

export function useExpenses(month?: number, year?: number) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const m = month || getCurrentMonth();
  const y = year || getCurrentYear();

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getExpenses(m, y);
      setExpenses(data);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки расходов');
    } finally {
      setLoading(false);
    }
  }, [m, y]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  return { expenses, loading, error, refetch: fetchExpenses };
}