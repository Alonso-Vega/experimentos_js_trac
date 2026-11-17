// JSON canónico (claves ordenadas) y huella SHA-256 de la configuración.
// La huella identifica exactamente qué configuración produjo cada archivo de datos.

export function canonicalJSON(value) {
  return JSON.stringify(normalize(value, "config"));
}

function normalize(v, path) {
  if (v === null) return null;
  const t = typeof v;
  if (t === "string" || t === "boolean") return v;
  if (t === "number") {
    if (!Number.isFinite(v)) throw new Error(`Valor numérico no válido en ${path}`);
    return v;
  }
  if (t === "undefined") throw new Error(`Valor sin definir en ${path}`);
  if (t === "function") throw new Error(`La configuración no puede contener funciones (${path})`);
  if (Array.isArray(v)) return v.map((x, i) => normalize(x, `${path}[${i}]`));
  if (t === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = normalize(v[k], `${path}.${k}`);
    return out;
  }
  throw new Error(`Tipo no admitido en ${path}: ${t}`);
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function configHash(config) {
  return sha256Hex(canonicalJSON(config));
}
