import { NextRequest, NextResponse } from "next/server";
import { hasSession, queryByMatricula, type SilverdatVehicle } from "@/core/silverdat/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!hasSession()) {
      return NextResponse.json(
        { ok: false, error: "No hay sesión Silverdat activa. Inicie sesión primero." },
        { status: 401 },
      );
    }

    const { matriculas } = await req.json();

    if (!Array.isArray(matriculas) || matriculas.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Se requiere un array de matrículas" },
        { status: 400 },
      );
    }

    // Cap at 100 to prevent abuse
    const plates = matriculas.slice(0, 100) as string[];

    const results: { matricula: string; ok: boolean; vehicle?: SilverdatVehicle; error?: string; debug?: string }[] = [];

    for (const mat of plates) {
      const cleaned = mat.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      if (!cleaned) {
        results.push({ matricula: mat, ok: false, error: "Matrícula vacía" });
        continue;
      }

      const result = await queryByMatricula(cleaned);
      results.push({
        matricula: cleaned,
        ok: result.ok,
        vehicle: result.vehicle,
        error: result.error,
        ...(result.debug ? { debug: result.debug } : {}),
      });

      // Throttle: 400ms between queries
      if (plates.indexOf(mat) < plates.length - 1) {
        await new Promise(r => setTimeout(r, 400));
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Error interno" },
      { status: 500 },
    );
  }
}
