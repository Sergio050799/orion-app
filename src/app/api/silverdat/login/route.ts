import { NextRequest, NextResponse } from "next/server";
import { login, hasSession } from "@/core/silverdat/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { datId, user, pass } = await req.json();

    if (!datId || !user || !pass) {
      return NextResponse.json(
        { ok: false, error: "Faltan credenciales (datId, user, pass)" },
        { status: 400 },
      );
    }

    const result = await login(datId, user, pass);
    return NextResponse.json(result, { status: result.ok ? 200 : 401 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Error interno" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hasSession: hasSession() });
}
