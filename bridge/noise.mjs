import { operationRegistry } from "../shared/operations.mjs";
const invalid = (message) => {
  throw Object.assign(new Error(message), { statusCode: 400 });
};
export function noiseOptions(input) {
  if (["steps", "method", "category", "parameters"].some((key) => input[key] !== undefined))
    invalid(
      "Noise starts a separate experiment from the clean original; do not mix it with operations.",
    );
  const value = input.noise;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Object.hasOwn(operationRegistry.noise, value.type)
  )
    invalid("Choose salt-and-pepper or Gaussian noise.");
  const definition = operationRegistry.noise[value.type];
  const field = definition.parameter;
  if (Object.keys(value).some((key) => !["type", "seed", field].includes(key)))
    invalid("Only send parameters for the chosen noise type.");
  if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > 4294967295)
    invalid("Noise seed must be an integer from 0 to 4294967295.");
  if (
    typeof value[field] !== "number" ||
    !Number.isFinite(value[field]) ||
    value[field] < 0 ||
    value[field] > definition.max
  )
    invalid(
      field === "density"
        ? "Noise density must be between 0 and 30%."
        : "Noise standard deviation must be between 0 and 0.2 on the normalized 0–1 scale.",
    );
  return { noise: { type: value.type, seed: value.seed, [field]: value[field] } };
}
