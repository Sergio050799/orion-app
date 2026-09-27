import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ORION_API = process.env.ORION_API_URL ?? "http://localhost:3001";
const ORION_KEY = process.env.ORION_API_KEY ?? "dev_secret_local";

export async function GET() {
  try {
    const res = await fetch(`${ORION_API}/silverdat-historial`, {
      headers: { "X-Api-Key": ORION_KEY },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Error obteniendo historial");

    const rows: {
      matricula: string;
      fecha_consulta: string;
      consultado_por: string;
      carpeta_nombre: string;
      corredor_nombre: string;
    }[] = await res.json();

    const fecha = new Date().toLocaleDateString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    const lines: string[] = [
      "ORION — Historial de consultas Silverdat",
      `Generado: ${fecha}`,
      `Total registros: ${rows.length}`,
      "=".repeat(60),
      "",
    ];

    let currentMat = "";
    for (const r of rows) {
      if (r.matricula !== currentMat) {
        if (currentMat) lines.push("");
        lines.push(`MATRICULA: ${r.matricula}`);
        lines.push("-".repeat(40));
        currentMat = r.matricula;
      }
      const ts = new Date(r.fecha_consulta).toLocaleDateString("es-ES", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      lines.push(`  ${ts}  ·  ${r.consultado_por || "—"}  ·  ${r.carpeta_nombre || "—"}  ·  ${r.corredor_nombre || "—"}`);
    }

    lines.push("");
    lines.push("=".repeat(60));
    lines.push("Orion — Del Caos al Orden");

    const txt = lines.join("\n");

    return new NextResponse(txt, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="historial_silverdat_${new Date().toISOString().slice(0, 10)}.txt"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
