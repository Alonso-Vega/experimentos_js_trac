// Sustitución de marcadores {nombre} en los textos de la configuración y formato de puntos.
// Los textos de la configuración son HTML de confianza (los escribe el laboratorio);
// los valores que se insertan se escapan.

export function escapeHTML(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function fill(template, vars = {}) {
  return template.replace(/\{([a-z_]+)\}/g, (m, k) => (k in vars ? escapeHTML(vars[k]) : m));
}

const MINUS = "−"; // signo menos tipográfico

/** Puntos para el marcador: 12, −3, 2.50 */
export function formatPoints(n) {
  const abs = Math.abs(n);
  const s = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
  return n < 0 ? MINUS + s : s;
}

/** Puntos con signo explícito: +5, −1, +0 */
export function formatSigned(n) {
  return (n < 0 ? "" : "+") + formatPoints(n);
}
