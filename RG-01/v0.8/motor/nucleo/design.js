// Genera la secuencia de fases, bloques y ensayos a partir de las reglas de la configuración.
// Índices desde 1, para que coincidan con la forma de hablar del protocolo.
//
// Motor 0.4.0 · ensayos forzados: en una fase con «forced», cada ensayo lleva la única
// alternativa disponible (forced_option). Esas fases NO consumen la numeración global de
// ensayos ni de bloques (trial_index_global y block_index_global quedan en null en el
// diseño): así los ensayos libres conservan su numeración (p. ej., 1–180) aunque haya una
// fase forzada antes. La sesión asigna a los ensayos y bloques forzados números propios al
// ejecutarlos (a partir del último número libre), distintos en cada repetición.

/**
 * @param {object} config  configuración efectiva (con el modo de prueba ya aplicado si procede)
 * @param {ReturnType<import('./rng.js').createRng>} rng  flujo aleatorio dedicado a las posiciones
 */
export function buildDesign(config, rng) {
  const allOptions = Object.keys(config.options);
  const trials = [];
  const phases = [];
  let trialGlobal = 0;
  let blockGlobal = 0;

  config.phases.forEach((phase, pi) => {
    const options = phase.options ?? allOptions;
    const isForced = Array.isArray(phase.forced);
    const blocks = [];
    for (let b = 1; b <= phase.blocks; b++) {
      const blockIndexGlobal = isForced ? null : ++blockGlobal;
      const arrangements = positionsForBlock(phase, options, rng);
      const blockTrials = arrangements.map((positions, ti) => {
        const t = {
          phase_id: phase.id,
          phase_index: pi + 1,
          block_index: b,
          block_index_global: blockIndexGlobal,
          trial_index_block: ti + 1,
          trial_index_global: isForced ? null : ++trialGlobal,
          positions, // alternativas de izquierda a derecha
          trial_kind: isForced ? "forced" : "free",
          forced_option: isForced ? phase.forced[b - 1][ti] : null,
        };
        trials.push(t);
        return t;
      });
      blocks.push({ phase_id: phase.id, block_index: b, block_index_global: blockIndexGlobal, block_kind: isForced ? "forced" : "free", trials: blockTrials });
    }
    phases.push({ phase_id: phase.id, phase_index: pi + 1, phase_kind: isForced ? "forced" : "free", blocks });
  });
  return { phases, trials, n_free_trials: trialGlobal, n_free_blocks: blockGlobal };
}

function positionsForBlock(phase, options, rng) {
  const n = phase.trials_per_block;
  switch (phase.positions) {
    case "fixed":
      return Array.from({ length: n }, () => options.slice());
    case "random_per_trial":
      return Array.from({ length: n }, () => rng.shuffle(options));
    case "balanced_per_block": {
      // Mitad de los ensayos con cada disposición, en orden aleatorio.
      const [a, b] = options;
      const half = Array.from({ length: n / 2 }, () => [a, b]).concat(Array.from({ length: n / 2 }, () => [b, a]));
      return rng.shuffle(half);
    }
    case "all_permutations_balanced": {
      // Cada permutación de las alternativas aparece el mismo número de veces en el bloque,
      // en orden aleatorio. Si el bloque no es múltiplo del número de permutaciones (solo
      // en modo prueba), se toman las primeras n de una secuencia equilibrada mayor.
      const perms = permutations(options);
      const reps = Math.ceil(n / perms.length);
      const pool = [];
      for (let r = 0; r < reps; r++) for (const p of perms) pool.push(p.slice());
      return rng.shuffle(pool).slice(0, n);
    }
    default:
      throw new Error(`Método de posiciones desconocido «${phase.positions}»`);
  }
}

/** Todas las permutaciones, en orden lexicográfico de posición. */
export function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  const out = [];
  items.forEach((x, i) => {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const p of permutations(rest)) out.push([x, ...p]);
  });
  return out;
}
