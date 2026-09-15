import { NextRequest, NextResponse } from "next/server";
import { logUsage } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

const OCR_SERVER_URL = process.env.OCR_SERVER_URL || "http://127.0.0.1:8000";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/**
 * POST /api/ocr/extract
 *
 * Proxy al servidor GLM-OCR en VPS.
 * Acepta imágenes (JPG/PNG/WebP) y PDFs.
 * Para PDFs devuelve `pages[]` con un resultado por página.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const tipoDocumento = (formData.get("tipo_documento") as string) || "auto";
    const preprocess = (formData.get("preprocess") as string) || "true";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No se envio ningún archivo." },
        { status: 400 },
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Tipo no soportado: ${file.type}. Usa JPG, PNG o PDF.` },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "El archivo supera 50 MB." },
        { status: 400 },
      );
    }

    // Reenviar al servidor GLM-OCR en el VPS
    const pythonForm = new FormData();
    pythonForm.append("file", file);
    pythonForm.append("tipo_documento", tipoDocumento);
    pythonForm.append("preprocess", preprocess);

    const pythonRes = await fetch(`${OCR_SERVER_URL}/extract`, {
      method: "POST",
      body: pythonForm,
    });

    if (!pythonRes.ok) {
      const errText = await pythonRes.text().catch(() => "");
      return NextResponse.json(
        { success: false, error: `Error del servidor OCR (${pythonRes.status})${errText ? ": " + errText : ""}` },
        { status: pythonRes.status },
      );
    }

    const ocrResult = await pythonRes.json();

    // Registrar uso
    void logUsage('ocr_scan', { tipo: tipoDocumento, size: file.size, mime: file.type });

    // PDF multi-página: enriquecer cada página individualmente
    if (ocrResult.pages && Array.isArray(ocrResult.pages)) {
      const enrichedPages = await Promise.all(
        (ocrResult.pages as Array<{ success: boolean; campos: Record<string, string>; tipo_documento: string }>).map(
          (page) => enrichResult(page, req),
        ),
      );
      return NextResponse.json({ ...ocrResult, pages: enrichedPages });
    }

    // Imagen única: enriquecer y devolver
    const enriched = await enrichResult(ocrResult, req);
    return NextResponse.json(enriched);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";

    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      return NextResponse.json(
        {
          success: false,
          error: "Servidor OCR no disponible. Verifica OCR_SERVER_URL en .env",
          errorCode: "OCR_SERVER_DOWN",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ── Enriquecer resultado con catálogo y matrícula ──────────────────────────

type OcrPageRaw = {
  success: boolean;
  campos: Record<string, string>;
  tipo_documento: string;
  [key: string]: unknown;
};

async function enrichResult(ocrResult: OcrPageRaw, req: NextRequest): Promise<Record<string, unknown>> {
  let catalogMatch = null;
  let plateInfo = null;

  if (ocrResult.success && ocrResult.campos) {
    const campos = ocrResult.campos;
    const tipo = ocrResult.tipo_documento;

    // Cruzar con catálogo de vehículos (permiso y ficha)
    if (tipo === "PERMISO_CIRCULACION" || tipo === "FICHA_TECNICA_MODERNA") {
      try {
        const searchBody: Record<string, unknown> = {};

        if (tipo === "PERMISO_CIRCULACION") {
          searchBody.marca = campos.D1_marca || "";
          searchBody.modelo = campos.D3_denominacion || "";
          searchBody.kw = campos.P2_potencia ? parseInt(campos.P2_potencia) : undefined;
          searchBody.cilindrada = campos.P1_cilindrada ? parseInt(campos.P1_cilindrada) : undefined;
          searchBody.plazas = campos.S1_plazas ? parseInt(campos.S1_plazas) : undefined;
          searchBody.combustible = campos.P3_combustible || "";
          searchBody.tara = campos.G_masa_orden_marcha ? parseInt(campos.G_masa_orden_marcha) : undefined;
        } else {
          searchBody.marca = campos.D1_marca || "";
          searchBody.modelo = campos.D3_modelo || "";
          searchBody.kw = campos.P2_potencia_kw ? parseInt(campos.P2_potencia_kw) : undefined;
          searchBody.cilindrada = campos.P1_cilindrada ? parseInt(campos.P1_cilindrada) : undefined;
          searchBody.plazas = campos.S1_plazas ? parseInt(campos.S1_plazas) : undefined;
          searchBody.combustible = campos.P3_combustible || "";
          searchBody.tara = campos.F2_masa_servicio ? parseInt(campos.F2_masa_servicio) : undefined;
        }

        const catalogRes = await fetch(new URL("/api/catalogo/search", req.url).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(searchBody),
        });

        if (catalogRes.ok) {
          const catalogData = await catalogRes.json();
          if (catalogData.candidates?.length > 0) {
            catalogMatch = { best: catalogData.candidates[0], total: catalogData.candidates.length };
          }
        }
      } catch {
        // no crítico
      }
    }

    // Resolver matrícula
    const matricula = campos.A_matricula || campos.matricula || "";
    if (matricula) {
      try {
        const plateRes = await fetch(new URL("/api/plates/resolve", req.url).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plate: matricula }),
        });
        if (plateRes.ok) {
          plateInfo = await plateRes.json();
        }
      } catch {
        // no crítico
      }
    }
  }

  return { ...ocrResult, catalogo: catalogMatch, matricula_info: plateInfo };
}
