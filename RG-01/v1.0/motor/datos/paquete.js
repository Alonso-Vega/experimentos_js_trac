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

// Motor 0.7.0: gráfico de elecciones por bloque (hoja «grafico» del .xlsx), si el estudio
// lo pide con data.choice_chart. Marcador y relleno por defecto de cada forma de marcador.
const MARKER_STYLE = {
  circle: { fill: "A6A6A6", line: "7F7F7F" }, triangle: { fill: "FFFFFF", line: "000000" },
  square: { fill: "000000", line: "000000" }, diamond: { fill: "7F7F7F", line: "7F7F7F" },
  x: { fill: "000000", line: "000000" }, star: { fill: "FFFFFF", line: "000000" },
  plus: { fill: "000000", line: "000000" }, dash: { fill: "000000", line: "000000" }, dot: { fill: "000000", line: "000000" },
};
const DEFAULT_MARKERS = ["circle", "triangle", "square", "diamond", "x"];
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/**
 * Hoja «grafico»: una fila por bloque de elección libre (bloque, fase y elecciones de cada
 * alternativa) y un gráfico de líneas con marcadores, líneas verticales discontinuas entre
 * fases y el nombre de cada fase encima. Devuelve null si no procede.
 */
export function buildChoiceChartSheet(events, tables) {
  const start = events.find((e) => e.type === "session_start");
  const cfg = start.is_test && start.effective_config ? start.effective_config : start.config;
  const cc = cfg?.data?.choice_chart;
  if (!cc) return null;
  const blocks = tables.bloques.filter((b) => b.block_kind !== "forced" && b.n_trials > 0);
  if (!blocks.length) return null;
  const lang = start.language ?? cfg.language ?? "es";
  const optionIds = Object.keys(cfg.options);
  const names = optionIds.map((o) => cap(cfg.options[o].label?.[lang] ?? o));
  const phaseLabel = (id) => cc.phase_labels?.[id] ?? id;
  const rows = blocks.map((b) => {
    const r = { bloque: b.block_index_global, fase: phaseLabel(b.phase_id) };
    optionIds.forEach((o, i) => { r[names[i]] = b[`n_choice_${o}`] ?? 0; });
    return r;
  });
  const yMax = Math.max(...cfg.phases.filter((p) => !p.forced).map((p) => p.trials_per_block));
  const xMax = Math.max(...rows.map((r) => r.bloque));
  const separators = [];
  const labels = [];
  let runStart = 0;
  for (let i = 1; i <= blocks.length; i++) {
    if (i === blocks.length || blocks[i].phase_id !== blocks[i - 1].phase_id) {
      const first = rows[runStart].bloque, last = rows[i - 1].bloque;
      labels.push({ x: (first + last) / 2, y: yMax + 1, text: phaseLabel(blocks[i - 1].phase_id) });
      if (i < blocks.length) separators.push(last + 0.5);
      runStart = i;
    }
  }
  const series = optionIds.map((o, i) => {
    const marker = cc.markers?.[o] ?? DEFAULT_MARKERS[i % DEFAULT_MARKERS.length];
    return { col: 2 + i, name: names[i], marker, ...MARKER_STYLE[marker] };
  });
  return {
    name: "grafico",
    rows,
    chart: {
      title: cc.title === "participant" || cc.title === undefined ? String(start.participant_id ?? "") : String(cc.title),
      xTitle: cc.x_title ?? (lang === "en" ? "BLOCKS" : "BLOQUES"),
      yTitle: cc.y_title ?? (lang === "en" ? "CHOICE FREQUENCY" : "FRECUENCIA DE ELECCIÓN"),
      xCol: 0, series, separators, labels,
      markerSize: cc.marker_size ?? 7, // motor 0.8.0
      x: { min: 0, max: xMax + 1, labelMax: xMax },
      y: { min: 0, max: yMax + 2, labelMax: yMax, majorUnit: yMax <= 6 ? 1 : 2 },
    },
  };
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
  const chartSheet = buildChoiceChartSheet(events, tables);
  const xlsx = createXlsx([
    ...(chartSheet ? [chartSheet] : []), // la primera hoja, para que sea lo que se ve al abrir
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
