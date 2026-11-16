// Página de recuperación: lista las sesiones guardadas en este navegador y permite
// descargarlas (paquete completo, reconstruido desde el registro bruto, más los archivos
// propios del estudio si los define) o borrarlas. Los datos personales se listan aparte.

import { listStoredSessions, loadStoredSession, markExported, markSent } from "../datos/almacen-local.js";
import { listPersonalRecords, personalCSV, loadPersonalRecord } from "../datos/personales.js";
import { downloadBytes } from "../datos/paquete.js";
import { buildSessionFiles, downloadFiles } from "../datos/descargas.js";
import { datapipeTarget, buildUploads, sendToDataPipe, describeResult } from "../datos/envio-datapipe.js";
import { escapeHTML } from "./textos.js";
import { ENGINE_VERSION } from "../version.js";

document.getElementById("origen").textContent = location.origin;
// Motor 0.5.0: las tablas se recalculan con el motor de ESTA página. Si una sesión se hizo con
// otro motor (otra versión del estudio servida desde la misma dirección), se avisa.
const otherEngine = (s) => s.engine_version && s.engine_version !== ENGINE_VERSION;

/** Función de archivos propios del estudio (exportar.js en su carpeta), si existe. */
async function studyExporter(events) {
  const start = events.find((e) => e.type === "session_start");
  const page = start?.environment?.page_url;
  const modName = start?.environment?.study_exports_module;
  if (!page || !modName) return null;
  try { return (await import(new URL(modName, page).href)).default; } catch { return null; }
}

function render() {
  const items = listStoredSessions();
  const pers = listPersonalRecords();
  const el = document.getElementById("lista");
  if (!items.length && !pers.length) { el.innerHTML = "<p>No hay sesiones guardadas en este navegador.</p>"; return; }
  el.innerHTML = `
    <h2>Sesiones</h2>
    <p>Esta página usa el motor ${escapeHTML(ENGINE_VERSION)}. ${items.some((s) => !s.error && otherEngine(s)) ? "<b>Las sesiones marcadas con ⚠ se hicieron con otro motor:</b> el registro bruto (<code>_bruto.json</code>) se descarga completo e intacto, pero las tablas y los archivos propios del estudio se recalculan con el motor de esta página. Para obtenerlos con su motor, abre «Recuperar datos» desde el lanzador de esa versión." : ""}</p>
    <table class="lab-lista">
      <tr><th>Tipo</th><th>Estudio</th><th>Motor</th><th>Participante</th><th>Inicio (UTC)</th><th>Cierre</th><th>Eventos</th><th>Descargada</th><th>Enviada</th><th></th></tr>
      ${items.map((s, i) => s.error ? `<tr><td colspan="10">${escapeHTML(s.key)}: ${escapeHTML(s.error)}</td></tr>` : `
        <tr>
          <td>${s.is_test ? "PRUEBA" : "<b>REAL</b>"}</td>
          <td>${escapeHTML(s.study_id)} v${escapeHTML(s.study_version)}</td>
          <td>${escapeHTML(s.engine_version ?? "?")}${otherEngine(s) ? " ⚠" : ""}</td>
          <td>${escapeHTML(s.participant_id)}</td>
          <td>${escapeHTML(s.started ?? "")}</td>
          <td>${escapeHTML(s.end_reason ?? "sin cierre registrado")}</td>
          <td>${s.n_events}</td>
          <td>${s.exported ? "sí" : "no"}</td>
          <td id="envio-${i}">${s.sent ? `sí (${escapeHTML(s.sent_to ?? "")})` : "no"}</td>
          <td>
            <button class="lab-btn" data-accion="descargar" data-i="${i}">Descargar</button>
            <button class="lab-btn secundario" data-accion="enviar" data-i="${i}">Enviar a DataPipe</button>
            <button class="lab-btn secundario" data-accion="borrar" data-i="${i}">Borrar</button>
          </td>
        </tr>`).join("")}
    </table>
    ${pers.length ? `<h2>Datos personales (guardados aparte)</h2>
    <table class="lab-lista">
      <tr><th>Tipo</th><th>Estudio</th><th>Código</th><th>Sesión</th><th></th></tr>
      ${pers.map((p, i) => p.error ? `<tr><td colspan="5">${escapeHTML(p.key)}: ${escapeHTML(p.error)}</td></tr>` : `
        <tr>
          <td>${p.record.is_test ? "PRUEBA" : "<b>REAL</b>"}</td>
          <td>${escapeHTML(p.record.study_id ?? "")}</td>
          <td>${escapeHTML(p.record.participant_id ?? "")}</td>
          <td><code>${escapeHTML(String(p.record.session_id).slice(0, 8))}</code></td>
          <td>
            <button class="lab-btn" data-accion="pers-descargar" data-i="${i}">Descargar</button>
            <button class="lab-btn secundario" data-accion="pers-borrar" data-i="${i}">Borrar</button>
          </td>
        </tr>`).join("")}
    </table>` : ""}`;
  el.querySelectorAll("button").forEach((b) => b.addEventListener("click", async () => {
    const i = Number(b.dataset.i);
    const acc = b.dataset.accion;
    if (acc === "descargar") {
      const s = items[i];
      const v = loadStoredSession(s.key);
      downloadFiles(buildSessionFiles({
        events: v.events, personalRecord: loadPersonalRecord(s.is_test, s.session_id), extraExports: await studyExporter(v.events),
        kind: "recuperada", localSaveStatus: "recuperada_de_almacen_local",
      }));
      markExported(s.key);
      render();
    } else if (acc === "enviar") {
      // Motor 0.6.0: usa la configuración guardada con la sesión (session_start.config).
      const s = items[i];
      const v = loadStoredSession(s.key);
      const start = v.events.find((e) => e.type === "session_start");
      const target = datapipeTarget(start?.config, start?.is_test);
      const cell = document.getElementById(`envio-${i}`);
      if (!target) { cell.textContent = "este estudio no envía a DataPipe"; return; }
      cell.textContent = "enviando…";
      const files = buildSessionFiles({
        events: v.events, personalRecord: loadPersonalRecord(s.is_test, s.session_id), extraExports: await studyExporter(v.events),
        kind: "recuperada", localSaveStatus: "recuperada_de_almacen_local",
      });
      const res = await sendToDataPipe({ uploads: buildUploads({ events: v.events, files, kind: "recuperada", sendZip: target.sendZip }), experimentId: target.experimentId });
      if (res.ok) markSent(s.key, { sent_to: target.destination });
      cell.textContent = describeResult(res, target);
    } else if (acc === "borrar") {
      const s = items[i];
      const aviso = s.exported || s.sent ? "" : "\n\nATENCIÓN: esta sesión NO se ha descargado ni enviado nunca.";
      if (confirm(`¿Borrar del navegador la sesión de ${s.participant_id} (${s.study_id})?${aviso}`)) { localStorage.removeItem(s.key); render(); }
    } else if (acc === "pers-descargar") {
      const r = pers[i].record;
      downloadBytes(new TextEncoder().encode(personalCSV(r)), `${r.is_test ? "PRUEBA_" : ""}${r.study_id}_${r.participant_id ?? "sin_codigo"}_${String(r.session_id).slice(0, 8)}_personales_RECUPERADA.csv`, "text/csv;charset=utf-8");
    } else if (acc === "pers-borrar") {
      if (confirm("¿Borrar del navegador estos datos personales? Hazlo solo si ya los has descargado y guardado.")) { localStorage.removeItem(pers[i].key); render(); }
    }
  }));
}
render();
