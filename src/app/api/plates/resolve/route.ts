import { NextRequest, NextResponse } from "next/server";
import { resolvePlateFromSeed } from "@/core/_source_of_truth/plates/resolver";
import { parsePlate } from "@/core/_source_of_truth/plates/engine";

export async function POST(req: NextRequest) {
  try {
    const { plate: rawPlate } = await req.json();
    if (!rawPlate) {
      return NextResponse.json({ error: "No plate provided" }, { status: 400 });
    }

    const plate = rawPlate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

    let parsed;
    try {
      parsed = parsePlate(plate);
    } catch {
      return NextResponse.json({ resolved: false, plate });
    }

    const result = resolvePlateFromSeed(parsed.letters);

    if (!result) {
      return NextResponse.json({ resolved: false, plate });
    }

    return NextResponse.json({
      resolved: true,
      plate,
      year: result.year,
      month: result.month,
      confidence: result.confidence,
      type: result.type || "Standard",
    });
  } catch {
    return NextResponse.json({ resolved: false, error: "Error interno" }, { status: 500 });
  }
}
