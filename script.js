(() => {
  'use strict';

  // ---------- Константы ----------
  const STORAGE_KEY = 'quiz:v1';
  const QUESTIONS = ['gender', 'age', 'goal'];
  const LOADER = QUESTIONS.length; // 3
  const FINAL = LOADER + 1; // 4
  const TOTAL = 4;
  const ADVANCE_MS = 250;
  const LOADER_MS = 3000;
  const UTM_KEY = /^(utm_[a-z0-9_]+|subid\d*|sub_id\d*|clickid|gclid|fbclid)$/i;

  // ---------- DOM ----------
  const quizHeader = document.querySelector('.quiz__header');
  const steps = [...document.querySelectorAll('.step')];
  const backBtn = document.getElementById('back-btn');
  const progress = document.getElementById('progress');
  const progressFill = document.getElementById('progress-fill');
  const count = document.getElementById('count');
  const meterFill = document.getElementById('meter-fill');
  const percent = document.getElementById('percent');
  const candlesBox = document.getElementById('candles');
  const offer = document.getElementById('offer-link');

  // ---------- Хранилище ----------
  const load = () => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return s && typeof s === 'object' ? s : {};
    } catch {
      return {};
    }
  };

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  };

  const saved = load();
  const state = {
    step: Number.isInteger(saved.step) ? saved.step : 0,
    answers:
      saved.answers && typeof saved.answers === 'object' ? saved.answers : {},
    utm: saved.utm && typeof saved.utm === 'object' ? saved.utm : {},
    done: Boolean(saved.done),
  };

  const maxStep = () => {
    const firstEmpty = QUESTIONS.findIndex((q) => !state.answers[q]);
    if (firstEmpty !== -1) return firstEmpty;
    return state.done ? FINAL : LOADER;
  };

  const clamp = (n) =>
    Math.max(0, Math.min(Number.isFinite(n) ? n : 0, maxStep()));

  // ---------- Обновление выбранных состояний ----------
  function updateOptionClasses() {
    document.querySelectorAll('.option').forEach((label) => {
      const input = label.querySelector('input[type="radio"]');
      if (input) {
        label.classList.toggle('option--selected', input.checked);
      }
    });
  }

  // ---------- Рендер ----------
  let current = -1;
  let raf = 0;
  let locked = false;

  function render(step, focus) {
    current = step;
    steps.forEach((el, i) => el.classList.toggle('step--active', i === step));

    // Скрываем верхний прогресс-бар на финальном шаге
    if (quizHeader) {
      quizHeader.style.display = step === FINAL ? 'none' : 'flex';
    }

    backBtn.hidden = step === 0;

    const n = Math.min(step + 1, TOTAL);
    progressFill.style.width = `${(n / TOTAL) * 100}%`;
    count.textContent = `${n} из ${TOTAL}`;
    progress.setAttribute('aria-valuenow', n);

    state.step = step;
    save();
    updateOptionClasses();

    cancelAnimationFrame(raf);
    if (step === LOADER) runLoader();
    if (focus)
      steps[step].querySelector('.step__title').focus({ preventScroll: true });
  }

  // ---------- История ----------
  const depth = () =>
    history.state && Number.isInteger(history.state.i) ? history.state.i : 0;

  function go(step, mode = 'push') {
    step = clamp(step);
    const url = new URL(location.href);
    url.searchParams.set('step', step + 1);
    const st = { step, i: mode === 'push' ? depth() + 1 : depth() };
    if (mode === 'push') history.pushState(st, '', url);
    else history.replaceState(st, '', url);
    render(step, true);
  }

  window.addEventListener('popstate', (e) => {
    render(clamp(e.state && e.state.step), true);
  });

  backBtn.addEventListener('click', () => {
    const prev = current === FINAL ? LOADER - 1 : current - 1;
    if (depth() > 0) history.back();
    else go(prev, 'replace');
  });

  // ---------- Ответы ----------
  document.addEventListener('click', (e) => {
    const input = e.target.closest('input[type="radio"]');
    if (!input) return;
    if (locked) {
      e.preventDefault();
      return;
    }

    state.answers[input.name] = input.value;
    save();
    updateOptionClasses();

    locked = true;
    const from = current;
    setTimeout(() => {
      locked = false;
      if (current === from) go(from + 1);
    }, ADVANCE_MS);
  });

  // ---------- Лоадер ----------
  const heights = [34, 52, 44, 66, 58, 80, 62, 90, 72, 96, 78, 88, 70, 100];
  heights.forEach((h, i) => {
    const candle = document.createElement('i');
    candle.className =
      'loader__candle' + (i % 3 === 2 ? ' loader__candle--down' : '');
    candle.style.setProperty('--h', `${h * 0.9}%`);
    candlesBox.appendChild(candle);
  });
  const candles = [...candlesBox.children];

  function runLoader() {
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / LOADER_MS, 1);
      meterFill.style.transform = `scaleX(${p})`;
      percent.textContent = `${Math.round(p * 100)}%`;
      candles.forEach((c, i) =>
        c.classList.toggle('loader__candle--on', p > i / candles.length),
      );
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        state.done = true;
        save();
        go(FINAL, 'replace');
      }
    };
    raf = requestAnimationFrame(tick);
  }

  // ---------- UTM ----------
  const params = new URLSearchParams(location.search);
  params.forEach((value, key) => {
    if (UTM_KEY.test(key)) state.utm[key] = value;
  });

  function decorateOffer() {
    const base = offer.getAttribute('href');
    if (!/^https?:\/\//i.test(base)) return;
    const url = new URL(base);
    Object.entries(state.utm).forEach(([k, v]) => {
      if (!url.searchParams.has(k)) url.searchParams.set(k, v);
    });
    offer.href = url.href;
  }

  // ---------- Старт ----------
  document.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.checked = state.answers[input.name] === input.value;
  });
  decorateOffer();

  const fromUrl = parseInt(params.get('step'), 10);
  const start = clamp(Number.isNaN(fromUrl) ? state.step : fromUrl - 1);
  const url = new URL(location.href);
  url.searchParams.set('step', start + 1);
  history.replaceState({ step: start, i: depth() }, '', url);
  render(start, false);
})();
