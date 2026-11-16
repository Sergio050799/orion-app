"use client";

/* Animaciones de la app SIN tocar la lógica de cada página. Se monta una sola vez en (dashboard)/layout.tsx.
   1) Cuenta los números de los KPIs de 0 al valor real (lee el texto ya formateado: «18.460», «42,8 %», «1.240.000 €»…).
      El texto final es EXACTAMENTE el que pintó React; solo se anima por el camino.
   2) Revela con fundido + subida las zonas grandes (KPIs, rejillas) cuando entran en pantalla.
   3) Cierra la cortina circular del login/logout si hay una pendiente. */
import { useEffect, useLayoutEffect } from "react";
import { wipeOutIfPending } from "@/lib/wipe";

const KPI_VALUE = ".kpi .v, .db-kpi .v";
const REVEAL = ".db-kpis, .db-grid2, .kpis, .grid2";
const NUM = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/;

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function fmt(value: number, decimals: number): string {
  /* punto en los miles, coma en los decimales (de-DE; «es» no agrupa los de 4 cifras) */
  return value.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function KpiMotion() {
  const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

  useIso(() => {
    const root = document.querySelector(".app-main") as HTMLElement | null;
    if (!root) return;

    /* ── 1. count-up ─────────────────────────────────────────── */
    const mine = new WeakMap<Text, string>();   // último texto escrito por nosotros
    const raf = new WeakMap<Text, number>();
    let order = 0;

    const animate = (el: HTMLElement) => {
      if (el.childNodes.length !== 1 || el.firstChild!.nodeType !== 3) return;
      const node = el.firstChild as Text;
      if (mine.get(node) === node.data) return;       // cambio nuestro, no de React
      const finalText = node.data;
      const m = finalText.match(NUM);
      if (!m || reduced()) return;
      const dec = m[0].includes(",") ? m[0].split(",")[1].length : 0;
      const to = parseFloat(m[0].replace(/\./g, "").replace(",", "."));
      if (!isFinite(to) || to === 0) return;
      const pre = finalText.slice(0, m.index), post = finalText.slice(m.index! + m[0].length);
      cancelAnimationFrame(raf.get(node) || 0);
      const write = (t: string) => { mine.set(node, t); node.data = t; };
      write(pre + fmt(0, dec) + post);
      const delay = 120 + (order++ % 6) * 90, dur = 1300;
      const t0 = performance.now() + delay;
      const step = (now: number) => {
        if (now < t0) { raf.set(node, requestAnimationFrame(step)); return; }
        const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
        if (p < 1) { write(pre + fmt(to * e, dec) + post); raf.set(node, requestAnimationFrame(step)); }
        else write(finalText);                         // texto final idéntico al de React
      };
      raf.set(node, requestAnimationFrame(step));
    };

    /* ── 2. reveal al entrar en pantalla ─────────────────────── */
    // rootMargin: dispara 400 px ANTES de que entre al viewport — útil para que una página larga
    // tras login/navegación no quede con bloques inferiores en opacity:0 hasta hacer scroll.
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      (en.target as HTMLElement).setAttribute("data-rv", "in");
      setTimeout(() => ((en.target as HTMLElement).style.transitionDelay = ""), 1600);
    }), { threshold: 0, rootMargin: "0px 0px 400px 0px" });

    const safetyTimers = new WeakMap<HTMLElement, number>();

    const tag = (el: HTMLElement, i: number) => {
      if (el.hasAttribute("data-rv") || reduced()) return;
      el.setAttribute("data-rv", "");
      el.style.transitionDelay = `${Math.min(i, 5) * 0.08}s`;
      // Si al tagear el elemento ya está en viewport (típico tras login/navegación),
      // marcar «in» en el siguiente frame — el IntersectionObserver a veces no dispara
      // para nodos recién añadidos ya visibles, y el bloque queda con opacity:0.
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0 && r.width > 0) {
        requestAnimationFrame(() => el.setAttribute("data-rv", "in"));
        return;
      }
      io.observe(el);
      // Red de seguridad: si tras 2,5 s sigue sin activarse (IO que no dispara, scroll dentro
      // de un contenedor que el IO no vigila, etc.), forzar visibilidad para no dejar nada oculto.
      const t = window.setTimeout(() => {
        if (el.getAttribute("data-rv") !== "in") {
          io.unobserve(el);
          el.setAttribute("data-rv", "in");
        }
      }, 2500);
      safetyTimers.set(el, t);
    };

    const scan = (scope: ParentNode) => {
      scope.querySelectorAll<HTMLElement>(KPI_VALUE).forEach(animate);
      scope.querySelectorAll<HTMLElement>(REVEAL).forEach(tag);
    };

    scan(root);
    const mo = new MutationObserver(recs => {
      for (const r of recs) {
        if (r.type === "characterData") {
          const p = r.target.parentElement;
          if (p && p.matches(KPI_VALUE)) animate(p);
        } else r.addedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          const el = n as HTMLElement;
          if (el.matches(KPI_VALUE)) animate(el);
          if (el.matches(REVEAL)) tag(el, 0);
          scan(el);
        });
      }
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true });

    wipeOutIfPending();
    return () => { mo.disconnect(); io.disconnect(); };
  }, []);

  return null;
}
