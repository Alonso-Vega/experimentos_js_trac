// Datos personales (nombre, contacto, casillas de consentimiento...).
//
// Se guardan SEPARADOS del registro de la tarea: nunca entran en el registro bruto, en las
// tablas ni en el paquete .zip. Tienen su propia clave en el navegador (para poder
// recuperarlos si falla la descarga) y su propio archivo CSV.

import { toCSV } from "./csv.js";

const PREFIX = "lab:v1-personal";

export function personalKey(isTest, sessionId) {
  return `${PREFIX}:${isTest ? "prueba" : "real"}:${sessionId}`;
}

export function createPersonalStore({ isTest, sessionId, storage = globalThis.localStorage }) {
  const key = personalKey(isTest, sessionId);
  const record = { session_id: sessionId, is_test: isTest, forms: [] };
  const status = { ok: null, last_error: null };
  return {
    key,
    status,
    get record() { return record; },
    /** Añade las respuestas personales de un formulario y las guarda en el acto. */
    add(formId, values, { participantId, studyId }) {
      const now = new Date();
      record.participant_id = participantId ?? record.participant_id ?? null;
      record.study_id = studyId;
      record.forms.push({ form_id: formId, values, submitted_utc: now.toISOString(), submitted_local: localStamp(now) });
      try { storage.setItem(key, JSON.stringify(record)); status.ok = true; }
      catch (err) { status.ok = false; status.last_error = String(err?.message ?? err); }
    },
    hasData() { return record.forms.length > 0; },
  };
}

/** Fecha y hora local legible: 2026-11-15 18:22:05 */
export function localStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Una fila: código, cada dato personal y la fecha y hora de envío de cada formulario. */
export function personalCSV(record) {
  const row = { participant_code: record.participant_id ?? "", study_id: record.study_id ?? "", session_id: record.session_id, is_test: record.is_test };
  for (const f of record.forms) {
    for (const [k, v] of Object.entries(f.values)) row[k] = v;
    row[`${f.form_id}_fecha_hora_local`] = f.submitted_local;
    row[`${f.form_id}_fecha_hora_utc`] = f.submitted_utc;
  }
  return toCSV([row]);
}

export function listPersonalRecords(storage = globalThis.localStorage) {
  const out = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(PREFIX + ":")) continue;
    try { out.push({ key, record: JSON.parse(storage.getItem(key)) }); } catch { out.push({ key, error: "no se pudo leer" }); }
  }
  return out;
}

export function loadPersonalRecord(isTest, sessionId, storage = globalThis.localStorage) {
  try { return JSON.parse(storage.getItem(personalKey(isTest, sessionId))); } catch { return null; }
}
