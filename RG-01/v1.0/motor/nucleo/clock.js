// Relojes. El motor nunca llama a performance.now() directamente: recibe un reloj.
// En el navegador se usa el reloj monotónico; en las pruebas, un reloj manual.

export const browserClock = {
  kind: "performance.now",
  now: () => performance.now(),
};

/** Reloj manual para pruebas: el tiempo solo avanza cuando se pide. */
export function createManualClock(start = 0) {
  let t = start;
  return {
    kind: "manual",
    now: () => t,
    advance(ms) { if (ms < 0) throw new Error("el reloj no retrocede"); t += ms; return t; },
    set(v) { if (v < t) throw new Error("el reloj no retrocede"); t = v; return t; },
  };
}
