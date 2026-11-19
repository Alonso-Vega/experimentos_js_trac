// RG-01 · Archivo 1 («datos de la tarea»), tal como lo pidió el investigador.
// Sin nombre ni contacto. Tipos de fila (row_type):
//   trial          un ensayo (libre o forzado: trial_type)
//   verbal_report  un informe verbal (VR1–VR3; VR0 = tras la exposición forzada del Grupo 2)
//   block_summary  resumen de cada bloque experimental (15): elecciones de cada figura y
//                  puntos al terminar el bloque (después del largo plazo). v0.4
// Los datos demográficos y el tiempo de lectura de la regla van en columnas fijas en todas
// las filas. Se calcula a partir del registro bruto, así que también funciona con sesiones
// recuperadas. El diccionario de estas columnas está en protocolo.md, apartado «Archivo 1».

import { deriveTables } from "./motor/datos/derive.js";
import { toCSV } from "./motor/datos/csv.js";

const DEMOGRAPHIC_FIELDS = [
  "age", "gender", "gender_otro", "education", "country_of_origin", "first_language", "macarthur_ladder",
  "employment", "handedness", "normal_or_corrected_vision", "colour_vision_difficulty", "previous_psych_experiments", "comments",
];
const STIMULI = ["S1", "S2", "S3"];

// Columnas en orden. Todas las filas las tienen todas (vacías si no aplican).
const COLUMNS = [
  "row_type",
  "participant_code", "group", "language", "study_id", "study_version", "engine_version", "config_hash", "session_id", "is_test",
  "phase", "phase_id", "block_in_phase", "block_global", "trial_in_block", "trial_global",
  "trial_type", "forced_stimulus", "repetition", "forced_trial_number",
  "position_S1", "position_S2", "position_S3",
  "chosen_stimulus", "chosen_shape", "chosen_position", "rt_ms",
  "points_short_term", "total_points_after_trial",
  "lp_stimulus", "lp_choices_in_block", "lp_points_in_block", "total_points_after_lp",
  "n_choices_S1", "n_choices_S2", "n_choices_S3", "total_points_end_of_block",
  "instruction_in_effect", "rule_reading_time_ms",
  ...DEMOGRAPHIC_FIELDS,
  "vr_number", "vr_text",
];

export default function exportar({ events, config }) {
  const t = deriveTables(events);
  const start = events.find((e) => e.type === "session_start");
  // v0.5: el nombre de la figura (chosen_shape) va siempre en español, aunque la sesión sea en
  // inglés, para que los datos de los dos idiomas sean comparables. El idioma de la sesión
  // está en la columna «language».
  const SHAPE_LANG = "es";
  const demo = events.find((e) => e.type === "form_submitted" && e.form_id === "demograficos")?.values ?? {};
  const rule = t.pantallas.find((p) => p.screen_id === "regla");
  // Fases experimentales numeradas 1–3; la exposición forzada (fase con «forced») es la fase 0.
  const forcedPhases = new Set(config.phases.filter((p) => Array.isArray(p.forced)).map((p) => p.id));
  const freePhases = config.phases.filter((p) => !forcedPhases.has(p.id)).map((p) => p.id);
  const phaseNumber = (id) => (forcedPhases.has(id) ? 0 : freePhases.indexOf(id) + 1);
  const trialsPerBlock = Object.fromEntries(config.phases.map((p) => [p.id, p.trials_per_block]));
  // Estímulo de largo plazo de cada fase: el que tiene una contingencia end_of_block en ella.
  const lpStimulus = {};
  for (const k of config.contingencies) {
    if (k.delay.mode === "end_of_block") for (const ph of k.phases ?? config.phases.map((p) => p.id)) lpStimulus[ph] = k.option;
  }

  const common = {
    participant_code: start.participant_id,
    group: start.condition,
    language: start.language,
    study_id: start.study_id,
    study_version: start.study_version,
    engine_version: start.engine_version,
    config_hash: start.config_hash,
    session_id: start.session_id,
    is_test: start.is_test,
  };
  const fixed = { rule_reading_time_ms: rule?.reading_time_ms ?? null };
  for (const f of DEMOGRAPHIC_FIELDS) fixed[f] = demo[f] ?? null;

  const positionOf = (tr, stim) => {
    if (tr.option_left === stim) return "left";
    if (tr.option_center === stim) return "center";
    if (tr.option_right === stim) return "right";
    return null;
  };
  // Cada bloque ejecutado tiene un block_index_global único (también en las repeticiones).
  const blockOf = (tr) => t.bloques.find((b) => b.block_index_global === tr.block_index_global)
    ?? t.bloques.find((b) => b.phase_id === tr.phase_id && b.block_index === tr.block_index);

  const rows = [];
  for (const tr of t.ensayos) {
    const blk = blockOf(tr);
    const forced = tr.trial_kind === "forced";
    const isLast = tr.trial_index_block === trialsPerBlock[tr.phase_id];
    const lp = lpStimulus[tr.phase_id] ?? null;
    rows.push({
      row_type: "trial",
      ...common,
      phase: phaseNumber(tr.phase_id),
      phase_id: tr.phase_id,
      block_in_phase: tr.block_index,
      block_global: forced ? null : blk?.block_index_global ?? null,   // 1–15 solo en los bloques experimentales
      trial_in_block: tr.trial_index_block,
      trial_global: forced ? null : tr.trial_index_global,              // 1–180 solo en los ensayos experimentales
      trial_type: tr.trial_kind,
      forced_stimulus: tr.forced_option,
      repetition: tr.repetition,
      forced_trial_number: forced ? (tr.block_index - 1) * trialsPerBlock[tr.phase_id] + tr.trial_index_block : null, // 1–24 en cada repetición
      position_S1: positionOf(tr, "S1"),
      position_S2: positionOf(tr, "S2"),
      position_S3: positionOf(tr, "S3"),
      chosen_stimulus: tr.response_option,
      chosen_shape: tr.response_option ? config.options[tr.response_option].label[SHAPE_LANG] : null,
      chosen_position: tr.response_position,
      rt_ms: tr.latency_ms,
      points_short_term: tr.response_option ? tr.value_delivered_immediately : null,
      total_points_after_trial: tr.balance_available_after,
      lp_stimulus: isLast ? lp : null,
      lp_choices_in_block: isLast && lp ? blk?.[`n_choice_${lp}`] ?? null : null,
      lp_points_in_block: isLast ? blk?.value_delivered_at_block_end ?? null : null,
      total_points_after_lp: isLast ? blk?.balance_available_end ?? null : null,
      instruction_in_effect: tr.instruction_id,
      ...fixed,
    });
  }

  for (const e of events) {
    if (e.type !== "form_submitted" || e.form_id !== "informe_verbal") continue;
    const digits = String(e.form_instance).replace(/\D/g, "");
    const n = digits === "" ? null : Number(digits);   // VR0 = 0 (exposición forzada)
    rows.push({
      row_type: "verbal_report",
      ...common,
      phase: n,
      repetition: e.repetition ?? null,
      ...fixed,
      vr_number: n,
      vr_text: e.values.response,
    });
  }

  // Resumen por bloque experimental (no incluye los bloques de la exposición forzada).
  for (const b of t.bloques) {
    if (b.block_kind === "forced") continue;
    rows.push({
      row_type: "block_summary",
      ...common,
      phase: phaseNumber(b.phase_id),
      phase_id: b.phase_id,
      block_in_phase: b.block_index,
      block_global: b.block_index_global,
      trial_type: "free",
      ...Object.fromEntries(STIMULI.map((s) => [`n_choices_${s}`, b[`n_choice_${s}`] ?? 0])),
      total_points_end_of_block: b.balance_available_end,   // incluye el largo plazo del bloque
      ...fixed,
    });
  }

  const now = new Date();
  const p = (x) => String(x).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  const code = String(start.participant_id ?? "sin_codigo").replace(/[^A-Za-z0-9_-]/g, "_");
  return [{
    filename: `${start.is_test ? "PRUEBA_" : ""}${start.study_id}_${code}_${stamp}_tarea.csv`,
    content: toCSV(rows, COLUMNS),
    label: "Archivo 1: datos de la tarea (sin nombre ni contacto)",
  }];
}
