const intensityMethods = ["gamma", "equalize", "stretch"];
const spatialMethods = ["mean", "gaussian", "median", "unsharp", "sobel"];
const invalid = (message) => {
  throw Object.assign(new Error(message), { statusCode: 400 });
};
const finite = (value) => typeof value === "number" && Number.isFinite(value);

export function processingOptions(input) {
  const { method } = input;
  if (![...intensityMethods, ...spatialMethods].includes(method))
    invalid("Choose a supported intensity transformation or spatial filter.");
  const category = intensityMethods.includes(method) ? "intensity" : "spatial";
  if (input.category !== undefined && input.category !== category)
    invalid("The selected category does not match the method.");
  const fields = {
    gamma: ["gamma"],
    equalize: [],
    stretch: ["lowCutoff", "highCutoff"],
    mean: ["kernelSize"],
    median: ["kernelSize"],
    gaussian: ["kernelSize", "sigma"],
    unsharp: ["kernelSize", "sigma", "amount"],
    sobel: [],
  }[method];
  const defaults = {
    gamma: 1,
    lowCutoff: 0.1,
    highCutoff: 0.9,
    kernelSize: ["gaussian", "unsharp"].includes(method) ? 5 : 3,
    sigma: 1,
    amount: 1,
  };
  let supplied;
  if (input.parameters !== undefined) {
    if (
      !input.parameters ||
      typeof input.parameters !== "object" ||
      Array.isArray(input.parameters)
    )
      invalid("Method parameters must be a JSON object.");
    supplied = input.parameters;
    if (Object.keys(supplied).some((key) => !fields.includes(key)))
      invalid("Only send parameters for the selected method.");
  } else {
    // Retain the established flat intensity requests for existing callers.
    supplied = Object.fromEntries(
      fields.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]),
    );
  }
  const parameters = Object.fromEntries(
    fields.map((key) => [key, supplied[key] === undefined ? defaults[key] : supplied[key]]),
  );
  if (method === "gamma" && (!finite(parameters.gamma) || parameters.gamma <= 0))
    invalid("Gamma must be a finite positive number.");
  if (
    method === "stretch" &&
    (!finite(parameters.lowCutoff) ||
      !finite(parameters.highCutoff) ||
      parameters.lowCutoff < 0 ||
      parameters.highCutoff > 1 ||
      parameters.highCutoff - parameters.lowCutoff < 1e-6)
  )
    invalid("Cutoffs must be within 0–100%, with low below high.");
  if (fields.includes("kernelSize") && ![3, 5, 7].includes(parameters.kernelSize))
    invalid("Choose an odd neighborhood size: 3×3, 5×5 or 7×7.");
  if (
    fields.includes("sigma") &&
    (!finite(parameters.sigma) || parameters.sigma < 0.3 || parameters.sigma > 3)
  )
    invalid("Gaussian sigma must be between 0.3 and 3.");
  if (
    fields.includes("amount") &&
    (!finite(parameters.amount) || parameters.amount < 0 || parameters.amount > 3)
  )
    invalid("Sharpening strength must be between 0 and 3.");
  return { category, method, parameters };
}
