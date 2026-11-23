// Diccionario de datos: cada variable exportada, explicada en español e inglés.
// {option} representa el identificador de una alternativa (p. ej., n_choice_A).
// La prueba pruebas/datos.test.mjs falla si una columna exportada no está aquí.

const T = "ms (reloj monotónico desde el inicio de la sesión / monotonic clock from session start)";

// [tabla, variable, español, english, unidad]
const ENTRIES = [
  // ---- comunes ----
  ["*", "session_id", "Identificador único de la sesión.", "Unique session identifier.", ""],
  ["*", "participant_id", "Código seudonimizado del participante, escrito por el investigador.", "Pseudonymised participant code entered by the researcher.", ""],

  // ---- sesiones ----
  ["sesiones", "study_id", "Identificador del estudio.", "Study identifier.", ""],
  ["sesiones", "study_version", "Versión del estudio.", "Study version.", ""],
  ["sesiones", "engine_version", "Versión del motor común.", "Common engine version.", ""],
  ["sesiones", "config_hash", "Huella SHA-256 de la configuración del estudio tal como está escrita.", "SHA-256 hash of the study configuration as written.", ""],
  ["sesiones", "condition", "Condición o grupo asignado (si el estudio lo usa).", "Assigned condition or group (if the study uses one).", ""],
  ["sesiones", "is_test", "TRUE si la sesión se ejecutó en modo de prueba (datos no válidos para análisis).", "TRUE if run in test mode (data not valid for analysis).", ""],
  ["sesiones", "language", "Idioma de los textos de cara al participante.", "Language of participant-facing texts.", ""],
  ["sesiones", "seed", "Semilla aleatoria de la sesión; reproduce la aleatorización.", "Session random seed; reproduces randomisation.", ""],
  ["sesiones", "session_wall_start", "Fecha y hora de inicio (calendario, ISO 8601 UTC).", "Start date and time (calendar, ISO 8601 UTC).", ""],
  ["sesiones", "session_wall_end", "Fecha y hora de cierre registrado (vacío si no hubo cierre).", "Recorded end date and time (empty if no close was recorded).", ""],
  ["sesiones", "end_reason", "Motivo de cierre: completed, abandoned, error o no_registrado.", "End reason: completed, abandoned, error or no_registrado (not recorded).", ""],
  ["sesiones", "duration_ms", "Tiempo desde el inicio hasta el último evento registrado.", "Time from start to the last recorded event.", "ms"],
  ["sesiones", "n_trials_planned", "Ensayos libres previstos por el diseño (sin contar los forzados).", "Free-choice trials planned by the design (forced trials not included).", "ensayos / trials"],
  ["sesiones", "n_forced_trials_planned", "Ensayos forzados previstos por el diseño en cada repetición (0 si el estudio no tiene).", "Forced trials planned by the design per repetition (0 if the study has none).", "ensayos / trials"],
  ["sesiones", "n_balance_resets", "Veces que el saldo disponible se puso a 0 (evento balance_reset).", "Times the available balance was reset to 0 (balance_reset event).", ""],
  ["sesiones", "n_trials_completed", "Ensayos cerrados.", "Trials closed.", "ensayos / trials"],
  ["sesiones", "n_responses", "Respuestas válidas registradas (una por ensayo como máximo).", "Valid responses recorded (at most one per trial).", "respuestas / responses"],
  ["sesiones", "n_omissions", "Ensayos sin respuesta dentro de la ventana temporal.", "Trials without a response within the time window.", "ensayos / trials"],
  ["sesiones", "n_input_ignored", "Entradas recibidas fuera de una oportunidad de respuesta (no cuentan como respuesta).", "Inputs received outside a response opportunity (not counted as responses).", ""],
  ["sesiones", "n_choice_{option}", "Número de elecciones de la alternativa {option} en la sesión.", "Number of choices of option {option} in the session.", "respuestas / responses"],
  ["sesiones", "balance_available_final", "Saldo disponible (consecuencias entregadas) al final.", "Available balance (delivered consequences) at the end.", "puntos / points"],
  ["sesiones", "balance_pending_final", "Saldo pendiente (obtenido y no entregado) al final.", "Pending balance (earned, not delivered) at the end.", "puntos / points"],
  ["sesiones", "n_incidents", "Incidencias registradas (foco, visibilidad, errores).", "Recorded incidents (focus, visibility, errors).", ""],
  ["sesiones", "n_visibility_hidden", "Veces que la página dejó de estar visible (cambio de pestaña, minimizar).", "Times the page became hidden (tab switch, minimise).", ""],
  ["sesiones", "n_window_blur", "Veces que la ventana perdió el foco.", "Times the window lost focus.", ""],
  ["sesiones", "n_errors", "Errores técnicos registrados.", "Technical errors recorded.", ""],
  ["sesiones", "jspsych_version", "Versión de jsPsych cargada.", "Loaded jsPsych version.", ""],
  ["sesiones", "browser_name", "Navegador detectado.", "Detected browser.", ""],
  ["sesiones", "browser_version", "Versión del navegador.", "Browser version.", ""],
  ["sesiones", "os", "Sistema operativo detectado.", "Detected operating system.", ""],
  ["sesiones", "user_agent", "Cadena user-agent completa.", "Full user-agent string.", ""],
  ["sesiones", "screen_width", "Ancho de la pantalla.", "Screen width.", "px CSS"],
  ["sesiones", "screen_height", "Alto de la pantalla.", "Screen height.", "px CSS"],
  ["sesiones", "viewport_width", "Ancho del área visible del navegador al iniciar.", "Browser viewport width at start.", "px CSS"],
  ["sesiones", "viewport_height", "Alto del área visible del navegador al iniciar.", "Browser viewport height at start.", "px CSS"],
  ["sesiones", "device_pixel_ratio", "Relación entre píxeles físicos y CSS.", "Physical-to-CSS pixel ratio.", ""],
  ["sesiones", "max_touch_points", "Puntos táctiles que admite el dispositivo (0 = sin pantalla táctil).", "Touch points supported (0 = no touch screen).", ""],
  ["sesiones", "timezone", "Zona horaria del dispositivo.", "Device time zone.", ""],
  ["sesiones", "local_save_status", "Estado del guardado local en el navegador en el momento de exportar.", "Status of local browser storage at export time.", ""],

  // ---- bloques ----
  ["bloques", "phase_id", "Fase.", "Phase.", ""],
  ["bloques", "block_index", "Número de bloque dentro de la fase (desde 1).", "Block number within the phase (from 1).", ""],
  ["bloques", "block_index_global", "Número único del bloque en la sesión. Los bloques libres van del 1 en adelante; los forzados y las repeticiones reciben números a continuación del último bloque libre.", "Unique block number in the session. Free blocks run from 1; forced blocks and repetitions are numbered after the last free block.", ""],
  ["bloques", "block_kind", "free (elección libre) o forced (ensayos forzados).", "free (free choice) or forced (forced trials).", ""],
  ["bloques", "repetition", "Repetición del tramo repetible (desde 1; vacío fuera de un tramo repetible).", "Repetition of the repeatable segment (from 1; empty outside a repeatable segment).", ""],
  ["bloques", "block_start_ms", "Inicio del bloque.", "Block start.", T],
  ["bloques", "block_end_ms", "Fin del bloque (vacío si no terminó).", "Block end (empty if not finished).", T],
  ["bloques", "n_trials", "Ensayos iniciados en el bloque.", "Trials started in the block.", ""],
  ["bloques", "n_responses", "Respuestas en el bloque. Denominador de prop_choice_*.", "Responses in the block. Denominator of prop_choice_*.", ""],
  ["bloques", "n_omissions", "Omisiones en el bloque.", "Omissions in the block.", ""],
  ["bloques", "n_choice_{option}", "Elecciones de {option} en el bloque.", "Choices of {option} in the block.", ""],
  ["bloques", "prop_choice_{option}", "Proporción de elecciones de {option}: n_choice_{option} / n_responses.", "Proportion of {option} choices: n_choice_{option} / n_responses.", "0–1"],
  ["bloques", "n_switches_within_block", "Cambios de alternativa entre respuestas consecutivas del bloque (máximo n_responses − 1).", "Option changes between consecutive responses in the block (max n_responses − 1).", ""],
  ["bloques", "latency_mean_ms", "Media de latency_ms en el bloque.", "Mean latency_ms in the block.", "ms"],
  ["bloques", "latency_median_ms", "Mediana de latency_ms en el bloque.", "Median latency_ms in the block.", "ms"],
  ["bloques", "value_delivered_immediately", "Suma de consecuencias inmediatas entregadas en el bloque.", "Sum of immediate consequences delivered in the block.", "puntos / points"],
  ["bloques", "value_delivered_at_block_end", "Suma de consecuencias entregadas al final del bloque.", "Sum of consequences delivered at block end.", "puntos / points"],
  ["bloques", "balance_available_end", "Saldo disponible al cerrar el bloque.", "Available balance at block close.", "puntos / points"],
  ["bloques", "balance_pending_end", "Saldo pendiente al cerrar el bloque.", "Pending balance at block close.", "puntos / points"],
  ["bloques", "completed", "TRUE si el bloque se cerró.", "TRUE if the block was closed.", ""],

  // ---- ensayos ----
  ["ensayos", "phase_id", "Fase.", "Phase.", ""],
  ["ensayos", "block_index", "Bloque dentro de la fase.", "Block within the phase.", ""],
  ["ensayos", "trial_index_block", "Ensayo dentro del bloque (desde 1).", "Trial within the block (from 1).", ""],
  ["ensayos", "block_index_global", "Número único del bloque del ensayo (enlaza con bloques.block_index_global; vacío en datos anteriores al motor 0.4.0).", "Unique block number of the trial (links to bloques.block_index_global; empty in data before engine 0.4.0).", ""],
  ["ensayos", "trial_index_global", "Número único del ensayo en la sesión. Los ensayos libres van del 1 en adelante; los forzados y las repeticiones reciben números a continuación del último ensayo libre. El orden temporal está en trial_start_ms.", "Unique trial number in the session. Free trials run from 1; forced trials and repetitions are numbered after the last free trial. Temporal order is given by trial_start_ms.", ""],
  ["ensayos", "trial_kind", "free (elección libre) o forced (ensayo forzado: solo una alternativa disponible).", "free (free choice) or forced (forced trial: only one option available).", ""],
  ["ensayos", "forced_option", "En un ensayo forzado, la única alternativa disponible (las demás se presentan bloqueadas).", "In a forced trial, the only available option (the others are shown locked).", ""],
  ["ensayos", "repetition", "Repetición del tramo repetible (desde 1; vacío fuera de un tramo repetible).", "Repetition of the repeatable segment (from 1; empty outside a repeatable segment).", ""],
  ["ensayos", "positions", "Alternativas de izquierda a derecha, separadas por |.", "Options from left to right, separated by |.", ""],
  ["ensayos", "option_left", "Alternativa presentada a la izquierda (si hay dos o tres).", "Option shown on the left (if two or three).", ""],
  ["ensayos", "option_center", "Alternativa presentada en el centro (si hay tres).", "Option shown in the centre (if three).", ""],
  ["ensayos", "option_right", "Alternativa presentada a la derecha (si hay dos o tres).", "Option shown on the right (if two or three).", ""],
  ["ensayos", "response_window_ms", "Ventana de respuesta programada (vacío = sin límite).", "Programmed response window (empty = no limit).", "ms"],
  ["ensayos", "trial_start_ms", "Inicio del ensayo (orden de presentar).", "Trial start (presentation requested).", T],
  ["ensayos", "stimulus_onset_ms", "Inicio estimado por software de la presentación de las alternativas (marca del primer fotograma tras insertarlas). No es una medición física.", "Software-estimated onset of the options (first animation frame after insertion). Not a physical measurement.", T],
  ["ensayos", "response_id", "Identificador único de la respuesta. Enlaza con consecuencias.", "Unique response identifier. Links to consequences.", ""],
  ["ensayos", "response_option", "Alternativa elegida.", "Chosen option.", ""],
  ["ensayos", "response_position", "Posición de la alternativa elegida (left/right, o left/center/right con tres).", "Position of the chosen option (left/right, or left/center/right with three).", ""],
  ["ensayos", "instruction_id", "Instrucción vigente en el momento de la respuesta (vacío si no se presentó ninguna).", "Instruction in effect at the time of the response (empty if none was presented).", ""],
  ["ensayos", "response_ms", "Momento de la respuesta (evento click del navegador).", "Response time (browser click event).", T],
  ["ensayos", "latency_ms", "Latencia: response_ms − stimulus_onset_ms.", "Latency: response_ms − stimulus_onset_ms.", "ms"],
  ["ensayos", "pointerdown_latency_ms", "Desde stimulus_onset_ms hasta que se presionó el botón o se tocó la pantalla (pointerdown).", "From stimulus_onset_ms to button press or screen touch (pointerdown).", "ms"],
  ["ensayos", "input_modality", "Modalidad de entrada: mouse, touch, pen, keyboard o unknown.", "Input modality: mouse, touch, pen, keyboard or unknown.", ""],
  ["ensayos", "is_switch", "TRUE si la alternativa difiere de la respuesta anterior de la sesión (vacío en la primera).", "TRUE if the option differs from the previous response in the session (empty for the first).", ""],
  ["ensayos", "omitted", "TRUE si terminó la ventana de respuesta sin respuesta.", "TRUE if the response window ended without a response.", ""],
  ["ensayos", "n_input_ignored", "Entradas ignoradas durante el ensayo (p. ej., segundo clic o clic en una alternativa bloqueada).", "Inputs ignored during the trial (e.g., second click or click on a locked option).", ""],
  ["ensayos", "contingencies_earned", "Contingencias cuya consecuencia se obtuvo con esta respuesta, separadas por |.", "Contingencies whose consequence was earned by this response, separated by |.", ""],
  ["ensayos", "value_delivered_immediately", "Suma de consecuencias inmediatas entregadas por esta respuesta.", "Sum of immediate consequences delivered for this response.", "puntos / points"],
  ["ensayos", "value_pending_created", "Suma de consecuencias demoradas que esta respuesta dejó pendientes.", "Sum of delayed consequences this response left pending.", "puntos / points"],
  ["ensayos", "feedback_onset_ms", "Inicio estimado de la presentación de la consecuencia.", "Estimated onset of consequence presentation.", T],
  ["ensayos", "feedback_offset_ms", "Retirada de la presentación de la consecuencia.", "Removal of consequence presentation.", T],
  ["ensayos", "feedback_scheduled_ms", "Duración programada de la presentación de la consecuencia.", "Programmed duration of consequence presentation.", "ms"],
  ["ensayos", "feedback_actual_ms", "Duración registrada por software: feedback_offset_ms − feedback_onset_ms.", "Software-recorded duration: feedback_offset_ms − feedback_onset_ms.", "ms"],
  ["ensayos", "trial_end_ms", "Cierre del ensayo (tras el intervalo entre ensayos).", "Trial close (after the inter-trial interval).", T],
  ["ensayos", "balance_available_after", "Saldo disponible al cerrar el ensayo.", "Available balance at trial close.", "puntos / points"],
  ["ensayos", "balance_pending_after", "Saldo pendiente al cerrar el ensayo.", "Pending balance at trial close.", "puntos / points"],
  ["ensayos", "n_incidents", "Incidencias registradas durante el ensayo.", "Incidents recorded during the trial.", ""],
  ["ensayos", "completed", "TRUE si el ensayo se cerró.", "TRUE if the trial was closed.", ""],

  // ---- consecuencias ----
  ["consecuencias", "consequence_id", "Identificador único de la consecuencia.", "Unique consequence identifier.", ""],
  ["consecuencias", "contingency_id", "Contingencia de la configuración que la produjo.", "Configuration contingency that produced it.", ""],
  ["consecuencias", "option", "Alternativa cuya respuesta la produjo.", "Option whose response produced it.", ""],
  ["consecuencias", "source_response_id", "Respuesta que la originó (enlaza con ensayos.response_id).", "Originating response (links to ensayos.response_id).", ""],
  ["consecuencias", "origin_phase_id", "Fase de la respuesta de origen.", "Phase of the originating response.", ""],
  ["consecuencias", "origin_block_index", "Bloque de la respuesta de origen.", "Block of the originating response.", ""],
  ["consecuencias", "origin_trial_index_global", "Ensayo de la respuesta de origen.", "Trial of the originating response.", ""],
  ["consecuencias", "outcome_type", "gain (ganancia) o loss (pérdida).", "gain or loss.", ""],
  ["consecuencias", "magnitude", "Magnitud programada.", "Programmed magnitude.", "puntos / points"],
  ["consecuencias", "unit", "Unidad.", "Unit.", ""],
  ["consecuencias", "signed_value", "Valor con signo (pérdidas negativas).", "Signed value (losses negative).", "puntos / points"],
  ["consecuencias", "delay_mode", "Demora: immediate, seconds, end_of_trial, end_of_block, end_of_phase o end_of_session.", "Delay: immediate, seconds, end_of_trial, end_of_block, end_of_phase or end_of_session.", ""],
  ["consecuencias", "delay_seconds", "Segundos de demora (solo si delay_mode = seconds; se miden desde la respuesta).", "Delay seconds (only if delay_mode = seconds; measured from the response).", "s"],
  ["consecuencias", "t_earned_ms", "Momento en que se obtuvo (respuesta de origen).", "Time earned (originating response).", T],
  ["consecuencias", "state_final", "Estado al exportar: delivered (entregada) o pending (pendiente).", "State at export: delivered or pending.", ""],
  ["consecuencias", "t_delivered_ms", "Momento de entrega (vacío si sigue pendiente).", "Delivery time (empty if still pending).", T],
  ["consecuencias", "delivery_trigger", "Qué provocó la entrega: immediate, seconds, end_of_trial, end_of_block, end_of_phase o end_of_session.", "What triggered delivery: immediate, seconds, end_of_trial, end_of_block, end_of_phase or end_of_session.", ""],
  ["consecuencias", "delivery_block_index", "Bloque en que se entregó.", "Block in which it was delivered.", ""],
  ["consecuencias", "delivery_trial_index_global", "Ensayo en que se entregó (vacío si fue fuera de un ensayo).", "Trial in which it was delivered (empty if outside a trial).", ""],
  ["consecuencias", "wait_ms", "Espera registrada: t_delivered_ms − t_earned_ms.", "Recorded wait: t_delivered_ms − t_earned_ms.", "ms"],

  // ---- pantallas ----
  ["pantallas", "screen_id", "Pantalla (instrucciones, regla, cuenta atrás, final de bloque...).", "Screen (instructions, rule, countdown, block end...).", ""],
  ["pantallas", "onset_ms", "Inicio estimado de la pantalla.", "Estimated screen onset.", T],
  ["pantallas", "advance_ms", "Momento en que se avanzó (vacío si avanza sola o no se avanzó).", "Time of advancing (empty if automatic or never advanced).", T],
  ["pantallas", "reading_time_ms", "Tiempo en pantalla hasta avanzar: advance_ms − onset_ms.", "Time on screen until advancing: advance_ms − onset_ms.", "ms"],
  ["pantallas", "advance_method", "Cómo se avanzó: button (botón) o key:<tecla>.", "How the participant advanced: button or key:<key>.", ""],

  // ---- formularios ----
  ["formularios", "form_id", "Formulario (configuración).", "Form (configuration).", ""],
  ["formularios", "form_instance", "Aparición concreta del formulario (p. ej., VR1, VR2, VR3).", "Specific occurrence of the form (e.g., VR1, VR2, VR3).", ""],
  ["formularios", "repetition", "Repetición del tramo repetible en que se respondió (vacío fuera de un tramo repetible).", "Repetition of the repeatable segment in which it was answered (empty outside a repeatable segment).", ""],
  ["formularios", "field_id", "Campo del formulario.", "Form field.", ""],
  ["formularios", "value", "Respuesta tal como se envió. Los datos personales no aparecen aquí.", "Response as submitted. Personal data never appear here.", ""],
  ["formularios", "other_text", "Texto escrito en la opción «Otro (especificar)».", "Text written in the 'Other (specify)' option.", ""],
  ["formularios", "submitted_ms", "Momento del envío.", "Submission time.", T],
  ["formularios", "form_time_ms", "Tiempo desde que apareció el formulario hasta el envío.", "Time from form onset to submission.", "ms"],

  // ---- eventos ----
  ["eventos", "seq", "Número de orden del evento en la sesión.", "Event order number in the session.", ""],
  ["eventos", "event_id", "Identificador único del evento.", "Unique event identifier.", ""],
  ["eventos", "type", "Tipo de evento (ver GLOSARIO.md).", "Event type (see GLOSARIO.md).", ""],
  ["eventos", "t_ms", "Momento del evento.", "Event time.", T],
  ["eventos", "wall_time", "Fecha y hora de calendario al registrar (ISO 8601 UTC).", "Calendar date and time when recorded (ISO 8601 UTC).", ""],
  ["eventos", "phase_id", "Fase (si aplica).", "Phase (if applicable).", ""],
  ["eventos", "block_index", "Bloque (si aplica).", "Block (if applicable).", ""],
  ["eventos", "trial_index_global", "Ensayo (si aplica).", "Trial (if applicable).", ""],
  ["eventos", "option", "Alternativa (si aplica).", "Option (if applicable).", ""],
  ["eventos", "response_id", "Respuesta relacionada (si aplica).", "Related response (if applicable).", ""],
  ["eventos", "consequence_id", "Consecuencia relacionada (si aplica).", "Related consequence (if applicable).", ""],
  ["eventos", "contingency_id", "Contingencia relacionada (si aplica).", "Related contingency (if applicable).", ""],
  ["eventos", "details_json", "Resto de campos del evento en JSON. La configuración completa está en el archivo _bruto.json.", "Remaining event fields as JSON. The full configuration is in the _bruto.json file.", ""],
];

const TABLES = ["sesiones", "bloques", "ensayos", "consecuencias", "pantallas", "formularios", "eventos"];

/** Busca la entrada de una columna; admite los patrones con {option}. */
export function lookup(table, variable) {
  for (const [t, v, es, en, unit] of ENTRIES) {
    if (t !== table && t !== "*") continue;
    if (v === variable) return { es, en, unit };
    if (v.includes("{option}")) {
      const [pre, post] = v.split("{option}");
      if (variable.startsWith(pre) && variable.endsWith(post) && variable.length > pre.length + post.length) {
        const opt = variable.slice(pre.length, variable.length - post.length);
        return { es: es.replaceAll("{option}", opt), en: en.replaceAll("{option}", opt), unit };
      }
    }
  }
  return null;
}

/** Filas del diccionario para las columnas realmente exportadas. */
export function buildDictionary(tables) {
  const rows = [];
  for (const t of TABLES) {
    const cols = tables[t]?.length ? Object.keys(tables[t][0]) : [];
    for (const c of cols) {
      const d = lookup(t, c);
      rows.push({ tabla: t, variable: c, descripcion_es: d?.es ?? "SIN DESCRIBIR", description_en: d?.en ?? "UNDESCRIBED", unidad_unit: d?.unit ?? "" });
    }
  }
  return rows;
}
