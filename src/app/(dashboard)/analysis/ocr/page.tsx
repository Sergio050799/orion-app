"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { listarCarpetas, guardarCarpeta, normalizeTipoVehiculo, type FlotaCarpeta } from "@/core/flotas";

// ─── Field label maps ────────────────────────────────────────────────────────

const LABELS_PERMISO: Record<string, string> = {
  A_matricula: "Matrícula",
  titular: "Titular",
  D1_marca: "Marca",
  D2_tipo_variante: "Tipo / Variante",
  D3_denominacion: "Denominación comercial",
  D4_uso: "Uso",
  E_bastidor: "Bastidor (VIN)",
  F1_masa_maxima: "Masa máxima (kg)",
  F2_masa_servicio: "Masa en servicio (kg)",
  G_masa_orden_marcha: "Tara (kg)",
  P1_cilindrada: "Cilindrada (cc)",
  P2_potencia: "Potencia (kW)",
  P3_combustible: "Combustible",
  S1_plazas: "Plazas",
  I_fecha_matriculacion: "Fecha matriculación",
  I1_fecha_permiso: "Fecha permiso",
  I2_localidad: "Localidad",
};

const LABELS_FICHA: Record<string, string> = {
  matricula: "Matrícula",
  D1_marca: "Marca",
  D3_modelo: "Modelo",
  E_bastidor: "Bastidor (VIN)",
  J_categoria: "Categoría UE",
  J1_carroceria: "Carrocería",
  R_color: "Color",
  P1_cilindrada: "Cilindrada (cc)",
  P2_potencia_kw: "Potencia (kW)",
  P3_combustible: "Combustible",
  S1_plazas: "Plazas",
  F1_masa_maxima: "Masa máxima (kg)",
  F2_masa_servicio: "Masa en servicio (kg)",
  V7_co2: "CO2 (g/km)",
  V9_euro: "Euro",
};

const LABELS_CARNET: Record<string, string> = {
  campo_1_apellidos: "Apellidos",
  campo_2_nombre: "Nombre",
  campo_3_nacimiento: "Fecha nacimiento",
  campo_3_pais: "País nacimiento",
  campo_4a_expedicion: "Fecha expedición",
  campo_4b_caducidad: "Fecha caducidad",
  campo_4c_autoridad: "Autoridad",
  campo_5_numero: "Nº documento",
  campo_9_categorias: "Categorías",
};

const LABELS_AUTORIZACION: Record<string, string> = {
  matricula: "Matrícula",
  fecha_matriculacion: "Fecha matriculación",
  titular: "Titular",
  jefatura: "Jefatura",
  marca: "Marca",
  modelo: "Modelo",
  bastidor: "Bastidor (VIN)",
  color: "Color",
  tipo: "Tipo",
  plazas: "Plazas",
  servicio: "Servicio",
  renting: "Renting",
  propulsion: "Propulsión",
  cilindrada: "Cilindrada (cc)",
  procedencia: "Procedencia",
  masa_maxima: "Masa máxima (kg)",
  variante: "Variante",
  version: "Versión",
  tipo_base: "Tipo base",
  contrasena_homologacion: "Contraseña homologación",
  masa_maxima_carga: "Masa máxima en carga (kg)",
  potencia_neta: "Potencia neta (kW)",
  relacion_potencia_peso: "Relación potencia/peso",
  masa_circulacion: "Masa en circulación (kg)",
  co2: "CO2 (g/km)",
  plazas_pie: "Plazas de pie",
  fecha_expedicion: "Fecha expedición",
  valido_hasta: "Válido hasta",
};

const LABELS_CARNET_TRASERO: Record<string, string> = {
  categorias_activas: "Categorías activas",
  AM_expedicion: "AM — Expedición", AM_caducidad: "AM — Caducidad", AM_restricciones: "AM — Restricciones",
  A1_expedicion: "A1 — Expedición", A1_caducidad: "A1 — Caducidad", A1_restricciones: "A1 — Restricciones",
  A2_expedicion: "A2 — Expedición", A2_caducidad: "A2 — Caducidad", A2_restricciones: "A2 — Restricciones",
  A_expedicion: "A — Expedición", A_caducidad: "A — Caducidad", A_restricciones: "A — Restricciones",
  B1_expedicion: "B1 — Expedición", B1_caducidad: "B1 — Caducidad", B1_restricciones: "B1 — Restricciones",
  B_expedicion: "B — Expedición", B_caducidad: "B — Caducidad", B_restricciones: "B — Restricciones",
  C1_expedicion: "C1 — Expedición", C1_caducidad: "C1 — Caducidad", C1_restricciones: "C1 — Restricciones",
  C_expedicion: "C — Expedición", C_caducidad: "C — Caducidad", C_restricciones: "C — Restricciones",
  D1_expedicion: "D1 — Expedición", D1_caducidad: "D1 — Caducidad", D1_restricciones: "D1 — Restricciones",
  D_expedicion: "D — Expedición", D_caducidad: "D — Caducidad", D_restricciones: "D — Restricciones",
  BE_expedicion: "BE — Expedición", BE_caducidad: "BE — Caducidad", BE_restricciones: "BE — Restricciones",
  C1E_expedicion: "C1E — Expedición", C1E_caducidad: "C1E — Caducidad", C1E_restricciones: "C1E — Restricciones",
  CE_expedicion: "CE — Expedición", CE_caducidad: "CE — Caducidad", CE_restricciones: "CE — Restricciones",
  D1E_expedicion: "D1E — Expedición", D1E_caducidad: "D1E — Caducidad", D1E_restricciones: "D1E — Restricciones",
  DE_expedicion: "DE — Expedición", DE_caducidad: "DE — Caducidad", DE_restricciones: "DE — Restricciones",
};

const LABELS_DNI_FRONTAL: Record<string, string> = {
  numero_dni: "Número DNI",
  apellidos: "Apellidos",
  nombre: "Nombre",
  sexo: "Sexo",
  nacionalidad: "Nacionalidad",
  fecha_nacimiento: "Fecha nacimiento",
  fecha_expedicion: "Fecha expedición",
  fecha_caducidad: "Fecha caducidad",
  num_soporte: "Nº soporte",
};

const LABELS_DNI_TRASERO: Record<string, string> = {
  domicilio: "Domicilio",
  lugar_nacimiento: "Lugar nacimiento",
  localidad: "Localidad",
  provincia: "Provincia",
  pais: "País",
  hijo_de: "Hijo/a de",
  equipo: "Equipo",
  num_soporte: "Nº soporte",
  idesp: "IDESP",
  mrz_linea1: "MRZ línea 1",
  mrz_linea2: "MRZ línea 2",
  mrz_linea3: "MRZ línea 3",
};

const LABEL_MAP: Record<string, Record<string, string>> = {
  PERMISO_CIRCULACION: LABELS_PERMISO,
  FICHA_TECNICA_MODERNA: LABELS_FICHA,
  CARNET_CONDUCIR: LABELS_CARNET,
  CARNET_TRASERO: LABELS_CARNET_TRASERO,
  AUTORIZACION_PROVISIONAL: LABELS_AUTORIZACION,
  DNI_FRONTAL: LABELS_DNI_FRONTAL,
  DNI_TRASERO: LABELS_DNI_TRASERO,
};

const SKIP_FIELDS = new Set(["tipo_documento", "calidad_imagen"]);

function getLabel(tipoDoc: string, key: string): string {
  const map = LABEL_MAP[tipoDoc];
  if (map?.[key]) return map[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Types ───────────────────────────────────────────────────────────────────

type TipoDoc = "auto" | "permiso_circulacion" | "ficha_tecnica_moderna" | "carnet_conducir" | "carnet_trasero" | "autorizacion_provisional" | "dni_frontal" | "dni_trasero";

interface OcrResult {
  campos: Record<string, string>;
  tipo_documento: string;
  tiempo_ms: number;
  catalogo?: {
    best: {
      id_veh: string;
      marca: string;
      modelo: string;
      version: string;
      pvp: number;
      score: number;
    };
    total: number;
  } | null;
  matricula_info?: {
    resolved: boolean;
    year?: number;
    month?: number;
    confidence?: number;
    type?: string;
  } | null;
}

interface OcrMultiPageResult {
  pages: OcrResult[];
  total_pages: number;
  tiempo_ms: number;
}

const TIPO_OPTIONS: { value: TipoDoc; label: string }[] = [
  { value: "permiso_circulacion", label: "Permiso Circ." },
  { value: "ficha_tecnica_moderna", label: "Ficha técnica" },
  { value: "carnet_conducir", label: "Carnet (frontal)" },
  { value: "carnet_trasero", label: "Carnet (trasero)" },
  { value: "autorizacion_provisional", label: "Autoriz. Prov." },
  { value: "dni_frontal", label: "DNI frontal" },
  { value: "dni_trasero", label: "DNI trasero" },
];

const TIPO_BADGE: Record<string, string> = {
  PERMISO_CIRCULACION: "Permiso de Circulación",
  FICHA_TECNICA_MODERNA: "Ficha Técnica",
  CARNET_CONDUCIR: "Carnet de Conducir (frontal)",
  CARNET_TRASERO: "Carnet de Conducir (trasero)",
  AUTORIZACION_PROVISIONAL: "Autorización Provisional",
  DNI_FRONTAL: "DNI (frontal)",
  DNI_TRASERO: "DNI (trasero)",
};

// ─── Design tokens ───────────────────────────────────────────────────────────

const glass = {
  background: "rgba(12, 28, 82, 0.75)",
  border: "1px solid rgba(61, 112, 255, 0.22)",
  borderRadius: 22,
  boxShadow:
    "0 30px 80px -20px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(61,112,255,0.14) inset",
} as const;

const pillActive = {
  background: "rgba(18,64,204,0.35)",
  border: "1px solid rgba(70,120,255,0.5)",
  color: "#FFFFFF",
} as const;

const pillInactive = {
  background: "rgba(6,14,50,0.5)",
  border: "1px solid rgba(61,112,255,0.16)",
  color: "rgba(178,198,245,0.6)",
} as const;

// ─── Component ───────────────────────────────────────────────────────────────

// Documentos que contienen datos de vehículo (relevantes para flotas)
const VEHICLE_DOC_TYPES = new Set(["PERMISO_CIRCULACION", "FICHA_TECNICA_MODERNA", "AUTORIZACION_PROVISIONAL"]);

// Mapeo: campo OCR → campo de trabajo en flotas
function mapOcrToVehicle(tipo: string, campos: Record<string, string>): Record<string, string> {
  const row: Record<string, string> = {};

  if (tipo === "PERMISO_CIRCULACION") {
    row.matricula = campos.A_matricula ?? "";
    row.marca = campos.D1_marca ?? "";
    row.modelo = campos.D3_denominacion ?? campos.D2_tipo_variante ?? "";
    row.uso = campos.D4_uso ?? "";
    row.kw = campos.P2_potencia ?? "";
    row.cilindrada = campos.P1_cilindrada ?? "";
    row.combustible = campos.P3_combustible ?? "";
    row.plazas = campos.S1_plazas ?? "";
    row.tn = campos.G_masa_orden_marcha ?? "";
    row.pma = campos.F1_masa_maxima ?? "";
    row.bastidor = campos.E_bastidor ?? "";
  } else if (tipo === "FICHA_TECNICA_MODERNA") {
    row.matricula = campos.matricula ?? "";
    row.marca = campos.D1_marca ?? "";
    row.modelo = campos.D3_modelo ?? "";
    row.kw = campos.P2_potencia_kw ?? "";
    row.cilindrada = campos.P1_cilindrada ?? "";
    row.combustible = campos.P3_combustible ?? "";
    row.plazas = campos.S1_plazas ?? "";
    row.pma = campos.F1_masa_maxima ?? "";
    row.bastidor = campos.E_bastidor ?? "";
  } else if (tipo === "AUTORIZACION_PROVISIONAL") {
    row.matricula = campos.matricula ?? "";
    row.marca = campos.marca ?? "";
    row.modelo = campos.modelo ?? "";
    row.kw = campos.potencia_neta ?? "";
    row.cilindrada = campos.cilindrada ?? "";
    row.combustible = campos.propulsion ?? "";
    row.plazas = campos.plazas ?? "";
    row.pma = campos.masa_maxima ?? "";
    row.bastidor = campos.bastidor ?? "";
    row.tipo_vehiculo = campos.tipo ?? "";
  }

  // Limpiar vacíos
  for (const k of Object.keys(row)) {
    row[k] = row[k]?.trim() ?? "";
  }
  // Normalizar tipo de vehículo si existe
  if (row.tipo_vehiculo) row.tipo_vehiculo = normalizeTipoVehiculo(row.tipo_vehiculo);
  return row;
}

export default function OcrScannerPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [tipoDoc, setTipoDoc] = useState<TipoDoc>("permiso_circulacion");
  const [preprocess, setPreprocess] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [editedCampos, setEditedCampos] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(0);
  const [showFlotaModal, setShowFlotaModal] = useState(false);
  const [multiResult, setMultiResult] = useState<OcrMultiPageResult | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isPdf, setIsPdf] = useState(false);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const carpetas = useMemo(() => listarCarpetas(), []);

  // ¿El resultado actual es de un documento de vehículo?
  const isVehicleDoc = result ? VEHICLE_DOC_TYPES.has(result.tipo_documento) : false;

  const handleSendToFlota = useCallback((carpeta: FlotaCarpeta) => {
    if (!result) return;
    const merged = { ...result.campos, ...editedCampos };
    const vehicleRow = mapOcrToVehicle(result.tipo_documento, merged);

    // Si la fila tiene matrícula, comprobar si ya existe
    const rows = carpeta.trabajo?.length > 0 ? [...carpeta.trabajo] : [...(carpeta.original ?? [])];
    const matUp = vehicleRow.matricula?.toUpperCase();
    const existIdx = matUp ? rows.findIndex(r => r.matricula?.trim().toUpperCase() === matUp) : -1;

    if (existIdx >= 0) {
      // Merge: rellenar campos vacíos del existente con datos OCR
      const existing = rows[existIdx];
      for (const [k, v] of Object.entries(vehicleRow)) {
        if (v && !existing[k]?.trim()) {
          existing[k] = v;
        }
      }
      rows[existIdx] = existing;
    } else {
      rows.push(vehicleRow);
    }

    // Guardar
    const updated: FlotaCarpeta = {
      ...carpeta,
      trabajo: rows,
    };
    guardarCarpeta(updated);
    setShowFlotaModal(false);

    // Navegar al centro de emisión
    router.push("/emission");
  }, [result, editedCampos, router]);

  const handleFile = useCallback((f: File) => {
    const isPdfFile = f.type === "application/pdf";
    if (!f.type.startsWith("image/") && !isPdfFile) return;
    setFile(f);
    setIsPdf(isPdfFile);
    if (isPdfFile) {
      setPreview(null);
      setPdfFileName(f.name);
    } else {
      setPreview(URL.createObjectURL(f));
      setPdfFileName(null);
    }
    setResult(null);
    setMultiResult(null);
    setCurrentPage(0);
    setEditedCampos({});
    setError(null);
  }, []);

  const goToPage = useCallback((pageIdx: number) => {
    if (!multiResult) return;
    setCurrentPage(pageIdx);
    setResult(multiResult.pages[pageIdx]);
    setEditedCampos({});
  }, [multiResult]);

  const handleScan = useCallback(async () => {
    if (!file) return;
    setScanning(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("tipo_documento", tipoDoc);
      if (preprocess) form.append("preprocess", "true");
      const res = await fetch("/api/ocr/extract", { method: "POST", body: form });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error en OCR");
      if (data.pages && Array.isArray(data.pages)) {
        const multi: OcrMultiPageResult = {
          pages: (data.pages as Array<Record<string, unknown>>).map((p) => ({
            campos: p.campos as Record<string, string>,
            tipo_documento: p.tipo_documento as string,
            tiempo_ms: (p.tiempo_ms as number) ?? 0,
            catalogo: (p.catalogo as OcrResult["catalogo"]) || null,
            matricula_info: (p.matricula_info as OcrResult["matricula_info"]) || null,
          })),
          total_pages: data.total_pages as number,
          tiempo_ms: data.tiempo_ms as number,
        };
        setMultiResult(multi);
        setResult(multi.pages[0]);
        setCurrentPage(0);
      } else {
        setResult({
          campos: data.campos,
          tipo_documento: data.tipo_documento,
          tiempo_ms: data.tiempo_ms,
          catalogo: data.catalogo || null,
          matricula_info: data.matricula_info || null,
        });
        setMultiResult(null);
      }
      setEditedCampos({});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setScanning(false);
    }
  }, [file, tipoDoc, preprocess]);

  const handleClear = useCallback(() => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setMultiResult(null);
    setCurrentPage(0);
    setIsPdf(false);
    setPdfFileName(null);
    setEditedCampos({});
    setError(null);
    setScanning(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleCopy = useCallback(() => {
    if (!result) return;
    const tipo = result.tipo_documento;
    const lines = Object.entries(result.campos)
      .filter(([k]) => !SKIP_FIELDS.has(k))
      .map(([k, v]) => `${getLabel(tipo, k)}: ${editedCampos[k] ?? v}`)
      .join("\n");
    navigator.clipboard.writeText(lines);
  }, [result, editedCampos]);

  const campos = result
    ? Object.entries(result.campos).filter(([k]) => !SKIP_FIELDS.has(k))
    : [];

  const confidencePercent = result
    ? Math.round(
        (campos.filter(([, v]) => v && v.trim().length > 0).length / Math.max(campos.length, 1)) * 100
      )
    : 0;

  const hasResult = !!result;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", paddingTop: 8, minHeight: 0 }}>
      {/* ── Zone header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexShrink: 0 }}>
        <div
          style={{
            width: 4, height: 48, borderRadius: 4,
            background: "linear-gradient(180deg, #3366FF 0%, #1240CC 100%)",
            flexShrink: 0,
          }}
        />
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>
            Escáner OCR
          </h1>
          <p style={{ fontSize: 13, fontWeight: 500, color: "#BDD4FF", margin: "4px 0 0 0", letterSpacing: "0.01em" }}>
            Permisos &middot; Fichas técnicas &middot; Carnets &middot; Autorizaciones &middot; DNI
          </p>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {/* ── Main content ── */}
      <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>

        {/* ── BEFORE RESULTS: upload + settings side by side ── */}
        {!hasResult && (
          <div style={{ ...glass, flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 28 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
                {/* LEFT: Document upload */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <h2 style={{ fontSize: 11, fontWeight: 800, color: "rgba(178,198,245,0.6)", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                    Documento
                  </h2>

                  {isPdf && pdfFileName ? (
                    <PdfBox fileName={pdfFileName} onClear={handleClear} />
                  ) : !preview ? (
                    <DropZone dragOver={dragOver} setDragOver={setDragOver} onFile={handleFile} onClick={() => inputRef.current?.click()} />
                  ) : (
                    <PreviewBox preview={preview} onClear={handleClear} />
                  )}
                </div>

                {/* RIGHT: Settings */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <h2 style={{ fontSize: 11, fontWeight: 800, color: "rgba(178,198,245,0.6)", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                    Tipo de documento
                  </h2>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {TIPO_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setTipoDoc(opt.value)}
                        style={{ fontSize: 12, fontWeight: 700, padding: "10px 16px", borderRadius: 12, cursor: "pointer", transition: "all 0.2s", ...(tipoDoc === opt.value ? pillActive : pillInactive) }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <PreprocessToggle preprocess={preprocess} onChange={setPreprocess} />

                  {error && <ErrorBox message={error} />}

                  <ScanButton file={file} scanning={scanning} onClick={handleScan} />

                  <p style={{ fontSize: 11, color: "rgba(178,198,245,0.42)", fontWeight: 500, margin: 0, lineHeight: 1.5 }}>
                    Sube una imagen clara del documento. El escáner detectará automáticamente los campos
                    y extraerá la información. Tiempo estimado: 5-10 segundos.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── AFTER RESULTS: compact 3-column layout ── */}
        {hasResult && (
          <div style={{ ...glass, flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 24 }} className="custom-scrollbar">
              <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24, minHeight: 0 }}>

                {/* LEFT SIDEBAR: preview + controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Compact preview */}
                  {preview && (
                    <div style={{
                      position: "relative", borderRadius: 14, overflow: "hidden",
                      border: "1px solid rgba(61,112,255,0.22)", background: "rgba(6,14,50,0.5)",
                    }}>
                      <img src={preview} alt="Preview" style={{ width: "100%", maxHeight: 200, objectFit: "contain", padding: 8 }} />
                    </div>
                  )}

                  {/* Doc type pills — compact */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {TIPO_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setTipoDoc(opt.value)}
                        style={{ fontSize: 10, fontWeight: 700, padding: "7px 10px", borderRadius: 10, cursor: "pointer", transition: "all 0.2s", ...(tipoDoc === opt.value ? pillActive : pillInactive) }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <PreprocessToggle preprocess={preprocess} onChange={setPreprocess} compact />

                  {error && <ErrorBox message={error} />}

                  <ScanButton file={file} scanning={scanning} onClick={handleScan} compact label="Re-escanear" />

                  {/* Action buttons */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button onClick={handleCopy} style={{
                      fontSize: 11, fontWeight: 700, padding: "9px 14px", borderRadius: 10, cursor: "pointer",
                      background: "rgba(18,64,204,0.15)", color: "#3366FF", border: "1px solid rgba(51,102,255,0.25)", transition: "all 0.2s", width: "100%",
                    }}>
                      Copiar datos
                    </button>
                    {isVehicleDoc && (
                      <button onClick={() => setShowFlotaModal(true)} style={{
                        fontSize: 11, fontWeight: 700, padding: "9px 14px", borderRadius: 10, cursor: "pointer",
                        background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)", transition: "all 0.2s", width: "100%",
                      }}>
                        Enviar a flota
                      </button>
                    )}
                    <button onClick={handleClear} style={{
                      fontSize: 11, fontWeight: 700, padding: "9px 14px", borderRadius: 10, cursor: "pointer",
                      background: "rgba(6,14,50,0.5)", color: "#BDD4FF", border: "1px solid rgba(51,102,255,0.15)", transition: "all 0.2s", width: "100%",
                    }}>
                      Nuevo escaneo
                    </button>
                  </div>
                </div>

                {/* RIGHT: Results table */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
                  {/* Results header bar */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: "5px 12px", borderRadius: 8,
                        background: "rgba(18,64,204,0.25)", color: "#3366FF",
                        border: "1px solid rgba(51,102,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        {TIPO_BADGE[result.tipo_documento] ?? result.tipo_documento}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#BDD4FF" }}>
                        {(result.tiempo_ms / 1000).toFixed(1)}s
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {/* Page navigator — solo para PDFs multi-página */}
                      {multiResult && multiResult.total_pages > 1 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 0}
                            style={{
                              width: 24, height: 24, borderRadius: 6, border: "1px solid rgba(61,112,255,0.2)",
                              background: "rgba(6,14,50,0.5)", color: "#BDD4FF", fontSize: 12, fontWeight: 700,
                              cursor: currentPage === 0 ? "not-allowed" : "pointer", opacity: currentPage === 0 ? 0.4 : 1,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                          >‹</button>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#BDD4FF", minWidth: 52, textAlign: "center" }}>
                            {currentPage + 1} / {multiResult.total_pages}
                          </span>
                          <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage >= multiResult.total_pages - 1}
                            style={{
                              width: 24, height: 24, borderRadius: 6, border: "1px solid rgba(61,112,255,0.2)",
                              background: "rgba(6,14,50,0.5)", color: "#BDD4FF", fontSize: 12, fontWeight: 700,
                              cursor: currentPage >= multiResult.total_pages - 1 ? "not-allowed" : "pointer",
                              opacity: currentPage >= multiResult.total_pages - 1 ? 0.4 : 1,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                          >›</button>
                        </div>
                      )}

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 80, height: 5, borderRadius: 3, background: "rgba(6,14,50,0.5)", overflow: "hidden" }}>
                          <div style={{
                            width: `${confidencePercent}%`, height: "100%", borderRadius: 3,
                            background: confidencePercent >= 80
                              ? "linear-gradient(90deg, #22C55E, #4ADE80)"
                              : confidencePercent >= 50
                              ? "linear-gradient(90deg, #F59E0B, #FBBF24)"
                              : "linear-gradient(90deg, #EF4444, #F87171)",
                            transition: "width 0.4s ease",
                          }} />
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          color: confidencePercent >= 80 ? "#4ADE80" : confidencePercent >= 50 ? "#FBBF24" : "#F87171",
                        }}>
                          {confidencePercent}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Data table */}
                  <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(61,112,255,0.16)", flex: "1 1 auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "rgba(6,14,50,0.5)" }}>
                          <th style={{
                            padding: "10px 16px", fontSize: 10, fontWeight: 800,
                            color: "rgba(178,198,245,0.6)", textTransform: "uppercase",
                            letterSpacing: "0.1em", textAlign: "left", width: "35%",
                          }}>
                            Campo
                          </th>
                          <th style={{
                            padding: "10px 16px", fontSize: 10, fontWeight: 800,
                            color: "rgba(178,198,245,0.6)", textTransform: "uppercase",
                            letterSpacing: "0.1em", textAlign: "left",
                          }}>
                            Valor
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {campos.map(([key, val], i) => (
                          <tr
                            key={key}
                            style={{
                              background: i % 2 === 0 ? "transparent" : "rgba(51,102,255,0.03)",
                              borderTop: "1px solid rgba(61,112,255,0.12)",
                            }}
                          >
                            <td style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, color: "#BDD4FF" }}>
                              {getLabel(result.tipo_documento, key)}
                            </td>
                            <td style={{ padding: "5px 10px" }}>
                              <input
                                value={editedCampos[key] ?? val}
                                onChange={e => setEditedCampos(prev => ({ ...prev, [key]: e.target.value }))}
                                style={{
                                  width: "100%", fontSize: 12, fontWeight: 600, color: "#FFFFFF",
                                  padding: "6px 10px", background: "rgba(12, 28, 82, 0.45)",
                                  border: "1px solid rgba(61,112,255,0.16)", borderRadius: 8,
                                  outline: "none", transition: "border 0.2s, background 0.2s",
                                }}
                                onFocus={e => { e.currentTarget.style.borderColor = "rgba(70,120,255,0.5)"; e.currentTarget.style.background = "rgba(12, 28, 82, 0.65)"; }}
                                onBlur={e => { e.currentTarget.style.borderColor = "rgba(61,112,255,0.16)"; e.currentTarget.style.background = "rgba(12, 28, 82, 0.45)"; }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Catalogo match */}
                  {result.catalogo && (
                    <div style={{
                      padding: 16, borderRadius: 14,
                      background: "rgba(34,197,94,0.08)",
                      border: "1px solid rgba(34,197,94,0.2)",
                      marginTop: 12,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(34,197,94,0.7)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                        Vehiculo identificado ({result.catalogo.total} candidatos)
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#4ADE80" }}>
                        {result.catalogo.best.marca} {result.catalogo.best.modelo} {result.catalogo.best.version}
                      </div>
                      <div style={{ fontSize: 11, color: "#BDD4FF", marginTop: 4 }}>
                        Score: {result.catalogo.best.score}/100 · PVP: {result.catalogo.best.pvp?.toLocaleString("es-ES")} EUR
                      </div>
                    </div>
                  )}

                  {/* Matricula info */}
                  {result.matricula_info?.resolved && (
                    <div style={{
                      padding: 16, borderRadius: 14,
                      background: "rgba(61,112,255,0.12)",
                      border: "1px solid rgba(51,102,255,0.2)",
                      marginTop: 8,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(168,196,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                        Matricula
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#BDD4FF" }}>
                        Estimacion: {result.matricula_info.month}/{result.matricula_info.year}
                        {result.matricula_info.type && ` · ${result.matricula_info.type}`}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(168,196,255,0.5)", marginTop: 2 }}>
                        Confianza: {((result.matricula_info.confidence || 0) * 100).toFixed(0)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal selección de flota ── */}
      {showFlotaModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowFlotaModal(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} />
          <div style={{
            position: "relative", width: "90%", maxWidth: 480, maxHeight: "70vh",
            background: "rgba(8,16,52,0.98)", border: "1px solid rgba(61,112,255,0.25)",
            borderRadius: 20, padding: 0, overflow: "hidden",
            boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          }} onClick={e => e.stopPropagation()}>

            <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid rgba(61,112,255,0.12)" }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: "#FFFFFF", margin: 0 }}>
                Enviar datos a flota
              </h3>
              <p style={{ fontSize: 11, color: "rgba(178,198,245,0.5)", margin: "4px 0 0 0" }}>
                Los datos del documento se añadirán como vehículo en la flota seleccionada.
              </p>
            </div>

            <div style={{ padding: "12px 16px", maxHeight: "calc(70vh - 100px)", overflowY: "auto" }} className="custom-scrollbar">
              {carpetas.length === 0 ? (
                <p style={{ fontSize: 12, color: "rgba(178,198,245,0.4)", textAlign: "center", padding: "30px 0" }}>
                  No hay flotas creadas.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {carpetas.map(c => {
                    const rows = c.trabajo?.length > 0 ? c.trabajo : c.original;
                    const nVeh = rows?.length ?? 0;
                    const estadoColor: Record<string, string> = {
                      "EN ESTUDIO": "#3366FF", "OFERTADA": "#f59e0b", "CONTRATADA": "#10b981", "RECHAZADA": "#ef4444",
                    };
                    return (
                      <button key={c.id} onClick={() => handleSendToFlota(c)} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "12px 16px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                        background: "rgba(6,14,50,0.5)", border: "1px solid rgba(61,112,255,0.15)",
                        transition: "all 0.15s", width: "100%",
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(70,120,255,0.4)"; e.currentTarget.style.background = "rgba(18,64,204,0.12)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(61,112,255,0.15)"; e.currentTarget.style.background = "rgba(6,14,50,0.5)"; }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>{c.nombre}</div>
                          <div style={{ fontSize: 10, color: "rgba(178,198,245,0.5)", marginTop: 2 }}>
                            {nVeh} vehículos · {c.header?.tomador || "Sin tomador"}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                          color: estadoColor[c.estado] ?? "#BDD4FF",
                          background: `${estadoColor[c.estado] ?? "#3366FF"}18`,
                          border: `1px solid ${estadoColor[c.estado] ?? "#3366FF"}55`,
                          textTransform: "uppercase", letterSpacing: "0.06em",
                        }}>
                          {c.estado}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes ocr-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function DropZone({ dragOver, setDragOver, onFile, onClick }: {
  dragOver: number; setDragOver: (fn: (c: number) => number) => void;
  onFile: (f: File) => void; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onDragEnter={e => { e.preventDefault(); if (e.dataTransfer.types.includes("Files")) setDragOver(c => c + 1); }}
      onDragLeave={e => { e.preventDefault(); setDragOver(c => c - 1); }}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); setDragOver(() => 0); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      style={{
        border: dragOver > 0 ? "2px dashed #3366FF" : "2px dashed rgba(51,102,255,0.25)",
        borderRadius: 16, padding: "64px 24px", textAlign: "center", cursor: "pointer",
        background: dragOver > 0 ? "rgba(61,112,255,0.12)" : "rgba(12, 28, 82, 0.42)",
        transition: "border 0.2s, background 0.2s",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 280,
      }}
    >
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3366FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16, opacity: 0.8 }}>
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
        <path d="M12 12v9" /><path d="m16 16-4-4-4 4" />
      </svg>
      <p style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 700, margin: "0 0 8px 0" }}>
        {dragOver > 0 ? "Suelta aquí" : "Arrastra o haz clic para subir"}
      </p>
      <p style={{ color: "rgba(178,198,245,0.6)", fontSize: 12, fontWeight: 500, margin: 0 }}>
        JPG, PNG o PDF &middot; max 50 MB
      </p>
    </div>
  );
}

function PdfBox({ fileName, onClear }: { fileName: string; onClear: () => void }) {
  return (
    <div style={{
      position: "relative", borderRadius: 16, overflow: "hidden",
      border: "1px solid rgba(61,112,255,0.22)", background: "rgba(6,14,50,0.5)",
      minHeight: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32,
    }}>
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#3366FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16, opacity: 0.8 }}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="15" x2="15" y2="15"/>
      </svg>
      <p style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 700, margin: "0 0 6px 0", textAlign: "center", wordBreak: "break-all" }}>
        {fileName}
      </p>
      <p style={{ color: "rgba(178,198,245,0.5)", fontSize: 11, margin: 0 }}>PDF listo para escanear</p>
      <button
        onClick={onClear}
        style={{
          position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: 10,
          background: "rgba(0,0,0,0.65)", border: "1px solid rgba(51,102,255,0.2)",
          color: "#FFFFFF", fontSize: 16, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(8px)", transition: "background 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.5)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.65)"; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function PreviewBox({ preview, onClear }: { preview: string; onClear: () => void }) {
  return (
    <div style={{
      position: "relative", borderRadius: 16, overflow: "hidden",
      border: "1px solid rgba(61,112,255,0.22)", background: "rgba(6,14,50,0.5)",
      minHeight: 280, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <img src={preview} alt="Preview" style={{ width: "100%", maxHeight: 380, objectFit: "contain", padding: 12 }} />
      <button
        onClick={onClear}
        style={{
          position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: 10,
          background: "rgba(0,0,0,0.65)", border: "1px solid rgba(51,102,255,0.2)",
          color: "#FFFFFF", fontSize: 16, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(8px)", transition: "background 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.5)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.65)"; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function PreprocessToggle({ preprocess, onChange, compact }: { preprocess: boolean; onChange: (v: boolean) => void; compact?: boolean }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
      padding: compact ? "8px 12px" : "10px 14px", borderRadius: 12,
      background: preprocess ? "rgba(18,64,204,0.1)" : "rgba(3,10,42,0.3)",
      border: preprocess ? "1px solid rgba(51,102,255,0.2)" : "1px solid rgba(61,112,255,0.12)",
      transition: "all 0.2s",
    }}>
      <input type="checkbox" checked={preprocess} onChange={e => onChange(e.target.checked)} style={{ accentColor: "#1240CC", width: 14, height: 14 }} />
      <span style={{ fontSize: compact ? 11 : 12, fontWeight: 600, color: "#BDD4FF" }}>
        Preprocesar imagen
      </span>
    </label>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 600, color: "#EF4444",
      background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
      borderRadius: 12, padding: "10px 14px",
    }}>
      {message}
    </div>
  );
}

function ScanButton({ file, scanning, onClick, compact, label }: {
  file: File | null; scanning: boolean; onClick: () => void; compact?: boolean; label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!file || scanning}
      style={{
        fontSize: compact ? 12 : 14, fontWeight: 700,
        padding: compact ? "10px 18px" : "14px 28px",
        borderRadius: compact ? 10 : 14,
        cursor: !file || scanning ? "not-allowed" : "pointer",
        background: !file ? "rgba(18,64,204,0.2)" : "linear-gradient(135deg, #1240CC 0%, #3366FF 100%)",
        color: "white", border: "none", opacity: !file ? 0.5 : 1,
        boxShadow: file ? "0 8px 32px rgba(18,64,204,0.4)" : "none",
        transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%",
      }}
    >
      {scanning ? (
        <>
          <div style={{
            width: 16, height: 16, borderRadius: "50%",
            border: "2.5px solid rgba(255,255,255,0.2)", borderTopColor: "white",
            animation: "ocr-spin 0.7s linear infinite",
          }} />
          Escaneando...
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 8h10M7 12h6M7 16h8" />
          </svg>
          {label ?? "Escanear documento"}
        </>
      )}
    </button>
  );
}
