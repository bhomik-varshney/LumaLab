import { useState, useId } from "react";
import { operationRegistry, validateOperation } from "../../shared/operations.mjs";
import type { ProcessingOptions } from "@/lib/matlab-api";
export function SequenceStepEditor({
  step,
  onSave,
  onCancel,
}: {
  step: ProcessingOptions;
  onSave: (value: ProcessingOptions) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(step.parameters).map(([key, value]) => [key, String(value)])),
  );
  const [error, setError] = useState("");
  const id = useId();
  const definition = operationRegistry.operations.find((item) => item.id === step.method)!;
  return (
    <form
      className="sequence-step-editor"
      aria-label={`Edit ${definition.label} parameters`}
      onSubmit={(event) => {
        event.preventDefault();
        try {
          onSave(
            validateOperation(
              {
                ...step,
                parameters: Object.fromEntries(
                  Object.entries(draft).map(([key, value]) => [
                    key,
                    value.trim() ? Number(value) : NaN,
                  ]),
                ),
              },
              { strict: true },
            ),
          );
        } catch (error) {
          setError((error as Error).message);
        }
      }}
    >
      {Object.entries(definition.parameters).map(([key, rule]) => (
        <label key={key} htmlFor={`${id}-${key}`}>
          {rule.label ?? key}
          <input
            id={`${id}-${key}`}
            type="number"
            step={rule.integer ? (rule.odd ? 2 : 1) : "any"}
            min={rule.minExclusive ? undefined : (rule.min ?? undefined)}
            max={rule.max ?? undefined}
            value={draft[key] ?? ""}
            onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
          />
        </label>
      ))}
      {!Object.keys(definition.parameters).length && (
        <p>This operation has no adjustable parameters.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="noise-actions">
        <button className="studio-button secondary" type="submit">
          Save step
        </button>
        <button className="text-button" type="button" onClick={onCancel}>
          Cancel edit
        </button>
      </div>
    </form>
  );
}
