/**
 * Script para generar la plantilla DOCX de factura con placeholders.
 * Un DOCX es un ZIP con XML — construimos el XML a mano.
 *
 * Ejecutar: node scripts/generate-factura-template.mjs
 */
import PizZip from 'pizzip';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Leer logo y convertir a base64
const logoPath = join(rootDir, 'public', 'mmt_logo.jpeg');
const logoBytes = readFileSync(logoPath);
const logoBase64 = logoBytes.toString('base64');

// Dimensiones logo en EMU (1 inch = 914400 EMU)
// ~85pt wide × 41pt tall → 85/72*914400 = 1079500 × 41/72*914400 = 520700
const logoWidthEMU = 1079500;
const logoHeightEMU = 520700;

// Colores
const azulMMT = '4472C4';
const azulOscuro = '002060';
const negro = '000000';

// ─── XML Components ───────────────────────────────────────────────────────────

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.jpeg"/>
</Relationships>`;

const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
</w:settings>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>`;

// Helper: paragraph with runs
function p(runs, pProps = '') {
  const pPr = pProps ? `<w:pPr>${pProps}</w:pPr>` : '';
  return `<w:p>${pPr}${runs}</w:p>`;
}

// Helper: run with text
function r(text, rProps = '') {
  const rPr = rProps ? `<w:rPr>${rProps}</w:rPr>` : '';
  const preserveSpace = text.includes(' ') ? ' xml:space="preserve"' : '';
  return `<w:r>${rPr}<w:t${preserveSpace}>${escXml(text)}</w:t></w:r>`;
}

function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Run properties helpers
const bold = '<w:b/>';
const italic = '<w:i/>';
const underline = '<w:u w:val="single"/>';
function color(c) { return `<w:color w:val="${c}"/>`; }
function sz(pt) { return `<w:sz w:val="${pt * 2}"/><w:szCs w:val="${pt * 2}"/>`; }

// Paragraph alignment
const alignRight = '<w:jc w:val="right"/>';
const alignLeft = '<w:jc w:val="left"/>';

// Horizontal line (border bottom on paragraph)
const hrBorder = '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="808080"/></w:pBdr>';

// Empty paragraph (spacer)
const spacer = p('');

// Logo inline image
const logoRun = `<w:r>
  <w:rPr/>
  <w:drawing>
    <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               distT="0" distB="0" distL="0" distR="0">
      <wp:extent cx="${logoWidthEMU}" cy="${logoHeightEMU}"/>
      <wp:docPr id="1" name="Logo MMT"/>
      <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:nvPicPr>
              <pic:cNvPr id="1" name="image1.jpeg"/>
              <pic:cNvPicPr/>
            </pic:nvPicPr>
            <pic:blipFill>
              <a:blip r:embed="rId3" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
              <a:stretch><a:fillRect/></a:stretch>
            </pic:blipFill>
            <pic:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="${logoWidthEMU}" cy="${logoHeightEMU}"/>
              </a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            </pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing>
</w:r>`;

// ─── Build document body ──────────────────────────────────────────────────────

const body = [
  // Logo
  p(logoRun),
  spacer,
  // Cabecera MMT — azul, bold
  p(r('MUTUA MMT SEGUROS, S.M DE SEGUROS A PRIMA FIJA', `${bold}${color(azulMMT)}${sz(12)}`)),
  p(r(' C/Trafalgar,11. 28010 Madrid. CIF: G28010817', `${color(azulMMT)}${sz(9)}`)),
  // Línea separadora
  p('', hrBorder),
  spacer,
  // Nº Recibo — derecha, azul oscuro, bold+italic+underline, 14pt
  p(
    r('Nº Recibo: {numeroRecibo}', `${bold}${italic}${underline}${color(azulOscuro)}${sz(14)}`),
    alignRight
  ),
  spacer,
  // Título — bold+underline, 16pt
  p(r('RECIBO DE COBRO DE PRIMAS:', `${bold}${underline}${color(negro)}${sz(16)}`)),
  spacer,
  // Datos corredor
  p(r('Corredor:\t\t\t{corredor_nombre}')),
  p(r('CIF:\t\t\t\t{corredor_cif}')),
  p(r('Domicilio:\t\t\t{corredor_domicilio}')),
  spacer,
  // Flota
  p(r('Flota:\t\t\t\t{flota_nombre}')),
  spacer,
  // Tomador
  p(r('Tomador del seguro:\t\t{tomador_nombre}')),
  p(r('CIF:\t\t\t\t{tomador_cif}')),
  spacer,
  // Periodo y pago
  p(r('Período cobertura pólizas:\t{periodo_desde} al {periodo_hasta}')),
  p(r('Forma de pago:\t\t\t{forma_pago}')),
  spacer,
  // Descripción periodo — underline
  p(r('{descripcion_periodo}', `${bold}${underline}`)),
  spacer,
  // Importes
  p(r('Importe Prima Neta:\t\t\t{prima_neta}\t(*)')),
  p(r('Impuestos:\t\t\t\t{impuestos}\t(*)')),
  // Línea separadora
  p('', hrBorder),
  // Total — bold
  p(r('Importe prima total:\t\t\t{importe_total}\t(*)', `${bold}`)),
  spacer,
  spacer,
  // Nota
  p(r('(*) Según documento anexo adjunto', sz(8))),
].join('\n');

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>
    </w:sectPr>
  </w:body>
</w:document>`;

// ─── Assemble DOCX ────────────────────────────────────────────────────────────

const zip = new PizZip();
zip.file('[Content_Types].xml', contentTypes);
zip.file('_rels/.rels', rels);
zip.file('word/_rels/document.xml.rels', wordRels);
zip.file('word/document.xml', documentXml);
zip.file('word/styles.xml', styles);
zip.file('word/settings.xml', settings);
zip.file('word/media/image1.jpeg', logoBytes);

const outPath = join(rootDir, 'public', 'templates', 'factura_recibo.docx');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, zip.generate({ type: 'nodebuffer' }));

console.log(`Template generado: ${outPath}`);
console.log(`Tamaño: ${(readFileSync(outPath).length / 1024).toFixed(1)} KB`);
