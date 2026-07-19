import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Calculator,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  FileSpreadsheet,
  Menu,
  MessageSquareText,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { siteConfig } from './config';

const navigation = [
  { label: 'Возможности', href: '#features' },
  { label: 'Как работает', href: '#workflow' },
  { label: 'Тарифы', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

const industries = ['Кофейни и рестораны', 'Кальянные', 'Киберклубы', 'Сервисные команды', 'Небольшие сети'];

const workflow = [
  ['01', 'Добавьте точки и сотрудников', 'Зафиксируйте структуру команды, роли и правила оплаты.'],
  ['02', 'Создайте смены', 'Сотрудник или управляющий вносит фактически отработанную смену.'],
  ['03', 'Подтвердите время', 'Ответственный проверяет детали и утверждает или отклоняет запись.'],
  ['04', 'Соберите начисления', 'Система учитывает утверждённые смены, бонусы и удержания.'],
  ['05', 'Зафиксируйте выплаты', 'Полная или частичная выплата сохраняется отдельным событием.'],
  ['06', 'Посмотрите общую картину', 'Собственник видит точки, задачи, расчёты и историю действий.'],
];

const roles = [
  {
    id: 'owner',
    label: 'Собственник',
    title: 'Спокойный обзор без ручного сбора отчётов',
    text: 'Видит точки, начисления, выплаты, остатки и отклонения в одном рабочем контуре.',
    points: ['Состояние всех доступных точек', 'Расчёты и фактические выплаты', 'История действий и экспорт'],
  },
  {
    id: 'manager',
    label: 'Управляющий',
    title: 'Понятная очередь операционных задач',
    text: 'Работает со сменами своей команды и сразу понимает, что требует подтверждения.',
    points: ['Проверка и редактирование смен', 'Команда и её настройки', 'Бонусы и удержания по правилам доступа'],
  },
  {
    id: 'employee',
    label: 'Сотрудник',
    title: 'Собственные смены и деньги без лишних вопросов',
    text: 'Видит только свои смены, текущие начисления и историю зафиксированных выплат.',
    points: ['Быстрое внесение смены', 'Статусы и история изменений', 'Начислено, выплачено и осталось'],
  },
] as const;

const pricing = [
  {
    name: 'Старт',
    price: '4 900 ₽',
    scope: 'До 25 сотрудников · 1 точка',
    points: ['Сотрудники и смены', 'Подтверждения и роли', 'Текущие начисления', 'Telegram Mini App'],
    recommended: false,
  },
  {
    name: 'Рост',
    price: '9 900 ₽',
    scope: 'До 80 сотрудников · до 5 точек',
    points: ['Несколько точек', 'Расширенные права', 'Расчёты и выплаты', 'XLSX/CSV и аудит действий'],
    recommended: true,
  },
  {
    name: 'Сеть',
    price: '24 900 ₽',
    scope: 'До 300 сотрудников · несколько точек',
    points: ['Единый обзор по точкам', 'Разграничение управленческого доступа', 'Расширенный контур расчётов', 'Приоритетная поддержка запуска'],
    recommended: false,
  },
] as const;

const faqs = [
  ['Для каких компаний подходит продукт?', 'Для кофеен, ресторанов, сервисных команд и небольших сетей, где люди работают сменами, а фактические часы и выплаты приходится сводить вручную.'],
  ['Сколько занимает запуск?', 'Срок зависит от количества точек, сотрудников и правил оплаты. В пилоте мы вместе проверяем исходную таблицу, настраиваем первую точку и только после этого подключаем команду.'],
  ['Можно ли работать с несколькими точками?', 'Да. Смена привязывается к фактической точке работы, а сотрудник сохраняет свою основную точку. Доступ к данным зависит от роли и разрешений.'],
  ['Как сотрудники подключаются к системе?', 'Администратор добавляет сотрудника и выдаёт приглашение. Дальше сотрудник открывает Telegram Mini App и работает под своим Telegram-аккаунтом.'],
  ['Где работает приложение?', 'Для сотрудников и быстрых действий есть Telegram Mini App. Для собственника и управляющего доступна web-админка на компьютере или планшете.'],
  ['Как рассчитываются начисления?', 'Начисления строятся только по утверждённым сменам и сохранённым правилам оплаты. Бонусы прибавляются, удержания вычитаются. Фактические выплаты фиксируются отдельно.'],
  ['Можно ли выгрузить данные?', 'Да. Управленческий пользователь с соответствующим правом может скачать оформленный XLSX-отчёт или CSV с сырыми данными смен.'],
  ['Что происходит с текущими таблицами?', 'Мы не обещаем автоматический импорт. В пилоте перенос — это услуга запуска: вы присылаете таблицу, мы вместе проверяем структуру и переносим основные данные.'],
  ['Что входит в пилот?', 'Первичная настройка, перенос исходных данных, запуск первой точки, сбор обратной связи и прямой канал поддержки на период проверки продукта.'],
  ['Как защищены данные разных компаний?', 'Доступ требует авторизации через Telegram и проверяется на backend по ролям и разрешениям. В пилоте рабочий контур каждой компании настраивается отдельно; расширенная multi-workspace модель развивается поэтапно.'],
] as const;

function Logo({ compact = false }: { compact?: boolean }) {
  return <span className={`logo${compact ? ' logo-compact' : ''}`} aria-label="Порядок.Смены">
    <svg viewBox="0 0 48 40" aria-hidden="true">
      <path d="M4 36V16C4 8.268 10.268 2 18 2h12c7.732 0 14 6.268 14 14v20H34V17a5 5 0 0 0-5-5H19a5 5 0 0 0-5 5v19H4Z" />
    </svg>
    {!compact && <span>Порядок<span className="logo-dot">.</span>Смены</span>}
  </span>;
}

function ActionLink({ href, children, variant = 'primary', className = '' }: { href: string; children: React.ReactNode; variant?: 'primary' | 'secondary' | 'text'; className?: string }) {
  const external = /^https?:\/\//.test(href);
  return <a className={`button button-${variant} ${className}`.trim()} href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{children}</a>;
}

function ProductImage({ src, alt, mobile = false }: { src: string; alt: string; mobile?: boolean }) {
  return <div className={`product-image${mobile ? ' product-image-mobile' : ''}`}>
    <img src={src} alt={alt} width={mobile ? 390 : 1440} height={mobile ? 844 : 900} loading="lazy" />
  </div>;
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [roleId, setRoleId] = useState<(typeof roles)[number]['id']>('owner');
  const [hours, setHours] = useState(8);
  const [hourCost, setHourCost] = useState(700);
  const [extraCost, setExtraCost] = useState(5000);
  const activeRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const manualCost = useMemo(() => Math.max(0, hours) * 4.3 * Math.max(0, hourCost) + Math.max(0, extraCost), [extraCost, hourCost, hours]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, []);

  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach((item) => {
      const bounds = item.getBoundingClientRect();
      if (bounds.top < window.innerHeight && bounds.bottom > 0) {
        item.classList.add('is-visible');
        return;
      }
      observer.observe(item);
    });
    return () => observer.disconnect();
  }, []);

  return <>
    <a className="skip-link" href="#main">К содержанию</a>
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand-link" href="#top" aria-label="Порядок.Смены — на главную"><Logo /></a>
        <nav className="desktop-nav" aria-label="Основная навигация">
          {navigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
        </nav>
        <div className="header-actions">
          <ActionLink href={siteConfig.appUrl} variant="text">Войти</ActionLink>
          <ActionLink href={siteConfig.leadUrl}>Запросить пилот</ActionLink>
        </div>
        <button className="mobile-menu-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menuOpen} aria-controls="mobile-navigation">
          {menuOpen ? <X /> : <Menu />}
        </button>
      </div>
      <div id="mobile-navigation" className={`mobile-navigation${menuOpen ? ' open' : ''}`}>
        <nav aria-label="Мобильная навигация">
          {navigation.map((item) => <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a>)}
          <a href={siteConfig.appUrl}>Войти</a>
          <ActionLink href={siteConfig.leadUrl} className="mobile-pilot">Запросить пилот</ActionLink>
        </nav>
      </div>
    </header>

    <main id="main">
      <section className="hero section" id="top">
        <div className="container hero-grid">
          <div className="hero-copy" data-reveal>
            <p className="eyebrow">Для бизнеса со сменным персоналом</p>
            <h1>Смены, люди и расчёты — в одном порядке</h1>
            <p className="hero-lead">Порядок.Смены собирает график, фактические выходы, часы, начисления и выплаты в одном месте — без бесконечных таблиц, переписок и ручных сверок.</p>
            <div className="hero-actions">
              <ActionLink href={siteConfig.leadUrl}>Запросить пилот <ArrowRight /></ActionLink>
              <ActionLink href="#workflow" variant="secondary">Посмотреть, как работает</ActionLink>
            </div>
            <p className="risk-note"><CheckCircle2 />Настроим первую точку и поможем перенести сотрудников.</p>
          </div>
          <div className="hero-product" data-reveal>
            <ProductImage src="/screens/admin-overview.png" alt="Обзор точек, смен и расчётов в web-админке Порядок.Смены" />
            <ProductImage src="/screens/mini-dashboard.png" alt="Главный экран сотрудника в Telegram Mini App Порядок.Смены" mobile />
          </div>
        </div>
      </section>

      <section className="industry-strip" aria-label="Подходит для команд">
        <div className="container industry-inner">
          <span>Работает там, где есть смены</span>
          <div>{industries.map((industry) => <span key={industry}>{industry}</span>)}</div>
        </div>
      </section>

      <section className="section problem-section">
        <div className="container" data-reveal>
          <div className="section-heading">
            <p className="section-index">01</p>
            <h2>Excel, чаты и память администратора — не система учёта</h2>
          </div>
          <div className="comparison">
            <div className="comparison-side comparison-before">
              <h3>До</h3>
              <ul>
                <li>График в одной таблице</li><li>Подтверждения в переписке</li><li>Часы считаются вручную</li><li>Выплаты сверяются перед зарплатой</li><li>Проблемы видны слишком поздно</li>
              </ul>
            </div>
            <div className="comparison-arrow" aria-hidden="true"><ArrowRight /></div>
            <div className="comparison-side comparison-after">
              <h3>После</h3>
              <ul>
                <li>Точки, сотрудники и смены в одном месте</li><li>Понятные статусы подтверждения</li><li>Начисления считаются по правилам</li><li>Выплаты и остатки видны</li><li>Собственник получает общую картину</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section workflow-section" id="workflow">
        <div className="container">
          <div className="section-heading" data-reveal>
            <p className="section-index">02</p>
            <h2>Один рабочий ритм — от смены до выплаты</h2>
            <p>Каждое действие получает понятный статус, ответственного и место в общей истории.</p>
          </div>
          <ol className="workflow-list">
            {workflow.map(([number, title, text]) => <li key={number} data-reveal>
              <span className="workflow-number">{number}</span>
              <span className="workflow-mark" aria-hidden="true"><Logo compact /></span>
              <div><h3>{title}</h3><p>{text}</p></div>
            </li>)}
          </ol>
        </div>
      </section>

      <section className="section features-section" id="features">
        <div className="container">
          <div className="section-heading" data-reveal>
            <p className="section-index">03</p>
            <h2>Рабочие инструменты вместо ещё одной таблицы</h2>
          </div>

          <article className="feature-block" data-reveal>
            <div className="feature-copy"><CalendarCheck2 /><p className="feature-kicker">Смены и подтверждения</p><h3>Проверяйте факт, а не собирайте сообщения</h3><p>Сотрудник вносит смену, управляющий видит детали и принимает решение. Pending-записи не теряются в чате.</p><ul><li>Кто, где и когда работал</li><li>Часы, статус и начисление</li><li>Редактирование, approve и reject</li></ul></div>
            <ProductImage src="/screens/admin-shifts.png" alt="Таблица смен со статусами в web-админке" />
          </article>

          <article className="feature-block feature-reversed" data-reveal>
            <div className="feature-copy"><WalletCards /><p className="feature-kicker">Расчёты и выплаты</p><h3>Отделяйте начисленное от фактически выплаченного</h3><p>Расчёт сохраняется как снимок периода. Частичные и полные выплаты фиксируются отдельно и не меняют историю задним числом.</p><ul><li>Утверждённые смены, бонусы и удержания</li><li>Черновик и фиксация расчёта</li><li>Начислено, выплачено и осталось</li></ul></div>
            <ProductImage src="/screens/admin-payroll.png" alt="Расчёты выплат в web-админке" />
          </article>

          <article className="feature-block" data-reveal>
            <div className="feature-copy"><Building2 /><p className="feature-kicker">Точки и роли</p><h3>Одна команда может работать в разных местах</h3><p>Основная точка сотрудника и фактическая точка смены учитываются отдельно. Управляющий видит только разрешённый контур.</p><ul><li>Активные и архивные сотрудники</li><li>Несколько точек без дублирования людей</li><li>Роли и точечные разрешения</li></ul></div>
            <ProductImage src="/screens/admin-team.png" alt="Управление командой и ролями в web-админке" />
          </article>

          <article className="feature-block feature-reversed" data-reveal>
            <div className="feature-copy"><CircleDollarSign /><p className="feature-kicker">Обзор и отчётность</p><h3>Смотрите, что требует внимания прямо сейчас</h3><p>Web-обзор собирает реальные задачи, текущие смены и расчёты. XLSX и CSV помогают передать данные дальше без ручной пересборки.</p><ul><li>Сводка по доступным точкам</li><li>Экспорт смен и расчётов</li><li>Умная сводка объясняет готовые метрики</li></ul></div>
            <ProductImage src="/screens/admin-overview.png" alt="Операционный обзор собственника" />
          </article>
        </div>
      </section>

      <section className="section roles-section">
        <div className="container roles-layout" data-reveal>
          <div className="section-heading compact"><p className="section-index">04</p><h2>Каждой роли — свой уровень ясности</h2></div>
          <div className="roles-panel">
            <div className="role-tabs" role="tablist" aria-label="Роли в продукте">
              {roles.map((role) => <button key={role.id} type="button" role="tab" aria-selected={role.id === roleId} aria-controls="role-panel" onClick={() => setRoleId(role.id)}>{role.label}</button>)}
            </div>
            <div className="role-content" id="role-panel" role="tabpanel">
              <div><h3>{activeRole.title}</h3><p>{activeRole.text}</p></div>
              <ul>{activeRole.points.map((point) => <li key={point}><Check />{point}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section migration-section">
        <div className="container migration-layout" data-reveal>
          <div><p className="section-index">05</p><h2>Не начинайте учёт заново</h2><p>Поможем перенести сотрудников, точки и основные правила из вашей текущей таблицы. Это услуга запуска, а не обещание автоматического импорта.</p></div>
          <ol>
            <li><span>1</span><div><strong>Присылаете таблицу</strong><small>Без подготовки нового шаблона.</small></div></li>
            <li><span>2</span><div><strong>Вместе проверяем структуру</strong><small>Уточняем точки, роли и правила.</small></div></li>
            <li><span>3</span><div><strong>Настраиваем первую точку</strong><small>Проверяем данные на реальном процессе.</small></div></li>
            <li><span>4</span><div><strong>Команда начинает работать</strong><small>Сопровождаем первые смены.</small></div></li>
          </ol>
        </div>
      </section>

      <section className="section calculator-section">
        <div className="container calculator-layout" data-reveal>
          <div className="calculator-copy"><Calculator /><p className="section-index">06</p><h2>Сколько сейчас стоит ручной процесс?</h2><p>Это ориентир для разговора о процессе, а не обещание гарантированной экономии.</p></div>
          <div className="calculator-form">
            <label><span>Часов в неделю на графики и сверки</span><input type="number" min="0" step="1" value={hours} onChange={(event) => setHours(Number(event.target.value) || 0)} /></label>
            <label><span>Стоимость часа управляющего, ₽</span><input type="number" min="0" step="100" value={hourCost} onChange={(event) => setHourCost(Number(event.target.value) || 0)} /></label>
            <label><span>Ошибки и пересчёты в месяц, ₽</span><input type="number" min="0" step="500" value={extraCost} onChange={(event) => setExtraCost(Number(event.target.value) || 0)} /></label>
            <div className="calculator-result" aria-live="polite"><span>Оценка стоимости ручного процесса</span><strong>{Math.round(manualCost).toLocaleString('ru-RU')} ₽ <small>в месяц</small></strong><p>{hours.toLocaleString('ru-RU')} ч × 4,3 × {hourCost.toLocaleString('ru-RU')} ₽ + {extraCost.toLocaleString('ru-RU')} ₽</p></div>
          </div>
        </div>
      </section>

      <section className="section pricing-section" id="pricing">
        <div className="container">
          <div className="section-heading" data-reveal><p className="section-index">07</p><h2>Прозрачные тарифы без длинного согласования</h2><p>Финальные условия фиксируем перед пилотом. Автоматический биллинг пока не требуется для запуска.</p></div>
          <div className="pricing-grid">
            {pricing.map((plan) => <article className={`pricing-plan${plan.recommended ? ' recommended' : ''}`} key={plan.name} data-reveal>
              {plan.recommended && <span className="plan-label">Рекомендуемый</span>}
              <h3>{plan.name}</h3><p className="plan-price">{plan.price}<span>/ месяц</span></p><p className="plan-scope">{plan.scope}</p>
              <ul>{plan.points.map((point) => <li key={point}><Check />{point}</li>)}</ul>
              <ActionLink href={siteConfig.leadUrl} variant={plan.recommended ? 'primary' : 'secondary'}>Обсудить пилот</ActionLink>
            </article>)}
          </div>
          <div className="enterprise-row" data-reveal><div><h3>Enterprise</h3><p>Для сложной оргструктуры, интеграционных требований и нескольких юридических лиц. Состав и цена — по запросу.</p></div><ActionLink href={siteConfig.leadUrl} variant="secondary">Обсудить задачу</ActionLink></div>
        </div>
      </section>

      <section className="section pilot-section" id="pilot">
        <div className="container pilot-layout" data-reveal>
          <div><p className="eyebrow">Честный старт</p><h2>Ищем несколько команд для пилотного запуска</h2><p>Проверим продукт на ваших реальных процессах и вместе найдём границу между полезной автоматизацией и лишней сложностью.</p><ActionLink href={siteConfig.leadUrl}>Стать участником пилота <ArrowRight /></ActionLink></div>
          <ul><li><Users /><span><strong>Поможем с настройкой</strong><small>Точки, сотрудники, роли и правила.</small></span></li><li><FileSpreadsheet /><span><strong>Перенесём исходные данные</strong><small>Как услугу запуска, без обещания автоимпорта.</small></span></li><li><MessageSquareText /><span><strong>Соберём обратную связь</strong><small>По первым сменам и расчётам.</small></span></li><li><ShieldCheck /><span><strong>Дадим прямую поддержку</strong><small>На период пилотной проверки.</small></span></li></ul>
        </div>
      </section>

      <section className="section faq-section" id="faq">
        <div className="container faq-layout">
          <div className="section-heading compact" data-reveal><p className="section-index">08</p><h2>Частые вопросы</h2><p>Без обещаний функций, которых ещё нет.</p></div>
          <div className="faq-list" data-reveal>
            {faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown /></summary><p>{answer}</p></details>)}
          </div>
        </div>
      </section>

      <section className="final-cta section">
        <div className="container final-cta-inner" data-reveal>
          <div><h2>Соберите смены и расчёты в одном рабочем контуре</h2><p>Покажем продукт на ваших реальных процессах и поможем настроить первую точку.</p></div>
          <ActionLink href={siteConfig.leadUrl}>Запросить пилот <ArrowRight /></ActionLink>
        </div>
      </section>
    </main>

    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand"><Logo /><p>Смены, люди и расчёты — в одном спокойном рабочем контуре.</p></div>
        <nav aria-label="Навигация в подвале">{navigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>
        <div className="footer-links"><a href={siteConfig.contactUrl}>Контакт</a><a href={siteConfig.appUrl}>Войти в систему</a><span aria-disabled="true">Политика конфиденциальности — готовится</span><span aria-disabled="true">Пользовательское соглашение — готовится</span></div>
      </div>
      <div className="container footer-bottom"><span>© 2026 Порядок.Смены</span><span>Продукт находится на этапе пилотного запуска</span></div>
    </footer>
  </>;
}
