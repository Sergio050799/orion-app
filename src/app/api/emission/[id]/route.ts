import { NextRequest, NextResponse } from "next/server";
import { EmisionService } from "@/services/emission-service.server";

export const runtime = "nodejs";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const emision = EmisionService.get(id);
    if (!emision) {
        return NextResponse.json({ ok: false, error: "Emisión no encontrada." }, { status: 404 });
    }
    return NextResponse.json(emision);
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const deleted = EmisionService.delete(id);
    if (!deleted) {
        return NextResponse.json({ ok: false, error: "Emisión no encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
}
