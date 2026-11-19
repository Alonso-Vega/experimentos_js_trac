// Guardado incremental en el almacenamiento local del navegador (localStorage).
//
// - Se guarda tras cada grupo de eventos (los eventos del mismo instante se agrupan).
// - Los datos de prueba y los reales usan espacios de nombres distintos.
// - Es una red de seguridad, NO una copia de seguridad garantizada: el navegador puede
//   borrarlo (limpieza de datos, modo incógnito, falta de espacio). El dato que cuenta es
//   el archivo descargado (y, más adelante, el receptor remoto).
// - El almacenamiento es por origen (http://localhost:8765): si cambia el puerto o el
//   navegador, la página de recuperación no verá estas sesiones.

const PREFIX = "lab:v1";

export function namespace(isTest) {
  return `${PREFIX}:${isTest ? "prueba" : "real"}`;
}

export function createLocalStore({ isTest, sessionId, storage = globalThis.localStorage }) {
  const key = `${namespace(isTest)}:${sessionId}`;
  const status = { ok: null, last_saved_seq: 0, last_error: null, failures: 0 };
  let scheduled = false;
  let latest = null;
  let meta = { status: "en_curso", exported: false };

  function write() {
    scheduled = false;
    if (!latest) return;
    try {
      storage.setItem(key, JSON.stringify({ meta, events: latest }));
      status.ok = true;
      status.last_saved_seq = latest.length ? latest[latest.length - 1].seq : 0;
      status.last_error = null;
    } catch (err) {
      status.ok = false;
      status.failures++;
      status.last_error = String(err && err.message ? err.message : err);
    }
  }

  return {
    key,
    status,
    /** Programa un guardado (se agrupan los eventos de la misma tarea). */
    schedule(events) {
      latest = events;
      if (!scheduled) { scheduled = true; queueMicrotask(write); }
    },
    /** Guardado inmediato (cierre de página, fin de sesión). */
    flushNow(events) { latest = events ?? latest; write(); return { ...status }; },
    setMeta(patch) { meta = { ...meta, ...patch }; },
    describe() {
      if (status.ok === null) return "sin_guardar_aun";
      if (status.ok) return `ok_hasta_evento_${status.last_saved_seq}`;
      return `error: ${status.last_error}`;
    },
  };
}

/** Sesiones guardadas en este navegador (para la página de recuperación). */
export function listStoredSessions(storage = globalThis.localStorage) {
  const out = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(PREFIX + ":")) continue;
    try {
      const v = JSON.parse(storage.getItem(key));
      const start = v.events.find((e) => e.type === "session_start");
      const end = v.events.find((e) => e.type === "session_end");
      out.push({
        key,
        is_test: key.includes(":prueba:"),
        study_id: start?.study_id, study_version: start?.study_version, engine_version: start?.engine_version ?? null,
        participant_id: start?.participant_id, session_id: start?.session_id,
        started: start?.session_wall_start, end_reason: end?.reason ?? null,
        n_events: v.events.length, exported: Boolean(v.meta?.exported), status: v.meta?.status ?? null,
        sent: Boolean(v.meta?.sent), sent_to: v.meta?.sent_to ?? null, // envío a DataPipe (motor 0.6.0)
      });
    } catch {
      out.push({ key, error: "no se pudo leer" });
    }
  }
  return out.sort((a, b) => String(b.started).localeCompare(String(a.started)));
}

export function loadStoredSession(key, storage = globalThis.localStorage) {
  return JSON.parse(storage.getItem(key));
}

export function markExported(key, storage = globalThis.localStorage) {
  const v = JSON.parse(storage.getItem(key));
  v.meta = { ...(v.meta ?? {}), exported: true, exported_at: new Date().toISOString() };
  storage.setItem(key, JSON.stringify(v));
}

/**
 * Sesiones de un estudio y una versión guardadas en este navegador que nunca se descargaron.
 * closed = true si la sesión tiene cierre registrado (completada, abandonada...).
 *
 * Motor 0.5.0: se filtra también por versión del estudio. El navegador comparte el
 * almacenamiento entre todas las páginas de una misma dirección (p. ej., localhost:8702 y
 * localhost:8702/publicado/v0.1/, o todo un sitio de GitHub Pages); sin este filtro, al abrir
 * una versión se descargarían y procesarían con su motor las sesiones de otra versión.
 */
export function findUndownloadedSessions(studyId, studyVersion, storage = globalThis.localStorage) {
  return findPendingSessions(studyId, studyVersion, { requireSent: false }, storage);
}

/**
 * Motor 0.6.0: sesiones del estudio y la versión pendientes de descargar o, si el estudio
 * envía a DataPipe (requireSent), pendientes de enviar.
 */
export function findPendingSessions(studyId, studyVersion, { requireSent = false } = {}, storage = globalThis.localStorage) {
  return listStoredSessions(storage)
    .filter((s) => !s.error && s.study_id === studyId && s.study_version === studyVersion && (!s.exported || (requireSent && !s.sent)))
    .map((s) => ({ ...s, closed: s.end_reason !== null }));
}

/** Marca una sesión como enviada a DataPipe. */
export function markSent(key, info = {}, storage = globalThis.localStorage) {
  const v = JSON.parse(storage.getItem(key));
  v.meta = { ...(v.meta ?? {}), sent: true, sent_at: new Date().toISOString(), ...info };
  storage.setItem(key, JSON.stringify(v));
}
