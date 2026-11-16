// Archivos que se descargan de una sesión, en un solo sitio para que el final normal, la
// copia de emergencia, las sesiones interrumpidas y la página de recuperación entreguen
// siempre lo mismo:
//   1. paquete estándar del laboratorio (.zip, sin datos personales)
//   2. archivos propios del estudio (p. ej., Archivo 1 de RG-01), si los define
//   3. datos personales (.csv aparte), si el estudio los recoge

import { buildExportPackage, downloadBytes } from "./paquete.js";
import { personalCSV, localStamp } from "./personales.js";

const enc = (s) => new TextEncoder().encode(s);

/**
 * @param {object} p
 * @param {object[]} p.events
 * @param {object|null} [p.personalRecord]
 * @param {Function|null} [p.extraExports]  ({events, config, isTest}) => [{filename, content, label}]
 * @param {"final"|"emergencia"|"interrumpida"|"recuperada"} [p.kind]
 * @param {string|null} [p.localSaveStatus]
 */
export function buildSessionFiles({ events, personalRecord = null, extraExports = null, kind = "final", localSaveStatus = null }) {
  const start = events.find((e) => e.type === "session_start");
  if (!start) return [];
  const config = start.is_test && start.effective_config ? start.effective_config : start.config;
  const suffix = kind === "final" ? "" : `_${kind.toUpperCase()}`;
  const files = [];

  const pkg = buildExportPackage(events, { exportKind: kind, localSaveStatus });
  files.push({ filename: pkg.filename, bytes: pkg.bytes, mime: "application/zip", label: "Paquete completo del laboratorio (.zip)" });

  if (extraExports) {
    for (const f of extraExports({ events, config, isTest: start.is_test })) {
      files.push({ filename: f.filename.replace(/\.csv$/, `${suffix}.csv`), bytes: enc(f.content), mime: "text/csv;charset=utf-8", label: f.label ?? f.filename });
    }
  }

  if (personalRecord && personalRecord.forms?.length) {
    const stamp = localStamp().replace(/[-:]/g, "").replace(" ", "-").slice(0, 13);
    const code = String(start.participant_id ?? personalRecord.participant_id ?? "sin_codigo").replace(/[^A-Za-z0-9_-]/g, "_");
    files.push({
      filename: `${start.is_test ? "PRUEBA_" : ""}${start.study_id}_${code}_${stamp}_personales${suffix}.csv`,
      bytes: enc(personalCSV(personalRecord)),
      mime: "text/csv;charset=utf-8",
      label: "Datos personales (archivo aparte)",
    });
  }
  return files;
}

/** Descarga varios archivos seguidos (con una pequeña pausa para que el navegador no los bloquee). */
export function downloadFiles(files, gapMs = 400) {
  files.forEach((f, i) => setTimeout(() => downloadBytes(f.bytes, f.filename, f.mime), i * gapMs));
}
