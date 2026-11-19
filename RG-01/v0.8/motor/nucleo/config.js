// Validación de la configuración de un estudio y modo de prueba.
// Una configuración no válida impide iniciar la sesión: los errores se muestran en
// pantalla en lenguaje llano.

import { CONFIG_SCHEMA_VERSION } from "../version.js";
import { SCHEDULE_TYPES } from "./schedules.js";
import { DELAY_MODES } from "./consequences.js";

export const POSITION_METHODS = ["random_per_trial", "balanced_per_block", "all_permutations_balanced", "fixed"];
export const RESET_POLICIES = ["never", "block", "phase"];
export const FLOW_STEPS = ["form", "countdown", "screen", "speech", "phase", "repeat", "reset_balance", "end"];
// Pasos admitidos dentro de un tramo repetible (motor 0.4.0).
export const REPEAT_INNER_STEPS = ["form", "countdown", "screen", "phase", "reset_balance"];
export const FIELD_TYPES = ["text", "number", "radio", "checkbox", "textarea", "scale"];
export const BASE_TEXTS = [
  "continue_button", "balance_label", "pending_label",
  "feedback_gain", "feedback_loss", "feedback_none", "unit_point", "unit_points", "end_html",
];
// Textos que necesita el flujo por defecto (sin «flow»): instrucciones -> fases -> final.
export const DEFAULT_FLOW_TEXTS = ["instructions_html", "start_button"];

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const isInt = (x, min = -Infinity) => Number.isInteger(x) && x >= min;
const isNum = (x, min = -Infinity) => typeof x === "number" && Number.isFinite(x) && x >= min;
const LANGS = ["es", "en"];
const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));

export function validateConfig(c) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!isObj(c)) return ["La configuración no es un objeto."];
  const neededTexts = new Set(BASE_TEXTS);

  if (c.schema_version !== CONFIG_SCHEMA_VERSION) err(`schema_version debe ser ${CONFIG_SCHEMA_VERSION} (es ${c.schema_version}).`);
  if (!isObj(c.study)) err("Falta el apartado study.");
  else {
    if (!/^[A-Z]{2,5}-\d{2,3}$/.test(c.study.id ?? "")) err(`study.id «${c.study.id}» debe tener la forma ABC-01.`);
    if (!/^\d+\.\d+$/.test(c.study.version ?? "")) err(`study.version «${c.study.version}» debe tener la forma 1.0.`);
  }
  if (!LANGS.includes(c.language)) err(`language debe ser "es" o "en" (es «${c.language}»).`);
  // Motor 0.5.0: idiomas entre los que elige el investigador (el primero seleccionado es «language»).
  if (c.languages_available !== undefined) {
    const la = c.languages_available;
    if (!Array.isArray(la) || la.length === 0 || la.some((l) => !LANGS.includes(l)) || new Set(la).size !== la.length) err('languages_available debe listar idiomas distintos entre "es" y "en".');
    else if (!la.includes(c.language)) err(`languages_available debe incluir language («${c.language}»).`);
  }
  if (!(c.seed === "auto" || (typeof c.seed === "string" && c.seed.length > 0))) err('seed debe ser "auto" o un texto.');

  if (!isObj(c.participant)) err("Falta el apartado participant.");
  else {
    try { new RegExp(c.participant.id_pattern); } catch { err("participant.id_pattern no es una expresión regular válida."); }
    if (c.participant.id_source !== undefined && !["setup", "form"].includes(c.participant.id_source)) err('participant.id_source debe ser "setup" (lo escribe el investigador) o "form" (lo escribe el participante).');
  }

  if (c.group !== undefined) {
    if (!isObj(c.group) || !Array.isArray(c.group.available) || c.group.available.length === 0) err("group.available debe listar al menos un grupo.");
    else if (!c.group.available.includes(c.group.value)) err(`group.value «${c.group.value}» no está en group.available.`);
  }

  // ---- alternativas ----
  const optionIds = isObj(c.options) ? Object.keys(c.options) : [];
  if (optionIds.length < 2) err("options debe definir al menos dos alternativas.");
  for (const id of optionIds) {
    if (!/^[A-Za-z0-9_]+$/.test(id)) err(`Identificador de alternativa no válido: «${id}».`);
    for (const lang of LANGS) if (typeof c.options[id]?.label?.[lang] !== "string") err(`Falta options.${id}.label.${lang}.`);
    const st = c.options[id]?.stimulus;
    if (st !== undefined && !(isObj(st) && typeof st.svg === "string" && /^\s*<svg[\s>]/.test(st.svg))) err(`options.${id}.stimulus.svg debe ser un dibujo SVG que empiece por <svg.`);
  }

  // ---- fases (antes que contingencias, para validar contingency.phases) ----
  const phaseIds = [];
  if (!Array.isArray(c.phases) || c.phases.length === 0) err("phases debe ser una lista con al menos una fase.");
  else {
    c.phases.forEach((p, i) => {
      const where = `phases[${i}] (${p?.id ?? "sin id"})`;
      if (!/^[A-Za-z0-9_]+$/.test(p?.id ?? "")) err(`${where}: id no válido.`);
      if (phaseIds.includes(p?.id)) err(`${where}: id repetido.`);
      phaseIds.push(p?.id);
      if (!isInt(p?.blocks, 1)) err(`${where}: blocks debe ser un entero ≥ 1.`);
      if (!isInt(p?.trials_per_block, 1)) err(`${where}: trials_per_block debe ser un entero ≥ 1.`);
      const opts = p?.options ?? optionIds;
      if (!Array.isArray(opts) || opts.length < 2 || opts.some((o) => !optionIds.includes(o))) err(`${where}: options debe listar al menos dos alternativas existentes.`);
      if (!POSITION_METHODS.includes(p?.positions)) err(`${where}: positions debe ser uno de ${POSITION_METHODS.join(", ")}.`);
      if (p?.positions === "balanced_per_block") {
        if (Array.isArray(opts) && opts.length !== 2) err(`${where}: balanced_per_block solo admite dos alternativas.`);
        if (isInt(p?.trials_per_block) && p.trials_per_block % 2 !== 0) err(`${where}: balanced_per_block exige un número par de ensayos por bloque.`);
      }
      if (p?.positions === "all_permutations_balanced" && Array.isArray(opts) && isInt(p?.trials_per_block)) {
        const k = factorial(opts.length);
        if (p.trials_per_block % k !== 0) err(`${where}: all_permutations_balanced exige que los ensayos por bloque sean múltiplo de ${k} (permutaciones de ${opts.length} alternativas).`);
      }
      const t = p?.trial;
      if (!isObj(t)) err(`${where}: falta trial.`);
      else {
        if (!isInt(t.feedback_ms, 0)) err(`${where}: trial.feedback_ms debe ser un entero ≥ 0.`);
        if (!isInt(t.iti_ms, 0)) err(`${where}: trial.iti_ms debe ser un entero ≥ 0.`);
        if (!(t.response_window_ms === null || isInt(t.response_window_ms, 1))) err(`${where}: trial.response_window_ms debe ser null (sin límite) o un entero > 0.`);
        if (typeof t.hide_options_during_feedback !== "boolean") err(`${where}: trial.hide_options_during_feedback debe ser true o false.`);
        if (t.iti_display !== undefined && !["blank", "fixation"].includes(t.iti_display)) err(`${where}: trial.iti_display debe ser "blank" o "fixation".`);
      }
      if (typeof p?.block_end_screen !== "boolean") err(`${where}: block_end_screen debe ser true o false.`);
      if (p?.block_end_screen) neededTexts.add("block_end_html");
      if (p?.block_end_feedback !== undefined) {
        const f = p.block_end_feedback;
        if (p.block_end_screen) err(`${where}: no se pueden usar a la vez block_end_screen y block_end_feedback.`);
        if (!isObj(f) || !isInt(f.duration_ms, 1) || typeof f.show_zero !== "boolean") err(`${where}: block_end_feedback necesita duration_ms (entero > 0) y show_zero (true o false).`);
        neededTexts.add("block_end_feedback");
      }
      // Ensayos forzados (motor 0.4.0): forced[b][t] = única alternativa disponible en el
      // ensayo t del bloque b. Las demás se presentan bloqueadas.
      if (p?.forced !== undefined) {
        const f = p.forced;
        if (!Array.isArray(f) || (isInt(p?.blocks) && f.length !== p.blocks)) err(`${where}: forced debe ser una lista con una entrada por bloque (${p?.blocks}).`);
        else f.forEach((blk, b) => {
          if (!Array.isArray(blk) || (isInt(p?.trials_per_block) && blk.length !== p.trials_per_block)) err(`${where}: forced[${b}] debe listar una alternativa por ensayo (${p?.trials_per_block}).`);
          else blk.forEach((o, t) => { if (!Array.isArray(opts) || !opts.includes(o)) err(`${where}: forced[${b}][${t}] «${o}» no es una alternativa de esta fase.`); });
        });
      }
    });
  }

  // ---- contingencias ----
  if (!Array.isArray(c.contingencies)) err("contingencies debe ser una lista.");
  else {
    const seen = new Set();
    c.contingencies.forEach((k, i) => {
      const where = `contingencies[${i}] (${k?.id ?? "sin id"})`;
      if (!/^[A-Za-z0-9_]+$/.test(k?.id ?? "")) err(`${where}: id no válido.`);
      if (seen.has(k?.id)) err(`${where}: id repetido.`);
      seen.add(k?.id);
      if (!optionIds.includes(k?.option)) err(`${where}: la alternativa «${k?.option}» no existe.`);
      if (k?.phases !== undefined && (!Array.isArray(k.phases) || k.phases.length === 0 || k.phases.some((ph) => !phaseIds.includes(ph)))) err(`${where}: phases debe listar fases existentes.`);
      validateSchedule(k?.schedule, where, err);
      if (!isNum(k?.probability, 0) || k.probability > 1) err(`${where}: probability debe estar entre 0 y 1.`);
      if (!["gain", "loss"].includes(k?.outcome?.type)) err(`${where}: outcome.type debe ser "gain" o "loss".`);
      if (!isNum(k?.outcome?.magnitude, 0)) err(`${where}: outcome.magnitude debe ser un número ≥ 0.`);
      if (k?.outcome?.unit !== "points") err(`${where}: outcome.unit solo admite "points" en esta versión.`);
      if (!DELAY_MODES.includes(k?.delay?.mode)) err(`${where}: delay.mode debe ser uno de ${DELAY_MODES.join(", ")}.`);
      if (k?.delay?.mode === "seconds" && !isNum(k.delay.seconds, 0.001)) err(`${where}: delay.seconds debe ser > 0.`);
      if (!RESET_POLICIES.includes(k?.reset_on)) err(`${where}: reset_on debe ser uno de ${RESET_POLICIES.join(", ")}.`);
    });
  }

  if (!isObj(c.display) || typeof c.display.show_balance !== "boolean" || typeof c.display.show_pending !== "boolean") {
    err("display debe indicar show_balance y show_pending (true o false).");
  } else if (c.display.feedback_colored !== undefined && typeof c.display.feedback_colored !== "boolean") {
    err("display.feedback_colored debe ser true o false.");
  }
  if (c.session_end?.pending_policy !== "keep_pending_and_record") err('session_end.pending_policy solo admite "keep_pending_and_record" en esta versión.');
  if (c.incidents?.visibility_policy !== "record_only") err('incidents.visibility_policy solo admite "record_only" en esta versión.');
  if (c.data !== undefined && (!isObj(c.data) || typeof c.data.auto_download !== "boolean")) err("data.auto_download debe ser true o false.");
  // Gráfico de elecciones por bloque en el .xlsx (motor 0.7.0).
  if (isObj(c.data) && c.data.choice_chart !== undefined) {
    const cc = c.data.choice_chart;
    const MARKERS = ["circle", "triangle", "square", "diamond", "x", "star", "plus", "dash", "dot"];
    if (!isObj(cc)) err("data.choice_chart debe ser un objeto.");
    else {
      if (cc.phase_labels !== undefined && (!isObj(cc.phase_labels) || Object.entries(cc.phase_labels).some(([k, v]) => !phaseIds.includes(k) || typeof v !== "string"))) err("data.choice_chart.phase_labels debe asignar un texto a fases existentes.");
      if (cc.markers !== undefined && (!isObj(cc.markers) || Object.entries(cc.markers).some(([k, v]) => !optionIds.includes(k) || !MARKERS.includes(v)))) err(`data.choice_chart.markers debe asignar a alternativas existentes una de estas formas: ${MARKERS.join(", ")}.`);
      for (const k of ["title", "x_title", "y_title"]) if (cc[k] !== undefined && typeof cc[k] !== "string") err(`data.choice_chart.${k} debe ser un texto.`);
    }
  }
  // Envío a DataPipe (motor 0.6.0): experimento de PRUEBAS (borradores y modo prueba) y REAL
  // (solo sesiones reales de una versión congelada).
  if (isObj(c.data) && c.data.datapipe !== undefined) {
    const dp = c.data.datapipe;
    const ID = /^[A-Za-z0-9_-]{4,64}$/;
    if (!isObj(dp)) err("data.datapipe debe ser un objeto.");
    else {
      if (!ID.test(dp.experiment_id_test ?? "")) err("data.datapipe.experiment_id_test debe ser el identificador del experimento de PRUEBAS en DataPipe.");
      if (dp.experiment_id_real !== undefined && !ID.test(dp.experiment_id_real ?? "")) err("data.datapipe.experiment_id_real no es un identificador de DataPipe válido.");
      if (dp.experiment_id_real !== undefined && dp.experiment_id_real === dp.experiment_id_test) err("data.datapipe: los experimentos de pruebas y real deben ser distintos.");
      if (typeof dp.send_zip !== "boolean") err("data.datapipe.send_zip debe ser true (enviar también el .zip; exige «Accept base64 file uploads» en DataPipe) o false.");
      if (c.study?.status === "congelado" && !dp.experiment_id_real) err("Una versión congelada necesita data.datapipe.experiment_id_real (experimento REAL de DataPipe).");
    }
  }

  // ---- formularios ----
  const formIds = isObj(c.forms) ? Object.keys(c.forms) : [];
  let participantIdFields = 0;
  for (const fid of formIds) {
    const f = c.forms[fid];
    const where = `forms.${fid}`;
    if (!isObj(f) || !Array.isArray(f.fields) || f.fields.length === 0) { err(`${where}: necesita fields.`); continue; }
    if (f.title_key) neededTexts.add(f.title_key);
    neededTexts.add(f.submit_key ?? "continue_button");
    const ids = new Set();
    f.fields.forEach((fd, i) => {
      const w = `${where}.fields[${i}] (${fd?.id ?? "sin id"})`;
      if (!/^[A-Za-z0-9_]+$/.test(fd?.id ?? "")) err(`${w}: id no válido.`);
      if (ids.has(fd?.id)) err(`${w}: id repetido.`);
      ids.add(fd?.id);
      if (!FIELD_TYPES.includes(fd?.type)) err(`${w}: type debe ser uno de ${FIELD_TYPES.join(", ")}.`);
      for (const lang of LANGS) if (typeof fd?.label?.[lang] !== "string") err(`${w}: falta label.${lang}.`);
      if (typeof fd?.required !== "boolean") err(`${w}: required debe ser true o false.`);
      if ((fd?.type === "number" || fd?.type === "scale") && (!isInt(fd.min) || !isInt(fd.max) || fd.max < fd.min)) err(`${w}: necesita min y max enteros.`);
      if (fd?.type === "radio") {
        if (!Array.isArray(fd.options) || fd.options.length < 2) err(`${w}: radio necesita al menos dos options.`);
        else fd.options.forEach((o, j) => {
          if (typeof o?.value !== "string") err(`${w}.options[${j}]: falta value.`);
          for (const lang of LANGS) if (typeof o?.label?.[lang] !== "string") err(`${w}.options[${j}]: falta label.${lang}.`);
        });
      }
      if (fd?.details_key) neededTexts.add(fd.details_key);
      if (fd?.participant_id) {
        participantIdFields++;
        if (fd.type !== "text") err(`${w}: el campo del código del participante debe ser de tipo text.`);
        if (fd.personal) err(`${w}: el código del participante no puede ser un dato personal (es seudónimo).`);
      }
    });
  }
  if (c.participant?.id_source === "form" && participantIdFields !== 1) err('Con participant.id_source = "form", exactamente un campo de formulario debe tener participant_id: true.');
  if (c.participant?.id_source !== "form" && participantIdFields > 0) err('Hay un campo participant_id pero participant.id_source no es "form".');

  // ---- flujo ----
  if (c.flow === undefined) {
    DEFAULT_FLOW_TEXTS.forEach((k) => neededTexts.add(k));
  } else if (!Array.isArray(c.flow) || c.flow.length === 0) {
    err("flow debe ser una lista de pasos.");
  } else {
    const groups = c.group?.available ?? [];
    const phaseCount = {};
    const repeatIds = new Set();
    let idFormSeen = false;
    const checkStep = (s, i, where, inRepeat) => {
      if (inRepeat && !REPEAT_INNER_STEPS.includes(s?.step)) { err(`${where}: dentro de repeat solo se admiten ${REPEAT_INNER_STEPS.join(", ")}.`); return; }
      if (!FLOW_STEPS.includes(s?.step)) { err(`${where}: step debe ser uno de ${FLOW_STEPS.join(", ")}.`); return; }
      if (s.groups !== undefined && (!Array.isArray(s.groups) || s.groups.some((g) => !groups.includes(g)))) err(`${where}: groups debe listar grupos de group.available.`);
      if (s.step === "repeat") {
        if (!/^[A-Za-z0-9_]+$/.test(s.id ?? "")) err(`${where}: repeat necesita un id (letras, números o _).`);
        else if (repeatIds.has(s.id)) err(`${where}: id de repeat repetido.`);
        repeatIds.add(s.id);
        if (!s.repeat_button_key || !s.continue_button_key) err(`${where}: repeat necesita repeat_button_key y continue_button_key.`);
        else { neededTexts.add(s.repeat_button_key); neededTexts.add(s.continue_button_key); }
        if (!Array.isArray(s.steps) || s.steps.length === 0) err(`${where}: repeat necesita una lista steps con al menos un paso.`);
        else s.steps.forEach((x, j) => checkStep(x, j, `${where}.steps[${j}] (${x?.step ?? "?"})`, true));
        return;
      }
      if (s.step === "form") {
        if (!formIds.includes(s.form)) err(`${where}: el formulario «${s.form}» no existe.`);
        else if (c.forms[s.form].fields.some((fd) => fd.participant_id)) idFormSeen = true;
      }
      if (s.step === "phase") {
        if (!phaseIds.includes(s.phase)) err(`${where}: la fase «${s.phase}» no existe.`);
        phaseCount[s.phase] = (phaseCount[s.phase] ?? 0) + 1;
        if (c.participant?.id_source === "form" && !idFormSeen) err(`${where}: la fase empieza antes del formulario con el código del participante.`);
      }
      if (s.step === "countdown") {
        if (!isInt(s.from, 1) || !isInt(s.step_ms, 1)) err(`${where}: countdown necesita from y step_ms enteros > 0.`);
        if (s.text_key) neededTexts.add(s.text_key);
      }
      if (s.step === "screen") {
        if (!s.text_key) err(`${where}: falta text_key.`); else neededTexts.add(s.text_key);
        neededTexts.add(s.button_key ?? "continue_button");
      }
      if (s.step === "speech") {
        if (typeof s.character !== "string" || !/\.(svg|png|jpe?g|webp)$/i.test(s.character)) err(`${where}: character debe ser un archivo SVG o una imagen (.svg, .png, .jpg, .jpeg o .webp) del personaje.`);
        if (!s.bubble_key || !s.footer_key) err(`${where}: faltan bubble_key y footer_key.`);
        else { neededTexts.add(s.bubble_key); neededTexts.add(s.footer_key); }
        if (s.advance === "button") neededTexts.add(s.button_key ?? "continue_button");
        else if (s.advance !== undefined) err(`${where}: advance solo admite "button".`);
        else if (s.advance_key !== " ") err(`${where}: indica advance: "button" (botón) o advance_key: " " (barra espaciadora).`);
        if (s.instruction_id !== undefined && !/^[A-Za-z0-9_]+$/.test(s.instruction_id)) err(`${where}: instruction_id no válido.`);
      }
      if (s.step === "end" && (inRepeat || i !== c.flow.length - 1)) err(`${where}: end debe ser el último paso.`);
    };
    c.flow.forEach((s, i) => checkStep(s, i, `flow[${i}] (${s?.step ?? "?"})`, false));
    if (c.flow.at(-1)?.step !== "end") err('El último paso de flow debe ser {step: "end"}.');
    for (const ph of phaseIds) if (phaseCount[ph] !== 1) err(`La fase «${ph}» debe aparecer exactamente una vez en flow.`);
  }

  for (const lang of LANGS) {
    const tx = c.texts?.[lang];
    if (!isObj(tx)) { err(`Faltan los textos en «${lang}».`); continue; }
    for (const key of neededTexts) if (typeof tx[key] !== "string") err(`Falta texts.${lang}.${key}.`);
  }

  if (c.test_mode !== undefined) {
    const tm = c.test_mode;
    if (!isObj(tm)) err("test_mode debe ser un objeto.");
    else {
      for (const k of Object.keys(tm)) {
        if (k === "optional_forms") {
          if (!Array.isArray(tm.optional_forms) || tm.optional_forms.some((f) => !formIds.includes(f))) err("test_mode.optional_forms debe listar formularios existentes.");
        } else if (!["blocks", "trials_per_block", "feedback_ms", "iti_ms"].includes(k)) err(`test_mode.${k} no está admitido.`);
        else if (!isInt(tm[k], k === "blocks" || k === "trials_per_block" ? 1 : 0)) err(`test_mode.${k} debe ser un entero.`);
      }
    }
  }
  return errors;
}

function validateSchedule(s, where, err) {
  if (!isObj(s) || !SCHEDULE_TYPES.includes(s.type)) { err(`${where}: schedule.type debe ser uno de ${SCHEDULE_TYPES.join(", ")}.`); return; }
  if (s.type === "FR" && !isInt(s.n, 1)) err(`${where}: FR necesita n entero ≥ 1.`);
  if (s.type === "FI" && !isNum(s.seconds, 0.001)) err(`${where}: FI necesita seconds > 0.`);
  if (s.type === "VR" || s.type === "VI") {
    const d = s.distribution;
    if (!isObj(d)) { err(`${where}: ${s.type} necesita distribution.`); return; }
    if (d.kind === "uniform_int") {
      if (s.type !== "VR") err(`${where}: uniform_int solo es válido para VR.`);
      if (!isInt(d.min, 1) || !isInt(d.max, 1) || d.max < d.min) err(`${where}: uniform_int necesita 1 ≤ min ≤ max.`);
    } else if (d.kind === "list") {
      if (!Array.isArray(d.values) || d.values.length === 0) err(`${where}: list necesita values.`);
      else if (s.type === "VR" && d.values.some((v) => !isInt(v, 1))) err(`${where}: los valores de VR deben ser enteros ≥ 1.`);
      else if (s.type === "VI" && d.values.some((v) => !isNum(v, 0.001))) err(`${where}: los valores de VI (segundos) deben ser > 0.`);
    } else if (d.kind === "fleshler_hoffman") {
      if (s.type !== "VI") err(`${where}: fleshler_hoffman solo es válido para VI.`);
      if (!isNum(d.mean_s, 0.001) || !isInt(d.n, 1)) err(`${where}: fleshler_hoffman necesita mean_s > 0 y n entero ≥ 1.`);
    } else err(`${where}: distribution.kind desconocido «${d.kind}».`);
  }
}

/** Copia de la configuración con las reducciones del modo de prueba aplicadas. */
export function applyTestMode(config) {
  const c = structuredClone(config);
  const tm = c.test_mode ?? {};
  for (const p of c.phases) {
    // Una fase con ensayos forzados no se acorta: su secuencia está fijada ensayo a ensayo
    // (motor 0.4.0). Sí se aplican las reducciones de tiempos.
    if (tm.blocks !== undefined && !p.forced) p.blocks = Math.min(p.blocks, tm.blocks);
    if (tm.trials_per_block !== undefined && !p.forced) p.trials_per_block = Math.min(p.trials_per_block, tm.trials_per_block);
    if (tm.feedback_ms !== undefined) p.trial.feedback_ms = tm.feedback_ms;
    if (tm.iti_ms !== undefined) p.trial.iti_ms = tm.iti_ms;
  }
  for (const fid of tm.optional_forms ?? []) {
    for (const fd of c.forms[fid].fields) fd.required = false;
  }
  return c;
}

/** Pasos del flujo que corresponden a un grupo (o el flujo por defecto si no hay «flow»). */
export function flowFor(config, group) {
  if (!config.flow) {
    return [
      { step: "screen", id: "instructions", text_key: "instructions_html", button_key: "start_button" },
      ...config.phases.map((p) => ({ step: "phase", phase: p.id })),
      { step: "end" },
    ];
  }
  const forGroup = (list) => list
    .filter((s) => !s.groups || s.groups.includes(group))
    .map((s) => (s.step === "repeat" ? { ...s, steps: forGroup(s.steps) } : s));
  return forGroup(config.flow);
}
