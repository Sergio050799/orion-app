import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";
import { hasSession, queryByMatricula, type SilverdatVehicle } from "@/core/silverdat/service";

export const runtime = "nodejs";

const SECRET      = process.env.SESSION_SECRET ?? randomBytes(32).toString("hex");
const ORION_API   = process.env.ORION_API_URL  ?? "http://localhost:3001";
const ORION_KEY   = process.env.ORION_API_KEY  ?? "dev_secret_local";
const CACHE_MS    = 30 * 24 * 60 * 60 * 1000; // 30 días

// ─── Caché en proceso ─────────────────────────────────────────────────────────

const g = globalThis as Record<string, unknown>;
if (!g.__sdCache) g.__sdCache = new Map<string, { vehicle: SilverdatVehicle; ts: number }>();
const memCache = g.__sdCache as Map<string, { vehicle: SilverdatVehicle; ts: number }>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getUsername(req: NextRequest): string {
  const tok = req.cookies.get("orion_session")?.value;
  if (!tok) return "";
  const dot = tok.lastIndexOf(".");
  if (dot < 0) return "";
  const payload = tok.slice(0, dot);
  const sig = tok.slice(dot + 1);
  const expected = createHmac("sha256", SECRET).update(payload).digest("hex");
  if (expected !== sig) return "";
  const colon = payload.indexOf(":");
  return colon >= 0 ? payload.slice(0, colon) : "";
}

async function getFromDB(matricula: string): Promise<SilverdatVehicle | null> {
  try {
    const res = await fetch(`${ORION_API}/silverdat-cache/${encodeURIComponent(matricula)}`, {
      headers: { "X-Api-Key": ORION_KEY },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d.ok || !d.datos) return null;
    if (Date.now() - new Date(d.fecha_consulta).getTime() > CACHE_MS) return null;
    return JSON.parse(d.datos) as SilverdatVehicle;
  } catch { return null; }
}

async function saveToDB(
  matricula: string,
  vehicle: SilverdatVehicle,
  ctx: { consultado_por: string; carpeta_id: string; carpeta_nombre: string; corredor_id: string },
): Promise<void> {
  try {
    await fetch(`${ORION_API}/silverdat-cache`, {
      method: "POST",
      headers: { "X-Api-Key": ORION_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ matricula, datos: JSON.stringify(vehicle), ...ctx }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* no bloquear flujo principal */ }
}

// ─── POST /api/silverdat/enrich ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    if (!hasSession()) {
      return NextResponse.json(
        { ok: false, error: "No hay sesión Silverdat activa. Inicie sesión primero." },
        { status: 401 },
      );
    }

    const body = await req.json();
    const {
      matriculas,
      carpeta_id     = "",
      carpeta_nombre = "",
      corredor_id    = "",
    } = body as {
      matriculas: string[];
      carpeta_id?: string;
      carpeta_nombre?: string;
      corredor_id?: string;
    };

    if (!Array.isArray(matriculas) || matriculas.length === 0) {
      return NextResponse.json({ ok: false, error: "Se requiere un array de matrículas" }, { status: 400 });
    }

    const username = getUsername(req);
    const ctx      = { consultado_por: username, carpeta_id, carpeta_nombre, corredor_id };
    const plates   = matriculas.slice(0, 100);

    const results: {
      matricula: string;
      ok: boolean;
      vehicle?: SilverdatVehicle;
      error?: string;
      fromCache?: boolean;
    }[] = [];

    let prevWasSilverdat = false;

    for (const mat of plates) {
      const cleaned = mat.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      if (!cleaned) {
        results.push({ matricula: mat, ok: false, error: "Matrícula vacía" });
        continue;
      }

      // 1. Caché en memoria
      const memHit = memCache.get(cleaned);
      if (memHit && Date.now() - memHit.ts < CACHE_MS) {
        results.push({ matricula: cleaned, ok: true, vehicle: memHit.vehicle, fromCache: true });
        continue;
      }

      // 2. Caché en BD
      const dbVehicle = await getFromDB(cleaned);
      if (dbVehicle) {
        memCache.set(cleaned, { vehicle: dbVehicle, ts: Date.now() });
        results.push({ matricula: cleaned, ok: true, vehicle: dbVehicle, fromCache: true });
        continue;
      }

      // 3. Consulta real a Silverdat — throttle solo entre consultas reales
      if (prevWasSilverdat) {
        await new Promise(r => setTimeout(r, 400));
      }
      prevWasSilverdat = true;

      const result = await queryByMatricula(cleaned);

      if (result.ok && result.vehicle) {
        memCache.set(cleaned, { vehicle: result.vehicle, ts: Date.now() });
        saveToDB(cleaned, result.vehicle, ctx); // no-await: no bloquear
      }

      results.push({ matricula: cleaned, ok: result.ok, vehicle: result.vehicle, error: result.error });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
