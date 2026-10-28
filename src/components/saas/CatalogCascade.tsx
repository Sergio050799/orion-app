"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nf } from '@/lib/fmt';

/**
 * Búsqueda manual en el catálogo mediante desplegables en cascada:
 * Categoría → Tipo → Marca → Modelo → Año → Versión, con filtros opcionales de combustible, kW y plazas.
 * Usa /api/catalogo/cascada (filtrado exacto, solo lectura). Lo comparten Vehículos y Pre-emisión.
 */

export interface CascadaVersion {
  id_veh: string;
  marca: string;
  modelo: string;
  version: string;
  combustible: string;
  kw: number;
  cv: number;
  cilindrada: number;
  plazas: number;
  plazasMin: number;
  tara: number;
  pma: number;
  puertas: number;
  tipo: string;
  tipoLabel: string;
  categoria: 0 | 1 | 2 | 3;
  admitido: boolean;
  anyo: number;
  desde: number;
  hasta: number;
  pvp?: number;
}

interface TipoOpcion { key: string; label: string; categoria: 0 | 1 | 2 | 3; admitido: boolean; n: number }

interface Cascada {
  tipos: TipoOpcion[];
  marcas: string[];
  modelos: string[];
  anyos: number[];
  combustibles: string[];
  kws: number[];
  plazas: number[];
  versiones: CascadaVersion[];
  totalVersiones: number;
  marcaCanonica: string;
}

const FUEL_LABEL: Record<string, string> = {
  D: 'Diésel', G: 'Gasolina', E: 'Eléctrico', X: 'HEV-G', Y: 'HEV-D',
  P: 'PHEV-G', R: 'PHEV-D', L: 'Gas', Z: 'REEV', B: 'Bio', H: 'H₂',
};

const norm = (s: string) => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const CSS = `
.cc{display:grid;gap:14px;min-width:0}
.cc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 14px}
.cc-grid.f{grid-template-columns:repeat(3,minmax(0,1fr))}
.cc-f{display:grid;gap:6px;min-width:0}
.cc-f label{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--head)}
.cc .cc-grid select.cc-sel{appearance:none;-webkit-appearance:none;width:100%;box-sizing:border-box;min-width:0;cursor:pointer;color:var(--text);font-size:14px;padding:10px 36px 10px 12px;border:1px solid var(--line);border-radius:5px;
  background:var(--soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%23909db4' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M2 4h12M4 8h8M6.5 12h3'/%3E%3C/svg%3E") no-repeat right 11px center}
.cc .cc-grid select.cc-sel:focus{outline:none;border-color:var(--blue)}
.cc .cc-grid select.cc-sel:disabled{opacity:.45;cursor:not-allowed}
.cc-sub{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--head);margin:4px 0 -4px}
.cc-note{font-size:13.5px;color:var(--quiet);margin:0;line-height:1.5}
.cc-warn{font-size:13.5px;color:var(--sdoff,#e0705f);margin:0}
.cc-list{display:grid;max-height:300px;overflow-y:auto;border-top:1px solid var(--line)}
.cc-row{all:unset;box-sizing:border-box;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:14px;width:100%;padding:10px 14px;border-bottom:1px solid var(--line);font-size:14px;color:var(--text);transition:background .16s}
.cc-row:hover{background:var(--hover)}
.cc-row:focus-visible{outline:2px solid var(--blue);outline-offset:-2px}
.cc-row[aria-checked=true]{background:var(--hover);box-shadow:inset 3px 0 0 var(--blue)}
.cc-row b{font-weight:600}
.cc-row span.m{display:block;font-size:12.5px;color:var(--quiet);margin-top:2px}
.cc-row .id{font-size:12.5px;color:var(--quiet);white-space:nowrap;font-variant-numeric:tabular-nums}
.cc-act{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
@media (max-width:760px){.cc-grid,.cc-grid.f{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:460px){.cc-grid,.cc-grid.f{grid-template-columns:minmax(0,1fr)}}
`;

export default function CatalogCascade({ initial, onSelect, onClose, selectLabel = 'Usar esta versión', idPrefix = 'cc' }: {
  initial?: { marca?: string; modelo?: string; anyo?: number | string; kw?: number | string };
  onSelect: (v: CascadaVersion) => void;
  onClose?: () => void;
  selectLabel?: string;
  idPrefix?: string;
}) {
  const [categoria, setCategoria] = useState('');
  const [tipo, setTipo] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anyo, setAnyo] = useState('');
  const [combustible, setCombustible] = useState('');
  const [kw, setKw] = useState('');
  const [plazas, setPlazas] = useState('');
  const [versionId, setVersionId] = useState('');
  const [data, setData] = useState<Cascada | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const prefilled = useRef(false);
  const reqId = useRef(0);

  const fetchCascada = useCallback(async (c: string, t: string, m: string, mo: string, a: string, f: string, k: string, p: string) => {
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      if (c) q.set('categoria', c);
      if (t) q.set('tipo', t);
      if (m) q.set('marca', m);
      if (mo) q.set('modelo', mo);
      if (a) q.set('anyo', a);
      if (f) q.set('combustible', f);
      if (k) q.set('kw', k);
      if (p) q.set('plazas', p);
      const res = await fetch(`/api/catalogo/cascada?${q}`);
      const j = await res.json();
      if (id !== reqId.current) return null;
      if (!res.ok || !j.ok) throw new Error(j.error || `Catálogo no disponible (${res.status})`);
      setData(j as Cascada);
      return j as Cascada;
    } catch (e: unknown) {
      if (id === reqId.current) { setError(e instanceof Error ? e.message : 'Error de búsqueda'); setData(null); }
      return null;
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  // Carga inicial + preselección a partir de los datos que ya tiene el vehículo
  useEffect(() => {
    if (prefilled.current) return;
    prefilled.current = true;
    (async () => {
      if (!initial?.marca) { await fetchCascada('', '', '', '', '', '', '', ''); return; }
      // El servidor resuelve alias de marca (MERCEDES-BENZ → MERCEDES, VW → VOLKSWAGEN…)
      const withMarca = await fetchCascada('', '', initial.marca, '', '', '', '', '');
      if (!withMarca || !withMarca.marcaCanonica) return;
      const m = withMarca.marcaCanonica;
      setMarca(m);
      let wanted = norm(initial.modelo ?? '');
      for (const prefix of [norm(m), norm(initial.marca)]) {
        if (prefix && wanted.startsWith(prefix + ' ')) { wanted = wanted.slice(prefix.length + 1).trim(); break; }   // "SEAT LEON" → "LEON"
      }
      const norms = withMarca.modelos.map(x => ({ x, n: norm(x) }));
      const hit = !wanted ? undefined
        : norms.find(e => e.n === wanted)
          ?? norms.filter(e => wanted.startsWith(e.n + ' ') || e.n.startsWith(wanted + ' '))
                .sort((a, b) => b.n.length - a.n.length)[0];
      const mo = hit?.x ?? '';
      if (!mo) return;
      setModelo(mo);
      const withModelo = await fetchCascada('', '', m, mo, '', '', '', '');
      if (!withModelo) return;
      const y = String(initial.anyo ?? '');
      if (y && withModelo.anyos.includes(parseInt(y))) {
        setAnyo(y);
        await fetchCascada('', '', m, mo, y, '', '', '');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = (c: string, t: string, m: string, mo: string, a: string, f: string, k: string, p: string) => { setVersionId(''); fetchCascada(c, t, m, mo, a, f, k, p); };

  const onCategoria = (v: string) => { setCategoria(v); setTipo(''); setMarca(''); setModelo(''); setAnyo(''); setCombustible(''); setKw(''); setPlazas(''); refresh(v, '', '', '', '', '', '', ''); };
  const onTipo = (v: string) => { setTipo(v); setMarca(''); setModelo(''); setAnyo(''); setCombustible(''); setKw(''); setPlazas(''); refresh(categoria, v, '', '', '', '', '', ''); };
  const onMarca = (v: string) => { setMarca(v); setModelo(''); setAnyo(''); setCombustible(''); setKw(''); setPlazas(''); refresh(categoria, tipo, v, '', '', '', '', ''); };
  const onModelo = (v: string) => { setModelo(v); setAnyo(''); setCombustible(''); setKw(''); setPlazas(''); refresh(categoria, tipo, marca, v, '', '', '', ''); };
  const onAnyo = (v: string) => { setAnyo(v); setCombustible(''); setKw(''); setPlazas(''); refresh(categoria, tipo, marca, modelo, v, '', '', ''); };
  const onFuel = (v: string) => { setCombustible(v); refresh(categoria, tipo, marca, modelo, anyo, v, kw, plazas); };
  const onKw = (v: string) => { setKw(v); refresh(categoria, tipo, marca, modelo, anyo, combustible, v, plazas); };
  const onPlazas = (v: string) => { setPlazas(v); refresh(categoria, tipo, marca, modelo, anyo, combustible, kw, v); };

  const marcas = data?.marcas ?? [];
  const versiones = useMemo(() => data?.versiones ?? [], [data]);
  const chosen = versiones.find(v => v.id_veh === versionId);
  const tipoSel = (data?.tipos ?? []).find(t => t.key === tipo);
  const noAdmitido = (tipoSel && !tipoSel.admitido) || (chosen && !chosen.admitido);
  const stepReady = !!marca && !!modelo && !!anyo;
  const hasFilters = !!(combustible || kw || plazas);
  const clearFilters = () => { setCombustible(''); setKw(''); setPlazas(''); refresh(categoria, tipo, marca, modelo, anyo, '', '', ''); };

  const fid = (s: string) => `${idPrefix}_${s}`;

  return (
    <div className="cc">
      <style>{CSS}</style>
      <div className="cc-grid">
        <div className="cc-f">
          <label htmlFor={fid('categoria')}>Categoría</label>
          <select id={fid('categoria')} className="cc-sel" value={categoria} onChange={e => onCategoria(e.target.value)} disabled={(data?.tipos.length ?? 0) === 0 && !categoria}>
            <option value="">Todas las categorías</option>
            <option value="1">1.ª categoría</option>
            <option value="2">2.ª categoría</option>
            <option value="3">3.ª categoría (motos)</option>
          </select>
        </div>
        <div className="cc-f">
          <label htmlFor={fid('tipo')}>Tipo de vehículo</label>
          <select id={fid('tipo')} className="cc-sel" value={tipo} onChange={e => onTipo(e.target.value)} disabled={(data?.tipos.length ?? 0) === 0}>
            <option value="">{categoria ? `Todos los de ${categoria}.ª categoría` : 'Todos los tipos'}</option>
            {(data?.tipos ?? []).map(t => <option key={t.key} value={t.key}>{t.label}{!categoria && t.categoria ? ` · ${t.categoria}.ª categoría` : ''}{t.admitido ? '' : ' · no admitido'}</option>)}
          </select>
        </div>
        <div className="cc-f">
          <label htmlFor={fid('marca')}>Marca</label>
          <select id={fid('marca')} className="cc-sel" value={marca} onChange={e => onMarca(e.target.value)} disabled={marcas.length === 0}>
            <option value="">{loading && marcas.length === 0 ? 'Cargando…' : tipo || categoria ? `Selecciona marca (${nf(marcas.length)})` : 'Selecciona marca'}</option>
            {marcas.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="cc-f">
          <label htmlFor={fid('modelo')}>Modelo</label>
          <select id={fid('modelo')} className="cc-sel" value={modelo} onChange={e => onModelo(e.target.value)} disabled={!marca || (data?.modelos.length ?? 0) === 0}>
            <option value="">{marca ? 'Selecciona modelo' : 'Primero la marca'}</option>
            {(data?.modelos ?? []).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="cc-f">
          <label htmlFor={fid('anyo')}>Año</label>
          <select id={fid('anyo')} className="cc-sel" value={anyo} onChange={e => onAnyo(e.target.value)} disabled={!modelo || (data?.anyos.length ?? 0) === 0}>
            <option value="">{modelo ? 'Selecciona año' : 'Primero el modelo'}</option>
            {(data?.anyos ?? []).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="cc-f">
          <label htmlFor={fid('version')}>Versión</label>
          <select id={fid('version')} className="cc-sel" value={versionId} onChange={e => setVersionId(e.target.value)} disabled={!stepReady || versiones.length === 0}>
            <option value="">{stepReady ? (versiones.length ? `Selecciona versión (${nf(data?.totalVersiones ?? versiones.length)})` : 'Sin versiones') : 'Primero el año'}</option>
            {versiones.map(v => (
              <option key={v.id_veh} value={v.id_veh}>
                {(v.version || `${v.modelo} (sin versión)`)}{v.kw > 0 ? ` · ${nf(v.kw)} kW` : ''}{v.combustible ? ` · ${FUEL_LABEL[v.combustible] ?? v.combustible}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {stepReady && (
        <>
          <div className="cc-sub">Filtrar versiones</div>
          <div className="cc-grid f">
            <div className="cc-f">
              <label htmlFor={fid('fuel')}>Combustible</label>
              <select id={fid('fuel')} className="cc-sel" value={combustible} onChange={e => onFuel(e.target.value)}>
                <option value="">Todos</option>
                {(data?.combustibles ?? []).map(c => <option key={c} value={c}>{FUEL_LABEL[c] ?? c}</option>)}
              </select>
            </div>
            <div className="cc-f">
              <label htmlFor={fid('kw')}>Potencia (kW)</label>
              <select id={fid('kw')} className="cc-sel" value={kw} onChange={e => onKw(e.target.value)}>
                <option value="">Todas</option>
                {(data?.kws ?? []).map(k => <option key={k} value={k}>{nf(k)} kW</option>)}
              </select>
            </div>
            <div className="cc-f">
              <label htmlFor={fid('plazas')}>Plazas</label>
              <select id={fid('plazas')} className="cc-sel" value={plazas} onChange={e => onPlazas(e.target.value)}>
                <option value="">Todas</option>
                {(data?.plazas ?? []).map(p => <option key={p} value={p}>{nf(p)}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      {error && <p className="cc-warn">{error}</p>}
      {!error && noAdmitido && <p className="cc-warn">Este tipo de vehículo no se admite en flotas: no se puede seleccionar para el estudio.</p>}
      {!error && stepReady && !loading && versiones.length === 0 && (
        <p className="cc-note">No hay versiones con esos filtros{anyo ? ` comercializadas en ${anyo}` : ''}.{hasFilters ? ' Quita algún filtro.' : ' Prueba con otro año.'}</p>
      )}
      {!error && !stepReady && !loading && <p className="cc-note">{tipo || categoria ? 'Elige marca, modelo y año; después podrás afinar por combustible, potencia y plazas.' : 'Elige primero la categoría y el tipo de vehículo para acortar la lista de marcas, o déjalos en «Todos». Después, marca, modelo y año.'}</p>}

      {stepReady && versiones.length > 0 && (
        <div className="cc-list" role="radiogroup" aria-label="Versiones del catálogo">
          {versiones.map(v => (
            <button key={v.id_veh} type="button" role="radio" aria-checked={versionId === v.id_veh} className="cc-row" onClick={() => setVersionId(v.id_veh)}>
              <span>
                <b>{v.version || `${v.modelo} (sin versión)`}</b>
                <span className="m">
                  {v.categoria ? `${v.categoria}.ª categoría · ` : ''}{v.tipoLabel}{!v.admitido ? ' · no admitido' : ''} · 
                  {v.kw > 0 ? `${nf(v.kw)} kW` : ''}{v.combustible ? `${v.kw > 0 ? ' · ' : ''}${FUEL_LABEL[v.combustible] ?? v.combustible}` : ''}
                  {v.plazas > 0 ? ` · ${nf(v.plazas)} plazas` : ''}
                  {v.cilindrada > 0 ? ` · ${nf(v.cilindrada)} cc` : ''}
                  {v.tara > 0 ? ` · ${nf(v.tara)} kg` : ''}
                  {v.desde ? ` · ${v.desde}${v.hasta ? `–${v.hasta}` : ' en adelante'}` : ''}
                </span>
              </span>
              <span className="id">ID {v.id_veh}</span>
            </button>
          ))}
        </div>
      )}

      <div className="cc-act">
        {chosen && chosen.admitido && <button type="button" className="mini pri" onClick={() => onSelect(chosen)}>{selectLabel}</button>}
        {hasFilters && <button type="button" className="mini" onClick={clearFilters}>Quitar filtros</button>}
        {onClose && <button type="button" className="mini" onClick={onClose}>Cerrar</button>}
      </div>
    </div>
  );
}
