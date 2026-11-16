// Identificadores únicos (UUID v4). Se usan para eventos, respuestas, consecuencias y sesiones.

export function uuid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Generador de identificadores deterministas para pruebas. */
export function createSequentialIds(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(5, "0")}`;
}
