"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { listarCarpetas, listarCorredores, type FlotaCarpeta, type Corredor } from "@/core/flotas";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  tipo: "vencimiento" | "estado" | "info";
  titulo: string;
  mensaje: string;
  fecha: string; // ISO
  leida: boolean;
  carpetaId?: string;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  refresh: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markAsRead: () => {},
  markAllAsRead: () => {},
  refresh: () => {},
});

export const useNotifications = () => useContext(NotificationContext);

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "orion_notifications_v1";
const READ_KEY = "orion_notifications_read_v1";

function loadReadIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>) {
  localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseFecha(s: string): Date | null {
  if (!s) return null;
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const d = new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

const PERIODICIDAD_MESES: Record<string, number> = {
  mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12,
};

/** Desde la fecha de vencimiento, retrocede por periodicidad para hallar la próxima regularización futura. */
function proximaRegularizacion(fechaVencimiento: string, periodicidad: string): Date | null {
  const vto = parseFecha(fechaVencimiento);
  if (!vto) return null;
  const meses = PERIODICIDAD_MESES[periodicidad.toLowerCase()];
  if (!meses) return null;
  const now = new Date();
  const candidate = new Date(vto);
  while (candidate > now) candidate.setMonth(candidate.getMonth() - meses);
  candidate.setMonth(candidate.getMonth() + meses);
  return candidate;
}

// ─── Generate notifications from data ────────────────────────────────────────

function generateNotifications(): Notification[] {
  const carpetas = listarCarpetas();
  const corredores = listarCorredores();
  const corredorMap = new Map(corredores.map((c) => [c.id, c]));
  const now = new Date();
  const notifications: Notification[] = [];

  for (const c of carpetas) {
    const corredor = c.corredor_id ? corredorMap.get(c.corredor_id) : null;
    const corredorName = corredor?.nombre ?? "Sin corredor";

    // ── Regularización periódica (solo flotas EXTERNA) ───────────────────────
    if (
      c.header?.formaPago?.toUpperCase() === 'EXTERNA' &&
      c.header?.fechaVencimiento &&
      c.header?.periodicidad
    ) {
      const proxima = proximaRegularizacion(c.header.fechaVencimiento, c.header.periodicidad);
      if (proxima) {
        const diffDays = Math.ceil((proxima.getTime() - now.getTime()) / 86400000);
        if (diffDays <= 30) {
          notifications.push({
            id: `reg_${c.id}_${proxima.toISOString().slice(0, 10)}`,
            tipo: "vencimiento",
            titulo: `Regularización: ${c.nombre}`,
            mensaje: `Regularización ${c.header.periodicidad} en ${diffDays} día${diffDays === 1 ? '' : 's'} (${proxima.toLocaleDateString('es-ES')}) · ${corredorName}`,
            fecha: proxima.toISOString(),
            leida: false,
            carpetaId: c.id,
          });
        }
      }
    }

    // ── Vencimiento de la póliza ─────────────────────────────────────────────
    const vto = c.header?.fechaVencimiento;
    if (vto) {
      const vtoDate = parseFecha(vto) ?? new Date(vto);
      if (!isNaN(vtoDate.getTime())) {
        const diffDays = Math.ceil((vtoDate.getTime() - now.getTime()) / 86400000);

        if (diffDays < 0) {
          notifications.push({
            id: `vto_expired_${c.id}`,
            tipo: "vencimiento",
            titulo: `Vencida: ${c.nombre}`,
            mensaje: `La flota de ${corredorName} venció el ${vtoDate.toLocaleDateString("es-ES")}`,
            fecha: vtoDate.toISOString(),
            leida: false,
            carpetaId: c.id,
          });
        } else if (diffDays <= 30) {
          notifications.push({
            id: `vto_soon_${c.id}`,
            tipo: "vencimiento",
            titulo: `Próximo vencimiento: ${c.nombre}`,
            mensaje: `Vence en ${diffDays} día${diffDays === 1 ? "" : "s"} (${vtoDate.toLocaleDateString("es-ES")}) · ${corredorName}`,
            fecha: vtoDate.toISOString(),
            leida: false,
            carpetaId: c.id,
          });
        } else if (diffDays <= 60) {
          notifications.push({
            id: `vto_60_${c.id}`,
            tipo: "info",
            titulo: `Renovación próxima: ${c.nombre}`,
            mensaje: `Vence el ${vtoDate.toLocaleDateString("es-ES")} (${diffDays} días) · ${corredorName}`,
            fecha: vtoDate.toISOString(),
            leida: false,
            carpetaId: c.id,
          });
        }
      }
    }

    // ── Cambios de estado ────────────────────────────────────────────────────
    if (c.historico && c.historico.length > 1) {
      const last = c.historico[c.historico.length - 1];
      if (last.accion === "Cambio de estado") {
        notifications.push({
          id: `estado_${c.id}_${last.fecha}`,
          tipo: "estado",
          titulo: `${c.nombre}: ${last.estadoNuevo}`,
          mensaje: `Cambió de ${last.estadoAnterior} a ${last.estadoNuevo}${last.motivo ? ` — ${last.motivo}` : ""}`,
          fecha: last.fecha,
          leida: false,
          carpetaId: c.id,
        });
      }
    }
  }

  // Sort by date desc
  notifications.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  return notifications;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    const generated = generateNotifications();
    const read = loadReadIds();
    setReadIds(read);
    setNotifications(generated.map((n) => ({ ...n, leida: read.has(n.id) })));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const markAsRead = useCallback((id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveReadIds(next);
      return next;
    });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const allIds = new Set(prev.map((n) => n.id));
      const read = loadReadIds();
      for (const id of allIds) read.add(id);
      saveReadIds(read);
      setReadIds(read);
      return prev.map((n) => ({ ...n, leida: true }));
    });
  }, []);

  const unreadCount = notifications.filter((n) => !n.leida).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, refresh }}>
      {children}
    </NotificationContext.Provider>
  );
}
