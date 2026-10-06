import registry from "./operations.json" with { type: "json" };
export const operationRegistry = registry;
export function validateOperation(
  input,
  { strict = false, availableIds = registry.operations.map((item) => item.id) } = {},
) {
  const invalid = (message) => {
    throw Object.assign(new Error(message), { statusCode: 400 });
  };
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("Choose a method and its parameters.");
  const definition = registry.operations.find((item) => item.id === input.method);
  if (!definition || !availableIds.includes(input.method))
    invalid("Choose an available intensity transformation or spatial filter.");
  if (input.category !== undefined && input.category !== definition.category)
    invalid("The selected category does not match the method.");
  const fields = Object.keys(definition.parameters);
  let supplied = input.parameters;
  if (supplied === undefined && !strict)
    supplied = Object.fromEntries(
      fields.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]),
    );
  if (!supplied || typeof supplied !== "object" || Array.isArray(supplied))
    invalid("Provide valid settings for the selected method.");
  if (Object.keys(supplied).some((key) => !fields.includes(key)))
    invalid("Only send parameters for the selected method.");
  if (strict && fields.some((key) => supplied[key] === undefined))
    invalid("Include every required parameter for the selected method.");
  const parameters = {};
  for (const [key, rule] of Object.entries(definition.parameters)) {
    const value = supplied[key] === undefined ? rule.default : supplied[key];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (rule.min !== null && (rule.minExclusive ? value <= rule.min : value < rule.min)) ||
      (rule.max !== null && value > rule.max) ||
      (rule.integer && !Number.isInteger(value)) ||
      (rule.odd && value % 2 !== 1)
    )
      invalid(
        key === "kernelSize"
          ? "Kernel size must be an odd integer from 3 to 15."
          : ["lowCutoff", "highCutoff"].includes(key)
            ? "Cutoffs must be within 0–100%, with low below high."
            : `Choose a valid ${key} for ${definition.label}.`,
      );
    parameters[key] = value;
  }
  for (const constraint of definition.constraints)
    if (parameters[constraint.upper] - parameters[constraint.lower] < constraint.minGap)
      invalid("Cutoffs must be within 0–100%, with low below high.");
  return { category: definition.category, method: definition.id, parameters };
}
