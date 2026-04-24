"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { listarCorredores, listarCarpetas, type Corredor, type FlotaCarpeta } from "@/core/flotas";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ReciboRow {
  id: string;
  poliza: string;
  numRecibo: string;
  riesgo: string;
  fecha: string;
  tipo: string;
  importe: number;
  pNeta: number;
  impuesto: number;
  comision: number;
  liquido: number;
  periodicidad: string;
  fechaInicioPoliza: string;
  fechaVencimiento: string;
  tomador: string;
}

interface GrupoTomador {
  tomador: string;
  cifTomador: string;
  rows: ReciboRow[];
  pctComision: number;
}

interface FacturaData {
  numRecibo: string;
  corredor: string;
  corredorCif: string;
  corredorDomicilio: string;
  flota: string;
  tomador: string;
  cifTomador: string;
  periodoDesde: string;
  periodoHasta: string;
  formaPago: string;
  descripcionPeriodo: string;
  primaNeta: number;
  impuestos: number;
  primaTotal: number;
}

interface Resumen {
  vehiculos: number;
  primaNeta: number;
  impuesto: number;
  importe: number;
  comision: number;
  liquido: number;
}

type TipoOperacion = "emision" | "regularizacion";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";
}

function parseNum(s: string): number {
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function padDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function calcDescripcionPeriodo(tipo: TipoOperacion, periodicidad: string, fechaInicio?: string, fechaVencimiento?: string): string {
  const hoy = new Date();
  const year = hoy.getFullYear();
  const q = Math.floor(hoy.getMonth() / 3) + 1;
  const qNames = ["", "PRIMER", "SEGUNDO", "TERCER", "CUARTO"];
  if (tipo === "regularizacion") {
    const prevQ = q === 1 ? 4 : q - 1;
    const prevYear = q === 1 ? year - 1 : year;
    const qStart = new Date(prevYear, (prevQ - 1) * 3, 1);
    const qEnd = new Date(prevYear, prevQ * 3, 0);
    return `REGULARIZACI\u00D3N ${prevQ}\u00BA TRIMESTRE ${prevYear}: Recibos del ${padDate(qStart)} al ${padDate(qEnd)}`;
  }
  if (periodicidad?.toLowerCase() === "trimestral") {
    const qStart = new Date(year, (q - 1) * 3, 1);
    const qEnd = new Date(year, q * 3, 0);
    return `${qNames[q]} TRIMESTRE ${year}: ${padDate(qStart)} al ${padDate(qEnd)}`;
  }
  if (fechaInicio && fechaVencimiento) return `${fechaInicio} al ${fechaVencimiento}`;
  return `PERIODO ${year}`;
}

function calcResumen(filas: ReciboRow[]): Resumen {
  const matriculas = new Set(filas.map(r => r.riesgo).filter(Boolean));
  return {
    vehiculos: matriculas.size,
    primaNeta: filas.reduce((s, r) => s + r.pNeta, 0),
    impuesto: filas.reduce((s, r) => s + r.impuesto, 0),
    importe: filas.reduce((s, r) => s + r.importe, 0),
    comision: filas.reduce((s, r) => s + r.comision, 0),
    liquido: filas.reduce((s, r) => s + r.liquido, 0),
  };
}

let _rowId = 0;
function nextId() { return `r_${++_rowId}_${Date.now()}`; }

// ─── Component ──────────────────────────────────────────────────────────────────

export default function GestionDocumentalPage() {
  // ─ State Paso 1
  const [corredores] = useState<Corredor[]>(() => listarCorredores());
  const [carpetas] = useState<FlotaCarpeta[]>(() => listarCarpetas());
  const [corredorId, setCorredorId] = useState("");
  const [flotaId, setFlotaId] = useState("");
  const [tipoOp, setTipoOp] = useState<TipoOperacion>("emision");
  const [uploading, setUploading] = useState(false);

  // ─ State Paso 2 (multi-tomador)
  const [grupos, setGrupos] = useState<GrupoTomador[]>([]);
  const [activeTab, setActiveTab] = useState("TODOS");

  // ─ State Paso 3
  const [factura, setFactura] = useState<FacturaData | null>(null);

  // ─ State Paso 4
  const [revisado, setRevisado] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // Derived
  const corredor = corredores.find(c => c.id === corredorId) ?? null;
  const flotasFiltradas = corredorId ? carpetas.filter(c => c.corredor_id === corredorId) : carpetas;
  const flota = carpetas.find(c => c.id === flotaId) ?? null;

  // All rows flat
  const allRows = useMemo(() => grupos.flatMap(g => g.rows), [grupos]);
  const hasData = allRows.length > 0;
  const mostrarTabs = grupos.length > 1;

  // Active group
  const grupoActivo = activeTab === "TODOS" ? null : grupos.find(g => g.tomador === activeTab) ?? null;
  const filasVisibles = activeTab === "TODOS" ? allRows : (grupoActivo?.rows ?? []);
  const pctVisible = grupoActivo?.pctComision ?? (grupos[0]?.pctComision ?? 0);

  // Resumen
  const resumenVisible = useMemo(() => calcResumen(filasVisibles), [filasVisibles]);
  const resumenGlobal = useMemo(() => calcResumen(allRows), [allRows]);

  // ─ Recalc helpers
  function recalcRows(filas: ReciboRow[], pct: number): ReciboRow[] {
    return filas.map(r => {
      const comision = Math.round(r.pNeta * pct) / 100;
      const liquido = Math.round((r.importe - comision) * 100) / 100;
      return { ...r, comision, liquido };
    });
  }

  // ─ Handle upload
  const handleUpload = useCallback(async (file: File) => {
    if (!corredorId || !flotaId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("corredor", JSON.stringify(corredor));
      fd.append("flota", JSON.stringify(flota));
      fd.append("tipo", tipoOp.toUpperCase());
      const res = await fetch("/api/flotas/recibos/procesar", { method: "POST", body: fd });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || "Error desconocido del servidor");
      }
      const data = await res.json();

      const defaultPct = data.porcentajeComision ?? corredor?.porcentajeComision ?? 0;

      // Parse grupos if available, else build single group from rows
      const rawGrupos: Array<{ tomador: string; cifTomador: string; rows: Record<string, unknown>[]; porcentajeComision?: number }> =
        data.grupos ?? [{ tomador: flota?.header?.tomador ?? "", cifTomador: flota?.header?.cifTomador ?? "", rows: data.rows ?? [], porcentajeComision: defaultPct }];

      const parsedGrupos: GrupoTomador[] = rawGrupos.map(g => {
        const pct = g.porcentajeComision ?? defaultPct;
        const parsedRows: ReciboRow[] = (g.rows ?? []).map((r: Record<string, unknown>) => {
          const pNeta = typeof r.pNeta === "number" ? r.pNeta : parseNum(String(r.pNeta ?? "0"));
          const impuesto = typeof r.impuesto === "number" ? r.impuesto : parseNum(String(r.impuesto ?? "0"));
          const importe = typeof r.importe === "number" ? r.importe : parseNum(String(r.importe ?? "0"));
          const comision = Math.round(pNeta * pct) / 100;
          const liquido = Math.round((importe - comision) * 100) / 100;
          return {
            id: nextId(), poliza: String(r.poliza ?? ""), numRecibo: String(r.numRecibo ?? ""),
            riesgo: String(r.riesgo ?? ""), fecha: String(r.fecha ?? ""), tipo: String(r.tipo ?? ""),
            importe, pNeta, impuesto, comision, liquido,
            periodicidad: String(r.periodicidad ?? ""), fechaInicioPoliza: String(r.fechaInicioPoliza ?? ""),
            fechaVencimiento: String(r.fechaVencimiento ?? ""), tomador: String(r.tomador ?? g.tomador ?? ""),
          };
        });
        return { tomador: g.tomador ?? "", cifTomador: g.cifTomador ?? "", rows: parsedRows, pctComision: pct };
      });

      setGrupos(parsedGrupos);
      setActiveTab("TODOS");

      // Auto-fill factura with first tomador or global
      const hoy = new Date();
      const ddmmyyyy = `${String(hoy.getDate()).padStart(2, "0")}${String(hoy.getMonth() + 1).padStart(2, "0")}${hoy.getFullYear()}`;
      const letraCorr = (corredor?.nombre ?? "X").charAt(0).toUpperCase();
      const allParsedRows = parsedGrupos.flatMap(g => g.rows);
      const totalPNeta = allParsedRows.reduce((s, r) => s + r.pNeta, 0);
      const totalImpuesto = allParsedRows.reduce((s, r) => s + r.impuesto, 0);
      const totalImporte = allParsedRows.reduce((s, r) => s + r.importe, 0);
      const firstGroup = parsedGrupos[0];

      setFactura({
        numRecibo: `R${letraCorr}${ddmmyyyy}`,
        corredor: corredor?.nombre ?? "",
        corredorCif: corredor?.cif ?? "",
        corredorDomicilio: corredor?.domicilio ?? "",
        flota: flota?.nombre ?? "",
        tomador: firstGroup?.tomador ?? flota?.header?.tomador ?? "",
        cifTomador: firstGroup?.cifTomador ?? flota?.header?.cifTomador ?? "",
        periodoDesde: flota?.header?.fechaInicio ?? "",
        periodoHasta: flota?.header?.fechaVencimiento ?? "",
        formaPago: flota?.header?.periodicidad || corredor?.periodicidad || "",
        descripcionPeriodo: calcDescripcionPeriodo(tipoOp, flota?.header?.periodicidad || corredor?.periodicidad || "", flota?.header?.fechaInicio, flota?.header?.fechaVencimiento),
        primaNeta: totalPNeta,
        impuestos: totalImpuesto,
        primaTotal: totalImporte,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al procesar el Excel.");
    } finally {
      setUploading(false);
    }
  }, [corredorId, flotaId, tipoOp, corredor, flota]);

  // ─ Row edit (within grupos)
  const updateRow = useCallback((id: string, field: keyof ReciboRow, value: string | number) => {
    setGrupos(prev => prev.map(g => ({
      ...g,
      rows: g.rows.map(r => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === "pNeta" || field === "importe") {
          updated.comision = Math.round(updated.pNeta * g.pctComision) / 100;
          updated.liquido = Math.round((updated.importe - updated.comision) * 100) / 100;
        }
        return updated;
      }),
    })));
  }, []);

  const deleteRow = useCallback((id: string) => {
    setGrupos(prev => prev.map(g => ({ ...g, rows: g.rows.filter(r => r.id !== id) })).filter(g => g.rows.length > 0));
  }, []);

  const addRow = useCallback(() => {
    const tomadorTab = activeTab === "TODOS" ? (grupos[0]?.tomador ?? "") : activeTab;
    setGrupos(prev => {
      const idx = prev.findIndex(g => g.tomador === tomadorTab);
      if (idx < 0) {
        return [...prev, { tomador: tomadorTab, cifTomador: "", pctComision: corredor?.porcentajeComision ?? 0, rows: [{
          id: nextId(), poliza: "", numRecibo: "", riesgo: "", fecha: "", tipo: "",
          importe: 0, pNeta: 0, impuesto: 0, comision: 0, liquido: 0,
          periodicidad: "", fechaInicioPoliza: "", fechaVencimiento: "", tomador: tomadorTab,
        }] }];
      }
      return prev.map((g, i) => i === idx ? { ...g, rows: [...g.rows, {
        id: nextId(), poliza: "", numRecibo: "", riesgo: "", fecha: "", tipo: "",
        importe: 0, pNeta: 0, impuesto: 0, comision: 0, liquido: 0,
        periodicidad: "", fechaInicioPoliza: "", fechaVencimiento: "", tomador: tomadorTab,
      }] } : g);
    });
  }, [activeTab, grupos, corredor]);

  // ─ % comisión change (per tomador or global)
  const handlePctChange = useCallback((newPct: number) => {
    if (activeTab === "TODOS") {
      // Global: change all
      setGrupos(prev => prev.map(g => ({ ...g, pctComision: newPct, rows: recalcRows(g.rows, newPct) })));
    } else {
      // Per-tomador
      setGrupos(prev => prev.map(g => g.tomador === activeTab ? { ...g, pctComision: newPct, rows: recalcRows(g.rows, newPct) } : g));
    }
  }, [activeTab]);

  // ─ Update factura when switching tabs
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    if (tab !== "TODOS" && factura) {
      const g = grupos.find(gr => gr.tomador === tab);
      if (g) {
        const r = calcResumen(g.rows);
        setFactura(prev => prev ? { ...prev, tomador: g.tomador, cifTomador: g.cifTomador, primaNeta: r.primaNeta, impuestos: r.impuesto, primaTotal: r.importe } : prev);
      }
    } else if (tab === "TODOS" && factura) {
      const r = calcResumen(allRows);
      const first = grupos[0];
      setFactura(prev => prev ? { ...prev, tomador: first?.tomador ?? "", cifTomador: first?.cifTomador ?? "", primaNeta: r.primaNeta, impuestos: r.impuesto, primaTotal: r.importe } : prev);
    }
  }, [grupos, factura, allRows]);

  // ─ Factura field edit
  const setFact = useCallback((field: keyof FacturaData, value: string | number) => {
    setFactura(prev => prev ? { ...prev, [field]: value } : prev);
  }, []);

  // ─ Downloads
  const handleDownloadExcel = useCallback(async () => {
    const hoy = new Date();
    const fechaInf = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()}`;
    const tituloExcel = `Informe Recibos ${flota?.nombre ?? ""} ${tipoOp.toUpperCase()}`;
    const rowsParaExcel = allRows.map(r => ({
      poliza: r.poliza, numRecibo: r.numRecibo, riesgo: r.riesgo, fecha: r.fecha,
      tipo: r.tipo, importe: r.importe, pNeta: r.pNeta, impuesto: r.impuesto,
      comision: r.comision, liquidoAbonar: r.liquido,
      periodicidad: r.periodicidad, fechaInicioPoliza: r.fechaInicioPoliza,
      fechaVencimiento: r.fechaVencimiento, tomador: r.tomador,
    }));
    const resumenExcel = {
      totalRegistros: allRows.length,
      totalVehiculos: new Set(allRows.map(r => r.riesgo).filter(Boolean)).size,
      totalImporte: resumenGlobal.importe, totalPrimaNeta: resumenGlobal.primaNeta,
      totalImpuesto: resumenGlobal.impuesto, totalComision: resumenGlobal.comision,
      totalLiquidoAbonar: resumenGlobal.liquido,
    };
    const body = { tipo: tipoOp.toUpperCase(), titulo: tituloExcel, fechaInforme: fechaInf, rows: rowsParaExcel, resumen: resumenExcel };
    const res = await fetch("/api/flotas/recibos/excel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { const err = await res.json().catch(() => null); alert(err?.error || "Error generando Excel"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `recibos_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  }, [allRows, resumenGlobal, tipoOp, flota]);

  const handleDownloadFactura = useCallback(async () => {
    if (!factura) return;
    const bodyPdf = {
      tipo: tipoOp.toUpperCase(),
      numeroRecibo: factura.numRecibo,
      corredor: { nombre: factura.corredor, cif: factura.corredorCif, domicilio: factura.corredorDomicilio },
      flota: factura.flota,
      tomador: { nombre: factura.tomador, cif: factura.cifTomador },
      periodoCobertura: { desde: factura.periodoDesde, hasta: factura.periodoHasta },
      formaPago: factura.formaPago, descripcionPeriodo: factura.descripcionPeriodo,
      primaNeta: factura.primaNeta, impuestos: factura.impuestos, importeTotal: factura.primaTotal,
    };
    const res = await fetch("/api/flotas/recibos/factura", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyPdf) });
    if (!res.ok) { const err = await res.json().catch(() => null); alert(err?.error || "Error generando factura"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `recibo_${factura.numRecibo}.docx`;
    a.click(); URL.revokeObjectURL(url);
  }, [factura, tipoOp]);

  const handleDownloadFacturasBatch = useCallback(async () => {
    if (!factura || grupos.length < 2) return;
    const hoy = new Date();
    const ddmmyyyy = `${String(hoy.getDate()).padStart(2, "0")}${String(hoy.getMonth() + 1).padStart(2, "0")}${hoy.getFullYear()}`;
    const letraCorr = (corredor?.nombre ?? "X").charAt(0).toUpperCase();

    const facturas = grupos.map(g => {
      const r = calcResumen(g.rows);
      return {
        numeroRecibo: `R${letraCorr}${ddmmyyyy}_${g.tomador.substring(0, 5)}`,
        tomador: { nombre: g.tomador, cif: g.cifTomador },
        primaNeta: r.primaNeta, impuestos: r.impuesto, importeTotal: r.importe,
      };
    });

    const body = {
      tipo: tipoOp.toUpperCase(),
      corredor: { nombre: corredor?.nombre, cif: corredor?.cif, domicilio: corredor?.domicilio },
      flota: flota?.nombre,
      periodoCobertura: { desde: factura.periodoDesde, hasta: factura.periodoHasta },
      formaPago: factura.formaPago, descripcionPeriodo: factura.descripcionPeriodo,
      facturas,
    };
    const res = await fetch("/api/flotas/recibos/facturas-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { const err = await res.json().catch(() => null); alert(err?.error || "Error generando facturas"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `facturas_${flota?.nombre ?? "flota"}.zip`;
    a.click(); URL.revokeObjectURL(url);
  }, [grupos, tipoOp, corredor, flota, factura]);

  // ─── Styles ─────────────────────────────────────────────────────────────────
  const labelSt: React.CSSProperties = { display: "block", fontSize: 10, fontWeight: 800, color: "rgba(129,140,248,0.8)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 };
  const inputSt: React.CSSProperties = { width: "100%", fontSize: 12, padding: "7px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", outline: "none", fontFamily: "inherit" };
  const sectionTitle: React.CSSProperties = { fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16 };
  const glassCard: React.CSSProperties = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "20px 24px" };
  const calcBg: React.CSSProperties = { background: "rgba(99,102,241,0.05)" };

  // ─── KPI Panel sub-component ────────────────────────────────────────────────
  const KpiPanel = ({ res, pct }: { res: Resumen; pct: number }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
      {([
        ["Veh\u00EDculos", String(res.vehiculos), false],
        ["Prima Neta", fmtEur(res.primaNeta), false],
        ["Impuesto", fmtEur(res.impuesto), false],
        ["Importe Total", fmtEur(res.importe), false],
        [`Comisi\u00F3n (${pct}%)`, fmtEur(res.comision), true],
        ["L\u00EDquido a Abonar", fmtEur(res.liquido), true],
      ] as [string, string, boolean][]).map(([label, val, highlight], i) => (
        <div key={i} style={{
          background: highlight ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.02)",
          border: `1px solid ${highlight ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.06)"}`,
          borderRadius: 10, padding: "10px 14px", textAlign: "center",
        }}>
          <p style={{ margin: 0, fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p>
          <p style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 700, color: highlight ? "#818cf8" : "#e2e8f0" }}>{val}</p>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", padding: "28px 32px", color: "#e2e8f0", fontFamily: "inherit" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Gesti&oacute;n Documental</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Recibos, comisiones y facturaci&oacute;n</p>
        </div>

        {/* ═══ PASO 1: CONFIGURACIÓN ═══ */}
        <div style={{ ...glassCard, marginBottom: 20 }}>
          <p style={sectionTitle}>Paso 1 &mdash; Configuraci&oacute;n</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 16, alignItems: "end" }}>
            <div>
              <label style={labelSt}>Corredor</label>
              <select style={{ ...inputSt, cursor: "pointer" }} value={corredorId} onChange={e => { setCorredorId(e.target.value); setFlotaId(""); }}>
                <option value="">Seleccionar corredor...</option>
                {corredores.map(c => <option key={c.id} value={c.id}>{c.nombre} &middot; {c.porcentajeComision}%</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>Flota</label>
              <select style={{ ...inputSt, cursor: "pointer" }} value={flotaId} onChange={e => setFlotaId(e.target.value)} disabled={!corredorId}>
                <option value="">Seleccionar flota...</option>
                {flotasFiltradas.map(f => <option key={f.id} value={f.id}>{f.nombre || "(sin nombre)"}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
              {(["emision", "regularizacion"] as TipoOperacion[]).map(t => (
                <button key={t} onClick={() => setTipoOp(t)} style={{
                  padding: "8px 16px", fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  background: tipoOp === t ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.03)",
                  color: tipoOp === t ? "#818cf8" : "rgba(255,255,255,0.4)",
                }}>{t === "emision" ? "Emisi\u00F3n" : "Regularizaci\u00F3n"}</button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <input ref={fileRef} type="file" accept=".xls,.xlsx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} disabled={!corredorId || !flotaId || uploading} style={{
              width: "100%", padding: "14px 0", borderRadius: 10, border: "1px dashed rgba(99,102,241,0.3)",
              background: "rgba(99,102,241,0.05)", color: "#818cf8", fontSize: 13, fontWeight: 700,
              cursor: !corredorId || !flotaId || uploading ? "not-allowed" : "pointer",
              opacity: !corredorId || !flotaId ? 0.4 : 1, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>{uploading ? "Procesando..." : "Subir Excel del sistema (.xls / .xlsx)"}</button>
          </div>
        </div>

        {/* ═══ PASO 2: REVISIÓN Y EDICIÓN ═══ */}
        {hasData && (
          <div style={{ ...glassCard, marginBottom: 20, padding: 0 }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ ...sectionTitle, marginBottom: 16 }}>Paso 2 &mdash; Revisi&oacute;n y edici&oacute;n</p>

              {/* Tabs tomador */}
              {mostrarTabs && (
                <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
                  {["TODOS", ...grupos.map(g => g.tomador)].map(tab => (
                    <button key={tab} onClick={() => handleTabChange(tab)} style={{
                      padding: "6px 14px", borderRadius: 8, border: "1px solid",
                      fontSize: 11, fontWeight: 700, cursor: "pointer",
                      borderColor: activeTab === tab ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.08)",
                      background: activeTab === tab ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.02)",
                      color: activeTab === tab ? "#818cf8" : "rgba(255,255,255,0.45)",
                    }}>
                      {tab === "TODOS" ? "TODOS" : tab}
                      {tab !== "TODOS" && (
                        <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.6 }}>
                          ({grupos.find(g => g.tomador === tab)?.rows.length ?? 0})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <KpiPanel res={resumenVisible} pct={pctVisible} />

              {/* % Comisión */}
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 800, color: "rgba(129,140,248,0.8)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  % Comisi&oacute;n{mostrarTabs && activeTab !== "TODOS" ? ` (${activeTab})` : mostrarTabs ? " (global)" : ""}:
                </label>
                <input type="number" min={0} max={100} step={0.1} value={pctVisible}
                  onChange={e => handlePctChange(parseFloat(e.target.value) || 0)}
                  style={{ ...inputSt, width: 80 }} />
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    {["P\u00F3liza", "N\u00BA Recibo", "Riesgo", "Fecha", "Tipo", "Importe", "P.Neta", "Impuesto", "COMISI\u00D3N", "L\u00CDQUIDO", "Period.", "Inicio P\u00F3l.", "Vto.", "Tomador", ""].map((h, i) => (
                      <th key={i} style={{
                        padding: "10px 8px", textAlign: "left", fontSize: 9, fontWeight: 800,
                        color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em",
                        whiteSpace: "nowrap", ...(i === 8 || i === 9 ? calcBg : {}),
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filasVisibles.map(row => (
                    <tr key={row.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      {(["poliza", "numRecibo", "riesgo", "fecha", "tipo"] as (keyof ReciboRow)[]).map(f => (
                        <td key={f} style={{ padding: "4px 4px" }}>
                          <input style={{ ...inputSt, padding: "5px 6px", fontSize: 11 }} value={String(row[f])}
                            onChange={e => updateRow(row.id, f, e.target.value)} />
                        </td>
                      ))}
                      {(["importe", "pNeta", "impuesto"] as (keyof ReciboRow)[]).map(f => (
                        <td key={f} style={{ padding: "4px 4px" }}>
                          <input style={{ ...inputSt, padding: "5px 6px", fontSize: 11, textAlign: "right" }}
                            type="number" step="0.01" value={row[f] as number}
                            onChange={e => updateRow(row.id, f, parseFloat(e.target.value) || 0)} />
                        </td>
                      ))}
                      <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600, color: "#818cf8", ...calcBg, fontSize: 11 }}>{fmtEur(row.comision)}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600, color: "#818cf8", ...calcBg, fontSize: 11 }}>{fmtEur(row.liquido)}</td>
                      {(["periodicidad", "fechaInicioPoliza", "fechaVencimiento", "tomador"] as (keyof ReciboRow)[]).map(f => (
                        <td key={f} style={{ padding: "4px 4px" }}>
                          <input style={{ ...inputSt, padding: "5px 6px", fontSize: 11 }} value={String(row[f])}
                            onChange={e => updateRow(row.id, f, e.target.value)} />
                        </td>
                      ))}
                      <td style={{ padding: "4px 8px" }}>
                        <button onClick={() => deleteRow(row.id)} style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "rgba(255,255,255,0.25)", fontSize: 14, padding: 2,
                        }} title="Eliminar fila">&times;</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "12px 24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <button onClick={addRow} style={{
                background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8,
                padding: "7px 16px", color: "#818cf8", fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}>+ A&ntilde;adir fila</button>
            </div>
          </div>
        )}

        {/* ═══ PASO 3: PREVIEW FACTURA ═══ */}
        {factura && hasData && (
          <div style={{ ...glassCard, marginBottom: 20 }}>
            <p style={sectionTitle}>Paso 3 &mdash; Factura{mostrarTabs ? ` (${activeTab === "TODOS" ? grupos[0]?.tomador ?? "" : activeTab})` : ""}</p>

            {mostrarTabs && (
              <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
                {grupos.map(g => (
                  <button key={g.tomador} onClick={() => {
                    handleTabChange(g.tomador);
                  }} style={{
                    padding: "5px 12px", borderRadius: 6, border: "1px solid",
                    fontSize: 10, fontWeight: 700, cursor: "pointer",
                    borderColor: (activeTab === g.tomador || (activeTab === "TODOS" && g === grupos[0])) ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.08)",
                    background: (activeTab === g.tomador || (activeTab === "TODOS" && g === grupos[0])) ? "rgba(99,102,241,0.12)" : "transparent",
                    color: (activeTab === g.tomador || (activeTab === "TODOS" && g === grupos[0])) ? "#818cf8" : "rgba(255,255,255,0.4)",
                  }}>{g.tomador}</button>
                ))}
              </div>
            )}

            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "24px 28px", maxWidth: 700, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>MUTUA MMT SEGUROS, S.M DE SEGUROS A PRIMA FIJA</p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>C/Trafalgar, 11. 28010 Madrid. CIF: G28010817</p>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelSt}>N&ordm; Recibo</label>
                <input style={inputSt} value={factura.numRecibo} onChange={e => setFact("numRecibo", e.target.value)} />
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>RECIBO DE COBRO DE PRIMAS:</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={labelSt}>Corredor</label><input style={inputSt} value={factura.corredor} onChange={e => setFact("corredor", e.target.value)} /></div>
                <div><label style={labelSt}>CIF Corredor</label><input style={inputSt} value={factura.corredorCif} onChange={e => setFact("corredorCif", e.target.value)} /></div>
              </div>
              <div style={{ marginBottom: 12 }}><label style={labelSt}>Domicilio</label><input style={inputSt} value={factura.corredorDomicilio} onChange={e => setFact("corredorDomicilio", e.target.value)} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={labelSt}>Flota</label><input style={inputSt} value={factura.flota} onChange={e => setFact("flota", e.target.value)} /></div>
                <div><label style={labelSt}>Tomador</label><input style={inputSt} value={factura.tomador} onChange={e => setFact("tomador", e.target.value)} /></div>
              </div>
              <div style={{ marginBottom: 16 }}><label style={labelSt}>CIF Tomador</label><input style={{ ...inputSt, width: "50%" }} value={factura.cifTomador} onChange={e => setFact("cifTomador", e.target.value)} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={labelSt}>Per&iacute;odo desde</label><input style={inputSt} value={factura.periodoDesde} onChange={e => setFact("periodoDesde", e.target.value)} /></div>
                <div><label style={labelSt}>Per&iacute;odo hasta</label><input style={inputSt} value={factura.periodoHasta} onChange={e => setFact("periodoHasta", e.target.value)} /></div>
                <div><label style={labelSt}>Forma de pago</label><input style={inputSt} value={factura.formaPago} onChange={e => setFact("formaPago", e.target.value)} /></div>
              </div>
              <div style={{ marginBottom: 20 }}><label style={labelSt}>Descripci&oacute;n del per&iacute;odo</label><input style={inputSt} value={factura.descripcionPeriodo} onChange={e => setFact("descripcionPeriodo", e.target.value)} /></div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                {([["Prima Neta", "primaNeta"], ["Impuestos", "impuestos"], ["Prima Total", "primaTotal"]] as [string, keyof FacturaData][]).map(([label, field]) => (
                  <div key={field} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>{label}:</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="number" step="0.01" style={{ ...inputSt, width: 140, textAlign: "right", fontWeight: 700, fontSize: 14, color: field === "primaTotal" ? "#818cf8" : "#e2e8f0" }}
                        value={factura[field] as number} onChange={e => setFact(field, parseFloat(e.target.value) || 0)} />
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>&euro;</span>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ margin: "16px 0 0", fontSize: 10, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>(*) Seg&uacute;n documento anexo adjunto</p>
            </div>
          </div>
        )}

        {/* ═══ PASO 4: EMITIR ═══ */}
        {factura && hasData && (
          <div style={{ ...glassCard, marginBottom: 40 }}>
            <p style={sectionTitle}>Paso 4 &mdash; Emitir</p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={revisado} onChange={e => setRevisado(e.target.checked)} style={{ accentColor: "#6366f1" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>He revisado los datos</span>
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <button onClick={handleDownloadExcel} disabled={!revisado} style={{
                padding: "14px 0", borderRadius: 10, border: "none",
                background: revisado ? "#6366f1" : "rgba(99,102,241,0.15)",
                color: revisado ? "#fff" : "rgba(255,255,255,0.3)",
                fontSize: 13, fontWeight: 700, cursor: revisado ? "pointer" : "not-allowed",
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Descargar Excel procesado</button>
              {mostrarTabs ? (
                <button onClick={handleDownloadFacturasBatch} disabled={!revisado} style={{
                  padding: "14px 0", borderRadius: 10, border: "1px solid rgba(99,102,241,0.3)",
                  background: revisado ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.02)",
                  color: revisado ? "#818cf8" : "rgba(255,255,255,0.3)",
                  fontSize: 13, fontWeight: 700, cursor: revisado ? "pointer" : "not-allowed",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>Descargar facturas (ZIP)</button>
              ) : (
                <button onClick={handleDownloadFactura} disabled={!revisado} style={{
                  padding: "14px 0", borderRadius: 10, border: "1px solid rgba(99,102,241,0.3)",
                  background: revisado ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.02)",
                  color: revisado ? "#818cf8" : "rgba(255,255,255,0.3)",
                  fontSize: 13, fontWeight: 700, cursor: revisado ? "pointer" : "not-allowed",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>Descargar factura DOCX</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
