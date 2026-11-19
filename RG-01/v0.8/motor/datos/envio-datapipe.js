// Envío de los datos de una sesión a DataPipe (pipe.jspsych.org), que los guarda en el
// almacenamiento del investigador (p. ej., su Google Drive). Motor 0.6.0.
//
// - Se envía lo mismo que se descarga (paquete .zip, archivos propios del estudio, datos
//   personales) y, además, el registro bruto en texto (_bruto.json), que es la fuente de
//   verdad y llega aunque el .zip no se pueda enviar.
// - Destino: el experimento de PRUEBAS de DataPipe para el modo prueba y para cualquier
//   versión que no esté congelada; el experimento REAL solo para sesiones reales de una
//   versión congelada. Así los datos reales nunca se mezclan con pruebas.
// - DataPipe no admite dos archivos con el mismo nombre en un experimento (error FILE_EXISTS):
//   todos los nombres llevan el identificador de la sesión. Si un archivo ya estaba (p. ej.,
//   al reintentar), se considera enviado.
// - API documentada en https://pipe.jspsych.org/docs/api (consultada el 2026-11-16):
//   POST /api/data/ {experimentID, filename, data}  ·  POST /api/base64/ {…, data en base64}
//   201 = guardado · 202 = aceptado y en cola (DataPipe reintenta) · 400 = rechazado (error).
// - El envío no sustituye al guardado en el navegador: si falla, los datos siguen ahí y se
//   pueden reenviar o descargar.

import { buildRawJSON } from "./paquete.js";

export const DATAPIPE_URL = "https://pipe.jspsych.org/api";
// La validación de data.datapipe está en nucleo/config.js (validateConfig).

/**
 * Experimento de DataPipe al que va una sesión, o null si el estudio no usa DataPipe.
 * @returns {{experimentId:string, destination:"pruebas"|"real", sendZip:boolean}|null}
 */
export function datapipeTarget(config, isTest) {
  const dp = config?.data?.datapipe;
  if (!dp) return null;
  const real = !isTest && config.study?.status === "congelado" && dp.experiment_id_real;
  return { experimentId: real ? dp.experiment_id_real : dp.experiment_id_test, destination: real ? "real" : "pruebas", sendZip: dp.send_zip === true };
}

/** Añade el identificador corto de la sesión al nombre si no lo lleva (nombres únicos en DataPipe). */
function uniqueName(filename, sid8) {
  if (filename.includes(sid8)) return filename;
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? `${filename.slice(0, dot)}_${sid8}${filename.slice(dot)}` : `${filename}_${sid8}`;
}

export function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Archivos que se envían: el registro bruto (texto) y los mismos archivos que se descargan
 * (`files`, de buildSessionFiles). Los .csv y .json van como texto; el .zip, en base64.
 * @returns {{filename:string, encoding:"text"|"base64", data:string, label:string}[]}
 */
export function buildUploads({ events, files, kind = "final", sendZip = true }) {
  const start = events.find((e) => e.type === "session_start");
  const sid8 = String(start.session_id).slice(0, 8);
  const dec = new TextDecoder("utf-8", { ignoreBOM: true }); // conserva el BOM de los CSV (acentos en Excel)
  const raw = buildRawJSON(events, { exportKind: kind });
  const out = [{ filename: uniqueName(raw.filename, sid8), encoding: "text", data: raw.text, label: "Registro bruto (_bruto.json)" }];
  for (const f of files) {
    if (/\.zip$/i.test(f.filename)) {
      if (sendZip) out.push({ filename: uniqueName(f.filename, sid8), encoding: "base64", data: bytesToBase64(f.bytes), label: f.label });
    } else {
      out.push({ filename: uniqueName(f.filename, sid8), encoding: "text", data: dec.decode(f.bytes), label: f.label });
    }
  }
  return out;
}

/**
 * Envía los archivos uno a uno. Nunca lanza: devuelve el resultado de cada archivo.
 * @returns {Promise<{ok:boolean, results:{filename:string, label:string, ok:boolean, status:string, code:string|null}[]}>}
 */
export async function sendToDataPipe({ uploads, experimentId, fetchImpl = globalThis.fetch, baseUrl = DATAPIPE_URL, timeoutMs = 60000 }) {
  const results = [];
  for (const u of uploads) {
    const endpoint = `${baseUrl}/${u.encoding === "base64" ? "base64" : "data"}/`;
    let r;
    try {
      const ctrl = typeof AbortController === "function" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "*/*" },
        body: JSON.stringify({ experimentID: experimentId, filename: u.filename, data: u.data }),
        signal: ctrl?.signal,
      });
      if (timer) clearTimeout(timer);
      let body = null;
      try { body = await res.json(); } catch { /* sin cuerpo JSON */ }
      const code = body?.error ?? null;
      if (res.status === 201) r = { ok: true, status: "guardado", code: null };
      else if (res.status === 202) r = { ok: true, status: "en_cola", code: null };
      else if (code === "FILE_EXISTS") r = { ok: true, status: "ya_estaba", code };
      else r = { ok: false, status: `error_${res.status}`, code: code ?? (body?.message ? String(body.message) : null) };
    } catch (err) {
      r = { ok: false, status: "sin_conexion", code: String(err?.name === "AbortError" ? "TIMEOUT" : err?.message ?? err) };
    }
    results.push({ filename: u.filename, label: u.label, ...r });
  }
  return { ok: results.length > 0 && results.every((x) => x.ok), results };
}

/** Texto breve en español para la pantalla del investigador. */
export function describeResult(res, target) {
  const dest = target.destination === "real" ? "experimento REAL" : "experimento de PRUEBAS";
  if (res.ok) return `Datos enviados a DataPipe (${dest}): ${res.results.length} archivos.`;
  const bad = res.results.filter((x) => !x.ok);
  return `ERROR al enviar a DataPipe (${dest}): ${bad.length} de ${res.results.length} archivos sin enviar (${bad.map((x) => `${x.status}${x.code ? " " + x.code : ""}`).join("; ")}). Los datos siguen guardados en este navegador.`;
}
