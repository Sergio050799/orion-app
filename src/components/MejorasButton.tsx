'use client';

import { useState } from 'react';

export default function MejorasButton() {
  const [open,    setOpen]    = useState(false);
  const [titulo,  setTitulo]  = useState('');
  const [desc,    setDesc]    = useState('');
  const [sending, setSending] = useState(false);
  const [done,    setDone]    = useState(false);

  async function send() {
    if (!titulo.trim() || !desc.trim()) return;
    setSending(true);
    try {
      // Obtener el usuario actual
      const me = await fetch('/api/auth/me').then(r => r.ok ? r.json() : null).catch(() => null);
      await fetch('/api/admin/mejoras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario:     me?.username || '',
          titulo:      titulo.trim(),
          descripcion: desc.trim(),
        }),
      });
      setDone(true);
      setTimeout(() => { setOpen(false); setDone(false); setTitulo(''); setDesc(''); }, 1500);
    } catch {
      // silencioso
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen(true)}
        title="Sugerir una mejora"
        className="fixed bottom-5 right-5 z-50 w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center text-xl transition"
      >
        💡
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Sugerir una mejora</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {done ? (
              <div className="py-6 text-center text-green-600 font-medium">¡Enviado! Gracias.</div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                  <input
                    type="text"
                    value={titulo}
                    onChange={e => setTitulo(e.target.value)}
                    placeholder="Resumen breve de la mejora"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    maxLength={100}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                  <textarea
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    placeholder="Explica con detalle qué mejoraría y por qué ayudaría"
                    rows={4}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    maxLength={1000}
                  />
                </div>
                <button
                  onClick={send}
                  disabled={sending || !titulo.trim() || !desc.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold py-2.5 rounded-lg text-sm transition"
                >
                  {sending ? 'Enviando...' : 'Enviar sugerencia'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
