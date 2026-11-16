// Generador pseudoaleatorio con semilla (reproducible).
// Algoritmo: hash de cadena xmur3 -> generador sfc32. Cada uso (diseño, posiciones,
// cada contingencia) recibe su propio flujo derivado de la semilla de sesión, para que
// añadir una contingencia no altere la aleatorización del diseño.

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * @param {string} seed
 */
export function createRng(seed) {
  if (typeof seed !== "string" || seed.length === 0) throw new Error("createRng: la semilla debe ser un texto no vacío");
  const h = xmur3(seed);
  const next = sfc32(h(), h(), h(), h());
  // Descarta los primeros valores (calentamiento recomendado para sfc32).
  for (let i = 0; i < 15; i++) next();
  let draws = 0;
  const rng = {
    seed,
    /** Número en [0, 1). */
    next() { draws++; return next(); },
    /** Entero en [min, max], ambos incluidos. */
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new Error(`rng.int: rango no válido ${min}..${max}`);
      return min + Math.floor(rng.next() * (max - min + 1));
    },
    /** true con probabilidad p. */
    chance(p) {
      if (!(p >= 0 && p <= 1)) throw new Error(`rng.chance: probabilidad no válida ${p}`);
      if (p === 1) { rng.next(); return true; } // consume igual para mantener la secuencia estable
      return rng.next() < p;
    },
    /** Copia barajada (Fisher-Yates). */
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    get draws() { return draws; },
    /** Flujo independiente derivado de esta semilla. */
    derive(label) { return createRng(`${seed}::${label}`); },
  };
  return rng;
}

/** Semilla nueva para una sesión (16 caracteres hexadecimales). */
export function generateSeed() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
