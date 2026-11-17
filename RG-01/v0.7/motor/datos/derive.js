// Tablas derivadas del registro bruto de eventos: sesiones, bloques, ensayos,
// consecuencias y eventos. Solo usan los eventos, de modo que una sesión recuperada del
// almacenamiento local se reconstruye igual que una terminada.

export function deriveTables(events, { localSaveStatus = null } = {}) {
  const start = events.find((e) => e.type === "session_start");
  if (!start) throw new Error("El registro no contiene session_start");
  const end = events.find((e) => e.type === "session_end") ?? null;
  const optionIds = Object.keys(start.config.options);
  const base = { session_id: start.session_id, participant_id: start.participant_id };

  // ---------- consecuencias ----------
  const consMap = new Map();
  for (const e of events) {
    if (e.type === "consequence_earned") {
      consMap.set(e.consequence_id, {
        ...base,
        consequence_id: e.consequence_id,
        contingency_id: e.contingency_id,
        option: e.option,
        source_response_id: e.source_response_id,
        origin_phase_id: e.phase_id,
        origin_block_index: e.block_index,
        origin_trial_index_global: e.trial_index_global,
        outcome_type: e.outcome_type,
        magnitude: e.magnitude,
        unit: e.unit,
        signed_value: e.signed_value,
        delay_mode: e.delay_mode,
        delay_seconds: e.delay_seconds,
        t_earned_ms: e.t_ms,
        state_final: "earned",
        t_delivered_ms: null,
        delivery_trigger: null,
        delivery_block_index: null,
        delivery_trial_index_global: null,
        wait_ms: null,
      });
    } else if (e.type === "consequence_pending") {
      const c = consMap.get(e.consequence_id); if (c) c.state_final = "pending";
    } else if (e.type === "consequence_delivered") {
      const c = consMap.get(e.consequence_id);
      if (c) {
        c.state_final = "delivered";
        c.t_delivered_ms = e.t_ms;
        c.delivery_trigger = e.delivery_trigger;
        c.delivery_block_index = e.block_index;
        c.delivery_trial_index_global = e.trial_index_global;
        c.wait_ms = round3(e.t_ms - c.t_earned_ms);
      }
    }
  }
  const consequences = [...consMap.values()];

  // ---------- ensayos ----------
  const trials = [];
  const trialByIndex = new Map();
  for (const e of events) {
    if (e.type === "trial_start") {
      const t = {
        ...base,
        phase_id: e.phase_id,
        block_index: e.block_index,
        block_index_global: e.block_index_global ?? null, // en el ensayo desde el motor 0.4.0
        trial_index_block: e.trial_index_block,
        trial_index_global: e.trial_index_global,
        trial_kind: e.trial_kind ?? "free",
        forced_option: e.forced_option ?? null,
        repetition: e.repetition ?? null,
        positions: e.positions.join("|"),
        option_left: e.positions.length <= 3 ? e.positions[0] : null,
        option_center: e.positions.length === 3 ? e.positions[1] : null,
        option_right: e.positions.length <= 3 ? e.positions[e.positions.length - 1] : null,
        response_window_ms: e.response_window_ms,
        trial_start_ms: e.t_ms,
        stimulus_onset_ms: null,
        response_id: null,
        response_option: null,
        response_position: null,
        response_ms: null,
        latency_ms: null,
        pointerdown_latency_ms: null,
        input_modality: null,
        is_switch: null,
        instruction_id: null,
        omitted: false,
        n_input_ignored: 0,
        contingencies_earned: "",
        value_delivered_immediately: 0,
        value_pending_created: 0,
        feedback_onset_ms: null,
        feedback_offset_ms: null,
        feedback_scheduled_ms: null,
        feedback_actual_ms: null,
        trial_end_ms: null,
        balance_available_after: null,
        balance_pending_after: null,
        n_incidents: 0,
        completed: false,
      };
      trials.push(t);
      trialByIndex.set(e.trial_index_global, t);
    }
  }
  let currentTrial = null;
  for (const e of events) {
    if (e.type === "trial_start") currentTrial = trialByIndex.get(e.trial_index_global);
    const t = e.trial_index_global != null ? trialByIndex.get(e.trial_index_global) : null;
    switch (e.type) {
      case "stimulus_onset": if (t) t.stimulus_onset_ms = e.t_ms; break;
      case "response":
        if (t) Object.assign(t, {
          response_id: e.response_id, response_option: e.option, response_position: e.position_label,
          response_ms: e.t_ms, latency_ms: e.latency_ms, pointerdown_latency_ms: e.pointerdown_latency_ms,
          input_modality: e.modality, is_switch: e.is_switch, instruction_id: e.instruction_id ?? null,
        });
        break;
      case "omission": if (t) t.omitted = true; break;
      case "input_ignored": if (currentTrial) currentTrial.n_input_ignored++; break;
      case "consequence_earned": {
        const tr = trialByIndex.get(e.trial_index_global);
        if (tr) {
          tr.contingencies_earned = tr.contingencies_earned ? `${tr.contingencies_earned}|${e.contingency_id}` : e.contingency_id;
          if (e.delay_mode !== "immediate") tr.value_pending_created = round3(tr.value_pending_created + e.signed_value);
        }
        break;
      }
      case "consequence_delivered":
        if (e.delivery_trigger === "immediate" && t) t.value_delivered_immediately = round3(t.value_delivered_immediately + e.signed_value);
        break;
      case "feedback_onset": if (t) { t.feedback_onset_ms = e.t_ms; t.feedback_scheduled_ms = e.scheduled_ms ?? null; } break;
      case "feedback_offset": if (t) { t.feedback_offset_ms = e.t_ms; if (t.feedback_onset_ms != null) t.feedback_actual_ms = round3(e.t_ms - t.feedback_onset_ms); } break;
      case "incident": if (t) t.n_incidents++; break;
      case "trial_end":
        if (t) Object.assign(t, { trial_end_ms: e.t_ms, balance_available_after: e.balance_available, balance_pending_after: e.balance_pending, completed: true });
        currentTrial = null;
        break;
    }
  }

  // ---------- bloques ----------
  const blocks = [];
  // Desde el motor 0.4.0 cada bloque ejecutado tiene un block_index_global único (también
  // en las repeticiones) y los ensayos lo llevan: se empareja por él. Con datos anteriores
  // (sin block_index_global en los ensayos) se empareja por fase y bloque, como antes.
  const trialsCarryBlock = trials.some((t) => t.block_index_global != null);
  for (const e of events) {
    if (e.type !== "block_start") continue;
    const bt = trialsCarryBlock
      ? trials.filter((t) => t.block_index_global === e.block_index_global)
      : trials.filter((t) => t.phase_id === e.phase_id && t.block_index === e.block_index);
    const resp = bt.filter((t) => t.response_option != null);
    const endEv = events.find((x) => x.type === "block_end" && x.block_index_global === e.block_index_global);
    const lats = resp.map((t) => t.latency_ms).filter((x) => x != null);
    const row = {
      ...base,
      phase_id: e.phase_id,
      block_index: e.block_index,
      block_index_global: e.block_index_global,
      block_kind: e.block_kind ?? "free",
      repetition: e.repetition ?? null,
      block_start_ms: e.t_ms,
      block_end_ms: endEv?.t_ms ?? null,
      n_trials: bt.length,
      n_responses: resp.length,
      n_omissions: bt.filter((t) => t.omitted).length,
    };
    for (const o of optionIds) {
      const n = resp.filter((t) => t.response_option === o).length;
      row[`n_choice_${o}`] = n;
      row[`prop_choice_${o}`] = resp.length ? round6(n / resp.length) : null;
    }
    // Cambios de alternativa dentro del bloque (el primero del bloque no cuenta).
    let switches = 0;
    for (let i = 1; i < resp.length; i++) if (resp[i].response_option !== resp[i - 1].response_option) switches++;
    row.n_switches_within_block = switches;
    row.latency_mean_ms = lats.length ? round3(lats.reduce((s, x) => s + x, 0) / lats.length) : null;
    row.latency_median_ms = lats.length ? round3(median(lats)) : null;
    row.value_delivered_immediately = round3(bt.reduce((s, t) => s + t.value_delivered_immediately, 0));
    row.value_delivered_at_block_end = endEv ? endEv.delivered_value : null;
    row.balance_available_end = endEv ? endEv.balance_available : null;
    row.balance_pending_end = endEv ? endEv.balance_pending : null;
    row.completed = Boolean(endEv);
    blocks.push(row);
  }

  // ---------- sesión ----------
  const env = start.environment ?? {};
  const count = (type) => events.filter((e) => e.type === type).length;
  const incidents = events.filter((e) => e.type === "incident");
  const last = events.at(-1);
  const respAll = trials.filter((t) => t.response_option != null);
  const session = {
    ...base,
    study_id: start.study_id,
    study_version: start.study_version,
    engine_version: start.engine_version,
    config_hash: start.config_hash,
    condition: start.condition,
    is_test: start.is_test,
    language: start.language,
    seed: start.seed,
    session_wall_start: start.session_wall_start,
    session_wall_end: end?.session_wall_end ?? null,
    end_reason: end?.reason ?? "no_registrado",
    duration_ms: last.t_ms,
    n_trials_planned: start.n_trials_planned,
    n_forced_trials_planned: start.n_forced_trials_planned ?? 0,
    n_trials_completed: count("trial_end"),
    n_responses: respAll.length,
    n_omissions: count("omission"),
    n_input_ignored: count("input_ignored"),
  };
  for (const o of optionIds) session[`n_choice_${o}`] = respAll.filter((t) => t.response_option === o).length;
  Object.assign(session, {
    balance_available_final: end?.balance_available ?? lastBalance(events, "balance_available"),
    balance_pending_final: end?.balance_pending ?? lastBalance(events, "balance_pending"),
    n_balance_resets: count("balance_reset"),
    n_incidents: incidents.length,
    n_visibility_hidden: incidents.filter((e) => e.incident === "visibility_hidden").length,
    n_window_blur: incidents.filter((e) => e.incident === "window_blur").length,
    n_errors: incidents.filter((e) => e.incident === "error").length,
    jspsych_version: env.jspsych_version ?? null,
    browser_name: env.browser_name ?? null,
    browser_version: env.browser_version ?? null,
    os: env.os ?? null,
    user_agent: env.user_agent ?? null,
    screen_width: env.screen_width ?? null,
    screen_height: env.screen_height ?? null,
    viewport_width: env.viewport_width ?? null,
    viewport_height: env.viewport_height ?? null,
    device_pixel_ratio: env.device_pixel_ratio ?? null,
    max_touch_points: env.max_touch_points ?? null,
    timezone: env.timezone ?? null,
    local_save_status: localSaveStatus,
  });

  // ---------- pantallas (instrucciones, regla, cuenta atrás...) ----------
  const screens = [];
  for (const e of events) {
    if (e.type === "screen_onset") {
      screens.push({ ...base, screen_id: e.screen_id, onset_ms: e.t_ms, advance_ms: null, reading_time_ms: null, advance_method: null });
    } else if (e.type === "screen_continue") {
      const sc = [...screens].reverse().find((x) => x.screen_id === e.screen_id && x.advance_ms === null);
      if (sc) Object.assign(sc, { advance_ms: e.t_ms, reading_time_ms: e.latency_ms, advance_method: e.method ?? "button" });
    }
  }

  // ---------- formularios (una fila por campo) ----------
  const forms = [];
  for (const e of events) {
    if (e.type !== "form_submitted") continue;
    for (const [field, v] of Object.entries(e.values ?? {})) {
      forms.push({
        ...base, form_id: e.form_id, form_instance: e.form_instance ?? e.form_id, repetition: e.repetition ?? null, field_id: field,
        value: v && typeof v === "object" ? v.value ?? null : v,
        other_text: v && typeof v === "object" ? v.other ?? null : null,
        submitted_ms: e.t_ms, form_time_ms: e.form_time_ms ?? null,
      });
    }
  }

  // ---------- eventos (planos) ----------
  const COMMON = ["phase_id", "block_index", "trial_index_global", "option", "response_id", "consequence_id", "contingency_id"];
  const SKIP = new Set(["seq", "event_id", "session_id", "type", "t_ms", "wall_time", ...COMMON, "config", "effective_config"]);
  const flat = events.map((e) => {
    const row = { seq: e.seq, event_id: e.event_id, session_id: e.session_id, type: e.type, t_ms: e.t_ms, wall_time: e.wall_time };
    for (const k of COMMON) row[k] = e[k] ?? null;
    const details = {};
    for (const [k, v] of Object.entries(e)) if (!SKIP.has(k)) details[k] = v;
    row.details_json = Object.keys(details).length ? JSON.stringify(details) : null;
    return row;
  });

  return { sesiones: [session], bloques: blocks, ensayos: trials, consecuencias: consequences, pantallas: screens, formularios: forms, eventos: flat };
}

function lastBalance(events, key) {
  for (let i = events.length - 1; i >= 0; i--) if (events[i][key] != null) return events[i][key];
  return 0;
}
function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function round3(x) { return Math.round(x * 1000) / 1000; }
function round6(x) { return Math.round(x * 1e6) / 1e6; }
