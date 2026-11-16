// Único complemento de jsPsych del motor: ejecuta un «paso» definido en runner.js.
// Así la lógica de presentación no depende de los detalles de la API de jsPsych:
// si cambia de versión, solo hay que revisar este archivo.

/**
 * @param {object} jsPsychModule  objeto global que expone jsPsych (ParameterType)
 * @param {{kind:string, run:(el:HTMLElement, done:(data?:object)=>void)=>void}[]} steps
 */
export function makeStepPlugin(jsPsychModule, steps, engineVersion) {
  const PT = jsPsychModule.ParameterType;
  class LabStepPlugin {
    static info = {
      name: "lab-step",
      version: engineVersion,
      parameters: {
        step: { type: PT.INT, default: undefined },
      },
      data: {
        lab_step: { type: PT.INT },
        lab_kind: { type: PT.STRING },
      },
    };
    constructor(jsPsych) { this.jsPsych = jsPsych; }
    trial(display_element, trial) {
      const step = steps[trial.step];
      step.run(display_element, (data = {}) => {
        this.jsPsych.finishTrial({ lab_step: trial.step, lab_kind: step.kind, ...data });
      });
    }
  }
  return LabStepPlugin;
}
