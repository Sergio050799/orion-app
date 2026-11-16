/* Cortina circular de entrada/salida (login → app y app → login).
   wipeIn(x,y): expande un círculo desde (x,y) hasta cubrir la pantalla y resuelve cuando ya cubre.
   wipeOutIfPending(): en la página siguiente (dashboard o login) cierra el círculo y retira la cortina.
   El estado viaja por sessionStorage porque el cierre de sesión recarga la página (window.location). */
import '@/styles/orion-wipe.css';

const ID = 'orion-wipe';
const KEY = 'orion:wipe';

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function make(): HTMLElement {
  let el = document.getElementById(ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ID;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="orion-wipe-logo"></span>';
    document.body.appendChild(el);
  }
  return el;
}

export function wipeIn(x?: number, y?: number): Promise<void> {
  if (reduced()) return Promise.resolve();
  const el = make();
  el.className = '';
  el.style.setProperty('--x', `${x ?? window.innerWidth / 2}px`);
  el.style.setProperty('--y', `${y ?? window.innerHeight / 2}px`);
  void el.offsetWidth;
  el.classList.add('go');
  try { sessionStorage.setItem(KEY, '1'); } catch { /* sin almacenamiento */ }
  return new Promise(res => setTimeout(res, 820));
}

export function wipeOutIfPending(): void {
  try {
    if (sessionStorage.getItem(KEY) !== '1') return;
    sessionStorage.removeItem(KEY);
  } catch { return; }
  let el = document.getElementById(ID);
  if (!el) {            /* recarga completa (cierre de sesión): arranca ya cubierta */
    el = make();
    el.classList.add('held');
    void el.offsetWidth;
  }
  el.classList.remove('go', 'held');
  el.classList.add('out');
  setTimeout(() => el && el.remove(), 800);
}
