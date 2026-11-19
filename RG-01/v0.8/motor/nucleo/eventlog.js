// Registro bruto de eventos. Es la fuente de verdad: todas las tablas exportadas se
// derivan de él, de modo que una sesión recuperada del almacenamiento local puede
// reconstruirse por completo.
//
// t_ms: milisegundos desde el inicio de la sesión, en reloj monotónico (performance.now).
// wall_time: fecha y hora de calendario (ISO 8601) en el momento de registrar el evento.

import { uuid } from "./ids.js";

export function createEventLog({ sessionId, clock, t0, idFactory = uuid, wallClock = () => new Date().toISOString() }) {
  const events = [];
  const listeners = [];
  let seq = 0;

  function push(type, tAbs, payload) {
    const e = {
      seq: ++seq,
      event_id: idFactory(),
      session_id: sessionId,
      type,
      t_ms: round3(tAbs - t0),
      wall_time: wallClock(),
      ...payload,
    };
    events.push(e);
    for (const l of listeners) l(e);
    return e;
  }

  return {
    /** Registra un evento en el instante actual. */
    append(type, payload = {}) { return push(type, clock.now(), payload); },
    /** Registra un evento cuyo instante ya se conoce (p. ej., event.timeStamp del navegador). */
    appendAt(type, tAbs, payload = {}) { return push(type, tAbs, payload); },
    onAppend(fn) { listeners.push(fn); },
    get events() { return events; },
    relative(tAbs) { return round3(tAbs - t0); },
  };
}

export function round3(x) {
  return Math.round(x * 1000) / 1000;
}
