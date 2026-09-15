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

// ─── Generate notifications from data ────────────────────────────────────────

function generateNotifications(): Notification[] {
  const carpetas = listarCarpetas();
  const corredores = listarCorredores();
  const corredorMap = new Map(corredores.map((c) => [c.id, c]));
  const now = new Date();
  const notifications: Notification[] = [];

  for (const c of carpetas) {
    const vto = c.header?.fechaVencimiento;
    if (!vto) continue;

    const vtoDate = new Date(vto);
    const diffDays = Math.ceil((vtoDate.getTime() - now.getTime()) / 86400000);
    const corredor = c.corredor_id ? corredorMap.get(c.corredor_id) : null;
    const corredorName = corredor?.nombre ?? "Sin corredor";

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

    // State change notifications from historico
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
