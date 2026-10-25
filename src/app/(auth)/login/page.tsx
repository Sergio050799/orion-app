"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

/* ── tipos internos ───────────────────────────────────────────── */
type Star = {
  x: number; y: number; r: number; a: number;
  ph: number; sp: number; dp: number;
  dx: number; dy: number; c: string;
};

type Anim = {
  /* loop */
  raf: number; lastMs: number; tt: number; speed: number; target: number;
  reduced: boolean;
  /* ring */
  rw: number; rh: number; dpr: number; rotS: number; rv: number;
  ringCache: HTMLCanvasElement | null;
  /* sky */
  stars: Star[]; skyW: number; skyH: number; skyDpr: number;
  px: number; py: number; fade: number;
  /* cursor */
  ptr: { x: number; y: number; on: boolean };
  /* flags de la secuencia */
  litDone: boolean; readyDone: boolean;
};

const T_LIT   = 2.0;
const T_READY = 4.2;
const CS      = 1100;                       /* tamaño cache del aro */
const RC      = (CS / 1.8) * 0.5 * 0.93;   /* radio del aro ≈ 318 */
const N       = 360;
const COLORS  = ['205,220,255','205,220,255','170,186,255','150,170,255'];

/* ── helpers de canvas ────────────────────────────────────────── */
function clamp(v: number, a = 0, b = 1) { return Math.min(b, Math.max(a, v)); }
function rand(a: number, b: number) { return a + Math.random() * (b - a); }
function ease3(x: number) { return 1 - Math.pow(1 - x, 3); }

function blurInto(
  dst: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  px: number
) {
  const ctx = dst as CanvasRenderingContext2D & { filter?: string };
  if ('filter' in ctx) {
    ctx.filter = `blur(${px}px)`;
    ctx.drawImage(src, 0, 0);
    ctx.filter = 'none';
    return;
  }
  const k  = Math.max(2, Math.round(px / 2.2));
  const t  = document.createElement('canvas');
  t.width  = t.height = Math.ceil(CS / k);
  const tx = t.getContext('2d')!;
  (tx as any).imageSmoothingQuality = 'high';
  tx.drawImage(src, 0, 0, t.width, t.height);
  const u  = document.createElement('canvas');
  u.width  = u.height = Math.ceil(t.width / 2);
  u.getContext('2d')!.drawImage(t, 0, 0, u.width, u.height);
  (dst as any).imageSmoothingQuality = 'high';
  dst.drawImage(u, 0, 0, CS, CS);
}

/* Construye el aro en un canvas fuera de pantalla (se llama una sola vez) */
function makeRing(): HTMLCanvasElement {
  const c   = document.createElement('canvas');
  c.width   = c.height = CS;
  const out = c.getContext('2d')!;
  const cx  = CS / 2, cy = CS / 2;
  out.globalCompositeOperation = 'lighter';

  /* perfil de brillo: más intenso abajo, más fino arriba */
  const prof = (th: number) => {
    const q = (1 + Math.cos(th - Math.PI / 2)) / 2;
    return 0.3 + 0.7 * Math.pow(q, 2);
  };

  function layer(
    bands: [number, string, number, number][],
    blur: number,
    gain = 1
  ) {
    const l   = document.createElement('canvas');
    l.width   = l.height = CS;
    const x   = l.getContext('2d')!;
    x.globalCompositeOperation = 'lighter';

    for (const [w, col, alpha, al] of bands) {
      x.beginPath();
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * 6.2832;
        const r  = RC + (w * prof(th)) / 2;
        i === 0
          ? x.moveTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r)
          : x.lineTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r);
      }
      for (let i = N; i >= 0; i--) {
        const th = (i / N) * 6.2832;
        const r  = RC - (w * prof(th)) / 2;
        x.lineTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r);
      }
      x.closePath();

      let fill: string | CanvasGradient = `rgba(${col},${alpha})`;
      if ('createConicGradient' in x) {
        const g = (x as any).createConicGradient(0, cx, cy);
        for (let k = 0; k <= 36; k++) {
          const th = (k / 36) * 6.2832;
          g.addColorStop(k / 36, `rgba(${col},${(alpha * Math.pow(prof(th), al)).toFixed(4)})`);
        }
        fill = g;
      }
      x.fillStyle = fill;
      x.fill();
    }

    for (let g = 0; g < gain; g++) blurInto(out, l, blur);
  }

  layer([[RC * .62,'30,46,255',.20,1.1],[RC * .44,'44,60,255',.20,1.1]], RC * .15);
  layer([[RC * .26,'52,70,255',.34,1.0],[RC * .16,'80,92,255',.34,1.0]], RC * .065);
  layer([[RC * .085,'110,120,255',.55,1.0],[RC * .05,'160,160,255',.6,1.0]], RC * .022);
  layer([[RC * .026,'225,222,255',.9,1.0],[RC * .011,'252,250,255',1,1.0]], RC * .006, 2);

  return c;
}

/* ── componente ───────────────────────────────────────────────── */
export default function LoginPage() {
  const { login } = useAuth();

  /* estado de escena (controlan clases CSS) */
  const [lit,   setLit]   = useState(false);
  const [ready, setReady] = useState(false);
  const [open,  setOpen]  = useState(false);

  /* estado del formulario */
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  /* refs de canvas */
  const skyRef  = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  /* estado interno de animación (nunca causa re-renders) */
  const anim = useRef<Anim>({
    raf: 0, lastMs: 0, tt: 0, speed: 1, target: 1,
    reduced: false,
    rw: 0, rh: 0, dpr: 1, rotS: 0, rv: 0,
    ringCache: null,
    stars: [], skyW: 0, skyH: 0, skyDpr: 1,
    px: 0, py: 0, fade: 0,
    ptr: { x: -9999, y: -9999, on: false },
    litDone: false, readyDone: false,
  });

  /* ── animación del aro ───────────────────────────────────── */
  const sizeRing = useCallback(() => {
    const ring = ringRef.current;
    if (!ring) return;
    const a   = anim.current;
    const b   = ring.getBoundingClientRect();
    a.dpr     = Math.min(window.devicePixelRatio || 1, 2);
    a.rw      = b.width;
    a.rh      = b.height;
    ring.width  = Math.max(1, Math.round(a.rw * a.dpr));
    ring.height = Math.max(1, Math.round(a.rh * a.dpr));
    const rc  = ring.getContext('2d')!;
    rc.setTransform(a.dpr, 0, 0, a.dpr, 0, 0);
  }, []);

  const drawRing = useCallback((t: number, dt: number) => {
    const ring = ringRef.current;
    if (!ring) return;
    const a   = anim.current;
    const rc  = ring.getContext('2d')!;

    /* crea el cache la primera vez (operación costosa, una sola vez) */
    if (!a.ringCache) a.ringCache = makeRing();

    /* redimensionar si cambió */
    const b   = ring.getBoundingClientRect();
    const nd  = Math.min(window.devicePixelRatio || 1, 2);
    if (!a.rw || Math.abs(b.width - a.rw) > 0.5 || nd !== a.dpr) sizeRing();

    rc.clearRect(0, 0, a.rw, a.rh);
    const cx = a.rw / 2, cy = a.rh / 2;
    const orbW = ring.parentElement?.clientWidth || 300;

    /* progreso de revelado (crece de 0 → 1) */
    const q = a.reduced ? 1 : clamp((t - 0.5) / 3);
    a.rv = q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
    if (a.rv <= 0) return;

    const breath = 1 + 0.012 * Math.sin(t * 1.1);
    const al     = (0.55 + 0.45 * clamp(a.rv * 2.2)) * (0.94 + 0.06 * Math.sin(t * 1.1));

    /* rotación orgánica hacia el cursor */
    let want = 0;
    if (a.ptr.on && !a.reduced) {
      const br  = ring.getBoundingClientRect();
      const an  = Math.atan2(a.ptr.y - (br.top + br.height / 2), a.ptr.x - (br.left + br.width / 2));
      let df    = an - Math.PI / 2;
      while (df >  Math.PI) df -= 6.2832;
      while (df < -Math.PI) df += 6.2832;
      want = df * 0.1;
    }
    want   += a.reduced ? 0 : Math.sin(t * 0.23) * 0.05;
    a.rotS += (want - a.rotS) * Math.min(1, dt * 1.6);

    /* resplandor interior */
    const ig = rc.createRadialGradient(cx, cy + orbW * 0.09, 0, cx, cy + orbW * 0.05, orbW * 0.52);
    ig.addColorStop(0,   `rgba(34,48,225,${0.4 * a.rv})`);
    ig.addColorStop(0.55,`rgba(22,30,160,${0.2 * a.rv})`);
    ig.addColorStop(1,   'rgba(10,14,90,0)');
    rc.globalCompositeOperation = 'lighter';
    rc.globalAlpha = 1;
    rc.fillStyle   = ig;
    rc.beginPath();
    rc.arc(cx, cy, orbW * 0.5, 0, 6.2832);
    rc.fill();

    /* buffer temporal para el aro + máscara de revelado */
    const tmp  = document.createElement('canvas');
    tmp.width  = ring.width;
    tmp.height = ring.height;
    const tc   = tmp.getContext('2d')!;
    tc.setTransform(a.dpr, 0, 0, a.dpr, 0, 0);
    tc.globalCompositeOperation = 'source-over';
    tc.clearRect(0, 0, a.rw, a.rh);
    tc.globalAlpha = 1;
    tc.save();
    tc.translate(cx, cy);
    tc.rotate(a.rotS);
    tc.scale(breath, breath);
    tc.translate(-cx, -cy);
    tc.drawImage(a.ringCache, 0, 0, a.rw, a.rh);
    tc.restore();

    /* máscara de revelado con gradiente cónico */
    if (a.rv < 1 && 'createConicGradient' in tc) {
      const g = (tc as any).createConicGradient(Math.PI / 2, cx, cy);
      const h = a.rv * Math.PI * 1.18;
      const f = 0.75;
      for (let i = 0; i <= 40; i++) {
        const u   = i / 40;
        const phi = Math.min(u, 1 - u) * 2 * Math.PI;
        const av  = clamp((h - phi) / f);
        g.addColorStop(u, `rgba(0,0,0,${av})`);
      }
      tc.globalCompositeOperation = 'destination-in';
      tc.fillStyle = g;
      tc.fillRect(0, 0, a.rw, a.rh);
    }

    rc.globalAlpha = al;
    rc.drawImage(tmp, 0, 0, ring.width, ring.height, 0, 0, a.rw, a.rh);
    rc.globalAlpha = 1;
    rc.globalCompositeOperation = 'source-over';
  }, [sizeRing]);

  /* ── animación del cielo de estrellas ────────────────────── */
  const sizeSky = useCallback(() => {
    const sky = skyRef.current;
    if (!sky) return;
    const a    = anim.current;
    const d    = Math.min(window.devicePixelRatio || 1, 2);
    a.skyDpr   = d;
    a.skyW     = window.innerWidth;
    a.skyH     = window.innerHeight;
    sky.width  = a.skyW * d;
    sky.height = a.skyH * d;
    const sc   = sky.getContext('2d')!;
    sc.setTransform(d, 0, 0, d, 0, 0);
    const n    = Math.min(150, Math.max(50, Math.round(a.skyW * a.skyH / 11000)));
    a.stars    = Array.from({ length: n }, () => ({
      x:  rand(0, a.skyW), y: rand(0, a.skyH),
      r:  rand(.4, 1.35),  a: rand(.14, .5),
      ph: rand(0, 6.28),   sp: rand(.04, .16),
      dp: rand(.3, 1),     dx: 0, dy: 0,
      c:  COLORS[Math.floor(rand(0, COLORS.length))],
    }));
  }, []);

  const drawSky = useCallback((t: number) => {
    const sky = skyRef.current;
    if (!sky) return;
    const a  = anim.current;
    const sc = sky.getContext('2d')!;
    sc.clearRect(0, 0, a.skyW, a.skyH);
    a.fade = a.reduced ? 1 : clamp(t / 2.2);

    const tx = a.ptr.on ? a.ptr.x / a.skyW - 0.5 : 0;
    const ty = a.ptr.on ? a.ptr.y / a.skyH - 0.5 : 0;
    a.px += (tx - a.px) * 0.035;
    a.py += (ty - a.py) * 0.035;

    sc.globalCompositeOperation = 'lighter';
    for (const s of a.stars) {
      const bx = (s.x + Math.sin(t * s.sp + s.ph) * 4 * s.dp + a.skyW - a.px * 20 * s.dp) % a.skyW;
      const by = (s.y + Math.cos(t * s.sp * .72 + s.ph) * 3 * s.dp + a.skyH - a.py * 13 * s.dp) % a.skyH;
      let mx = 0, my = 0, l = 0;
      if (a.ptr.on) {
        const vx = bx - a.ptr.x, vy = by - a.ptr.y;
        const dd = Math.hypot(vx, vy);
        if (dd < 170) {
          const f = Math.pow(1 - dd / 170, 2);
          mx = (vx / (dd || 1)) * 26 * f * s.dp;
          my = (vy / (dd || 1)) * 26 * f * s.dp;
          l  = f * 0.25;
        }
      }
      s.dx += (mx - s.dx) * 0.06;
      s.dy += (my - s.dy) * 0.06;
      const av = clamp(s.a + (a.reduced ? 0 : Math.sin(t * .5 + s.ph) * .05) + l, .04, .8) * a.fade;
      const x  = bx + s.dx, y = by + s.dy;
      if (s.r > 0.95) {
        const g = sc.createRadialGradient(x, y, 0, x, y, s.r * 4);
        g.addColorStop(0,   `rgba(${s.c},${av})`);
        g.addColorStop(.3,  `rgba(${s.c},${av * .35})`);
        g.addColorStop(1,   `rgba(${s.c},0)`);
        sc.fillStyle = g;
        sc.beginPath(); sc.arc(x, y, s.r * 4, 0, 6.2832); sc.fill();
      } else {
        sc.fillStyle = `rgba(${s.c},${av})`;
        sc.beginPath(); sc.arc(x, y, s.r, 0, 6.2832); sc.fill();
      }
    }
    sc.globalCompositeOperation = 'source-over';
  }, []);

  /* ── loop principal ──────────────────────────────────────── */
  useEffect(() => {
    const a = anim.current;
    a.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* si la motion está reducida, salta directo al estado final */
    if (a.reduced) {
      setLit(true);
      setReady(true);
      a.litDone   = true;
      a.readyDone = true;
    }

    sizeSky();
    sizeRing();

    /* si se saltó antes la intro, comienza avanzado */
    try {
      if (sessionStorage.getItem('orion-intro') === '1' && !a.reduced) {
        a.tt = T_READY - 1.4;
      }
    } catch { /* */ }

    function frame(ms: number) {
      const dt     = Math.min(0.05, (ms - a.lastMs) / 1000 || 0.016);
      a.lastMs     = ms;
      a.speed     += (a.target - a.speed) * Math.min(1, dt * 3);
      a.tt        += dt * a.speed;
      const t      = a.reduced ? T_READY + 10 : a.tt;

      if (t >= T_LIT && !a.litDone) {
        a.litDone = true;
        setLit(true);
      }
      if (t >= T_READY && !a.readyDone) {
        a.readyDone = true;
        a.target    = 1;
        setReady(true);
        try { sessionStorage.setItem('orion-intro', '1'); } catch { /* */ }
      }

      drawSky(t);
      drawRing(t, dt);

      if (!a.reduced) a.raf = requestAnimationFrame(frame);
    }

    a.lastMs = performance.now();
    if (a.reduced) {
      frame(performance.now()); /* un único frame estático */
    } else {
      a.raf = requestAnimationFrame(frame);
    }

    /* saltarse la intro al hacer clic / tecla */
    const skipIntro = () => { if (a.tt < T_READY) a.target = 3.2; };

    const onResize   = () => { sizeSky(); };
    const onMove     = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      a.ptr.x  = e.clientX;
      a.ptr.y  = e.clientY;
      a.ptr.on = true;
    };
    const onLeave    = () => { a.ptr.on = false; };
    const onVisible  = () => {
      cancelAnimationFrame(a.raf);
      if (!document.hidden && !a.reduced) {
        a.lastMs = performance.now();
        a.raf    = requestAnimationFrame(frame);
      }
    };

    window.addEventListener('resize',         onResize,     { passive: true });
    window.addEventListener('pointermove',    onMove as EventListener, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pointerdown',    skipIntro, { passive: true });
    window.addEventListener('keydown',        skipIntro, { passive: true } as any);

    return () => {
      cancelAnimationFrame(a.raf);
      window.removeEventListener('resize',         onResize);
      window.removeEventListener('pointermove',    onMove as EventListener);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointerdown',    skipIntro);
      window.removeEventListener('keydown',        skipIntro as any);
    };
  }, [sizeSky, sizeRing, drawSky, drawRing]);

  /* gestiona el atributo inert del panel según open */
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (open) {
      el.removeAttribute('inert');
      /* foco al input tras la transición */
      setTimeout(() => usernameRef.current?.focus({ preventScroll: true }), 500);
    } else {
      el.setAttribute('inert', '');
    }
  }, [open]);

  /* ── toggle acceso ────────────────────────────────────────── */
  const handleToggleOpen = () => {
    const a = anim.current;
    if (!open && a.tt < T_READY) a.target = 3.2;
    setOpen(o => !o);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && open) setOpen(false);
  };

  const handleSceneClick = (e: React.MouseEvent) => {
    if (!open) return;
    const target = e.target as HTMLElement;
    if (!target.closest('#lp-panel') && !target.closest('#lp-logo') && !target.closest('.lp-lema')) {
      setOpen(false);
    }
  };

  /* ── submit ───────────────────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!username.trim()) { setError('Escribe tu usuario.'); return; }
    if (!password)        { setError('Escribe tu contraseña.'); return; }
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (data.success) {
        login(username.trim());
      } else {
        setError(data.error || 'Usuario o contraseña incorrectos');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  /* ── render ───────────────────────────────────────────────── */
  const sceneClass = [
    'lp-scene',
    lit   ? 'lit'   : '',
    ready ? 'ready' : '',
    open  ? 'open'  : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="lp-root" onKeyDown={handleKeyDown}>
      {/* cielo de estrellas */}
      <canvas ref={skyRef} id="lp-sky" aria-hidden="true" />

      <div className={sceneClass} id="lp-scene" onClick={handleSceneClick}>

        {/* orbe con aro y logo */}
        <div className="lp-orb" id="lp-orb">
          <canvas ref={ringRef} id="lp-ring" aria-hidden="true" />
          <button
            className="lp-logo"
            id="lp-logo"
            type="button"
            onClick={handleToggleOpen}
            aria-expanded={open}
            aria-controls="lp-panel"
            aria-label="ORION. Pulsa para acceder"
          >
            <span className="lp-markbox">
              <span className="lp-halo" />
              <span className="lp-mgw"><span className="lp-mg" /></span>
              <span className="lp-mkw"><span className="lp-mark" /></span>
            </span>
            <span className="lp-word" aria-hidden="true">
              {(['O','R','I','O','N'] as const).map((letter, idx) => (
                <i
                  key={idx}
                  style={{ '--i': Math.abs(idx - 2), '--k': [2,1,0,1,2][idx] } as React.CSSProperties}
                >
                  {letter}
                </i>
              ))}
            </span>
          </button>
        </div>

        {/* texto de ayuda */}
        <div className="lp-hint" aria-hidden="true">Pulsa para acceder</div>

        {/* panel de acceso */}
        <section
          ref={panelRef}
          className="lp-panel"
          id="lp-panel"
          aria-label="Acceso a ORION"
        >
          <div className="lp-panel-in">
            <div className="lp-card" aria-live="polite">
              <header className="lp-chead">
                <span className="lp-eyebrow">Acceso seguro</span>
                <h2>Iniciar sesión</h2>
                <p className="lp-sub">Entra con tu cuenta de ORION.</p>
              </header>

              <form className="lp-form" onSubmit={handleSubmit} noValidate>

                {/* campo usuario */}
                <div className="lp-fld">
                  <label htmlFor="lp-u">Usuario</label>
                  <div className="lp-inp">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="8" r="3.6"/>
                      <path d="M4.5 20c1-3.6 3.7-5.4 7.5-5.4s6.5 1.8 7.5 5.4"/>
                    </svg>
                    <input
                      ref={usernameRef}
                      id="lp-u"
                      name="usuario"
                      type="text"
                      autoComplete="username"
                      placeholder="nombre@empresa.com"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={username}
                      onChange={e => { setUsername(e.target.value); setError(''); }}
                    />
                  </div>
                </div>

                {/* campo contraseña */}
                <div className="lp-fld">
                  <label htmlFor="lp-p">Contraseña</label>
                  <div className="lp-inp">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/>
                      <path d="M8 10.5V7.8a4 4 0 018 0v2.7"/>
                    </svg>
                    <input
                      id="lp-p"
                      name="contrasena"
                      type={showPwd ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Tu contraseña"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyUp={e => setCapsLock(!!(e.getModifierState?.('CapsLock')))}
                      onBlur={() => setCapsLock(false)}
                    />
                    <button
                      type="button"
                      aria-pressed={showPwd}
                      aria-controls="lp-p"
                      onClick={() => setShowPwd(s => !s)}
                    >
                      {showPwd ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                  {capsLock && <div className="lp-caps">Bloq Mayús está activado</div>}
                </div>

                {/* recordarme + olvidé */}
                <div className="lp-row">
                  <label className="lp-chk">
                    <input type="checkbox" id="lp-rem" />
                    <span className="lp-box" aria-hidden="true" />
                    Recordarme
                  </label>
                </div>

                {/* error */}
                {error && (
                  <div className="lp-msg" role="alert">{error}</div>
                )}

                {/* botón enviar */}
                <button
                  className="lp-go"
                  type="submit"
                  disabled={loading}
                  style={{ width: '100%' }}
                >
                  {loading ? 'Comprobando…' : 'Entrar'}
                </button>

              </form>

              <footer className="lp-cfoot">
                <span>Demo · usuario <b>SERGIO</b> · contraseña <b>MMT2026</b></span>
              </footer>
            </div>
          </div>
        </section>

        {/* lema */}
        <h1 className="lp-lema" id="lp-lema">
          Del caos<br />al <em>orden</em>.
        </h1>
      </div>

      {/* pie */}
      <footer className="lp-foot">
        <span>© 2026 ORION · Madrid</span>
        <span>Conexión cifrada</span>
        <span>Acceso restringido a usuarios autorizados</span>
      </footer>
    </div>
  );
}
