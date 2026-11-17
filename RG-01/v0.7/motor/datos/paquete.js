// Paquete de datos de una sesión: un .zip con el registro bruto (JSON), las tablas en
// CSV, el libro .xlsx consolidado y el diccionario de variables.

import { deriveTables } from "./derive.js";
import { buildDictionary } from "./diccionario.js";
import { toCSV } from "./csv.js";
import { createXlsx } from "./xlsx.js";
import { createZip } from "./zip.js";

export const RAW_FORMAT = "lab-sesion-v1";

function stamp(iso) {
  // Hora local del ordenador: 2026-11-15T17:30:05Z en Madrid -> 20261115-183005
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function baseName(start) {
  const pid = String(start.participant_id).replace(/[^A-Za-z0-9_-]/g, "_");
  return `${start.is_test ? "PRUEBA_" : ""}${start.study_id}_v${start.study_version}_${pid}_${stamp(start.session_wall_start)}_${start.session_id.slice(0, 8)}`;
}

/**
 * Registro bruto de la sesión como texto JSON (el mismo que va dentro del .zip). Motor 0.6.0:
 * función aparte para que el envío a DataPipe mande exactamente el mismo contenido.
 * @returns {{ filename: string, text: string }}
 */
export function buildRawJSON(events, { exportKind = "final" } = {}) {
  const start = events.find((e) => e.type === "session_start");
  const suffix = exportKind === "final" ? "" : `_${exportKind.toUpperCase()}`;
  const raw = {
    format: RAW_FORMAT,
    export_kind: exportKind,
    exported_at: new Date().toISOString(),
    complete: events.some((e) => e.type === "session_end"),
    events,
  };
  return { filename: `${baseName(start)}${suffix}_bruto.json`, text: JSON.stringify(raw, null, 1) };
}

/**
 * @param {object[]} events  registro bruto
 * @param {{exportKind?: "final"|"emergencia"|"recuperada", localSaveStatus?: string}} opts
 * @returns {{ filename: string, bytes: Uint8Array, tables: object }}
 */
export function buildExportPackage(events, { exportKind = "final", localSaveStatus = null } = {}) {
  const start = events.find((e) => e.type === "session_start");
  const tables = deriveTables(events, { localSaveStatus });
  const dict = buildDictionary(tables);
  const base = baseName(start);
  const raw = JSON.parse(buildRawJSON(events, { exportKind }).text);
  const xlsx = createXlsx([
    { name: "sesiones", rows: tables.sesiones },
    { name: "bloques", rows: tables.bloques },
    { name: "ensayos", rows: tables.ensayos },
    { name: "consecuencias", rows: tables.consecuencias },
    { name: "pantallas", rows: tables.pantallas },
    { name: "formularios", rows: tables.formularios },
    { name: "eventos", rows: tables.eventos },
    { name: "diccionario", rows: dict },
  ]);
  const files = [
    { name: `${base}_bruto.json`, data: JSON.stringify(raw, null, 1) },
    { name: `${base}.xlsx`, data: xlsx },
    { name: `${base}_sesiones.csv`, data: toCSV(tables.sesiones) },
    { name: `${base}_bloques.csv`, data: toCSV(tables.bloques) },
    { name: `${base}_ensayos.csv`, data: toCSV(tables.ensayos) },
    { name: `${base}_consecuencias.csv`, data: toCSV(tables.consecuencias) },
    { name: `${base}_pantallas.csv`, data: toCSV(tables.pantallas) },
    { name: `${base}_formularios.csv`, data: toCSV(tables.formularios) },
    { name: `${base}_eventos.csv`, data: toCSV(tables.eventos) },
    { name: `${base}_diccionario.csv`, data: toCSV(dict) },
  ];
  const suffix = exportKind === "final" ? "" : `_${exportKind.toUpperCase()}`;
  return { filename: `${base}${suffix}.zip`, bytes: createZip(files), tables };
}

/** Descarga en el navegador. */
export function downloadBytes(bytes, filename, mime = "application/zip") {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
