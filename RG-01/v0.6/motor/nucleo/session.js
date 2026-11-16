// Controlador de sesión: une diseño, contingencias, cola de consecuencias y registro.
// No sabe nada de la pantalla: la capa de presentación le comunica qué ocurrió y cuándo
// (con marcas de tiempo del reloj monotónico) y él decide las consecuencias.

import { ENGINE_VERSION } from "../version.js";
import { createRng } from "./rng.js";
import { createSchedule } from "./schedules.js";
import { createLedger } from "./consequences.js";
import { createEventLog, round3 } from "./eventlog.js";
import { buildDesign } from "./design.js";
import { uuid } from "./ids.js";

function createContingency(spec, rootRng) {
  const scheduleRng = rootRng.derive(`schedule:${spec.id}`);
  const probabilityRng = rootRng.derive(`probability:${spec.id}`);
  const schedule = createSchedule(spec.schedule, { rng: scheduleRng });
  let started = false;
  return {
    id: spec.id,
    option: spec.option,
    spec,
    schedule,
    get started() { return started; },
    start(t) { schedule.start(t); started = true; },
    evaluate(t) {
      const before = schedule.snapshot(t);
      const r = schedule.respond(t);
      let probabilityPassed = null;
      if (r.requirement_met) probabilityPassed = probabilityRng.chance(spec.probability);
      return {
        requirement_met: r.requirement_met,
        probability: spec.probability,
        probability_passed: probabilityPassed,
        earned: r.requirement_met && probabilityPassed === true,
        schedule_before: before,
        schedule_after: schedule.snapshot(t),
      };
    },
  };
}

/**
 * @param {object} p
 * @param {object} p.config           configuración tal como está escrita (la que se resume en el hash)
 * @param {object} p.effectiveConfig  configuración usada (con modo de prueba aplicado si procede)
 * @param {string} p.configHash
 * @param {string} p.seed
 * @param {string} p.participantId
 * @param {string} [p.sessionId]
 * @param {boolean} p.isTest
 * @param {object} [p.environment]    navegador, plataforma, pantalla...
 * @param {{now: () => number}} p.clock
 */
export function createSession(p) {
  const idFactory = p.idFactory ?? uuid;
  const sessionId = p.sessionId ?? idFactory();
  const clock = p.clock;
  const t0 = clock.now();
  const cfg = p.effectiveConfig;
  const log = createEventLog({ sessionId, clock, t0, idFactory, wallClock: p.wallClock });
  const ledger = createLedger({ log, idFactory });
  const rootRng = createRng(p.seed);
  const design = buildDesign(cfg, rootRng.derive("positions"));
  const contingencies = cfg.contingencies.map((k) => createContingency(k, rootRng));
  const phaseById = Object.fromEntries(cfg.phases.map((ph) => [ph.id, ph]));

  let ctx = { phase_id: null, block_index: null, block_index_global: null, trial_index_global: null };
  let current = null;       // ensayo en curso
  let lastOption = null;    // para detectar cambios de alternativa
  let finished = false;
  let started = false;
  let participantId = p.participantId ?? null;
  let condition = p.condition ?? null;
  let instruction = null;   // instrucción vigente (id), se registra en cada respuesta

  // Tramo repetible en curso (motor 0.4.0): id del tramo y número de repetición (desde 1).
  let repeatId = null;
  let repetition = null;
  const rep = () => (repetition == null ? {} : { repeat_id: repeatId, repetition });

  // Numeración en ejecución (motor 0.4.0). Los ensayos y bloques libres conservan el número
  // del diseño. Los forzados (sin número en el diseño) y cualquier ensayo o bloque que se
  // ejecute por segunda vez (repetición) reciben el siguiente número libre a partir del
  // último del diseño, para que cada ensayo y cada bloque ejecutados tengan un número único.
  let nextTrialIndex = design.n_free_trials;
  let nextBlockIndex = design.n_free_blocks;
  const usedTrials = new Set();
  const usedBlocks = new Set();
  const runtimeIndex = (designIndex, used, bump) => {
    const idx = designIndex != null && !used.has(designIndex) ? designIndex : bump();
    used.add(idx);
    return idx;
  };

  // Una contingencia sin «phases» está activa en todas las fases.
  const activeIn = (k, phaseId) => !k.spec.phases || k.spec.phases.includes(phaseId);

  function context(extra = {}) {
    return { phase_id: ctx.phase_id, block_index: ctx.block_index, block_index_global: ctx.block_index_global, trial_index_global: ctx.trial_index_global, ...rep(), ...extra };
  }

  const session = {
    sessionId,
    design,
    log,
    ledger,
    get balances() { return { ...ledger.balances }; },
    get finished() { return finished; },
    get started() { return started; },
    get participantId() { return participantId; },
    get condition() { return condition; },

    /** Inicio del registro. El código del participante y la condición pueden llegar aquí
     *  (p. ej., cuando el participante escribe su código en el primer formulario). */
    start(overrides = {}) {
      if (started) throw new Error("La sesión ya se inició");
      if (overrides.participantId !== undefined) participantId = overrides.participantId;
      if (overrides.condition !== undefined) condition = overrides.condition;
      started = true;
      log.append("session_start", {
        study_id: p.config.study.id,
        study_version: p.config.study.version,
        engine_version: ENGINE_VERSION,
        config_hash: p.configHash,
        participant_id: participantId,
        condition,
        is_test: p.isTest,
        language: cfg.language,
        seed: p.seed,
        clock_kind: clock.kind ?? null,
        session_wall_start: new Date().toISOString(),
        environment: p.environment ?? null,
        n_trials_planned: design.n_free_trials,
        n_forced_trials_planned: design.trials.length - design.n_free_trials, // por repetición
        config: p.config,
        effective_config: p.isTest ? cfg : null,
      });
    },

    get repetition() { return repetition; },
    /** {repeat_id, repetition} si hay un tramo repetible en curso; {} si no. */
    get repeatInfo() { return rep(); },

    beginPhase(phaseId) {
      ctx = { phase_id: phaseId, block_index: null, block_index_global: null, trial_index_global: null };
      log.append("phase_start", { phase_id: phaseId, ...rep() });
    },

    /** Inicio de una repetición de un tramo repetible (n = 1 la primera vez). Motor 0.4.0. */
    beginRepetition(id, n) {
      repeatId = id;
      repetition = n;
      log.append("repetition_start", { repeat_id: id, repetition: n });
    },

    /** Fin del tramo repetible: el participante eligió continuar. */
    endRepeat(id) {
      log.append("repeat_end", { repeat_id: id, n_repetitions: repetition });
      repeatId = null;
      repetition = null;
    },

    /**
     * Pone a 0 el saldo disponible (p. ej., antes de la fase experimental). Las
     * consecuencias pendientes no se tocan. Se registra el saldo que había. Motor 0.4.0.
     */
    resetBalance(stepId = null) {
      const previous = ledger.resetAvailable();
      return log.append("balance_reset", {
        step_id: stepId, previous_available: previous,
        balance_available: ledger.balances.available, balance_pending: ledger.balances.pending, ...rep(),
      });
    },

    beginBlock(designBlock) {
      const now = clock.now();
      const block = { ...designBlock, block_index_global: runtimeIndex(designBlock.block_index_global, usedBlocks, () => ++nextBlockIndex) };
      ctx = { phase_id: block.phase_id, block_index: block.block_index, block_index_global: block.block_index_global, trial_index_global: null };
      const restarted = [];
      for (const k of contingencies) {
        if (!activeIn(k, block.phase_id)) continue;
        const firstOfPhase = block.block_index === 1;
        if (!k.started || k.spec.reset_on === "block" || (k.spec.reset_on === "phase" && firstOfPhase)) {
          k.start(now);
          restarted.push(k.id);
        }
      }
      log.appendAt("block_start", now, {
        phase_id: block.phase_id, block_index: block.block_index, block_index_global: block.block_index_global,
        block_kind: block.block_kind ?? "free", schedules_started: restarted, ...rep(),
      });
      return block;
    },

    /** Abre un ensayo. Devuelve el ensayo tal como se ejecuta (con su número definitivo). */
    beginTrial(designTrial) {
      if (current) throw new Error("beginTrial: hay un ensayo sin cerrar");
      const trial = {
        ...designTrial,
        block_index_global: ctx.block_index_global,
        trial_index_global: runtimeIndex(designTrial.trial_index_global, usedTrials, () => ++nextTrialIndex),
      };
      ctx.trial_index_global = trial.trial_index_global;
      current = { trial, onsetAbs: null, responded: false, omitted: false };
      log.append("trial_start", {
        phase_id: trial.phase_id, block_index: trial.block_index, block_index_global: trial.block_index_global,
        trial_index_block: trial.trial_index_block, trial_index_global: trial.trial_index_global, positions: trial.positions,
        trial_kind: trial.trial_kind ?? "free", forced_option: trial.forced_option ?? null,
        response_window_ms: phaseById[trial.phase_id].trial.response_window_ms, ...rep(),
      });
      return trial;
    },

    /** Inicio estimado por software de la presentación de las alternativas. */
    markOnset(tAbs) {
      if (!current) return;
      current.onsetAbs = tAbs;
      log.appendAt("stimulus_onset", tAbs, { trial_index_global: current.trial.trial_index_global, method: "requestAnimationFrame_timestamp" });
    },

    /**
     * Respuesta del participante.
     * @param {{option:string, tAbs:number, modality:string, pointerdownAbs?:number|null}} r
     */
    respond(r) {
      if (!current || current.responded || current.omitted || finished) {
        log.appendAt("input_ignored", r.tAbs, { option: r.option, reason: !current ? "no_trial_active" : "already_responded", modality: r.modality });
        return null;
      }
      const trial = current.trial;
      const posIndex = trial.positions.indexOf(r.option);
      if (posIndex < 0) throw new Error(`La alternativa ${r.option} no se presenta en este ensayo`);
      // Ensayo forzado (motor 0.4.0): solo cuenta la alternativa disponible. Un clic en una
      // alternativa bloqueada se registra como entrada ignorada y el ensayo sigue abierto.
      if (trial.forced_option && r.option !== trial.forced_option) {
        log.appendAt("input_ignored", r.tAbs, { option: r.option, reason: "option_locked", forced_option: trial.forced_option, modality: r.modality, trial_index_global: trial.trial_index_global });
        return null;
      }
      current.responded = true;
      const responseId = idFactory();
      const isSwitch = lastOption === null ? null : lastOption !== r.option;
      log.appendAt("response", r.tAbs, {
        response_id: responseId,
        phase_id: trial.phase_id, block_index: trial.block_index, trial_index_global: trial.trial_index_global,
        option: r.option,
        position_index: posIndex + 1,
        position_label: positionLabel(posIndex, trial.positions.length),
        modality: r.modality,
        latency_ms: current.onsetAbs == null ? null : round3(r.tAbs - current.onsetAbs),
        pointerdown_latency_ms: current.onsetAbs == null || r.pointerdownAbs == null ? null : round3(r.pointerdownAbs - current.onsetAbs),
        previous_option: lastOption,
        is_switch: isSwitch,
        instruction_id: instruction,
        ...(trial.forced_option ? { forced_option: trial.forced_option } : {}),
        ...rep(),
      });
      lastOption = r.option;

      const earned = [];
      for (const k of contingencies) {
        if (k.option !== r.option || !activeIn(k, trial.phase_id)) continue;
        const ev = k.evaluate(r.tAbs);
        log.appendAt("contingency_evaluated", r.tAbs, { response_id: responseId, contingency_id: k.id, option: k.option, ...ev });
        if (ev.earned) earned.push(ledger.earn({ contingency: k, source_response_id: responseId, context: context(), tAbs: r.tAbs }));
      }
      return {
        response_id: responseId,
        earned,
        delivered_now: earned.filter((c) => c.state === "delivered"),
        balances: { ...ledger.balances },
      };
    },

    /** Fin de la ventana de respuesta sin respuesta. */
    registerOmission(tAbs) {
      if (!current || current.responded) return;
      current.omitted = true;
      log.appendAt("omission", tAbs, { trial_index_global: current.trial.trial_index_global, phase_id: current.trial.phase_id, block_index: current.trial.block_index });
    },

    markFeedback(kind, tAbs, extra = {}) {
      log.appendAt(kind === "on" ? "feedback_onset" : "feedback_offset", tAbs, { trial_index_global: current?.trial.trial_index_global ?? null, ...extra });
    },

    endTrial() {
      if (!current) return [];
      const delivered = ledger.flush("end_of_trial", context(), clock.now());
      log.append("trial_end", {
        trial_index_global: current.trial.trial_index_global,
        responded: current.responded, omitted: current.omitted,
        balance_available: ledger.balances.available, balance_pending: ledger.balances.pending,
      });
      current = null;
      ctx.trial_index_global = null;
      return delivered;
    },

    endBlock() {
      const delivered = ledger.flush("end_of_block", context(), clock.now());
      const total = round3(delivered.reduce((s, c) => s + c.signed_value, 0));
      log.append("block_end", {
        phase_id: ctx.phase_id, block_index: ctx.block_index, block_index_global: ctx.block_index_global,
        delivered_at_block_end: delivered.map((c) => c.consequence_id), delivered_value: total,
        balance_available: ledger.balances.available, balance_pending: ledger.balances.pending, ...rep(),
      });
      return { delivered, total };
    },

    endPhase() {
      const delivered = ledger.flush("end_of_phase", context(), clock.now());
      log.append("phase_end", { phase_id: ctx.phase_id, delivered_value: round3(delivered.reduce((s, c) => s + c.signed_value, 0)) });
      return delivered;
    },

    /** Entrega las consecuencias con demora en segundos ya vencida. */
    tick() { return ledger.tick(context(), clock.now()); },

    /** Instrucción presentada: queda como «vigente» en las respuestas siguientes. */
    setInstruction(id, details = {}) {
      instruction = id;
      return log.append("instruction_presented", { instruction_id: id, ...details });
    },

    /** Pérdida de foco, cambio de visibilidad, error... Solo se registra: no pausa nada. */
    incident(kind, details = {}) {
      return log.append("incident", { incident: kind, trial_index_global: current?.trial.trial_index_global ?? null, ...details });
    },

    /**
     * Cierre. "completed": entrega las de modo end_of_session. Cualquier otro motivo
     * (abandono, error) deja las pendientes como pendientes.
     */
    finish(reason) {
      if (finished) return;
      if (!started) { finished = true; return; } // nada que cerrar: el registro no había empezado
      let delivered = [];
      if (reason === "completed") delivered = ledger.flush("end_of_session", context(), clock.now());
      const pend = ledger.pending();
      log.append("session_end", {
        reason,
        delivered_at_session_end: delivered.map((c) => c.consequence_id),
        pending_ids: pend.map((c) => c.consequence_id),
        pending_value: round3(pend.reduce((s, c) => s + c.signed_value, 0)),
        balance_available: ledger.balances.available, balance_pending: ledger.balances.pending,
        session_wall_end: new Date().toISOString(),
      });
      finished = true;
    },
  };
  return session;
}

export function positionLabel(i, n) {
  if (n === 2) return ["left", "right"][i];
  if (n === 3) return ["left", "center", "right"][i];
  return `pos${i + 1}`;
}
