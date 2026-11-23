// Ejecución de un estudio en el navegador.
//
// Capas: la configuración describe reglas y el flujo de pantallas; el núcleo (nucleo/)
// genera el diseño y decide las consecuencias; este módulo solo presenta y comunica al
// núcleo qué ocurrió y cuándo. jsPsych gestiona la secuencia de pasos; cada paso es una
// función de este archivo, envuelta en un único complemento de jsPsych (plugin.js).

import { ENGINE_VERSION } from "../version.js";
import { validateConfig, applyTestMode, flowFor } from "../nucleo/config.js";
import { configHash } from "../nucleo/hash.js";
import { generateSeed } from "../nucleo/rng.js";
import { browserClock } from "../nucleo/clock.js";
import { createSession } from "../nucleo/session.js";
import { createLocalStore, findPendingSessions, loadStoredSession, markExported, markSent } from "../datos/almacen-local.js";
import { createPersonalStore, loadPersonalRecord } from "../datos/personales.js";
import { buildSessionFiles, downloadFiles } from "../datos/descargas.js";
import { datapipeTarget, buildUploads, sendToDataPipe, describeResult } from "../datos/envio-datapipe.js";
import { detectEnvironment, runChecks } from "./entorno.js";
import { escapeHTML, fill, formatPoints, formatSigned } from "./textos.js";
import { renderForm } from "./formularios.js";
import { makeStepPlugin } from "./plugin.js";

const raf = () => new Promise((res) => requestAnimationFrame(res));
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const round3 = (x) => Math.round(x * 1000) / 1000;

/**
 * @param {object} p
 * @param {object} p.config
 * @param {HTMLElement} p.mount
 * @param {string} [p.experimentRoot]  ruta relativa desde la página del estudio hasta la carpeta
 *   del experimento, la que contiene motor/ (motor 0.3.0: cada experimento lleva su copia del motor).
 *   Por defecto "./", porque index.html está en la propia carpeta del experimento.
 * @param {(ctx:object)=>{filename:string, content:string}[]} [p.extraExports]  archivos propios del estudio
 */
export async function runStudy({ config, mount, experimentRoot = "./", extraExports = null }) {
  const params = new URLSearchParams(location.search);
  const isTest = params.get("prueba") === "1";
  const env = detectEnvironment();
  const checks = runChecks(env);
  const configErrors = validateConfig(config);
  const jsPsychAvailable = typeof window.initJsPsych === "function" && typeof window.jsPsychModule === "object";

  const blocking = [];
  if (!jsPsychAvailable) blocking.push("No se encuentra jsPsych en motor/vendor de este experimento. Su copia del motor está incompleta: vuelve a copiarla desde base/motor (MANUAL de base, «Actualizar el motor de un experimento») y recarga esta página.");
  for (const c of checks) if (!c.ok && c.blocking) blocking.push(c.message);
  for (const e of configErrors) blocking.push(`Configuración: ${e}`);

  // Precarga de archivos de estímulos (personajes). Un fallo impide iniciar la sesión.
  // SVG: se inserta su texto. Imagen (png, jpg, webp; motor 0.2.2): se descarga y se
  // descodifica antes de empezar, y se inserta ese mismo elemento para que aparezca entera.
  const assets = {};
  const preloadedImages = {};
  if (configErrors.length === 0) {
    for (const s of config.flow ?? []) {
      if (s.step !== "speech" || assets[s.character] || preloadedImages[s.character]) continue;
      try {
        if (/\.(png|jpe?g|webp)$/i.test(s.character)) {
          const img = new Image();
          img.alt = "";
          img.src = s.character;
          await img.decode();
          if (!img.naturalWidth) throw new Error("imagen vacía");
          preloadedImages[s.character] = img;
          continue;
        }
        const r = await fetch(s.character, { cache: "no-store" });
        const text = await r.text();
        if (!r.ok || !/<svg[\s>]/.test(text)) throw new Error(`HTTP ${r.status}`);
        assets[s.character] = text;
      } catch (err) {
        blocking.push(`No se pudo cargar el estímulo «${s.character}» (${err.message}).`);
      }
    }
  }

  let hash = null;
  if (blocking.length === 0) hash = await configHash(config);

  // Sesiones anteriores de este estudio que nunca se descargaron (p. ej., se cerró la
  // pestaña antes de terminar): las cerradas se descargan ya; las que no tienen cierre
  // registrado (podrían seguir abiertas en otra pestaña) quedan con un botón.
  // Motor 0.6.0: si el estudio envía a DataPipe, también se reenvían las sesiones sin enviar.
  const usesDataPipe = Boolean(config.data?.datapipe) && configErrors.length === 0;
  const pending = config.study?.id ? findPendingSessions(config.study.id, config.study.version, { requireSent: usesDataPipe }) : [];
  const pendingFiles = (s) => {
    const v = loadStoredSession(s.key);
    return {
      events: v.events,
      files: buildSessionFiles({
        events: v.events, personalRecord: loadPersonalRecord(s.is_test, s.session_id), extraExports,
        kind: "interrumpida", localSaveStatus: "recuperada_al_abrir_el_estudio",
      }),
    };
  };
  const downloadPending = (s) => {
    const { files } = pendingFiles(s);
    downloadFiles(files);
    markExported(s.key);
    s.exported = true;
    return files.length;
  };
  const sendPending = async (s) => {
    const target = datapipeTarget(config, s.is_test);
    if (!target) return null;
    const { events, files } = pendingFiles(s);
    const res = await sendToDataPipe({ uploads: buildUploads({ events, files, kind: "interrumpida", sendZip: target.sendZip }), experimentId: target.experimentId });
    if (res.ok) { markSent(s.key, { sent_to: target.destination }); s.sent = true; }
    return describeResult(res, target);
  };
  for (const s of pending) if (s.closed && !s.exported) s.downloaded = downloadPending(s);

  renderSetup({ mount, config, isTest, env, checks, blocking, hash, experimentRoot, params, pending, downloadPending, sendPending,
    onStart: ({ pid, group, language }) => startSession({ config, mount, isTest, env, hash, pid, group, language, experimentRoot, assets, preloadedImages, extraExports }) });
}

const LANGUAGE_NAMES = { es: "Español", en: "English" };

/** Adónde van los datos al terminar (pantalla del investigador). Motor 0.6.0. */
function dataDestination(config, isTest) {
  const dl = config.data?.auto_download ? "descarga en este ordenador" : "botón «Descargar datos» al final";
  const t = datapipeTarget(config, isTest);
  return t ? `envío a DataPipe (experimento ${t.destination === "real" ? "REAL" : "de PRUEBAS"}) + ${dl}` : dl;
}

// ------------------------------------------------------------------------------------
// Pantalla del investigador
// ------------------------------------------------------------------------------------
function renderSetup({ mount, config, isTest, env, checks, blocking, hash, experimentRoot, params, pending = [], downloadPending, sendPending = null, onStart }) {
  const eff = isTest && Array.isArray(config.phases) ? applyTestMode(config) : config;
  const planned = Array.isArray(eff.phases) ? eff.phases.map((p) => `${p.id}: ${p.blocks} × ${p.trials_per_block}`).join(" · ") : "—";
  const warnings = checks.filter((c) => !c.ok && !c.blocking).map((c) => c.message);
  if (config.study?.status !== "congelado") warnings.unshift("Versión en borrador: no usar con participantes reales.");
  const base = location.pathname;
  const idFromForm = config.participant?.id_source === "form";
  const groups = config.group?.available ?? [];
  // Idioma del participante (motor 0.5.0): lo elige el investigador si hay varios.
  const languages = config.languages_available ?? [config.language];

  mount.innerHTML = `
    <div class="lab-setup">
      <h1>${escapeHTML(config.study?.id ?? "?")}</h1>
      <div class="lab-sub">Pantalla del investigador</div>
      ${isTest ? `<div class="lab-aviso prueba">MODO PRUEBA · sesión acortada (${escapeHTML(planned)}). Los datos se marcan como prueba (archivos PRUEBA_) y se guardan aparte de los reales.</div>` : ""}
      ${blocking.length ? `<div class="lab-aviso error"><b>No se puede iniciar la sesión:</b><ul>${blocking.map((m) => `<li>${escapeHTML(m)}</li>`).join("")}</ul></div>` : ""}
      ${warnings.length ? `<div class="lab-aviso warn"><ul>${warnings.map((m) => `<li>${escapeHTML(m)}</li>`).join("")}</ul></div>` : ""}
      ${pending.length ? `<div class="lab-aviso warn" id="lab-pendientes"><b>Sesiones anteriores en este navegador sin descargar${sendPending && config.data?.datapipe ? " o sin enviar a DataPipe" : ""}:</b><ul>${pending.map((s, i) => `<li>${s.is_test ? "PRUEBA" : "REAL"} · participante <code>${escapeHTML(s.participant_id ?? "—")}</code> · ${escapeHTML(s.started ?? "")} · ${s.closed ? `cierre: ${escapeHTML(s.end_reason)}${s.downloaded ? ` · <b>descargada ahora (${s.downloaded} archivos, terminan en _INTERRUMPIDA)</b>` : ""}${config.data?.datapipe && !s.sent ? ` · <span data-envio="${i}">enviando a DataPipe…</span>` : ""}` : `sin cierre registrado (¿sigue abierta en otra pestaña?) <button type="button" class="lab-btn secundario" data-pendiente="${i}">Descargar${config.data?.datapipe ? " y enviar" : ""}</button>`}</li>`).join("")}</ul>Si el navegador pregunta si permites descargar varios archivos, pulsa «Permitir».</div>` : ""}
      <table>
        <tr><td>Estudio</td><td>${escapeHTML(config.study?.id ?? "?")} v${escapeHTML(config.study?.version ?? "?")} (${escapeHTML(config.study?.status ?? "?")})</td></tr>
        <tr><td>Motor</td><td>${ENGINE_VERSION}</td></tr>
        <tr><td>Huella de la configuración</td><td><code>${hash ? hash.slice(0, 12) : "—"}</code></td></tr>
        ${isTest ? `<tr><td>Ensayos (fase: bloques × ensayos)</td><td>${escapeHTML(planned)}</td></tr>` : ""}
        <tr><td>Datos al terminar</td><td>${escapeHTML(dataDestination(config, isTest))}</td></tr>
        ${languages.length > 1 ? "" : `<tr><td>Idioma del participante</td><td>${escapeHTML(LANGUAGE_NAMES[config.language] ?? config.language ?? "?")}</td></tr>`}
        <tr><td>Navegador</td><td>${escapeHTML(env.browser_name)} ${escapeHTML(env.browser_version ?? "")} · ${escapeHTML(env.os ?? "")}</td></tr>
      </table>
      <form id="lab-form" autocomplete="off">
        ${groups.length ? `<label for="lab-group">Grupo</label>
          <select id="lab-group" ${groups.length === 1 ? "disabled" : ""}>${groups.map((g) => `<option value="${escapeHTML(g)}" ${g === config.group.value ? "selected" : ""}>${escapeHTML(g)}</option>`).join("")}</select>` : ""}
        ${languages.length > 1 ? `<label for="lab-lang">Idioma del participante</label>
          <select id="lab-lang">${languages.map((l) => `<option value="${escapeHTML(l)}" ${l === config.language ? "selected" : ""}>${escapeHTML(LANGUAGE_NAMES[l] ?? l)}</option>`).join("")}</select>` : ""}
        ${idFromForm
          ? `<p>El código del participante lo escribe el propio participante en el primer formulario.</p>`
          : `<label for="lab-pid">Código del participante</label>
             <input type="text" id="lab-pid" value="${escapeHTML(params.get("pid") ?? "")}" ${blocking.length ? "disabled" : ""}>`}
        <div id="lab-pid-error" class="lab-aviso error" hidden></div>
        <div><button type="submit" class="lab-btn" ${blocking.length ? "disabled" : ""}>Iniciar sesión</button></div>
      </form>
      <p style="margin-top:2rem">
        ${isTest ? `<a href="${base}">Cambiar a sesión real</a>` : `<a href="${base}?prueba=1">Cambiar a modo prueba</a>`}
        · <a href="${experimentRoot}motor/recuperar.html">Recuperar datos</a>
      </p>
    </div>`;

  mount.querySelectorAll("[data-pendiente]").forEach((b) => b.addEventListener("click", async () => {
    const s = pending[Number(b.dataset.pendiente)];
    const n = s.exported ? 0 : downloadPending(s);
    const msg = Object.assign(document.createElement("b"), { textContent: n ? `descargada (${n} archivos)` : "" });
    b.replaceWith(msg);
    if (sendPending && config.data?.datapipe && !s.sent) {
      msg.textContent += `${n ? " · " : ""}enviando a DataPipe…`;
      msg.textContent = `${n ? `descargada (${n} archivos) · ` : ""}${await sendPending(s)}`;
    }
  }));
  // Envío a DataPipe de las sesiones cerradas que no se habían enviado (motor 0.6.0).
  mount.querySelectorAll("[data-envio]").forEach(async (span) => {
    span.textContent = await sendPending(pending[Number(span.dataset.envio)]);
  });

  mount.querySelector("#lab-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (blocking.length) return;
    const group = groups.length ? mount.querySelector("#lab-group").value : null;
    const language = languages.length > 1 ? mount.querySelector("#lab-lang").value : config.language;
    if (idFromForm) { onStart({ pid: null, group, language }); return; }
    const pid = mount.querySelector("#lab-pid").value.trim();
    const errBox = mount.querySelector("#lab-pid-error");
    if (!new RegExp(config.participant.id_pattern).test(pid)) {
      errBox.hidden = false;
      errBox.textContent = `El código no es válido. Debe cumplir el patrón ${config.participant.id_pattern} (letras sin acentos, números, guion o guion bajo).`;
      return;
    }
    onStart({ pid, group, language });
  });
}

// ------------------------------------------------------------------------------------
// Sesión
// ------------------------------------------------------------------------------------
function startSession({ config, mount, isTest, env, hash, pid, group, language, experimentRoot, assets, preloadedImages = {}, extraExports }) {
  // El idioma elegido solo cambia la configuración efectiva: la huella (hash) sigue siendo
  // la de config.js tal como está escrito, y el idioma usado queda en session_start.language.
  const base = isTest ? applyTestMode(config) : config;
  const eff = language && language !== base.language ? { ...base, language } : base;
  const lang = eff.language;
  document.documentElement.lang = lang;
  const tx = eff.texts[lang];
  const seed = config.seed === "auto" ? generateSeed() : config.seed;

  mount.innerHTML = "";
  const jsPsych = window.initJsPsych({ display_element: mount, on_finish: () => renderEnd() });
  let jsPsychVersion = null;
  try { jsPsychVersion = typeof jsPsych.version === "function" ? jsPsych.version() : null; } catch { /* sin versión */ }

  const session = createSession({
    config, effectiveConfig: eff, configHash: hash, seed, participantId: pid, condition: group, isTest,
    environment: { ...env, jspsych_version: jsPsychVersion, study_exports_module: extraExports ? "exportar.js" : null }, clock: browserClock,
  });
  const store = createLocalStore({ isTest, sessionId: session.sessionId });
  const personal = createPersonalStore({ isTest, sessionId: session.sessionId });
  session.log.onAppend(() => store.schedule(session.log.events));
  if (eff.participant.id_source !== "form") session.start();

  const live = () => session.started && !session.finished;

  // ---- incidencias: se registran, no pausan nada ----
  document.addEventListener("visibilitychange", () => { if (live()) session.incident(document.hidden ? "visibility_hidden" : "visibility_visible"); });
  window.addEventListener("blur", () => { if (live()) session.incident("window_blur"); });
  window.addEventListener("focus", () => { if (live()) session.incident("window_focus"); });
  window.addEventListener("error", (e) => { if (live()) session.incident("error", { message: String(e.message), source: e.filename ?? null, line: e.lineno ?? null }); });
  window.addEventListener("unhandledrejection", (e) => { if (live()) session.incident("error", { message: String(e.reason) }); });
  window.addEventListener("beforeunload", (e) => { if (!session.finished) { e.preventDefault(); e.returnValue = ""; } });
  window.addEventListener("pagehide", () => {
    if (live()) {
      session.finish("abandoned");
      store.setMeta({ status: "abandonada" });
      store.flushNow(session.log.events);
    }
  });
  // Copia de emergencia: Ctrl + Mayús + E en cualquier momento (la sesión continúa).
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e") && session.started) {
      e.preventDefault();
      session.incident("emergency_export");
      downloadFiles(buildSessionFiles({ events: session.log.events, personalRecord: personal.record, extraExports, kind: "emergencia", localSaveStatus: store.describe() }));
    }
  });

  // ---- consecuencias con demora en segundos ----
  if (eff.contingencies.some((k) => k.delay.mode === "seconds")) {
    setInterval(() => { if (live() && session.tick().length) updateHeader(); }, 50);
  }

  const optLabel = (o) => eff.options[o].label[lang];
  const optContent = (o) => eff.options[o].stimulus?.svg ?? escapeHTML(optLabel(o));
  const headerHTML = () => {
    const b = session.balances;
    let h = "";
    if (eff.display.show_balance) h += `${escapeHTML(tx.balance_label)}: <b class="lab-balance">${formatPoints(b.available)}</b>`;
    if (eff.display.show_pending) h += `<span class="lab-pending">${escapeHTML(tx.pending_label)}: <b>${formatPoints(b.pending)}</b></span>`;
    return h;
  };
  function updateHeader() {
    const hd = mount.querySelector(".lab-header");
    if (hd) hd.innerHTML = headerHTML();
  }
  const feedbackClass = (net) => (eff.display.feedback_colored === false ? "neutral" : net < 0 ? "loss" : "gain");

  // ---- pasos ----
  const steps = [];
  const timeline = [];
  const StepPlugin = makeStepPlugin(window.jsPsychModule, steps, ENGINE_VERSION);
  const push = (step) => { steps.push(step); timeline.push({ type: StepPlugin, step: steps.length - 1 }); };
  // Cada constructor de pasos recibe «emit»: por defecto añade el paso a la secuencia de
  // jsPsych (push); dentro de un tramo repetible lo guarda en la lista del tramo (0.4.0).
  const action = (kind, fn, emit = push) => emit({ kind, run(el, done) { fn(); done(); } });

  function screenStep(screenId, htmlFn, buttonText, before, emit = push) {
    emit({
      kind: `screen:${screenId}`,
      async run(el, done) {
        if (before) before();
        el.innerHTML = `<div class="lab-screen">${htmlFn()}<div><button type="button" class="lab-continue">${escapeHTML(buttonText)}</button></div></div>`;
        // El botón responde desde que existe; el inicio de la pantalla se estima con el primer fotograma.
        let ts = null;
        el.querySelector(".lab-continue").addEventListener("click", (e) => {
          if (session.started) session.log.appendAt("screen_continue", e.timeStamp, { screen_id: screenId, method: "button", latency_ms: ts === null ? null : round3(e.timeStamp - ts), ...session.repeatInfo });
          done();
        }, { once: true });
        ts = await raf();
        if (session.started) session.log.appendAt("screen_onset", ts, { screen_id: screenId, ...session.repeatInfo });
      },
    });
  }

  const formCounts = {};
  function formStep(s, emit = push) {
    formCounts[s.form] = (formCounts[s.form] ?? 0) + 1;
    const instance = s.instance ?? (formCounts[s.form] > 1 ? `${s.form}_${formCounts[s.form]}` : s.form);
    const form = eff.forms[s.form];
    emit({
      kind: `form:${instance}`,
      run(el, done) {
        renderForm(el, form, {
          lang, tx, idPattern: eff.participant.id_pattern,
          onSubmit: (values, formTimeMs) => {
            const logged = {};
            const pers = {};
            let code = null;
            for (const fd of form.fields) {
              const keys = [fd.id, `${fd.id}_otro`].filter((k) => k in values);
              for (const k of keys) (fd.personal ? pers : logged)[k] = values[k];
              if (fd.participant_id) code = values[fd.id] === null ? null : String(values[fd.id]).trim();
            }
            if (code !== null || form.fields.some((fd) => fd.participant_id)) {
              const pidFinal = code ?? (isTest ? "PRUEBA" : null);
              if (!session.started) session.start({ participantId: pidFinal });
            }
            if (Object.keys(pers).length) personal.add(instance, pers, { participantId: session.participantId, studyId: eff.study.id });
            if (session.started) {
              session.log.append("form_submitted", {
                form_id: s.form, form_instance: instance, values: logged,
                personal_fields: Object.keys(pers), form_time_ms: formTimeMs, ...session.repeatInfo,
              });
            }
            done();
          },
        });
      },
    });
  }

  function countdownStep(s, emit = push) {
    emit({
      kind: "countdown",
      async run(el, done) {
        el.innerHTML = `<div class="lab-countdown">${s.text_key ? `<div class="lab-countdown-text">${tx[s.text_key]}</div>` : ""}<div class="lab-countdown-num"></div></div>`;
        const num = el.querySelector(".lab-countdown-num");
        let first = null;
        for (let n = s.from; n >= 1; n--) {
          num.textContent = String(n);
          const ts = await raf();
          if (first === null) { first = ts; if (session.started) session.log.appendAt("screen_onset", ts, { screen_id: s.id ?? "countdown", ...session.repeatInfo }); }
          if (session.started) session.log.appendAt("countdown_tick", ts, { value: n });
          await wait(s.step_ms);
        }
        if (session.started) {
          const end = performance.now();
          session.log.appendAt("screen_continue", end, { screen_id: s.id ?? "countdown", method: "auto", latency_ms: round3(end - first), ...session.repeatInfo });
        }
        done();
      },
    });
  }

  function speechStep(s, emit = push) {
    emit({
      kind: `speech:${s.id}`,
      async run(el, done) {
        el.innerHTML = `
          <div class="lab-speech">
            <div class="lab-speech-row">
              <div class="lab-character">${assets[s.character] ?? ""}</div>
              <div class="lab-bubble">${tx[s.bubble_key]}</div>
            </div>
            <div class="lab-speech-footer">${tx[s.footer_key]}</div>
            ${s.advance === "button" ? `<div class="lab-speech-button"><button type="button" class="lab-continue">${escapeHTML(tx[s.button_key ?? "continue_button"])}</button></div>` : ""}
          </div>`;
        if (preloadedImages[s.character]) el.querySelector(".lab-character").appendChild(preloadedImages[s.character]);
        // Se avanza con un botón (motor 0.5.0, advance: "button") o con la barra espaciadora
        // (advance_key: " "). El control responde desde que la pantalla existe; el inicio se
        // estima con el primer fotograma.
        let ts = null;
        if (s.advance === "button") {
          el.querySelector(".lab-speech-button .lab-continue").addEventListener("click", (e) => {
            if (session.started) session.log.appendAt("screen_continue", e.timeStamp, { screen_id: s.id, method: "button", latency_ms: ts === null ? null : round3(e.timeStamp - ts) });
            done();
          }, { once: true });
        } else {
          const onKey = (e) => {
            if (e.key !== " " && e.code !== "Space") return;
            e.preventDefault();
            window.removeEventListener("keydown", onKey);
            if (session.started) session.log.appendAt("screen_continue", e.timeStamp, { screen_id: s.id, method: "key:space", latency_ms: ts === null ? null : round3(e.timeStamp - ts) });
            done();
          };
          window.addEventListener("keydown", onKey);
        }
        if (session.started && s.instruction_id) session.setInstruction(s.instruction_id, { screen_id: s.id, text_html: tx[s.bubble_key] });
        ts = await raf();
        if (session.started) session.log.appendAt("screen_onset", ts, { screen_id: s.id });
      },
    });
  }

  function choiceStep(designTrial, phaseCfg, emit = push) {
    const tcfg = phaseCfg.trial;
    emit({
      kind: "choice",
      async run(el, done) {
        // La sesión devuelve el ensayo con su número definitivo (distinto en cada repetición).
        const trial = session.beginTrial(designTrial);
        // Ensayo forzado (motor 0.4.0): las alternativas no disponibles se ven atenuadas y
        // bloqueadas; un clic sobre ellas se registra como entrada ignorada.
        const locked = (o) => trial.forced_option != null && o !== trial.forced_option;
        el.innerHTML = `
          <div class="lab-trial">
            <div class="lab-header">${headerHTML()}</div>
            <div class="lab-choice-area">
              ${trial.positions.map((o, i) => `<button type="button" class="lab-option${eff.options[o].stimulus ? " lab-option-svg" : ""}${locked(o) ? " lab-option-locked" : ""}" tabindex="-1" data-option="${escapeHTML(o)}" data-position="${i + 1}"${locked(o) ? ' aria-disabled="true"' : ""} aria-label="${escapeHTML(optLabel(o))}">${optContent(o)}</button>`).join("")}
            </div>
            <div class="lab-feedback" aria-live="polite"></div>
          </div>`;
        const buttons = [...el.querySelectorAll(".lab-option")];
        const fb = el.querySelector(".lab-feedback");
        let lastDown = null;
        let windowTimer = null;
        let closed = false;
        const hideOptions = () => buttons.forEach((b) => { b.style.visibility = "hidden"; });

        const interTrial = async () => {
          if (closed) return;
          closed = true;
          hideOptions();
          if (tcfg.iti_display === "fixation") {
            fb.className = "lab-feedback lab-fixation";
            fb.textContent = "+";
            const on = await raf();
            session.log.appendAt("fixation_onset", on, { trial_index_global: trial.trial_index_global, scheduled_ms: tcfg.iti_ms });
            await wait(tcfg.iti_ms);
            fb.textContent = "";
            const off = await raf();
            session.log.appendAt("fixation_offset", off, { trial_index_global: trial.trial_index_global });
          } else {
            await wait(tcfg.iti_ms);
          }
          session.endTrial();
          done();
        };

        for (const b of buttons) {
          b.addEventListener("pointerdown", (e) => { lastDown = { option: b.dataset.option, type: e.pointerType || "unknown", t: e.timeStamp }; });
          b.addEventListener("click", async (e) => {
            const option = b.dataset.option;
            const sameDown = lastDown && lastDown.option === option;
            const modality = sameDown ? lastDown.type : (e.detail === 0 ? "keyboard" : "unknown");
            const r = session.respond({ option, tAbs: e.timeStamp, modality, pointerdownAbs: sameDown ? lastDown.t : null });
            lastDown = null;
            if (!r) return; // entrada ignorada (ya registrada)
            clearTimeout(windowTimer);
            if (tcfg.hide_options_during_feedback) hideOptions();
            updateHeader();
            const lines = r.delivered_now.map((c) => fill(c.signed_value >= 0 ? tx.feedback_gain : tx.feedback_loss, { magnitude: formatPoints(c.magnitude), unit_label: c.magnitude === 1 ? tx.unit_point : tx.unit_points }));
            const net = r.delivered_now.reduce((s, c) => s + c.signed_value, 0);
            fb.className = `lab-feedback ${feedbackClass(net)}`;
            fb.innerHTML = lines.length ? lines.join("<br>") : tx.feedback_none;
            const on = await raf();
            session.markFeedback("on", on, { scheduled_ms: tcfg.feedback_ms, shown_html: fb.innerHTML });
            await wait(tcfg.feedback_ms);
            fb.innerHTML = "";
            hideOptions();
            const off = await raf();
            session.markFeedback("off", off, { scheduled_ms: tcfg.feedback_ms });
            interTrial();
          });
        }
        const onset = await raf();
        session.markOnset(onset);
        if (tcfg.response_window_ms) {
          windowTimer = setTimeout(() => {
            session.registerOmission(performance.now());
            interTrial();
          }, tcfg.response_window_ms);
        }
      },
    });
  }

  /** «+X» al final del bloque: se entregan las consecuencias end_of_block y se muestran. */
  function blockFeedbackStep(phaseCfg, emit = push) {
    const f = phaseCfg.block_end_feedback;
    emit({
      kind: "block_feedback",
      async run(el, done) {
        const { total, delivered } = session.endBlock();
        if (total === 0 && !f.show_zero) {
          session.log.append("block_feedback_skipped", { reason: "zero_and_show_zero_false", n_delivered: delivered.length });
          done();
          return;
        }
        el.innerHTML = `
          <div class="lab-trial">
            <div class="lab-header">${headerHTML()}</div>
            <div class="lab-choice-area"></div>
            <div class="lab-feedback ${feedbackClass(total)}">${fill(tx.block_end_feedback, { signed_delivered: formatSigned(total) })}</div>
          </div>`;
        const on = await raf();
        session.log.appendAt("block_feedback_onset", on, { delivered_value: total, n_delivered: delivered.length, scheduled_ms: f.duration_ms });
        await wait(f.duration_ms);
        el.querySelector(".lab-feedback").innerHTML = "";
        const off = await raf();
        session.log.appendAt("block_feedback_offset", off, { scheduled_ms: f.duration_ms });
        done();
      },
    });
  }

  // ---- secuencia a partir del flujo ----
  const blockTotalByPhase = Object.fromEntries(eff.phases.map((p) => [p.id, p.blocks]));

  function phaseSteps(s, emit) {
    const ph = session.design.phases.find((x) => x.phase_id === s.phase);
    const phaseCfg = eff.phases.find((p) => p.id === s.phase);
    action("phase_start", () => session.beginPhase(ph.phase_id), emit);
    for (const blk of ph.blocks) {
      action("block_start", () => session.beginBlock(blk), emit);
      for (const t of blk.trials) choiceStep(t, phaseCfg, emit);
      if (phaseCfg.block_end_screen) {
        let summary = null;
        screenStep(
          `block_end:${ph.phase_id}:${blk.block_index}`,
          () => fill(tx.block_end_html, {
            block_number: blk.block_index, block_total: blockTotalByPhase[ph.phase_id],
            delivered: formatPoints(summary.total), balance: formatPoints(session.balances.available),
          }),
          tx.continue_button,
          () => { summary = session.endBlock(); },
          emit,
        );
      } else if (phaseCfg.block_end_feedback) {
        blockFeedbackStep(phaseCfg, emit);
      } else {
        action("block_end", () => session.endBlock(), emit);
      }
    }
    action("phase_end", () => session.endPhase(), emit);
  }

  /** Ejecuta un paso guardado (dentro de un tramo repetible) y espera a que termine. */
  const runInner = (step, el) => new Promise((resolve) => { el.innerHTML = ""; step.run(el, () => resolve()); });

  /** Pantalla final del tramo repetible: dos botones, sin más texto. Devuelve "repeat" o "continue". */
  function repeatChoice(el, s, n) {
    return new Promise((resolve) => {
      const screenId = `${s.id}:eleccion`;
      el.innerHTML = `<div class="lab-screen lab-repeat-choice">
          <button type="button" class="lab-continue" data-choice="repeat">${escapeHTML(tx[s.repeat_button_key])}</button>
          <button type="button" class="lab-continue" data-choice="continue">${escapeHTML(tx[s.continue_button_key])}</button>
        </div>`;
      let ts = null;
      const onClick = (e) => {
        const choice = e.currentTarget.dataset.choice;
        el.querySelectorAll("[data-choice]").forEach((b) => b.removeEventListener("click", onClick));
        const latency = ts === null ? null : round3(e.timeStamp - ts);
        session.log.appendAt("screen_continue", e.timeStamp, { screen_id: screenId, method: `button:${choice}`, latency_ms: latency, ...session.repeatInfo });
        session.log.appendAt("repeat_choice", e.timeStamp, { repeat_id: s.id, repetition: n, choice, latency_ms: latency });
        resolve(choice);
      };
      el.querySelectorAll("[data-choice]").forEach((b) => b.addEventListener("click", onClick));
      raf().then((t) => { ts = t; session.log.appendAt("screen_onset", t, { screen_id: screenId, ...session.repeatInfo }); });
    });
  }

  /**
   * Tramo repetible (motor 0.4.0): ejecuta sus pasos y al final ofrece repetirlos o
   * continuar. Sin límite de repeticiones. Lo gestiona el motor, no jsPsych: para jsPsych
   * es un único paso. Las posiciones y la secuencia son las mismas en cada repetición.
   */
  function repeatStep(s) {
    const inner = [];
    const emitInner = (step) => inner.push(step);
    for (const x of s.steps) buildStep(x, emitInner);
    push({
      kind: `repeat:${s.id}`,
      async run(el, done) {
        for (let n = 1; ; n++) {
          session.beginRepetition(s.id, n);
          for (const step of inner) await runInner(step, el);
          const choice = await repeatChoice(el, s, n);
          if (choice === "continue") break;
        }
        session.endRepeat(s.id);
        done();
      },
    });
  }

  function buildStep(s, emit = push) {
    if (s.step === "form") formStep(s, emit);
    else if (s.step === "countdown") countdownStep(s, emit);
    else if (s.step === "screen") screenStep(s.id ?? s.text_key, () => tx[s.text_key], tx[s.button_key ?? "continue_button"], null, emit);
    else if (s.step === "speech") speechStep(s, emit);
    else if (s.step === "phase") phaseSteps(s, emit);
    else if (s.step === "reset_balance") action("reset_balance", () => session.resetBalance(s.id ?? null), emit);
    else if (s.step === "repeat") repeatStep(s);
    else if (s.step === "end") {
      action("session_end", () => {
        if (!session.started) session.start({ participantId: isTest ? "PRUEBA" : null });
        session.finish("completed");
        store.setMeta({ status: "completada" });
        store.flushNow(session.log.events);
      }, emit);
    }
  }
  for (const s of flowFor(eff, group)) buildStep(s);

  if (isTest) {
    const band = document.createElement("div");
    band.className = "lab-banda-prueba";
    band.textContent = "MODO PRUEBA";
    document.body.appendChild(band);
  }

  jsPsych.run(timeline);

  // ---- pantalla final, descarga y envío ----
  const target = datapipeTarget(config, isTest); // null si el estudio no envía a DataPipe
  const prepareFiles = () => buildSessionFiles({
    events: session.log.events, personalRecord: personal.record, extraExports, kind: "final", localSaveStatus: store.describe(),
  });

  function renderEnd() {
    const saved = store.status;
    mount.innerHTML = `
      <div class="lab-screen">
        ${fill(tx.end_html, { balance: formatPoints(session.balances.available) })}
        <div class="lab-investigador">
          <div>Para el investigador · participante <code>${escapeHTML(session.participantId ?? "—")}</code> · sesión <code>${session.sessionId.slice(0, 8)}</code>${group ? ` · grupo ${escapeHTML(group)}` : ""}${isTest ? " · <b>PRUEBA</b>" : ""}</div>
          <div class="lab-estado">${saved.ok ? `Guardado en este navegador: correcto (${saved.last_saved_seq} eventos).` : `<b>Guardado en este navegador: ERROR</b> (${escapeHTML(saved.last_error ?? "desconocido")}). Descarga los datos ahora.`}</div>
          ${target ? `<div id="lab-envio-estado" class="lab-estado">Enviando los datos a DataPipe…</div>
          <button type="button" class="lab-btn secundario" id="lab-reenviar" hidden>Reintentar el envío</button>` : ""}
          <button type="button" class="lab-btn" id="lab-descargar">Descargar datos</button>
          <div id="lab-descarga-estado" class="lab-estado"></div>
          <p>Si la descarga falla, abre <a href="${experimentRoot}motor/recuperar.html" target="_blank">Recuperar datos</a> en este mismo navegador.</p>
        </div>
      </div>`;
    const status = mount.querySelector("#lab-descarga-estado");
    // Envío a DataPipe (motor 0.6.0). No sustituye al guardado en el navegador ni a la descarga.
    const send = async () => {
      const box = mount.querySelector("#lab-envio-estado");
      const retry = mount.querySelector("#lab-reenviar");
      retry.hidden = true;
      box.textContent = "Enviando los datos a DataPipe…";
      try {
        const res = await sendToDataPipe({ uploads: buildUploads({ events: session.log.events, files: prepareFiles(), kind: "final", sendZip: target.sendZip }), experimentId: target.experimentId });
        box.innerHTML = `${res.ok ? "" : "<b>"}${escapeHTML(describeResult(res, target))}${res.ok ? "" : "</b>"}<ul>${res.results.map((r) => `<li><code>${escapeHTML(r.filename)}</code> · ${r.ok ? (r.status === "en_cola" ? "aceptado (en cola)" : r.status === "ya_estaba" ? "ya estaba enviado" : "guardado") : `<b>${escapeHTML(r.status)}${r.code ? " " + escapeHTML(r.code) : ""}</b>`}</li>`).join("")}</ul>`;
        if (res.ok) {
          store.setMeta({ sent: true, sent_at: new Date().toISOString(), sent_to: target.destination });
          store.flushNow(session.log.events);
        } else retry.hidden = false;
      } catch (err) {
        box.innerHTML = `<b>Error al preparar el envío:</b> ${escapeHTML(String(err))}. Los datos siguen guardados en este navegador.`;
        retry.hidden = false;
      }
    };
    if (target) mount.querySelector("#lab-reenviar").addEventListener("click", send);
    const download = () => {
      try {
        const files = prepareFiles();
        downloadFiles(files);
        store.setMeta({ exported: true, exported_at: new Date().toISOString() });
        store.flushNow(session.log.events);
        status.innerHTML = `Descargas iniciadas (${files.length} archivos):<ul>${files.map((f) => `<li><code>${escapeHTML(f.filename)}</code> · ${escapeHTML(f.label)}</li>`).join("")}</ul>Comprueba que están en la carpeta Descargas. Si el navegador pregunta si permites descargar varios archivos, pulsa «Permitir».`;
      } catch (err) {
        status.innerHTML = `<b>Error al preparar los datos:</b> ${escapeHTML(String(err))}. Usa Recuperar datos.`;
      }
    };
    mount.querySelector("#lab-descargar").addEventListener("click", download);
    if (eff.data?.auto_download) download();
    if (target) send();
  }
}
