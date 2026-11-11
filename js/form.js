// The join questionnaire: one question per screen.
// Owns a business  -> industry -> company -> country -> name -> phone
// Not yet          -> country -> name -> phone

import { CONFIG } from './config.js';
import { COUNTRIES } from './countries.js';

const INDUSTRIES = [
  'Technology', 'Real Estate', 'Finance & Investment', 'Trading & Retail', 'E-commerce', 'Hospitality & Tourism',
  'Healthcare', 'Construction', 'Logistics', 'Marketing & Media', 'Consulting', 'Manufacturing', 'Energy',
  'Education', 'Food & Beverage', 'Other',
];

export function initJoin({ onOpen, onClose } = {}) {
  const dialog = document.getElementById('joinDialog');
  const form = document.getElementById('joinForm');
  const bar = document.getElementById('joinBar');
  const nav = document.getElementById('joinNav');
  const nextBtn = document.getElementById('joinNext');
  const backBtn = document.getElementById('joinBack');
  const steps = Object.fromEntries([...form.querySelectorAll('[data-step]')].map((el) => [el.dataset.step, el]));
  const fCompany = document.getElementById('fCompany');
  const fCountry = document.getElementById('fCountry');
  const fName = document.getElementById('fName');
  const fPhone = document.getElementById('fPhone');
  const fDial = document.getElementById('fDial');
  const list = document.getElementById('countryList');
  const chips = document.getElementById('industryChips');

  const data = { ownsBusiness: null, industry: '', company: '', country: null, name: '', phone: '' };
  let current = 'business';
  let lastFocus = null;
  let sending = false;

  const flow = () => (data.ownsBusiness === false
    ? ['business', 'country', 'name', 'phone']
    : ['business', 'industry', 'company', 'country', 'name', 'phone']);

  // ----- build the industry chips and dial-code list -----
  INDUSTRIES.forEach((name) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = name;
    b.addEventListener('click', () => {
      data.industry = name;
      chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-selected', c === b));
      setTimeout(next, 180);
    });
    chips.appendChild(b);
  });
  COUNTRIES.forEach((c) => {
    const o = document.createElement('option');
    o.value = c.c; o.textContent = `${c.n} (+${c.d})`;
    fDial.appendChild(o);
  });
  fDial.value = 'AE';

  // ----- country search -----
  let active = -1, shown = [];
  function renderCountries() {
    const q = fCountry.value.trim().toLowerCase();
    shown = !q ? [] : COUNTRIES.filter((c) => c.n.toLowerCase().includes(q))
      .sort((a, b) => a.n.toLowerCase().indexOf(q) - b.n.toLowerCase().indexOf(q)).slice(0, 8);
    if (data.country && data.country.n === fCountry.value) shown = [];
    active = shown.length ? 0 : -1;
    list.innerHTML = '';
    shown.forEach((c, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option'); li.id = 'country-' + c.c; li.textContent = c.n;
      li.setAttribute('aria-selected', i === active ? 'true' : 'false');
      li.addEventListener('pointerdown', (e) => { e.preventDefault(); pickCountry(c); setTimeout(next, 160); });
      list.appendChild(li);
    });
    fCountry.setAttribute('aria-expanded', shown.length ? 'true' : 'false');
  }
  function pickCountry(c) {
    data.country = c; fCountry.value = c.n; fDial.value = c.c;
    list.innerHTML = ''; shown = []; active = -1;
    fCountry.setAttribute('aria-expanded', 'false');
  }
  function moveActive(d) {
    if (!shown.length) return;
    active = (active + d + shown.length) % shown.length;
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', i === active ? 'true' : 'false'));
    list.children[active].scrollIntoView({ block: 'nearest' });
  }
  fCountry.addEventListener('input', () => { data.country = null; renderCountries(); setError('country', ''); });
  fCountry.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
  });

  // ----- business yes / no -----
  steps.business.querySelectorAll('.choice').forEach((b) => {
    b.addEventListener('click', () => {
      data.ownsBusiness = b.dataset.value === 'yes';
      steps.business.querySelectorAll('.choice').forEach((c) => c.classList.toggle('is-selected', c === b));
      setTimeout(next, 180);
    });
  });

  function setError(step, msg) {
    const el = steps[step].querySelector('.error');
    if (el) el.textContent = msg;
  }

  function validate(step) {
    if (step === 'business') return data.ownsBusiness !== null;
    if (step === 'industry') return !!data.industry;
    if (step === 'company') {
      data.company = fCompany.value.trim();
      if (!data.company) { setError(step, 'Please enter your company name.'); return false; }
    }
    if (step === 'country') {
      if (!data.country) {
        const exact = COUNTRIES.find((c) => c.n.toLowerCase() === fCountry.value.trim().toLowerCase());
        if (exact) pickCountry(exact);
        else if (shown.length) pickCountry(shown[Math.max(0, active)]);
      }
      if (!data.country) { setError(step, 'Please choose your country from the list.'); return false; }
    }
    if (step === 'name') {
      data.name = fName.value.trim();
      if (data.name.length < 2) { setError(step, 'Please enter your name.'); return false; }
    }
    if (step === 'phone') {
      const digits = fPhone.value.replace(/\D/g, '');
      if (digits.length < 5 || digits.length > 15) { setError(step, 'Please enter a valid phone number.'); return false; }
      const dial = COUNTRIES.find((c) => c.c === fDial.value);
      data.phone = `+${dial ? dial.d : ''} ${digits.replace(/^0+/, '')}`;
    }
    setError(step, '');
    return true;
  }

  function show(step, back = false) {
    const prev = steps[current];
    current = step;
    Object.values(steps).forEach((el) => { el.classList.remove('is-active', 'is-back'); el.inert = true; });
    if (prev && prev !== steps[step]) prev.classList.toggle('is-back', !back);
    const el = steps[step];
    el.inert = false;
    el.classList.add('is-active');
    const f = flow();
    const i = f.indexOf(step);
    bar.style.transform = `scaleX(${step === 'done' ? 1 : i / f.length})`;
    nav.classList.toggle('is-hidden', step === 'done');
    backBtn.style.visibility = i > 0 ? 'visible' : 'hidden';
    const auto = step === 'business' || step === 'industry';
    nextBtn.style.display = auto ? 'none' : '';
    nav.querySelector('.join__hint').style.visibility = auto || step === 'done' ? 'hidden' : 'visible';
    nextBtn.textContent = step === 'phone' ? 'Join the club' : 'Continue';
    // Focus the first control. Skip on touch for choice screens so the keyboard doesn't jump up.
    const target = step === 'done' ? document.getElementById('joinClose') : el.querySelector('input, select') || el.querySelector('.is-selected, .choice, .chip');
    if (target) setTimeout(() => target.focus({ preventScroll: true }), 120);
  }

  async function submit() {
    if (sending) return;
    sending = true; nextBtn.disabled = true; nextBtn.textContent = 'Sending…';
    const payload = {
      owns_business: data.ownsBusiness ? 'Yes' : 'No',
      industry: data.ownsBusiness ? data.industry : '',
      company: data.ownsBusiness ? data.company : '',
      country: data.country.n,
      name: data.name,
      phone: data.phone,
      _subject: `New EBC member: ${data.name}`,
    };
    try {
      if (CONFIG.FORM_ENDPOINT) {
        const res = await fetch(CONFIG.FORM_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Request failed');
      } else {
        console.info('[EBC] No form endpoint set yet. This is what would be sent:', payload);
      }
      document.getElementById('doneName').textContent = ', ' + data.name.split(/\s+/)[0];
      show('done');
    } catch (err) {
      setError('phone', 'Something went wrong sending your details. Please try again, or message us on WhatsApp.');
      nextBtn.textContent = 'Join the club';
    } finally {
      sending = false; nextBtn.disabled = false;
    }
  }

  function next() {
    if (current === 'done' || !validate(current)) return;
    const f = flow(), i = f.indexOf(current);
    if (i === f.length - 1) submit(); else show(f[i + 1]);
  }
  function back() {
    const f = flow(), i = f.indexOf(current);
    if (i > 0) show(f[i - 1], true);
  }

  nextBtn.addEventListener('click', next);
  backBtn.addEventListener('click', back);
  form.addEventListener('submit', (e) => e.preventDefault());
  [fCompany, fName, fPhone].forEach((el) => el.addEventListener('input', () => setError(current, '')));

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A' && e.target.tagName !== 'SELECT') { e.preventDefault(); next(); }
    if (current === 'business' && !e.metaKey && !e.ctrlKey) {
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'y') steps.business.querySelector('[data-value="yes"]').click();
      if (k === 'b' || k === 'n') steps.business.querySelector('[data-value="no"]').click();
    }
    // keep keyboard focus inside the dialog
    if (e.key === 'Tab') {
      const f = [...dialog.querySelectorAll('button, a[href], input, select')].filter((n) => n.offsetParent !== null && !n.closest('[inert]') && getComputedStyle(n).visibility !== 'hidden');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ----- store buttons: placeholders until links are added in config.js -----
  const stores = [['storeApple', CONFIG.APP_STORE_URL], ['storeGoogle', CONFIG.GOOGLE_PLAY_URL]];
  let anyLive = false;
  stores.forEach(([id, url]) => {
    const a = document.getElementById(id);
    if (url) { a.href = url; anyLive = true; }
    else {
      a.classList.add('is-soon'); a.removeAttribute('target'); a.setAttribute('aria-disabled', 'true');
      a.addEventListener('click', (e) => e.preventDefault());
    }
  });
  if (anyLive) document.getElementById('storeNote').textContent = 'Download the app and sign in with the phone number you just gave us.';

  function open() {
    lastFocus = document.activeElement;
    dialog.hidden = false;
    document.body.classList.add('is-locked');
    requestAnimationFrame(() => dialog.classList.add('is-open'));
    show(current === 'done' ? 'done' : current);
    onOpen && onOpen();
  }
  function close() {
    dialog.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    setTimeout(() => { dialog.hidden = true; }, 300);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
    onClose && onClose();
  }
  document.getElementById('joinClose').addEventListener('click', close);
  document.querySelectorAll('[data-open-join]').forEach((b) => b.addEventListener('click', open));

  return { open, close };
}
