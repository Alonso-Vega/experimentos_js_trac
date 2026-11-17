// =====================================================================================
// RG-01 · Elección entre tres estímulos con consecuencias a corto y largo plazo
// Grupos: 1 «Instrucción» · 2 «Exposición forzada» · 3 «Sin instrucción»
// -------------------------------------------------------------------------------------
// ESTADO: BORRADOR (v0.7). Traducción de las instrucciones del investigador del
// 2026-11-15 (Grupo 1) y del 2026-11-16 (Grupos 2 y 3). Procedimiento completo en
// protocolo.md; historial en cambios.md.
// v0.2: datos iniciales opcionales salvo el código experimental y «Acepto participar».
// v0.3: foto (estimulos/speaker.jpg) en lugar del monigote en la pantalla de la regla (motor ≥ 0.2.3).
//       2026-11-16, aún sin datos: «+1», «+X» y «+0» en verde; «−1» en rojo (FEEDBACK_COLORED).
// v0.4: Grupos 2 (exposición forzada repetible) y 3 (sin la regla). Motor ≥ 0.4.0.
// v0.5: consentimiento aprobado por el comité de ética (textos-consentimiento.js), mensaje
//       final, regla con botón «Continuar», idioma elegido por el investigador (es/en). Motor ≥ 0.5.0.
// v0.6: envío de los datos a DataPipe (Google Drive del investigador), además de la descarga. Motor ≥ 0.6.0.
// v0.7: diseño ABCABC (6 fases de 5 bloques, 360 elecciones; VR1–VR6) y frase del euro
//       imaginario en las instrucciones generales.
//
// Los parámetros que más se tocan están en el BLOQUE DE PARÁMETROS de abajo. El resto del
// archivo los convierte al formato del motor; normalmente no hace falta tocarlo.
// Cada cambio altera la huella (config_hash) que se guarda con los datos. Si ya se
// recogieron datos con esta versión, no la edites: pide una versión nueva (MANUAL.md).
// =====================================================================================

// Hoja de información y consentimiento (texto aprobado por el comité de ética; no editar aquí).
import { CONSENT_HTML } from "./textos-consentimiento.js";

// ------------------------------- BLOQUE DE PARÁMETROS --------------------------------

// Grupos. El investigador elige el grupo en su pantalla antes de iniciar cada sesión;
// GROUP es solo el que aparece seleccionado de entrada.
//   "1" Instrucción: regla con la foto antes de la fase 1.
//   "2" Exposición forzada: ensayos forzados (repetibles) antes de la fase 1; sin la regla.
//   "3" Sin instrucción: como el 1, pero sin la regla.
const GROUP = "1";
const GROUPS_AVAILABLE = ["1", "2", "3"];

// Estímulos. Mismo tamaño (caja de 100 × 100 dentro de un lienzo de 120 × 120) y mismo color.
const STIMULUS_COLOR = "#8c8c8c"; // gris neutro
const STIMULI = {
  S1: { name: { es: "círculo", en: "circle" },
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="${STIMULUS_COLOR}"/></svg>` },
  S2: { name: { es: "triángulo", en: "triangle" },
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><polygon points="60,10 110,110 10,110" fill="${STIMULUS_COLOR}"/></svg>` },
  S3: { name: { es: "cuadrado", en: "square" },
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect x="10" y="10" width="100" height="100" fill="${STIMULUS_COLOR}"/></svg>` },
};

// Contingencias por condición: CONTINGENCIES[condición][estímulo] = { cp, lp }
//   cp = corto plazo: puntos tras cada elección (se muestran «+1» o «−1»).
//   lp = largo plazo: puntos por cada elección, sumados al final del bloque («+X»).
const CONTINGENCIES = {
  A: { S1: { cp: +1, lp: 0 }, S2: { cp: -1, lp: 0 }, S3: { cp: -1, lp: 5 } },
  B: { S1: { cp: -1, lp: 5 }, S2: { cp: +1, lp: 0 }, S3: { cp: -1, lp: 0 } },
  C: { S1: { cp: -1, lp: 0 }, S2: { cp: -1, lp: 5 }, S3: { cp: +1, lp: 0 } },
};

// Diseño ABCABC (v0.7): condición de cada fase, en orden. Fases 1–6 = fase1 … fase6.
// Las fases 4, 5 y 6 repiten exactamente las contingencias de las fases 1, 2 y 3.
// Tras cada fase, un informe verbal (VR1 … VR6). Los cambios de condición no se anuncian.
const PHASE_ORDER = ["A", "B", "C", "A", "B", "C"];

const BLOCKS_PER_PHASE = 5;
const TRIALS_PER_BLOCK = 12;     // múltiplo de 6: cada permutación de posiciones aparece igual número de veces
const FEEDBACK_CP_MS = 1500;     // «+1» / «−1»
const FIXATION_MS = 1000;        // punto de fijación (intervalo entre ensayos)
const FEEDBACK_LP_MS = 1500;     // «+X» tras el ensayo 12 de cada bloque
const SHOW_ZERO_LP = true;       // si X = 0, mostrar «+0» (true) o saltar la pantalla (false)
const FEEDBACK_COLORED = true;   // true: ganancias y «+0» en verde, pérdidas en rojo; false: color del texto
const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 1000;

// Exposición forzada (solo Grupo 2): bloques de 6 ensayos en los que solo se puede elegir
// la figura indicada; las otras dos aparecen bloqueadas. Usa las contingencias de la
// condición indicada en FORCED_CONTINGENCIES_FROM (la de la fase 1: corto y largo plazo, con
// el «+X» tras el ensayo 6). Al terminar: informe verbal y dos botones (repetir los ensayos o
// empezar el experimento). El marcador vuelve a 0 al empezar cada repetición y antes de la fase 1.
const FORCED_TRIALS_PER_BLOCK = 6;
const FORCED_CONTINGENCIES_FROM = "A";
const FORCED_SEQUENCE = [            // S1 = círculo, S2 = triángulo, S3 = cuadrado
  ["S2", "S2", "S2", "S2", "S2", "S2"], // bloque 1: triángulo
  ["S1", "S1", "S1", "S1", "S1", "S1"], // bloque 2: círculo
  ["S3", "S3", "S3", "S3", "S3", "S3"], // bloque 3: cuadrado
  ["S2", "S1", "S3", "S3", "S3", "S3"], // bloque 4: triángulo, círculo y después cuadrado
];

// Modo de prueba (?prueba=1, equivale a DEBUG = true): 1 bloque de 3 ensayos por fase y
// formularios iniciales sin campos obligatorios. Los datos se marcan como prueba.
// La exposición forzada no se acorta (su secuencia está fijada ensayo a ensayo).
const DEBUG = { blocks: 1, trials_per_block: 3, optional_forms: ["consentimiento", "demograficos"] };

// --------------------------- FIN DEL BLOQUE DE PARÁMETROS ----------------------------

const PHASES = PHASE_ORDER.map((_, i) => `fase${i + 1}`);
const FORCED_PHASE = "exposicion";

function contingenciesFromTable(table) {
  const out = [];
  for (const [cond, row] of Object.entries(table)) {
    // Cada condición actúa en todas las fases que la usan; la de FORCED_CONTINGENCIES_FROM,
    // también en la exposición forzada.
    const phases = PHASES.filter((_, i) => PHASE_ORDER[i] === cond);
    if (cond === FORCED_CONTINGENCIES_FROM) phases.push(FORCED_PHASE);
    for (const [stim, { cp, lp }] of Object.entries(row)) {
      out.push({
        id: `${cond}_${stim}_cp`, option: stim, phases,
        schedule: { type: "CRF" }, probability: 1,
        outcome: { type: cp < 0 ? "loss" : "gain", magnitude: Math.abs(cp), unit: "points" },
        delay: { mode: "immediate" }, reset_on: "never",
      });
      if (lp !== 0) {
        out.push({
          id: `${cond}_${stim}_lp`, option: stim, phases,
          schedule: { type: "CRF" }, probability: 1,
          outcome: { type: lp < 0 ? "loss" : "gain", magnitude: Math.abs(lp), unit: "points" },
          delay: { mode: "end_of_block" }, reset_on: "never",
        });
      }
    }
  }
  return out;
}

const yesNo = [
  { value: "yes", label: { es: "Sí", en: "Yes" } },
  { value: "no", label: { es: "No", en: "No" } },
];

export default {
  schema_version: 1,

  study: {
    id: "RG-01",
    title: "Elección entre tres estímulos: regla, corto y largo plazo",
    version: "0.7",
    status: "borrador",
  },

  language: "es",                    // idioma seleccionado de entrada
  languages_available: ["es", "en"], // el investigador elige el idioma en su pantalla, como el grupo
  seed: "auto",

  participant: {
    id_pattern: "^[A-Za-z0-9_-]{1,32}$",
    id_source: "form", // el participante escribe su código experimental en el primer formulario
  },

  group: { available: GROUPS_AVAILABLE, value: GROUP },

  options: Object.fromEntries(Object.entries(STIMULI).map(([id, s]) => [id, { label: s.name, stimulus: { svg: s.svg } }])),

  contingencies: contingenciesFromTable(CONTINGENCIES),

  phases: [
    // Exposición forzada (solo Grupo 2): mismo ensayo que las fases, con una sola figura disponible.
    {
      id: FORCED_PHASE,
      blocks: FORCED_SEQUENCE.length,
      trials_per_block: FORCED_TRIALS_PER_BLOCK,
      positions: "all_permutations_balanced", // 6 ensayos: cada orden de las 3 figuras una vez
      forced: FORCED_SEQUENCE,
      trial: {
        response_window_ms: null,
        feedback_ms: FEEDBACK_CP_MS,
        iti_ms: FIXATION_MS,
        iti_display: "fixation",
        hide_options_during_feedback: true,
      },
      block_end_screen: false,
      block_end_feedback: { duration_ms: FEEDBACK_LP_MS, show_zero: SHOW_ZERO_LP },
    },
    ...PHASES.map((id) => ({
      id,
      blocks: BLOCKS_PER_PHASE,
      trials_per_block: TRIALS_PER_BLOCK,
      positions: "all_permutations_balanced",
      trial: {
        response_window_ms: null, // sin límite de tiempo
        feedback_ms: FEEDBACK_CP_MS,
        iti_ms: FIXATION_MS,
        iti_display: "fixation",
        hide_options_during_feedback: true, // los estímulos desaparecen durante «+1»/«−1»
      },
      block_end_screen: false,
      block_end_feedback: { duration_ms: FEEDBACK_LP_MS, show_zero: SHOW_ZERO_LP },
    })),
  ],

  display: { show_balance: true, show_pending: false, feedback_colored: FEEDBACK_COLORED },
  session_end: { pending_policy: "keep_pending_and_record" },
  incidents: { visibility_policy: "record_only" },
  data: {
    auto_download: true, // además del envío, los archivos se descargan en el ordenador (decisión del investigador)
    // DataPipe (pipe.jspsych.org) guarda los datos en el Google Drive institucional del
    // investigador (carpeta «DataPipe»). Experimentos creados por el investigador el 2026-11-16.
    datapipe: {
      experiment_id_test: "ABBHNRGwB3QY", // «RG-01 pruebas»: modo prueba y cualquier versión no congelada
      experiment_id_real: "sHgqH9zsw765", // «RG-01 v1.0»: solo sesiones reales de una versión congelada
      send_zip: true,                     // enviar también el .zip (requiere «Accept base64 file uploads»)
    },
  },
  test_mode: DEBUG,

  forms: {
    consentimiento: {
      title_key: "consent_title_html",
      // Obligatorios solo «code» y «consent_given» (v0.2, petición del investigador).
      fields: [
        { id: "name", type: "text", label: { es: "Nombre", en: "Name" }, required: false, personal: true },
        { id: "code", type: "text", label: { es: "Código experimental", en: "Experimental code" }, required: true, participant_id: true },
        { id: "contact", type: "text", label: { es: "Contacto: email o teléfono", en: "Contact: e-mail or phone" }, required: false, personal: true },
        { id: "consent_read", type: "checkbox", label: { es: "He leído el consentimiento informado", en: "I have read the informed consent" },
          required: false, personal: true, details_key: "consent_text_html",
          details_summary: { es: "Leer el consentimiento informado", en: "Read the informed consent" } },
        { id: "consent_given", type: "checkbox", label: { es: "Acepto participar y doy mi consentimiento informado", en: "I agree to take part and give my informed consent" },
          required: true, personal: true },
      ],
    },
    demograficos: {
      title_key: "demographics_title_html",
      // Todos opcionales (v0.2, petición del investigador). La edad, si se escribe, debe estar entre 18 y 99.
      fields: [
        { id: "age", type: "number", min: 18, max: 99, label: { es: "Edad", en: "Age" }, required: false },
        { id: "gender", type: "radio", label: { es: "Género", en: "Gender" }, required: false, options: [
          { value: "cis_woman", label: { es: "Mujer cis", en: "Cis woman" } },
          { value: "cis_man", label: { es: "Hombre cis", en: "Cis man" } },
          { value: "trans_woman", label: { es: "Mujer trans", en: "Trans woman" } },
          { value: "trans_man", label: { es: "Hombre trans", en: "Trans man" } },
          { value: "non_binary", label: { es: "Persona no binaria", en: "Non-binary person" } },
          { value: "other", label: { es: "Otro", en: "Other" }, specify: true },
          { value: "prefer_not_to_say", label: { es: "Prefiero no responder", en: "Prefer not to say" } },
        ] },
        { id: "education", type: "radio", label: { es: "Nivel de estudios", en: "Level of education" }, required: false, options: [
          { value: "none", label: { es: "Sin estudios", en: "No formal education" } },
          { value: "primary", label: { es: "Primaria", en: "Primary" } },
          { value: "secondary", label: { es: "Secundaria (ESO)", en: "Lower secondary" } },
          { value: "upper_secondary", label: { es: "Bachillerato", en: "Upper secondary" } },
          { value: "vocational", label: { es: "Formación profesional", en: "Vocational training" } },
          { value: "bachelor", label: { es: "Grado universitario", en: "Bachelor's degree" } },
          { value: "master", label: { es: "Máster", en: "Master's degree" } },
          { value: "doctorate", label: { es: "Doctorado", en: "Doctorate" } },
        ] },
        { id: "country_of_origin", type: "text", label: { es: "País de origen", en: "Country of origin" }, required: false },
        { id: "first_language", type: "text", label: { es: "Lengua materna", en: "First language" }, required: false },
        { id: "macarthur_ladder", type: "scale", min: 1, max: 10, required: false, label: {
          es: "Imagina una escalera de 10 peldaños que representa a la sociedad: arriba las personas con más dinero, estudios y mejores trabajos, y abajo las que menos. ¿En qué peldaño te situarías?",
          en: "Imagine a 10-rung ladder representing society: at the top are the people with the most money, education and the best jobs, and at the bottom those with the least. Which rung would you place yourself on?",
        } },
        { id: "employment", type: "radio", label: { es: "Situación laboral", en: "Employment status" }, required: false, options: [
          { value: "student", label: { es: "Estudiante", en: "Student" } },
          { value: "employed", label: { es: "Trabaja", en: "Employed" } },
          { value: "student_and_employed", label: { es: "Estudia y trabaja", en: "Student and employed" } },
          { value: "unemployed", label: { es: "Desempleado/a", en: "Unemployed" } },
          { value: "other", label: { es: "Otro", en: "Other" } },
        ] },
        { id: "handedness", type: "radio", label: { es: "Lateralidad", en: "Handedness" }, required: false, options: [
          { value: "right", label: { es: "Diestro/a", en: "Right-handed" } },
          { value: "left", label: { es: "Zurdo/a", en: "Left-handed" } },
          { value: "ambidextrous", label: { es: "Ambidiestro/a", en: "Ambidextrous" } },
        ] },
        { id: "normal_or_corrected_vision", type: "radio", required: false, options: yesNo,
          label: { es: "Visión normal o corregida con gafas o lentillas", en: "Normal or corrected-to-normal vision (glasses or contact lenses)" } },
        { id: "colour_vision_difficulty", type: "radio", required: false,
          label: { es: "Daltonismo o dificultad para distinguir colores", en: "Colour blindness or difficulty distinguishing colours" },
          options: [...yesNo, { value: "dont_know", label: { es: "No lo sé", en: "I don't know" } }] },
        { id: "previous_psych_experiments", type: "radio", required: false, options: yesNo,
          label: { es: "¿Has participado antes en experimentos de psicología?", en: "Have you taken part in psychology experiments before?" } },
        { id: "comments", type: "textarea", required: false,
          label: { es: "¿Hay algo más que quieras comentarnos?", en: "Is there anything else you would like to tell us?" } },
      ],
    },
    informe_verbal: {
      fields: [
        { id: "response", type: "textarea", required: true, label: {
          es: "Si tuvieras que explicarle a otra persona cómo ganar todos los puntos posibles, ¿qué le dirías?",
          en: "If you had to explain to someone else how to earn as many points as possible, what would you tell them?",
        } },
      ],
    },
  },

  flow: [
    { step: "form", form: "consentimiento" },
    { step: "form", form: "demograficos" },
    { step: "countdown", id: "cuenta_atras", from: COUNTDOWN_FROM, step_ms: COUNTDOWN_STEP_MS, text_key: "countdown_text" },
    // Grupos 1 y 3: instrucciones generales; el Grupo 1 ve además la regla con la foto.
    { step: "screen", id: "instrucciones_generales", groups: ["1", "3"], text_key: "general_instructions_html", button_key: "continue_button" },
    { step: "speech", id: "regla", groups: ["1"], character: "estimulos/speaker.jpg",
      bubble_key: "rule_text", footer_key: "rule_footer", advance: "button", button_key: "continue_button", instruction_id: "regla_G1" },
    // Grupo 2: instrucciones de los ensayos de prueba y exposición forzada repetible.
    { step: "screen", id: "instrucciones_practica", groups: ["2"], text_key: "practice_instructions_html", button_key: "continue_button" },
    {
      step: "repeat", id: "exposicion", groups: ["2"],
      repeat_button_key: "repeat_practice_button", continue_button_key: "start_experiment_button",
      steps: [
        { step: "reset_balance", id: "inicio_exposicion" },      // el marcador empieza en 0 en cada repetición
        { step: "phase", phase: FORCED_PHASE },
        { step: "form", form: "informe_verbal", instance: "VR0" },
      ],
    },
    { step: "reset_balance", id: "inicio_experimento", groups: ["2"] }, // el marcador vuelve a 0 antes de la fase 1
    { step: "countdown", id: "cuenta_atras_experimento", groups: ["2"], from: COUNTDOWN_FROM, step_ms: COUNTDOWN_STEP_MS, text_key: "countdown_text" },
    { step: "screen", id: "instrucciones_generales", groups: ["2"], text_key: "general_instructions_html", button_key: "continue_button" },
    // Fases 1–6 (ABCABC), cada una seguida de su informe verbal (VR1 … VR6).
    ...PHASES.flatMap((id, i) => [
      { step: "phase", phase: id },
      { step: "form", form: "informe_verbal", instance: `VR${i + 1}` },
    ]),
    { step: "end" },
  ],

  // Textos de cara al participante. Títulos de los formularios, rótulo del marcador y mensaje
  // final: aprobados por el investigador (2026-11-16). Inglés: traducción revisada (v0.5).
  texts: {
    es: {
      consent_title_html: "<h2>Datos personales y consentimiento informado</h2>",
      consent_text_html: CONSENT_HTML.es,
      demographics_title_html: "<h2>Datos demográficos</h2>",
      countdown_text: "El experimento va a empezar en…",
      general_instructions_html: "<p>En este experimento vas a tener que seleccionar diferentes estímulos. Tu objetivo es ganar todos los puntos posibles. No te vamos a dar compensación económica pero imagina que cada punto vale 1€. Te recuerdo que tu objetivo es conseguir la máxima puntuación posible. Si lo has entendido, pulsa Continuar.</p>",
      rule_text: "Cada vez que pulses el cuadrado se te restará 1 punto en ese momento, pero se te darán +5 puntos por cada vez que lo hayas pulsado tras 12 ensayos.",
      rule_footer: "Si lo has entendido, pulsa Continuar.",
      practice_instructions_html: "<p>En este experimento deberás seleccionar diferentes estímulos para ganar puntos. Debes ganar el mayor número de puntos posibles. Antes de empezar el experimento vas a hacer unos ensayos para que te familiarices con la tarea.</p>",
      repeat_practice_button: "Volver a empezar ensayos de prueba",
      start_experiment_button: "Empezar experimento",
      continue_button: "Continuar",
      balance_label: "Puntos",
      pending_label: "Pendientes",
      unit_point: "punto",
      unit_points: "puntos",
      feedback_gain: "+{magnitude}",
      feedback_loss: "−{magnitude}",
      feedback_none: "",
      block_end_feedback: "{signed_delivered}",
      end_html: "<h2>¡Muchas gracias por participar!</h2><p>Te agradecemos el tiempo dedicado y la información que nos has proporcionado.</p>",
    },
    en: {
      consent_title_html: "<h2>Personal details and informed consent</h2>",
      consent_text_html: CONSENT_HTML.en,
      demographics_title_html: "<h2>Demographic information</h2>",
      countdown_text: "The experiment will start in…",
      general_instructions_html: "<p>In this experiment you will have to select different stimuli. Your goal is to earn as many points as possible. We will not give you any financial compensation, but imagine that each point is worth €1. Remember that your goal is to get the highest possible score. If you have understood, press Continue.</p>",
      rule_text: "Each time you press the square, 1 point will be subtracted at that moment, but you will be given +5 points for each time you have pressed it after 12 trials.",
      rule_footer: "If you have understood, press Continue.",
      practice_instructions_html: "<p>In this experiment you will have to select different stimuli to earn points. You must earn as many points as possible. Before starting the experiment you will do some trials to become familiar with the task.</p>",
      repeat_practice_button: "Start the practice trials again",
      start_experiment_button: "Start the experiment",
      continue_button: "Continue",
      balance_label: "Points",
      pending_label: "Pending",
      unit_point: "point",
      unit_points: "points",
      feedback_gain: "+{magnitude}",
      feedback_loss: "−{magnitude}",
      feedback_none: "",
      block_end_feedback: "{signed_delivered}",
      end_html: "<h2>Thank you very much for taking part!</h2><p>We appreciate the time you have devoted and the information you have provided.</p>",
    },
  },
};
