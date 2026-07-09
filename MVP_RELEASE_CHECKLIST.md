# MVP Release Checklist

Перед деплоем MVP проверь этот короткий список вместе с [SMOKE_TESTS.md](SMOKE_TESTS.md) и [AI_RULES.md](AI_RULES.md).

## 1. P0 сценарии

- [ ] Сотрудник создаёт смену
- [ ] Owner/admin утверждает смену
- [ ] Отклонение смены работает
- [ ] История обновляется после approve/reject
- [ ] Сводка выплат обновляется после approve/reject
- [ ] `fixed_shift` считается как фикс за смену
- [ ] `hourly` считается по часам
- [ ] Фильтр по точкам работает
- [ ] Архив сотрудников не ломает историю
- [ ] Обычный сотрудник не видит управление
- [ ] Permissions проверены по [SMOKE_TESTS.md](SMOKE_TESTS.md)

## 2. UI

- [ ] Видимые тексты на русском
- [ ] Light theme читаемая
- [ ] Dark theme читаемая
- [ ] Mobile safe area не перекрывает контент
- [ ] Пустые состояния нормальные
- [ ] Ошибки показываются понятным текстом

## 3. Backend

- [ ] App starts
- [ ] Database initialized
- [ ] `/api/me` работает
- [ ] `/api/stats/monthly` работает
- [ ] `/api/shifts` работает
- [ ] `/api/payroll/summary` работает

## 4. Known issues

- [ ] XLSX export temporarily frozen / проверить позже
- [ ] Desktop web admin planned later
- [ ] DeepSeek/AI reports planned later

## 5. Commands

- [ ] Backend compile
- [ ] Frontend build
- [ ] `git status`
