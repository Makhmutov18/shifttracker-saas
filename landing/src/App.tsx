import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CaretDown,
  Check,
  Clock,
  CurrencyRub,
  DeviceMobile,
  FileXls,
  List,
  ListChecks,
  MapPin,
  ShieldCheck,
  Storefront,
  UsersThree,
  X,
} from '@phosphor-icons/react';
import { siteConfig } from './config';

const workflow = [
  { number: '01', title: 'Сотрудник вносит смену', text: 'В Telegram, сразу после работы.' },
  { number: '02', title: 'Администратор проверяет', text: 'Видит часы, точку, выручку и начисление.' },
  { number: '03', title: 'Владелец фиксирует расчёт', text: 'Сохраняет суммы и отмечает реальные выплаты.' },
];

const capabilities = [
  { icon: ListChecks, title: 'Подтверждение смен', text: 'Ожидающие смены собраны в одной очереди с понятными статусами.' },
  { icon: CurrencyRub, title: 'Начисления и выплаты', text: 'Отдельно видно, сколько начислено, выплачено и осталось.' },
  { icon: MapPin, title: 'Несколько точек', text: 'Основная точка сотрудника и фактическая точка смены не смешиваются.' },
  { icon: UsersThree, title: 'Команда и доступы', text: 'Роли сотрудника, администратора и владельца с нужными правами.' },
  { icon: FileXls, title: 'Отчёты без ручной сборки', text: 'Готовый Excel и CSV по сменам, сотрудникам и расчётам.' },
  { icon: ShieldCheck, title: 'История действий', text: 'Изменения и управленческие действия остаются проверяемыми.' },
];

const roles = [
  ['Сотруднику', 'Внести смену, проверить статус и увидеть историю выплат.'],
  ['Администратору', 'Проверить смены, управлять командой и подготовить расчёт.'],
  ['Владельцу', 'Понять, что требует внимания, и видеть деньги по каждой точке.'],
];

const faqs = [
  ['Это замена кассе или бухгалтерии?', 'Нет. Порядок.Смены отвечает за смены, начисления и фиксацию выплат. Касса и бухгалтерский учёт остаются в своих системах.'],
  ['Нужно устанавливать приложение сотрудникам?', 'Нет. Сотрудники работают внутри Telegram Mini App, а владельцы и администраторы могут использовать веб-панель.'],
  ['Можно учитывать работу на разных точках?', 'Да. Смена хранит фактическую точку работы отдельно от основной точки сотрудника.'],
  ['Система сама переводит зарплату?', 'Нет. Она рассчитывает и фиксирует факт выплаты, но не переводит деньги.'],
];

function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      elements.forEach((element) => element.dataset.visible = 'true');
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset.visible = 'true';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Порядок.Смены, на главную">
          <span className="brand-mark">П</span>
          <span>Порядок.Смены</span>
        </a>

        <nav className={`site-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Основная навигация">
          <a href="#features" onClick={closeMenu}>Продукт</a>
          <a href="#workflow" onClick={closeMenu}>Как работает</a>
          <a href="#pilot" onClick={closeMenu}>Пилот</a>
          <a href="#faq" onClick={closeMenu}>Вопросы</a>
        </nav>

        <div className="header-actions">
          <a className="button button-quiet desktop-login" href={siteConfig.appUrl}>Войти</a>
          <a className="button button-primary header-cta" href={siteConfig.leadUrl}>Обсудить пилот</a>
          <button
            className="menu-button"
            type="button"
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={22} /> : <List size={22} />}
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy" data-reveal>
            <p className="context-line"><span /> Для бизнеса со сменными командами</p>
            <h1>Смены и выплаты без ручной сверки</h1>
            <p className="hero-lead">Сотрудники вносят смены в Telegram, администратор подтверждает, владелец видит начисления и выплаты.</p>
            <div className="hero-actions">
              <a className="button button-primary button-large" href={siteConfig.leadUrl}>
                Обсудить пилот <ArrowRight size={19} weight="bold" />
              </a>
              <a className="text-link" href="#product-view">Посмотреть продукт <ArrowRight size={17} /></a>
            </div>
            <div className="hero-assurances" aria-label="Основные преимущества">
              <span><Check size={16} weight="bold" /> Запуск с вашей командой</span>
              <span><Check size={16} weight="bold" /> Без установки сотрудникам</span>
            </div>
          </div>

          <div className="hero-visual" data-reveal>
            <div className="desktop-frame">
              <div className="frame-bar"><i /><i /><i /><span>Панель владельца</span></div>
              <img src="/screens/admin-overview.png" alt="Обзор смен и выплат в веб-панели Порядок.Смены" />
            </div>
            <div className="mobile-frame">
              <div className="mobile-speaker" />
              <img src="/screens/mini-dashboard.png" alt="Главная страница сотрудника в Telegram Mini App" />
            </div>
          </div>
        </section>

        <section className="audience-strip" aria-label="Для каких команд подходит продукт">
          <p>Кофейни</p><span /> <p>Бары</p><span /> <p>Пекарни</p><span /> <p>Рестораны</p><span /> <p>Небольшие сети</p>
        </section>

        <section className="section workflow-section" id="workflow">
          <div className="section-heading" data-reveal>
            <p className="section-kicker">Один рабочий контур</p>
            <h2>От закрытой смены до зафиксированной выплаты</h2>
            <p>Каждый участник видит свою часть процесса, а цифры не приходится собирать заново.</p>
          </div>
          <div className="workflow-line">
            {workflow.map((item) => (
              <article className="workflow-step" key={item.number} data-reveal>
                <span>{item.number}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section product-section" id="product-view">
          <div className="product-intro" data-reveal>
            <p className="section-kicker">Рабочая картина</p>
            <h2>Сразу видно, что происходит сейчас</h2>
            <p>Ожидающие смены, начисления, фактические выплаты и состояние точек находятся в одном обзоре.</p>
          </div>
          <figure className="product-shot" data-reveal>
            <img src="/screens/admin-overview.png" alt="Рабочий обзор владельца с начислениями, сменами и точками" />
            <figcaption><Clock size={17} /> Реальные данные по текущему периоду и выбранной точке</figcaption>
          </figure>
        </section>

        <section className="section split-showcase" id="features">
          <div className="split-copy" data-reveal>
            <p className="section-kicker">Два удобных интерфейса</p>
            <h2>Telegram для команды. Веб-панель для управления.</h2>
            <p>Сотруднику не нужно осваивать тяжёлую систему. Администратор при этом получает полноценный рабочий инструмент.</p>
            <ul className="clean-list">
              <li><DeviceMobile size={20} /> Смена, история и выплаты внутри Telegram</li>
              <li><Storefront size={20} /> Управление точками и командой в веб-панели</li>
              <li><ShieldCheck size={20} /> Разные возможности для каждой роли</li>
            </ul>
          </div>
          <div className="payroll-shot" data-reveal>
            <img src="/screens/admin-payroll.png" alt="Расчёты начислений и фактических выплат в веб-панели" />
          </div>
        </section>

        <section className="section capabilities-section">
          <div className="section-heading compact" data-reveal>
            <p className="section-kicker">Внутри продукта</p>
            <h2>Достаточно функций, чтобы навести порядок</h2>
          </div>
          <div className="capability-list">
            {capabilities.map(({ icon: Icon, title, text }) => (
              <article className="capability-row" key={title} data-reveal>
                <Icon size={23} />
                <h3>{title}</h3>
                <p>{text}</p>
                <ArrowRight size={18} />
              </article>
            ))}
          </div>
        </section>

        <section className="roles-band">
          <div className="roles-heading" data-reveal>
            <p className="section-kicker">Одна система, три взгляда</p>
            <h2>Ничего лишнего для каждой роли</h2>
          </div>
          <div className="roles-list">
            {roles.map(([title, text], index) => (
              <div className="role-item" key={title} data-reveal>
                <span>0{index + 1}</span><h3>{title}</h3><p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section pilot-section" id="pilot">
          <div className="pilot-copy" data-reveal>
            <p className="section-kicker">Пилотный запуск</p>
            <h2>Проверим продукт на вашей реальной команде</h2>
            <p>Поможем настроить точки, сотрудников и правила оплаты. Вы оцените процесс на настоящих сменах без длинного внедрения.</p>
            <a className="button button-primary button-large" href={siteConfig.contactUrl}>
              Обсудить пилот <ArrowRight size={19} weight="bold" />
            </a>
          </div>
          <div className="pilot-details" data-reveal>
            <div><span>01</span><p>Настраиваем структуру точек и роли команды</p></div>
            <div><span>02</span><p>Переносим действующие модели оплаты</p></div>
            <div><span>03</span><p>Проводим первые смены и расчёт вместе</p></div>
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="faq-heading" data-reveal>
            <p className="section-kicker">Частые вопросы</p>
            <h2>Коротко о важном</h2>
          </div>
          <div className="faq-list">
            {faqs.map(([question, answer]) => (
              <details key={question} data-reveal>
                <summary>{question}<CaretDown size={20} /></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand"><span className="brand-mark">П</span><strong>Порядок.Смены</strong></div>
        <p>Смены, начисления и выплаты в понятном порядке.</p>
        <div><a href="#features">Продукт</a><a href="#pilot">Пилот</a><a href={siteConfig.appUrl}>Войти</a></div>
      </footer>
    </div>
  );
}

export default App;
