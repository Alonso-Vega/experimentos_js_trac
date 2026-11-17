// Formularios definidos en la configuración (consentimiento, datos demográficos,
// informes verbales...). El botón de enviar solo se activa cuando todos los campos
// obligatorios están completos y son válidos.
//
// Valores que se guardan:
//   text, textarea -> el texto tal como se escribió (sin recortar)
//   number, scale  -> número entero
//   radio          -> valor de la opción; si la opción pide especificar, además <id>_otro
//   checkbox       -> true / false
//   campo vacío no obligatorio -> null

import { escapeHTML } from "./textos.js";

/**
 * @param {HTMLElement} el
 * @param {object} form  configuración del formulario
 * @param {{lang:string, tx:object, idPattern?:string, onSubmit:(values:object, ms:number)=>void}} o
 */
export function renderForm(el, form, { lang, tx, idPattern, onSubmit }) {
  const L = (x) => x[lang];
  const req = (fd) => (fd.required ? ' <span class="lab-req" aria-hidden="true">*</span>' : "");
  const html = form.fields.map((fd) => {
    const id = `lab-f-${fd.id}`;
    switch (fd.type) {
      case "text":
        return `<div class="lab-field"><label for="${id}">${escapeHTML(L(fd.label))}${req(fd)}</label>
          <input type="text" id="${id}" data-field="${fd.id}" autocomplete="off">
          <div class="lab-field-error" data-error="${fd.id}" hidden></div></div>`;
      case "number":
        return `<div class="lab-field"><label for="${id}">${escapeHTML(L(fd.label))}${req(fd)}</label>
          <input type="number" id="${id}" data-field="${fd.id}" min="${fd.min}" max="${fd.max}" step="1" inputmode="numeric" class="lab-num">
          <div class="lab-field-error" data-error="${fd.id}" hidden></div></div>`;
      case "textarea":
        return `<div class="lab-field"><label for="${id}">${escapeHTML(L(fd.label))}${req(fd)}</label>
          <textarea id="${id}" data-field="${fd.id}" rows="6"></textarea></div>`;
      case "checkbox":
        return `<div class="lab-field">
          ${fd.details_key ? `<details class="lab-details"><summary>${escapeHTML(fd.details_summary ? L(fd.details_summary) : (lang === "es" ? "Ver el texto" : "Show text"))}</summary><div>${tx[fd.details_key]}</div></details>` : ""}
          <label class="lab-check"><input type="checkbox" id="${id}" data-field="${fd.id}"> ${escapeHTML(L(fd.label))}${req(fd)}</label></div>`;
      case "radio":
        return `<fieldset class="lab-field"><legend>${escapeHTML(L(fd.label))}${req(fd)}</legend>
          ${fd.options.map((o, j) => `<label class="lab-radio"><input type="radio" name="${id}" data-field="${fd.id}" value="${escapeHTML(o.value)}" ${o.specify ? 'data-specify="1"' : ""}> ${escapeHTML(L(o.label))}</label>
            ${o.specify ? `<input type="text" class="lab-especificar" data-other="${fd.id}" placeholder="${lang === "es" ? "Especifica" : "Please specify"}" hidden>` : ""}`).join("")}
          </fieldset>`;
      case "scale": {
        const vals = [];
        for (let v = fd.max; v >= fd.min; v--) vals.push(v);
        return `<fieldset class="lab-field"><legend>${escapeHTML(L(fd.label))}${req(fd)}</legend>
          <div class="lab-escalera">${vals.map((v) => `<label class="lab-peldano"><input type="radio" name="${id}" data-field="${fd.id}" value="${v}"><span>${v}</span></label>`).join("")}</div>
          </fieldset>`;
      }
      default: return "";
    }
  }).join("");

  el.innerHTML = `<div class="lab-screen lab-form">
      ${form.title_key ? tx[form.title_key] : ""}
      <form novalidate>${html}
        <p class="lab-req-nota">${form.fields.some((f) => f.required) ? (lang === "es" ? "* Obligatorio" : "* Required") : ""}</p>
        <button type="submit" class="lab-continue" disabled>${escapeHTML(tx[form.submit_key ?? "continue_button"])}</button>
      </form></div>`;

  const f = el.querySelector("form");
  const submit = f.querySelector("button[type=submit]");
  const t0 = performance.now();

  function read() {
    const values = {};
    const problems = {};
    for (const fd of form.fields) {
      let v = null;
      if (fd.type === "text" || fd.type === "textarea") {
        const raw = f.querySelector(`[data-field="${fd.id}"]`).value;
        v = raw.trim() === "" ? null : raw;
        if (v !== null && fd.participant_id && idPattern && !new RegExp(idPattern).test(raw.trim())) {
          problems[fd.id] = lang === "es" ? "Solo letras sin acentos, números, guion o guion bajo (máximo 32)." : "Only unaccented letters, digits, hyphen or underscore (max 32).";
        }
      } else if (fd.type === "number") {
        const raw = f.querySelector(`[data-field="${fd.id}"]`).value;
        if (raw !== "") {
          const n = Number(raw);
          if (!Number.isInteger(n) || n < fd.min || n > fd.max) problems[fd.id] = lang === "es" ? `Escribe un número entero entre ${fd.min} y ${fd.max}.` : `Enter a whole number between ${fd.min} and ${fd.max}.`;
          else v = n;
        }
      } else if (fd.type === "checkbox") {
        v = f.querySelector(`[data-field="${fd.id}"]`).checked;
      } else if (fd.type === "radio" || fd.type === "scale") {
        const sel = f.querySelector(`[data-field="${fd.id}"]:checked`);
        if (sel) v = fd.type === "scale" ? Number(sel.value) : sel.value;
        if (fd.type === "radio") {
          const other = f.querySelector(`[data-other="${fd.id}"]`);
          if (other) {
            const show = Boolean(sel && sel.dataset.specify);
            other.hidden = !show;
            values[`${fd.id}_otro`] = show && other.value.trim() !== "" ? other.value : null;
            if (show && fd.required && values[`${fd.id}_otro`] === null) problems[`${fd.id}_otro`] = "missing";
          }
        }
      }
      values[fd.id] = v;
      const missing = fd.type === "checkbox" ? v !== true : v === null;
      if (fd.required && missing && !problems[fd.id]) problems[fd.id] = "missing";
    }
    return { values, problems };
  }

  function refresh() {
    const { problems } = read();
    for (const fd of form.fields) {
      const box = f.querySelector(`[data-error="${fd.id}"]`);
      if (!box) continue;
      const msg = problems[fd.id] && problems[fd.id] !== "missing" ? problems[fd.id] : "";
      box.hidden = !msg;
      box.textContent = msg;
    }
    submit.disabled = Object.keys(problems).length > 0;
  }
  f.addEventListener("input", refresh);
  f.addEventListener("change", refresh);
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const { values, problems } = read();
    if (Object.keys(problems).length) { refresh(); return; }
    submit.disabled = true;
    onSubmit(values, Math.round((performance.now() - t0) * 1000) / 1000);
  });
  refresh();
}
