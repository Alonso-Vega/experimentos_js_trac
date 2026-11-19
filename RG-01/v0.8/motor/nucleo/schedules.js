// Programas de reforzamiento: requisito que debe cumplir una respuesta elegible
// para que la contingencia quede satisfecha.
//
// Interfaz común:
//   start(t)    (re)inicia el programa en el instante t (ms, reloj monotónico).
//   respond(t)  registra una respuesta elegible en t. Devuelve { requirement_met, ... }.
//   snapshot(t) estado actual, para el registro.
//
// Intervalos (FI, VI): el reloj del intervalo empieza en start(t) y se reinicia en la
// respuesta que cumple el requisito. Al expirar el intervalo, el requisito queda
// disponible para la SIGUIENTE respuesta elegible (dependiente de la respuesta). No hay
// límite de disponibilidad (limited hold) en esta versión.
// El reloj de cada programa corre siempre, con independencia de la alternativa elegida.

export const SCHEDULE_TYPES = ["CRF", "EXT", "FR", "VR", "FI", "VI"];

/**
 * Valores de Fleshler y Hoffman (1962) para un VI de media meanS con n intervalos:
 * t_k = T [1 + ln N + (N-k) ln(N-k) - (N-k+1) ln(N-k+1)], k = 1..N, con 0·ln 0 = 0.
 * Devuelve segundos, en orden k = 1..N.
 */
export function fleshlerHoffman(meanS, n) {
  if (!(meanS > 0) || !Number.isInteger(n) || n < 1) throw new Error("fleshlerHoffman: parámetros no válidos");
  const xlnx = (x) => (x === 0 ? 0 : x * Math.log(x));
  const out = [];
  for (let k = 1; k <= n; k++) {
    out.push(meanS * (1 + Math.log(n) + xlnx(n - k) - xlnx(n - k + 1)));
  }
  return out;
}

/** Muestreo sin reemplazo de una lista; se vuelve a barajar al agotarse. */
function createBag(values, rng) {
  let bag = [];
  return () => {
    if (bag.length === 0) bag = rng.shuffle(values);
    return bag.pop();
  };
}

function variableSource(dist, rng, what) {
  if (!dist || typeof dist !== "object") throw new Error(`${what}: falta la distribución`);
  switch (dist.kind) {
    case "uniform_int":
      return () => rng.int(dist.min, dist.max);
    case "list":
      return createBag(dist.values, rng);
    case "fleshler_hoffman":
      return createBag(fleshlerHoffman(dist.mean_s, dist.n), rng);
    default:
      throw new Error(`${what}: distribución desconocida «${dist.kind}»`);
  }
}

/**
 * @param {object} spec  por ejemplo { type: "VR", distribution: { kind: "uniform_int", min: 1, max: 9 } }
 * @param {{ rng: ReturnType<import('./rng.js').createRng> }} deps
 */
export function createSchedule(spec, { rng }) {
  const type = spec?.type;
  let count = 0;          // respuestas elegibles desde el último requisito cumplido
  let requirement = null; // razón vigente (FR/VR)
  let intervalMs = null;  // intervalo vigente (FI/VI)
  let intervalStart = null;
  let started = false;

  let drawRatio = null;
  let drawIntervalS = null;
  if (type === "VR") drawRatio = variableSource(spec.distribution, rng, "VR");
  if (type === "VI") drawIntervalS = variableSource(spec.distribution, rng, "VI");

  function newRequirement(t) {
    count = 0;
    if (type === "FR") requirement = spec.n;
    if (type === "VR") requirement = drawRatio();
    if (type === "FI") { intervalMs = spec.seconds * 1000; intervalStart = t; }
    if (type === "VI") { intervalMs = drawIntervalS() * 1000; intervalStart = t; }
  }

  function available(t) {
    if (type === "FI" || type === "VI") return t - intervalStart >= intervalMs;
    return null;
  }

  return {
    type,
    start(t) { started = true; newRequirement(t); },
    respond(t) {
      if (!started) throw new Error(`Programa ${type} usado antes de start()`);
      count++;
      const before = { responses: count, requirement, interval_ms: intervalMs, interval_start_ms: intervalStart };
      let met;
      switch (type) {
        case "CRF": met = true; break;
        case "EXT": met = false; break;
        case "FR":
        case "VR": met = count >= requirement; break;
        case "FI":
        case "VI": met = available(t); break;
        default: throw new Error(`Programa desconocido «${type}»`);
      }
      if (met) newRequirement(t);
      return { requirement_met: met, state_before: before };
    },
    snapshot(t) {
      return {
        type,
        responses_since_requirement: count,
        requirement,
        interval_ms: intervalMs,
        interval_start_ms: intervalStart,
        available: t == null ? null : available(t),
      };
    },
  };
}
