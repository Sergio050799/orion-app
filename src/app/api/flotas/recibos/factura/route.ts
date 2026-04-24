import { NextRequest, NextResponse } from "next/server";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { readFile } from "fs/promises";
import { join } from "path";
import { formatMonedaES } from "@/core/flotas/recibos";

export const runtime = "nodejs";

interface FacturaRequestBody {
  tipo: 'EMISION' | 'REGULARIZACION';
  numeroRecibo: string;
  corredor: { nombre: string; cif: string; domicilio: string };
  flota: string;
  tomador: { nombre: string; cif: string };
  periodoCobertura: { desde: string; hasta: string };
  formaPago: string;
  descripcionPeriodo: string;
  primaNeta: number;
  impuestos: number;
  importeTotal: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: FacturaRequestBody = await req.json();

    // 1. Leer plantilla
    const templatePath = join(process.cwd(), 'public', 'templates', 'factura_recibo.docx');
    const templateBytes = await readFile(templatePath);

    // 2. Cargar en docxtemplater
    const zip = new PizZip(templateBytes);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // 3. Rellenar datos
    doc.render({
      numeroRecibo: body.numeroRecibo,
      corredor_nombre: body.corredor.nombre,
      corredor_cif: body.corredor.cif,
      corredor_domicilio: body.corredor.domicilio,
      flota_nombre: body.flota,
      tomador_nombre: body.tomador.nombre,
      tomador_cif: body.tomador.cif,
      periodo_desde: body.periodoCobertura.desde,
      periodo_hasta: body.periodoCobertura.hasta,
      forma_pago: body.formaPago,
      descripcion_periodo: body.descripcionPeriodo,
      prima_neta: formatMonedaES(body.primaNeta),
      impuestos: formatMonedaES(body.impuestos),
      importe_total: formatMonedaES(body.importeTotal),
    });

    // 4. Generar buffer
    const buf = doc.getZip().generate({ type: 'nodebuffer' });

    // 5. Devolver DOCX
    return new NextResponse(Buffer.from(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="recibo_${body.numeroRecibo}.docx"`,
      },
    });
  } catch (e: unknown) {
    console.error("[RECIBOS] Factura DOCX error:", e);
    return NextResponse.json(
      { error: (e instanceof Error ? e.message : "Error desconocido") },
      { status: 500 }
    );
  }
}
