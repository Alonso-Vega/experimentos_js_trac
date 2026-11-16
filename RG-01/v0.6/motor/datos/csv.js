// CSV en UTF-8 con BOM (Excel reconoce los acentos), separador coma, fin de línea CRLF.
// Protección contra fórmulas: el texto que empieza por = + - @ tabulador o retorno se
// precede de un apóstrofo para que Excel no lo ejecute. Los números no se tocan.
// El valor original sin proteger se conserva en el archivo _bruto.json.

const FORMULA_START = /^[=+\-@\t\r]/;
const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export function protectCell(value) {
  if (typeof value !== "string") return value;
  if (FORMULA_START.test(value) && !NUMERIC.test(value)) return "'" + value;
  return value;
}

function formatCell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = protectCell(typeof v === "string" ? v : JSON.stringify(v));
  if (/[",\r\n]/.test(s)) s = '"' + s.replaceAll('"', '""') + '"';
  return s;
}

/** @param {object[]} rows  filas con las mismas columnas (las de la primera fila) */
export function toCSV(rows, columns = rows.length ? Object.keys(rows[0]) : []) {
  const lines = [columns.map(formatCell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => formatCell(r[c])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
