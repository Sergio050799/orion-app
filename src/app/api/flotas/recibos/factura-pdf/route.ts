import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "fs/promises";
import { join } from "path";
import { formatMonedaES } from "@/core/flotas/recibos";

export const runtime = "nodejs";

interface FacturaRequestBody {
  tipo: "EMISION" | "REGULARIZACION";
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

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);

    const black = rgb(0, 0, 0);
    const gray = rgb(0.45, 0.45, 0.45);

    // Margins matching Word default (~72pt = 1 inch)
    const mL = 72;
    const mR = width - 72;
    const usableW = mR - mL;
    let y = height - 72;

    // ─── P0: Logo (standalone paragraph, left-aligned) ───
    // Logo in DOCX: 1079500 x 520700 EMU = 85 x 41 pt
    const logoW = 85;
    const logoH = 41;
    try {
      const logoPath = join(process.cwd(), "public", "templates", "factura_logo.jpeg");
      const logoBytes = await readFile(logoPath);
      const logoImage = await pdf.embedJpg(logoBytes);
      page.drawImage(logoImage, {
        x: mL,
        y: y - logoH,
        width: logoW,
        height: logoH,
      });
    } catch {
      // skip if logo missing
    }
    y -= logoH + 14; // space after logo paragraph

    // ─── P2: Company name (sz:24 = 12pt, bold) ───
    page.drawText("MUTUA MMT SEGUROS, S.M DE SEGUROS A PRIMA FIJA", {
      x: mL, y, size: 12, font: bold, color: black,
    });
    y -= 16;

    // ─── P3: Address (sz:18 = 9pt) ───
    page.drawText(" C/Trafalgar,11. 28010 Madrid. CIF: G28010817", {
      x: mL, y, size: 9, font: regular, color: black,
    });
    y -= 28; // blank paragraphs P4, P5

    // ─── P6: Nº Recibo (sz:28 = 14pt, bold, right-aligned) ───
    const reciboText = "N.\u00BA Recibo: " + body.numeroRecibo;
    const reciboW = bold.widthOfTextAtSize(reciboText, 14);
    page.drawText(reciboText, {
      x: mR - reciboW, y, size: 14, font: bold, color: black,
    });
    y -= 24; // blank paragraph P7

    // ─── P8: Title (sz:32 = 16pt, bold) ───
    page.drawText("RECIBO DE COBRO DE PRIMAS:", {
      x: mL, y, size: 16, font: bold, color: black,
    });
    y -= 24; // blank paragraph P9

    // ─── Data rows (default size ~11pt, tabs simulated with column alignment) ───
    const dataSize = 11;
    const lineH = 17;
    const tabCol = mL + 195; // where values start (simulating tabs)

    // P10: Corredor
    page.drawText("Corredor:", { x: mL, y, size: dataSize, font: regular, color: black });
    page.drawText(body.corredor.nombre, { x: tabCol, y, size: dataSize, font: regular, color: black });
    y -= lineH;

    // P11: CIF
    page.drawText("CIF:", { x: mL, y, size: dataSize, font: regular, color: black });
    page.drawText(body.corredor.cif, { x: tabCol, y, size: dataSize, font: regular, color: black });
    y -= lineH;

    // P12: Domicilio
    page.drawText("Domicilio:", { x: mL, y, size: dataSize, font: regular, color: black });
    // Truncate if too long
    let domText = body.corredor.domicilio;
    const maxValW = mR - tabCol;
    while (regular.widthOfTextAtSize(domText, dataSize) > maxValW && domText.length > 3) {
      domText = domText.slice(0, -1);
    }
    page.drawText(domText, { x: tabCol, y, size: dataSize, font: regular, color: black });
    y -= lineH + 8; // P13 blank

    // P14: Flota
    page.drawText("Flota:", { x: mL, y, size: dataSize, font: regular, color: black });
    page.drawText(body.flota, { x: tabCol, y, size: dataSize, font: regular, color: black });
    y -= lineH + 8; // P15 blank

    // P16: Tomador del seguro
    page.drawText("Tomador del seguro:", { x: mL, y, size: dataSize, font: regular, color: black });
    page.drawText(body.tomador.nombre, { x: tabCol, y, size: dataSize, font: regular, color: black });
    y -= lineH;

    // P17: CIF
    page.drawText("CIF:", { x: mL, y, size: dataSize, font: regular, color: black });
    page.drawText(body.tomador.cif, { x: tabCol, y, size: dataSize, font: regular, color: black });
    y -= lineH + 8; // P18 blank

    // P19: Periodo cobertura
    page.drawText("Per\u00EDodo cobertura p\u00F3lizas:", { x: mL, y, size: dataSize, font: regular, color: black });
    page.drawText(body.periodoCobertura.desde + " al " + body.periodoCobertura.hasta, { x: tabCol, y, size: dataSize, font: regular, color: black });
    y -= lineH;

    // P20: Forma de pago
    page.drawText("Forma de pago:", { x: mL, y, size: dataSize, font: regular, color: black });
    page.drawText(body.formaPago, { x: tabCol, y, size: dataSize, font: regular, color: black });
    y -= lineH + 8; // P21 blank

    // ─── P22: Descripcion periodo (bold) ───
    const descWords = body.descripcionPeriodo.split(" ");
    let descLine = "";
    for (const word of descWords) {
      const test = descLine ? descLine + " " + word : word;
      if (bold.widthOfTextAtSize(test, dataSize) > usableW) {
        page.drawText(descLine, { x: mL, y, size: dataSize, font: bold, color: black });
        y -= lineH;
        descLine = word;
      } else {
        descLine = test;
      }
    }
    if (descLine) {
      page.drawText(descLine, { x: mL, y, size: dataSize, font: bold, color: black });
    }
    y -= lineH + 8; // P23 blank

    // ─── Amounts ───
    const amtTab = mL + 230; // value column for amounts
    const noteTab = amtTab + 130; // (*) column

    // P24: Importe Prima Neta
    page.drawText("Importe Prima Neta:", { x: mL, y, size: dataSize, font: regular, color: black });
    page.drawText(formatMonedaES(body.primaNeta), { x: amtTab, y, size: dataSize, font: regular, color: black });
    page.drawText("(*)", { x: noteTab, y, size: dataSize, font: regular, color: black });
    y -= lineH;

    // P25: Impuestos
    page.drawText("Impuestos:", { x: mL, y, size: dataSize, font: regular, color: black });
    page.drawText(formatMonedaES(body.impuestos), { x: amtTab, y, size: dataSize, font: regular, color: black });
    page.drawText("(*)", { x: noteTab, y, size: dataSize, font: regular, color: black });
    y -= lineH + 8; // P26 blank

    // P27: Importe prima total (bold)
    page.drawText("Importe prima total:", { x: mL, y, size: dataSize, font: bold, color: black });
    page.drawText(formatMonedaES(body.importeTotal), { x: amtTab, y, size: dataSize, font: bold, color: black });
    page.drawText("(*)", { x: noteTab, y, size: dataSize, font: regular, color: black });
    y -= lineH + 16; // P28, P29 blank

    // ─── P30: Footnote (sz:16 = 8pt) ───
    page.drawText("(*) Seg\u00FAn documento anexo adjunto", {
      x: mL, y, size: 8, font: regular, color: gray,
    });

    // ─── Generate ───
    const pdfBytes = await pdf.save();

    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="recibo_${body.numeroRecibo}.pdf"`,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido" },
      { status: 500 },
    );
  }
}
