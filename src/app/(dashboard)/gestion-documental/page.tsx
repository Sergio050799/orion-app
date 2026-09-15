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

function round2(n: number): number { return Math.round(n * 100) / 100; }

function calcResumen(filas: ReciboRow[]): Resumen {
  const matriculas = new Set(filas.map(r => r.riesgo).filter(Boolean));
  return {
    vehiculos: matriculas.size,
    primaNeta: round2(filas.reduce((s, r) => s + r.pNeta, 0)),
    impuesto: round2(filas.reduce((s, r) => s + r.impuesto, 0)),
    importe: round2(filas.reduce((s, r) => s + r.importe, 0)),
    comision: round2(filas.reduce((s, r) => s + r.comision, 0)),
    liquido: round2(filas.reduce((s, r) => s + r.liquido, 0)),
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

  // ─ State columnas
  const [showAllColumns, setShowAllColumns] = useState(false);

  // ─ Drag & drop
  const [dragCounter, setDragCounter] = useState(0);

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
          const pNeta = Math.round((typeof r.pNeta === "number" ? r.pNeta : parseNum(String(r.pNeta ?? "0"))) * 100) / 100;
          const impuesto = Math.round((typeof r.impuesto === "number" ? r.impuesto : parseNum(String(r.impuesto ?? "0"))) * 100) / 100;
          const importe = Math.round((typeof r.importe === "number" ? r.importe : parseNum(String(r.importe ?? "0"))) * 100) / 100;
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
      const totalPNeta = round2(allParsedRows.reduce((s, r) => s + r.pNeta, 0));
      const totalImpuesto = round2(allParsedRows.reduce((s, r) => s + r.impuesto, 0));
      const totalImporte = round2(allParsedRows.reduce((s, r) => s + r.importe, 0));
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

  // ─ % comision change (per tomador or global)
  const handlePctChange = useCallback((newPct: number) => {
    if (activeTab === "TODOS") {
      setGrupos(prev => prev.map(g => ({ ...g, pctComision: newPct, rows: recalcRows(g.rows, newPct) })));
    } else {
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
        setFactura(prev => prev ? { ...prev, tomador: g.tomador, cifTomador: g.cifTomador, primaNeta: round2(r.primaNeta), impuestos: round2(r.impuesto), primaTotal: round2(r.importe) } : prev);
      }
    } else if (tab === "TODOS" && factura) {
      const r = calcResumen(allRows);
      const first = grupos[0];
      setFactura(prev => prev ? { ...prev, tomador: first?.tomador ?? "", cifTomador: first?.cifTomador ?? "", primaNeta: round2(r.primaNeta), impuestos: round2(r.impuesto), primaTotal: round2(r.importe) } : prev);
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

  const handleDownloadFacturaPdf = useCallback(async () => {
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
    const res = await fetch("/api/flotas/recibos/factura-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyPdf) });
    if (!res.ok) { const err = await res.json().catch(() => null); alert(err?.error || "Error generando PDF"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `recibo_${factura.numRecibo}.pdf`;
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

  // ─── Design Tokens ────────────────────────────────────────────────────────────
  const glassCard: React.CSSProperties = {
    background: 'rgba(12, 28, 82, 0.75)',
    border: '1px solid rgba(61, 112, 255, 0.22)',
    borderRadius: 22,
    boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(61,112,255,0.14) inset',
  };

  const labelSt: React.CSSProperties = {
    display: "block", fontSize: 10, fontWeight: 800,
    color: "rgba(51,102,255,0.8)", textTransform: "uppercase",
    letterSpacing: "0.08em", marginBottom: 6,
  };

  const inputSt: React.CSSProperties = {
    width: "100%", fontSize: 13, padding: "9px 12px", borderRadius: 10,
    background: "rgba(6,14,50,0.5)", border: "1px solid rgba(61,112,255,0.22)",
    color: "#FFFFFF", outline: "none", fontFamily: "inherit",
  };

  const selectSt: React.CSSProperties = {
    ...inputSt, cursor: "pointer", appearance: "none" as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(51,102,255,0.6)'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
    paddingRight: 32,
  };

  const accentBar: React.CSSProperties = {
    width: 4, height: 28, borderRadius: 2,
    background: "linear-gradient(180deg, #3366FF 0%, #1240CC 100%)",
    marginRight: 14, flexShrink: 0,
  };

  const pillContainer: React.CSSProperties = {
    display: "inline-flex", gap: 0, borderRadius: 10, overflow: "hidden",
    background: "rgba(6,14,50,0.5)", border: "1px solid rgba(61,112,255,0.22)",
    padding: 3,
  };

  const pillBase: React.CSSProperties = {
    padding: "8px 20px", fontSize: 12, fontWeight: 700, border: "none",
    cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em",
    borderRadius: 8, transition: "all 0.15s",
  };

  const calcBg: React.CSSProperties = { background: "rgba(18,64,204,0.08)" };

  // ─── KPI Panel sub-component ────────────────────────────────────────────────
  const KpiPanel = ({ res, pct }: { res: Resumen; pct: number }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
      {([
        ["Veh\u00EDculos", String(res.vehiculos), false],
        ["Prima Neta", fmtEur(res.primaNeta), false],
        ["Impuesto", fmtEur(res.impuesto), false],
        ["Importe", fmtEur(res.importe), false],
        [`Comisi\u00F3n (${pct}%)`, fmtEur(res.comision), true],
        ["L\u00EDquido", fmtEur(res.liquido), true],
      ] as [string, string, boolean][]).map(([label, val, highlight], i) => (
        <div key={i} style={{
          ...glassCard,
          borderRadius: 14, padding: "14px 12px", textAlign: "center",
          ...(highlight ? { borderColor: 'rgba(51,102,255,0.3)', background: 'rgba(18,64,204,0.20)' } : {}),
        }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: "rgba(70,120,255,0.6)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p>
          <p style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 700, fontFamily: "inherit", color: highlight ? "#3366FF" : "#FFFFFF" }}>{val}</p>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", padding: "32px 36px", color: "#FFFFFF", fontFamily: "inherit" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>

        {/* ═══ STEP 1: CONFIG + UPLOAD ═══ */}
        <div style={{ marginBottom: 28 }}>
          {/* Zone header */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
            <div style={accentBar} />
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#FFFFFF" }}>Gesti&oacute;n Documental</h1>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#BDD4FF" }}>Recibos, comisiones y facturaci&oacute;n de flotas</p>
            </div>
          </div>

          {/* Glass card: 2 columns */}
          <div style={{ ...glassCard, padding: "32px 36px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "start" }}>
              {/* LEFT: Configuration */}
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#BDD4FF", textTransform: "uppercase", letterSpacing: "0.06em" }}>Configuraci&oacute;n</h3>
                <div>
                  <label style={labelSt}>Corredor</label>
                  <select style={selectSt} value={corredorId} onChange={e => { setCorredorId(e.target.value); setFlotaId(""); }}>
                    <option value="">Seleccionar corredor...</option>
                    {corredores.map(c => <option key={c.id} value={c.id}>{c.nombre} &middot; {c.porcentajeComision}%</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelSt}>Flota</label>
                  <select style={selectSt} value={flotaId} onChange={e => setFlotaId(e.target.value)} disabled={!corredorId}>
                    <option value="">Seleccionar flota...</option>
                    {flotasFiltradas.map(f => <option key={f.id} value={f.id}>{f.nombre || "(sin nombre)"}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelSt}>Tipo de operaci&oacute;n</label>
                  <div style={pillContainer}>
                    {(["emision", "regularizacion"] as TipoOperacion[]).map(t => (
                      <button key={t} onClick={() => setTipoOp(t)} style={{
                        ...pillBase,
                        background: tipoOp === t ? "rgba(18,64,204,0.35)" : "transparent",
                        color: tipoOp === t ? "#FFFFFF" : "rgba(178,198,245,0.6)",
                      }}>{t === "emision" ? "Emisi\u00F3n" : "Regularizaci\u00F3n"}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT: Upload */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 18, height: "100%" }}
                onDragEnter={e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.types.includes('Files')) setDragCounter(c => c + 1); }}
                onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragCounter(c => c - 1); }}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => {
                  e.preventDefault(); e.stopPropagation(); setDragCounter(0);
                  if (!corredorId || !flotaId || uploading) return;
                  const file = e.dataTransfer.files?.[0];
                  if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) handleUpload(file);
                }}
              >
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#BDD4FF", textTransform: "uppercase", letterSpacing: "0.06em" }}>Subir recibos</h3>
                <input ref={fileRef} type="file" accept=".xls,.xlsx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
                <button onClick={() => fileRef.current?.click()} disabled={!corredorId || !flotaId || uploading} style={{
                  flex: 1, minHeight: 180, padding: "28px 20px", borderRadius: 16,
                  border: dragCounter > 0 ? "2px dashed #3366FF" : "2px dashed rgba(51,102,255,0.3)",
                  background: dragCounter > 0 ? "rgba(61,112,255,0.12)" : "rgba(8,22,72,0.3)",
                  color: "#3366FF", fontSize: 14, fontWeight: 700,
                  cursor: !corredorId || !flotaId || uploading ? "not-allowed" : "pointer",
                  opacity: !corredorId || !flotaId ? 0.4 : 1,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 12, textAlign: "center", transition: "border 0.15s, background 0.15s",
                }}>
                  {/* Upload cloud icon */}
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                    <path d="M12 12v9" />
                    <path d="m16 16-4-4-4 4" />
                  </svg>
                  <span>{uploading ? "Procesando..." : dragCounter > 0 ? "Suelta el archivo aqu\u00ED" : "Subir Excel del sistema"}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(178,198,245,0.6)" }}>.xls / .xlsx</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ STEP 2: DATA VIEW ═══ */}
        {hasData && (
          <div style={{ marginBottom: 28 }}>
            {/* Zone header */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
              <div style={accentBar} />
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#FFFFFF" }}>Revisi&oacute;n y edici&oacute;n</h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "rgba(178,198,245,0.6)" }}>
                  {corredor?.nombre ?? ""} &middot; {flota?.nombre ?? ""} &middot; {tipoOp === "emision" ? "Emisi\u00F3n" : "Regularizaci\u00F3n"} &middot; {allRows.length} registros
                </p>
              </div>
            </div>

            {/* Tomador tabs */}
            {mostrarTabs && (
              <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
                {["TODOS", ...grupos.map(g => g.tomador)].map(tab => (
                  <button key={tab} onClick={() => handleTabChange(tab)} style={{
                    padding: "8px 18px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    border: "1px solid",
                    borderColor: activeTab === tab ? "rgba(70,120,255,0.5)" : "rgba(61,112,255,0.16)",
                    background: activeTab === tab ? "rgba(18,64,204,0.25)" : "rgba(8,22,72,0.3)",
                    color: activeTab === tab ? "#FFFFFF" : "rgba(178,198,245,0.6)",
                    transition: "all 0.15s",
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

            {/* KPI row */}
            <div style={{ marginBottom: 20 }}>
              <KpiPanel res={resumenVisible} pct={pctVisible} />
            </div>

            {/* Glass table card */}
            <div style={{ ...glassCard, padding: 0, overflow: "hidden", marginBottom: 20 }}>
              {/* Toolbar */}
              <div style={{ padding: "16px 28px", borderBottom: "1px solid rgba(61,112,255,0.16)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(51,102,255,0.8)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    % Comisi&oacute;n{mostrarTabs && activeTab !== "TODOS" ? ` (${activeTab})` : mostrarTabs ? " (global)" : ""}:
                  </label>
                  <input inputMode="decimal" value={pctVisible}
                    onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) handlePctChange(parseFloat(v) || 0); }}
                    style={{ ...inputSt, width: 80, padding: "6px 10px", fontSize: 13 }} />
                </div>
                <button onClick={() => setShowAllColumns(v => !v)} style={{
                  fontSize: 11, fontWeight: 700, padding: '6px 14px', borderRadius: 8,
                  background: showAllColumns ? 'rgba(18,64,204,0.25)' : 'rgba(6,14,50,0.5)',
                  color: '#3366FF', border: '1px solid rgba(61,112,255,0.22)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>{showAllColumns ? "Menos columnas" : "M\u00E1s columnas"}</button>
                <button onClick={addRow} style={{
                  fontSize: 11, fontWeight: 700, padding: '6px 14px', borderRadius: 8,
                  background: 'rgba(18,64,204,0.15)', color: '#3366FF',
                  border: '1px solid rgba(61,112,255,0.22)', cursor: 'pointer',
                  marginLeft: "auto",
                }}>+ A&ntilde;adir fila</button>
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(61,112,255,0.16)" }}>
                      {[
                        { label: "P\u00F3liza", always: true },
                        { label: "N\u00BA Recibo", always: true },
                        { label: "Riesgo", always: true },
                        { label: "Fecha", always: true },
                        { label: "Tipo", always: true },
                        { label: "Importe", always: true },
                        { label: "P.Neta", always: true },
                        { label: "Impuesto", always: true },
                        { label: "COMISI\u00D3N", always: true, highlight: true },
                        { label: "L\u00CDQUIDO", always: true, highlight: true },
                        { label: "Period.", always: false },
                        { label: "Inicio P\u00F3l.", always: false },
                        { label: "Vto.", always: false },
                        { label: "Tomador", always: false },
                        { label: "", always: true },
                      ].filter(col => col.always || showAllColumns).map((col, i) => (
                        <th key={i} style={{
                          padding: "12px 8px", textAlign: "left", fontSize: 10, fontWeight: 800,
                          color: col.highlight ? "#3366FF" : "rgba(178,198,245,0.6)",
                          textTransform: "uppercase", letterSpacing: "0.08em",
                          whiteSpace: "nowrap", ...(col.highlight ? calcBg : {}),
                        }}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filasVisibles.map(row => (
                      <tr key={row.id} style={{ borderBottom: "1px solid rgba(61,112,255,0.10)" }}>
                        {(["poliza", "numRecibo", "riesgo", "fecha", "tipo"] as (keyof ReciboRow)[]).map(f => (
                          <td key={f} style={{ padding: "4px 4px" }}>
                            <input style={{ ...inputSt, padding: "6px 8px", fontSize: 11, borderRadius: 8 }} value={String(row[f])}
                              onChange={e => updateRow(row.id, f, e.target.value)} />
                          </td>
                        ))}
                        {(["importe", "pNeta", "impuesto"] as (keyof ReciboRow)[]).map(f => (
                          <td key={f} style={{ padding: "4px 4px" }}>
                            <input style={{ ...inputSt, padding: "6px 8px", fontSize: 11, textAlign: "right", borderRadius: 8 }}
                              inputMode="decimal" value={round2(row[f] as number)}
                              onChange={e => { const v = e.target.value; if (v === '' || /^-?\d*\.?\d*$/.test(v)) updateRow(row.id, f, round2(parseFloat(v) || 0)); }} />
                          </td>
                        ))}
                        <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700, color: "#3366FF", ...calcBg, fontSize: 12 }}>{fmtEur(row.comision)}</td>
                        <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700, color: "#3366FF", ...calcBg, fontSize: 12 }}>{fmtEur(row.liquido)}</td>
                        {showAllColumns && (["periodicidad", "fechaInicioPoliza", "fechaVencimiento", "tomador"] as (keyof ReciboRow)[]).map(f => (
                          <td key={f} style={{ padding: "4px 4px" }}>
                            <input style={{ ...inputSt, padding: "6px 8px", fontSize: 11, borderRadius: 8 }} value={String(row[f])}
                              onChange={e => updateRow(row.id, f, e.target.value)} />
                          </td>
                        ))}
                        <td style={{ padding: "4px 8px" }}>
                          <button onClick={() => deleteRow(row.id)} style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: "rgba(178,198,245,0.4)", fontSize: 16, padding: 4,
                            transition: "color 0.15s",
                          }} title="Eliminar fila">&times;</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ─── Factura card ─── */}
            {factura && (
              <div style={{ ...glassCard, padding: "28px 32px", marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "#BDD4FF" }}>
                  Factura del corredor{mostrarTabs ? ` (${activeTab === "TODOS" ? grupos[0]?.tomador ?? "" : activeTab})` : ""}
                </h3>

                {mostrarTabs && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
                    {grupos.map(g => (
                      <button key={g.tomador} onClick={() => handleTabChange(g.tomador)} style={{
                        padding: "6px 14px", borderRadius: 8, border: "1px solid",
                        fontSize: 11, fontWeight: 700, cursor: "pointer",
                        borderColor: (activeTab === g.tomador || (activeTab === "TODOS" && g === grupos[0])) ? "rgba(70,120,255,0.5)" : "rgba(61,112,255,0.16)",
                        background: (activeTab === g.tomador || (activeTab === "TODOS" && g === grupos[0])) ? "rgba(18,64,204,0.2)" : "transparent",
                        color: (activeTab === g.tomador || (activeTab === "TODOS" && g === grupos[0])) ? "#FFFFFF" : "rgba(178,198,245,0.6)",
                      }}>{g.tomador}</button>
                    ))}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div><label style={labelSt}>N&ordm; Recibo</label><input style={inputSt} value={factura.numRecibo} onChange={e => setFact("numRecibo", e.target.value)} /></div>
                  <div><label style={labelSt}>Corredor</label><input style={inputSt} value={factura.corredor} onChange={e => setFact("corredor", e.target.value)} /></div>
                  <div><label style={labelSt}>CIF Corredor</label><input style={inputSt} value={factura.corredorCif} onChange={e => setFact("corredorCif", e.target.value)} /></div>
                  <div><label style={labelSt}>Domicilio</label><input style={inputSt} value={factura.corredorDomicilio} onChange={e => setFact("corredorDomicilio", e.target.value)} /></div>
                  <div><label style={labelSt}>Flota</label><input style={inputSt} value={factura.flota} onChange={e => setFact("flota", e.target.value)} /></div>
                  <div><label style={labelSt}>Tomador</label><input style={inputSt} value={factura.tomador} onChange={e => setFact("tomador", e.target.value)} /></div>
                  <div><label style={labelSt}>CIF Tomador</label><input style={inputSt} value={factura.cifTomador} onChange={e => setFact("cifTomador", e.target.value)} /></div>
                  <div><label style={labelSt}>Forma de pago</label><input style={inputSt} value={factura.formaPago} onChange={e => setFact("formaPago", e.target.value)} /></div>
                  <div><label style={labelSt}>Per&iacute;odo desde</label><input style={inputSt} value={factura.periodoDesde} onChange={e => setFact("periodoDesde", e.target.value)} /></div>
                  <div><label style={labelSt}>Per&iacute;odo hasta</label><input style={inputSt} value={factura.periodoHasta} onChange={e => setFact("periodoHasta", e.target.value)} /></div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={labelSt}>Descripci&oacute;n del per&iacute;odo</label>
                  <input style={inputSt} value={factura.descripcionPeriodo} onChange={e => setFact("descripcionPeriodo", e.target.value)} />
                </div>
                <div style={{ borderTop: "1px solid rgba(61,112,255,0.16)", paddingTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                  {([["Prima Neta", "primaNeta"], ["Impuestos", "impuestos"], ["Prima Total", "primaTotal"]] as [string, keyof FacturaData][]).map(([label, field]) => (
                    <div key={field} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(178,198,245,0.6)" }}>{label}:</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input inputMode="decimal" style={{
                          ...inputSt, width: 150, textAlign: "right", fontWeight: 700, fontSize: 15,
                          color: field === "primaTotal" ? "#3366FF" : "#FFFFFF",
                        }}
                          value={round2(factura[field] as number)} onChange={e => { const v = e.target.value; if (v === '' || /^-?\d*\.?\d*$/.test(v)) setFact(field, round2(parseFloat(v) || 0)); }} />
                        <span style={{ fontSize: 14, color: "rgba(178,198,245,0.5)" }}>&euro;</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── Download bar ─── */}
            {factura && (
              <div style={{ ...glassCard, padding: "20px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={revisado} onChange={e => setRevisado(e.target.checked)}
                      style={{ accentColor: "#1240CC", width: 16, height: 16 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#BDD4FF" }}>He revisado todos los datos</span>
                  </label>
                </div>
                <div style={{ display: "flex", gap: 14 }}>
                  <button onClick={handleDownloadExcel} disabled={!revisado} style={{
                    flex: 1, padding: "14px 0", borderRadius: 12, border: "none",
                    background: revisado ? "linear-gradient(135deg, #1240CC 0%, #3366FF 100%)" : "rgba(8,22,72,0.5)",
                    color: revisado ? "#FFFFFF" : "rgba(178,198,245,0.4)",
                    fontSize: 13, fontWeight: 700, cursor: revisado ? "pointer" : "not-allowed",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    boxShadow: revisado ? "0 8px 32px -8px rgba(18,64,204,0.5)" : "none",
                    transition: "all 0.2s",
                  }}>Descargar Excel</button>
                  {mostrarTabs ? (
                    <button onClick={handleDownloadFacturasBatch} disabled={!revisado} style={{
                      flex: 1, padding: "14px 0", borderRadius: 12,
                      border: "1px solid rgba(51,102,255,0.25)",
                      background: revisado ? "rgba(18,64,204,0.15)" : "rgba(8,22,72,0.3)",
                      color: revisado ? "#3366FF" : "rgba(178,198,245,0.4)",
                      fontSize: 13, fontWeight: 700, cursor: revisado ? "pointer" : "not-allowed",
                      textTransform: "uppercase", letterSpacing: "0.05em",
                      transition: "all 0.2s",
                    }}>Descargar facturas (ZIP)</button>
                  ) : (
                    <>
                      <button onClick={handleDownloadFacturaPdf} disabled={!revisado} style={{
                        flex: 1, padding: "14px 0", borderRadius: 12,
                        border: "1px solid rgba(51,102,255,0.25)",
                        background: revisado ? "rgba(18,64,204,0.15)" : "rgba(8,22,72,0.3)",
                        color: revisado ? "#3366FF" : "rgba(178,198,245,0.4)",
                        fontSize: 13, fontWeight: 700, cursor: revisado ? "pointer" : "not-allowed",
                        textTransform: "uppercase", letterSpacing: "0.05em",
                        transition: "all 0.2s",
                      }}>Descargar factura PDF</button>
                      <button onClick={handleDownloadFactura} disabled={!revisado} style={{
                        flex: 1, padding: "14px 0", borderRadius: 12,
                        border: "1px solid rgba(51,102,255,0.15)",
                        background: revisado ? "rgba(12,28,82,0.45)" : "rgba(8,22,72,0.3)",
                        color: revisado ? "rgba(178,198,245,0.7)" : "rgba(178,198,245,0.4)",
                        fontSize: 13, fontWeight: 700, cursor: revisado ? "pointer" : "not-allowed",
                        textTransform: "uppercase", letterSpacing: "0.05em",
                        transition: "all 0.2s",
                      }}>Descargar DOCX</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
