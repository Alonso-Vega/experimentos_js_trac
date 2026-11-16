// Detección del navegador y comprobaciones previas al inicio de una sesión.

export const SUPPORTED_BROWSERS = ["Chrome", "Edge"];

export function detectEnvironment() {
  const ua = navigator.userAgent;
  let name = "desconocido";
  let version = null;
  const brands = navigator.userAgentData?.brands ?? [];
  const edge = brands.find((b) => b.brand === "Microsoft Edge");
  const chrome = brands.find((b) => b.brand === "Google Chrome");
  let m;
  if (edge) { name = "Edge"; version = edge.version; }
  else if (chrome) { name = "Chrome"; version = chrome.version; }
  else if ((m = ua.match(/Edg\/(\d+)/))) { name = "Edge"; version = m[1]; }
  else if ((m = ua.match(/Firefox\/(\d+)/))) { name = "Firefox"; version = m[1]; }
  else if ((m = ua.match(/HeadlessChrome\/(\d+)/))) { name = "Chrome (sin interfaz)"; version = m[1]; }
  else if ((m = ua.match(/Chrome\/(\d+)/))) { name = "Chrome"; version = m[1]; }
  else if ((m = ua.match(/Version\/(\d+).*Safari/))) { name = "Safari"; version = m[1]; }

  let os = navigator.userAgentData?.platform || null;
  if (!os) {
    if (/Windows/.test(ua)) os = "Windows";
    else if (/iPhone|iPad/.test(ua)) os = "iOS";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/Linux/.test(ua)) os = "Linux";
  }
  return {
    browser_name: name,
    browser_version: version,
    os,
    user_agent: ua,
    screen_width: screen.width,
    screen_height: screen.height,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    device_pixel_ratio: window.devicePixelRatio,
    max_touch_points: navigator.maxTouchPoints ?? 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    page_url: location.href.split("?")[0],
  };
}

/**
 * @returns {{id:string, ok:boolean, blocking:boolean, message:string}[]}
 */
export function runChecks(env) {
  const checks = [];
  const add = (id, ok, blocking, message) => checks.push({ id, ok, blocking, message });

  add("secure_context", window.isSecureContext === true, true,
    "La página no se abrió desde el lanzador. Cierra esta pestaña y usa INICIAR-WINDOWS.bat (o INICIAR-MAC.command).");
  add("crypto", Boolean(globalThis.crypto?.subtle && globalThis.crypto?.getRandomValues), true,
    "El navegador no ofrece funciones criptográficas (huella de la configuración).");
  add("pointer_events", "PointerEvent" in window, true,
    "El navegador no admite eventos de puntero (ratón y pantalla táctil).");
  let storageOk = false;
  try {
    const k = "lab:comprobacion";
    localStorage.setItem(k, "1");
    storageOk = localStorage.getItem(k) === "1";
    localStorage.removeItem(k);
  } catch { storageOk = false; }
  add("local_storage", storageOk, true,
    "El navegador no permite guardar datos localmente (¿ventana privada?). Abre una ventana normal.");
  add("browser", SUPPORTED_BROWSERS.includes(env.browser_name), false,
    `Navegador no validado (${env.browser_name} ${env.browser_version ?? ""}). Los navegadores de referencia son Chrome y Edge.`);
  return checks;
}
