// Cola explícita de consecuencias y saldos.
//
// Estados de una consecuencia (ver GLOSARIO.md):
//   obtenida   -> una respuesta elegible cumplió el requisito y el sorteo de probabilidad.
//   pendiente  -> obtenida pero aún no entregada porque tiene demora.
//   entregada  -> aplicada al saldo disponible y presentada.
// «Programada» se registra en la evaluación de la contingencia (requirement_met), antes
// de que exista la consecuencia.
//
// Saldos: disponible (entregado) y pendiente (obtenido sin entregar), siempre por separado.
// Las consecuencias pendientes se acumulan (no se cancelan ni se sustituyen).
// Al cerrar la sesión, el motor NO entrega ni elimina pendientes por su cuenta: las deja
// registradas como pendientes, salvo las de modo end_of_session en un cierre normal.

import { round3 } from "./eventlog.js";

export const DELAY_MODES = ["immediate", "seconds", "end_of_trial", "end_of_block", "end_of_phase", "end_of_session"];

export function createLedger({ log, idFactory }) {
  const records = [];
  const balances = { available: 0, pending: 0 };

  function signed(outcome) {
    return outcome.type === "loss" ? -outcome.magnitude : outcome.magnitude;
  }

  function deliver(rec, context, tAbs) {
    const wasPending = rec.state === "pending";
    rec.state = "delivered";
    rec.t_delivered_ms = log.relative(tAbs);
    rec.delivery_context = context;
    if (wasPending) balances.pending = round3(balances.pending - rec.signed_value);
    balances.available = round3(balances.available + rec.signed_value);
    log.appendAt("consequence_delivered", tAbs, {
      consequence_id: rec.consequence_id,
      contingency_id: rec.contingency_id,
      option: rec.option,
      source_response_id: rec.source_response_id,
      signed_value: rec.signed_value,
      delivery_trigger: context.trigger,
      phase_id: context.phase_id,
      block_index: context.block_index,
      trial_index_global: context.trial_index_global ?? null,
      balance_available: balances.available,
      balance_pending: balances.pending,
      ...repOf(context),
    });
    return rec;
  }

  return {
    balances,
    records,

    /**
     * Registra una consecuencia obtenida. Si es inmediata se entrega en el acto.
     * @returns el registro de la consecuencia
     */
    earn({ contingency, source_response_id, context, tAbs }) {
      const { outcome, delay } = contingency.spec;
      const rec = {
        consequence_id: idFactory(),
        contingency_id: contingency.id,
        option: contingency.option,
        source_response_id,
        type: outcome.type,
        magnitude: outcome.magnitude,
        unit: outcome.unit,
        signed_value: signed(outcome),
        delay_mode: delay.mode,
        delay_seconds: delay.mode === "seconds" ? delay.seconds : null,
        delay_from: delay.mode === "seconds" ? "response" : null,
        t_earned_ms: log.relative(tAbs),
        t_due_abs: delay.mode === "seconds" ? tAbs + delay.seconds * 1000 : null,
        origin_context: context,
        state: "earned",
        t_delivered_ms: null,
        delivery_context: null,
      };
      records.push(rec);
      log.appendAt("consequence_earned", tAbs, {
        consequence_id: rec.consequence_id,
        contingency_id: rec.contingency_id,
        option: rec.option,
        source_response_id,
        outcome_type: rec.type,
        magnitude: rec.magnitude,
        unit: rec.unit,
        signed_value: rec.signed_value,
        delay_mode: rec.delay_mode,
        delay_seconds: rec.delay_seconds,
        phase_id: context.phase_id,
        block_index: context.block_index,
        trial_index_global: context.trial_index_global ?? null,
        ...repOf(context),
      });
      if (delay.mode === "immediate") {
        deliver(rec, { ...context, trigger: "immediate" }, tAbs);
      } else {
        rec.state = "pending";
        balances.pending = round3(balances.pending + rec.signed_value);
        log.appendAt("consequence_pending", tAbs, {
          consequence_id: rec.consequence_id,
          delay_mode: rec.delay_mode,
          due_t_ms: rec.t_due_abs == null ? null : log.relative(rec.t_due_abs),
          balance_available: balances.available,
          balance_pending: balances.pending,
        });
      }
      return rec;
    },

    /** Entrega todas las pendientes cuyo modo coincide (end_of_trial, end_of_block...). */
    flush(mode, context, tAbs) {
      const due = records.filter((r) => r.state === "pending" && r.delay_mode === mode);
      return due.map((r) => deliver(r, { ...context, trigger: mode }, tAbs));
    },

    /** Entrega las pendientes con demora en segundos ya vencida. */
    tick(context, tAbs) {
      const due = records
        .filter((r) => r.state === "pending" && r.delay_mode === "seconds" && r.t_due_abs <= tAbs)
        .sort((a, b) => a.t_due_abs - b.t_due_abs);
      return due.map((r) => deliver(r, { ...context, trigger: "seconds" }, tAbs));
    },

    pending() { return records.filter((r) => r.state === "pending"); },

    /**
     * Pone a 0 el saldo disponible y devuelve el que había (motor 0.4.0). Las
     * consecuencias ya entregadas siguen registradas; las pendientes no se tocan.
     */
    resetAvailable() {
      const previous = balances.available;
      balances.available = 0;
      return previous;
    },
  };
}

/** Repetición del tramo repetible en curso, si la hay (motor 0.4.0). */
function repOf(context) {
  return context?.repetition == null ? {} : { repeat_id: context.repeat_id, repetition: context.repetition };
}
