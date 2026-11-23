// Escritor mínimo de libros .xlsx (Office Open XML), sin dependencias.
// El texto se escribe como cadena literal (inlineStr): Excel nunca lo interpreta como
// fórmula. Los números se guardan como números y los lógicos como VERDADERO/FALSO.

import { createZip } from "./zip.js";

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function esc(s) {
  return String(s)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function colName(i) {
  let s = "";
  i++;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

function cell(ref, v, header) {
  const style = header ? ' s="1"' : "";
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
  if (typeof v === "boolean") return `<c r="${ref}"${style} t="b"><v>${v ? 1 : 0}</v></c>`;
  const text = typeof v === "string" ? v : JSON.stringify(v);
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(text.slice(0, 32767))}</t></is></c>`;
}

function sheetXML(rows, { drawingRelId = null } = {}) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const out = [];
  out.push(`<row r="1">${columns.map((c, i) => cell(`${colName(i)}1`, c, true)).join("")}</row>`);
  rows.forEach((r, ri) => {
    const n = ri + 2;
    out.push(`<row r="${n}">${columns.map((c, i) => cell(`${colName(i)}${n}`, r[c], false)).join("")}</row>`);
  });
  return XML_HEAD +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<sheetData>${out.join("")}</sheetData>` +
    (drawingRelId ? `<drawing r:id="${drawingRelId}"/>` : "") +
    "</worksheet>";
}

// ---------------------------------------------------------------------------------------
// Gráfico de dispersión con líneas (motor 0.7.0), en DrawingML de Office, sin dependencias.
// Las series de datos apuntan a columnas de la propia hoja (con valores en caché, para que
// el gráfico se vea aunque Excel no recalcule). Líneas verticales discontinuas y rótulos
// se dibujan con series auxiliares de valores fijos, ocultas en la leyenda.
// ---------------------------------------------------------------------------------------
const NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const CHART_MARKERS = ["circle", "triangle", "square", "diamond", "x", "star", "plus", "dash", "dot"];

const solid = (hex) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
const lineXML = (hex, w = 15875, dash = null) => `<a:ln w="${w}" cap="flat">${solid(hex)}${dash ? `<a:prstDash val="${dash}"/>` : ""}<a:round/></a:ln>`;
const noLine = "<a:ln><a:noFill/></a:ln>";
const num = (v) => (Number.isFinite(v) ? String(v) : "");

function numCache(values) {
  return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => (Number.isFinite(v) ? `<c:pt idx="${i}"><c:v>${num(v)}</c:v></c:pt>` : "")).join("")}</c:numCache>`;
}
function numLit(values) {
  return `<c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${num(v)}</c:v></c:pt>`).join("")}</c:numLit>`;
}
function richText(text, { size = 1000, bold = false, rot = null } = {}) {
  return `<c:tx><c:rich><a:bodyPr${rot !== null ? ` rot="${rot}" vert="horz"` : ""}/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}" b="${bold ? 1 : 0}"/></a:pPr>` +
    `<a:r><a:rPr lang="es-ES" sz="${size}" b="${bold ? 1 : 0}"/><a:t>${esc(text)}</a:t></a:r></a:p></c:rich></c:tx>`;
}
function axisTitle(text, rot = null) {
  return `<c:title>${richText(text, { size: 1000, bold: true, rot })}<c:overlay val="0"/></c:title>`;
}
const txPr = (size) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}">${solid("000000")}</a:defRPr></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr>`;

/**
 * XML del gráfico.
 * @param {object} ch
 * @param {string} ch.sheetName      hoja con los datos
 * @param {number} ch.nRows          filas de datos (sin la cabecera)
 * @param {number} ch.xCol           índice de la columna de X
 * @param {{col:number, name:string, marker:string, fill:string, line:string}[]} ch.series
 * @param {number[]} ch.separators   X de las líneas verticales discontinuas
 * @param {{x:number, y:number, text:string}[]} ch.labels  rótulos (p. ej., nombre de cada fase)
 * @param {{min:number, max:number, labelMax:number}} ch.x   ch.y  escalas; labelMax: último valor rotulado
 * @param {number} [ch.markerSize] tamaño de los marcadores en puntos (2–72; 7 si no se indica)
 * @param {string} ch.title, ch.xTitle, ch.yTitle
 * @param {object[]} ch.rows         filas de datos (para los valores en caché)
 * @param {string[]} ch.columns
 */
export function chartXML(ch) {
  const sheetRef = `'${ch.sheetName.replaceAll("'", "''")}'`;
  const range = (col) => `${sheetRef}!$${colName(col)}$2:$${colName(col)}$${ch.nRows + 1}`;
  const colValues = (col) => ch.rows.map((r) => r[ch.columns[col]]);
  let idx = 0;
  const sers = [];
  const hidden = [];
  for (const s of ch.series) {
    sers.push(`<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>` +
      `<c:tx><c:strRef><c:f>${sheetRef}!$${colName(s.col)}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>` +
      `<c:spPr>${lineXML(s.line, 15875)}</c:spPr>` +
      `<c:marker><c:symbol val="${s.marker}"/><c:size val="${ch.markerSize ?? 7}"/><c:spPr>${solid(s.fill)}${lineXML("000000", 9525)}</c:spPr></c:marker>` +
      `<c:xVal><c:numRef><c:f>${range(ch.xCol)}</c:f>${numCache(colValues(ch.xCol))}</c:numRef></c:xVal>` +
      `<c:yVal><c:numRef><c:f>${range(s.col)}</c:f>${numCache(colValues(s.col))}</c:numRef></c:yVal>` +
      '<c:smooth val="0"/></c:ser>');
    idx++;
  }
  for (const x of ch.separators) {
    hidden.push(idx);
    sers.push(`<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/><c:tx><c:v>separador</c:v></c:tx>` +
      `<c:spPr>${lineXML("000000", 9525, "dash")}</c:spPr><c:marker><c:symbol val="none"/></c:marker>` +
      `<c:xVal>${numLit([x, x])}</c:xVal><c:yVal>${numLit([ch.y.min, ch.y.labelMax])}</c:yVal><c:smooth val="0"/></c:ser>`);
    idx++;
  }
  for (const l of ch.labels) {
    hidden.push(idx);
    sers.push(`<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/><c:tx><c:v>${esc(l.text)}</c:v></c:tx>` +
      `<c:spPr>${noLine}</c:spPr><c:marker><c:symbol val="none"/></c:marker>` +
      `<c:dLbls><c:spPr><a:noFill/>${noLine}</c:spPr>${txPr(900)}<c:dLblPos val="ctr"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="1"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>` +
      `<c:xVal>${numLit([l.x])}</c:xVal><c:yVal>${numLit([l.y])}</c:yVal><c:smooth val="0"/></c:ser>`);
    idx++;
  }
  const axLine = `<c:spPr>${lineXML("000000", 9525)}</c:spPr>`;
  // Formato de número de los ejes: solo se rotulan los valores entre 1 y labelMax (X) o 0 y labelMax (Y).
  const xFmt = `[=0]"";[<${ch.x.labelMax + 1}]0;""`;
  const yFmt = `[<${ch.y.labelMax + 1}]0;""`;
  return XML_HEAD +
    `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/>` +
    "<c:chart>" +
    `<c:title>${richText(ch.title, { size: 1400, bold: true })}<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` +
    "<c:plotArea><c:layout/>" +
    `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${sers.join("")}<c:axId val="50010001"/><c:axId val="50010002"/></c:scatterChart>` +
    `<c:valAx><c:axId val="50010001"/><c:scaling><c:orientation val="minMax"/><c:max val="${ch.x.max}"/><c:min val="${ch.x.min}"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>` +
    `${axisTitle(ch.xTitle)}<c:numFmt formatCode="${esc(xFmt)}" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axLine}${txPr(900)}` +
    '<c:crossAx val="50010002"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/><c:majorUnit val="1"/></c:valAx>' +
    `<c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/><c:max val="${ch.y.max}"/><c:min val="${ch.y.min}"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>` +
    `${axisTitle(ch.yTitle, -5400000)}<c:numFmt formatCode="${esc(yFmt)}" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axLine}${txPr(900)}` +
    `<c:crossAx val="50010001"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/><c:majorUnit val="${ch.y.majorUnit ?? 2}"/></c:valAx>` +
    `<c:spPr><a:noFill/>${noLine}</c:spPr></c:plotArea>` +
    `<c:legend><c:legendPos val="b"/>${hidden.map((i) => `<c:legendEntry><c:idx val="${i}"/><c:delete val="1"/></c:legendEntry>`).join("")}<c:overlay val="0"/>${txPr(900)}</c:legend>` +
    '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>' +
    `<c:spPr>${solid("FFFFFF")}${noLine}</c:spPr></c:chartSpace>`;
}

function drawingXML(fromCol, toCol, toRow) {
  return XML_HEAD +
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    `<xdr:twoCellAnchor><xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Grafico 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
    '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>' +
    `<a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="rId1"/></a:graphicData></a:graphic>` +
    "</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>";
}

/**
 * @param {{name: string, rows: object[], chart?: object}[]} sheets  nombres de hoja de hasta 31
 *   caracteres. Una hoja con «chart» (motor 0.7.0) lleva además un gráfico de dispersión que
 *   usa sus columnas (ver chartXML; sheetName, nRows, rows y columns se rellenan aquí).
 * @returns {Uint8Array}
 */
export function createXlsx(sheets) {
  const files = [];
  const charted = sheets.map((s, i) => (s.chart ? i : -1)).filter((i) => i >= 0);
  files.push({
    name: "[Content_Types].xml",
    data: XML_HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      charted.map((_, k) => `<Override PartName="/xl/drawings/drawing${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` +
        `<Override PartName="/xl/charts/chart${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("") +
      "</Types>",
  });
  files.push({
    name: "_rels/.rels",
    data: XML_HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>",
  });
  files.push({
    name: "xl/workbook.xml",
    data: XML_HEAD +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      "</sheets></workbook>",
  });
  files.push({
    name: "xl/_rels/workbook.xml.rels",
    data: XML_HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      "</Relationships>",
  });
  files.push({
    name: "xl/styles.xml",
    data: XML_HEAD +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>",
  });
  sheets.forEach((s, i) => {
    const k = charted.indexOf(i);
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXML(s.rows, { drawingRelId: k >= 0 ? "rId1" : null }) });
    if (k < 0) return;
    const columns = s.rows.length ? Object.keys(s.rows[0]) : [];
    files.push({
      name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
      data: XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${k + 1}.xml"/></Relationships>`,
    });
    files.push({ name: `xl/drawings/drawing${k + 1}.xml`, data: drawingXML(columns.length + 1, columns.length + 1 + (s.chart.widthCols ?? 18), s.chart.heightRows ?? 26) });
    files.push({
      name: `xl/drawings/_rels/drawing${k + 1}.xml.rels`,
      data: XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${k + 1}.xml"/></Relationships>`,
    });
    files.push({ name: `xl/charts/chart${k + 1}.xml`, data: chartXML({ ...s.chart, sheetName: s.name.slice(0, 31), nRows: s.rows.length, rows: s.rows, columns }) });
  });
  return createZip(files);
}
