import { NextRequest, NextResponse } from "next/server";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { readFile } from "fs/promises";
import { join } from "path";
import { formatMonedaES } from "@/core/flotas/recibos";

export const runtime = "nodejs";

interface FacturaBatchRequest {
  tipo: 'EMISION' | 'REGULARIZACION';
  corredor: { nombre: string; cif: string; domicilio: string };
  flota: string;
  periodoCobertura: { desde: string; hasta: string };
  formaPago: string;
  descripcionPeriodo: string;
  facturas: Array<{
    numeroRecibo: string;
    tomador: { nombre: string; cif: string };
    primaNeta: number;
    impuestos: number;
    importeTotal: number;
  }>;
}

function generarFacturaDocx(
  templateBytes: Buffer,
  common: Omit<FacturaBatchRequest, 'facturas'>,
  factura: FacturaBatchRequest['facturas'][number],
): Buffer {
  const zip = new PizZip(templateBytes);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render({
    numeroRecibo: factura.numeroRecibo,
    corredor_nombre: common.corredor.nombre,
    corredor_cif: common.corredor.cif,
    corredor_domicilio: common.corredor.domicilio,
    flota_nombre: common.flota,
    tomador_nombre: factura.tomador.nombre,
    tomador_cif: factura.tomador.cif,
    periodo_desde: common.periodoCobertura.desde,
    periodo_hasta: common.periodoCobertura.hasta,
    forma_pago: common.formaPago,
    descripcion_periodo: common.descripcionPeriodo,
    prima_neta: formatMonedaES(factura.primaNeta),
    impuestos: formatMonedaES(factura.impuestos),
    importe_total: formatMonedaES(factura.importeTotal),
  });

  return doc.getZip().generate({ type: 'nodebuffer' });
}

export async function POST(req: NextRequest) {
  try {
    const body: FacturaBatchRequest = await req.json();

    if (!body.facturas || body.facturas.length === 0) {
      return NextResponse.json({ error: "No hay facturas para generar" }, { status: 400 });
    }

    // 1. Leer plantilla una vez
    const templatePath = join(process.cwd(), 'public', 'templates', 'factura_recibo.docx');
    const templateBytes = await readFile(templatePath);

    const { facturas, ...common } = body;

    // Si solo hay una factura, devolver DOCX directo
    if (facturas.length === 1) {
      const buf = generarFacturaDocx(templateBytes, common, facturas[0]);
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="recibo_${facturas[0].numeroRecibo}.docx"`,
        },
      });
    }

    // 2. Múltiples facturas → empaquetar en ZIP
    const zipOut = new PizZip();
    for (const f of facturas) {
      const docxBuf = generarFacturaDocx(templateBytes, common, f);
      zipOut.file(`recibo_${f.numeroRecibo}.docx`, docxBuf);
    }

    const zipBuffer = zipOut.generate({ type: 'nodebuffer' });

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="facturas_${body.tipo.toLowerCase()}.zip"`,
      },
    });
  } catch (e: unknown) {
    console.error("[RECIBOS] Facturas batch error:", e);
    return NextResponse.json(
      { error: (e instanceof Error ? e.message : "Error desconocido") },
      { status: 500 }
    );
  }
}
