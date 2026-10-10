import { useState } from "react";
import type { ReactNode, Ref } from "react";
import { SequenceStepEditor } from "./sequence-step-editor";
import {
  Pencil,
  ImageIcon,
  ArrowRight,
  ChartNoAxesColumn,
  Grid3X3,
  Spline,
  ChevronDown,
  ChevronUp,
  Layers3,
  Play,
  Plus,
  Trash2,
  X,
  Check,
} from "lucide-react";
import { methods, describeOperation } from "@/lib/enhancement-methods";
import { MAX_SEQUENCE_STEPS } from "@/lib/processing-sequence";
import type { SequencePhase, SequenceStep } from "@/lib/processing-sequence";
import type { ProcessingOptions, SequenceProgress } from "@/lib/matlab-api";

type Props = {
  steps: SequenceStep[];
  builderRef?: Ref<HTMLDetailsElement>;
  inputPreviewUrl?: string;
  resultPreviewUrl?: string | undefined;
  inputLabel?: string;
  inputControls?: ReactNode;
  validationError?: string;
  onEdit?: (id: string, options: ProcessingOptions) => void;
  phase: SequencePhase;
  progress: SequenceProgress | null;
  error: string;
  canAdd: boolean;
  canRun: boolean;
  runHint: string;
  isCurrentResult: boolean;
  onAdd: () => void;
  onRun: () => void;
  onClear: () => void;
  onRemove: (id: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
};

export function ProcessingSequence({
  steps,
  phase,
  progress,
  error,
  canAdd,
  canRun,
  runHint,
  isCurrentResult,
  onAdd,
  onRun,
  onClear,
  onRemove,
  onMove,
  builderRef,
  inputPreviewUrl,
  resultPreviewUrl,
  inputLabel = "Original image",
  inputControls,
  validationError,
  onEdit,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const running = phase === "running";
  const activeName = methods.find((item) => item.id === progress?.method)?.name;
  const status = running
    ? progress?.state === "processing"
      ? `Applying step ${progress.step} of ${progress.total}: ${activeName ?? progress.method}.`
      : progress?.state === "exporting" || progress?.state === "complete"
        ? "All steps applied. Preparing the final image…"
        : "Waiting for MATLAB to start this sequence…"
    : isCurrentResult
      ? `Complete · ${steps.length} steps applied.`
      : "";
  return (
    <section className="sequence-dock" aria-label="Saved processing sequence">
      <details ref={builderRef} className="processing-sequence">
        <summary>
          <Layers3 size={15} />
          <span>Processing Sequence</span>
          <span className="sequence-count">
            {steps.length} / {MAX_SEQUENCE_STEPS}
          </span>
          <ChevronDown size={14} />
        </summary>
        <div className="sequence-body">
          <p className="sequence-intro">
            Each step uses the previous result. The selected input stays separate from the output.
          </p>
          {inputControls}
          {validationError && (
            <p role="alert" className="sequence-error">
              {validationError}
            </p>
          )}
          <p className="sequence-hint">
            {!steps.length
              ? "Choose a method and its settings above, then add your first step."
              : steps.length === MAX_SEQUENCE_STEPS
                ? "Six steps saved. Remove a step to add another."
                : "Add saves the current settings. Saved steps stay unchanged."}
          </p>
          {!!steps.length && (
            <>
              <div className="sequence-endpoint">
                <i />
                {inputLabel}
              </div>
              <ol className="sequence-step-list">
                {steps.map((step, index) => {
                  const name =
                    methods.find((item) => item.id === step.method)?.name ??
                    "Unavailable operation";
                  const complete =
                    isCurrentResult || (running && index < (progress?.completedSteps ?? 0));
                  const active =
                    running && progress?.state === "processing" && progress.step === index + 1;
                  return (
                    <li
                      key={step.id}
                      className={
                        active ? "active-sequence-step" : complete ? "complete-sequence-step" : ""
                      }
                    >
                      <span className="sequence-step-number">
                        {complete ? <Check size={11} /> : index + 1}
                      </span>
                      <div className="sequence-step-copy">
                        <strong>{name}</strong>
                        <span>{describeOperation(step)}</span>
                      </div>
                      <div className="sequence-edit-actions">
                        {onEdit && (
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Edit step ${index + 1}: ${name}`}
                            disabled={running || !methods.some((item) => item.id === step.method)}
                            onClick={() => setEditingId(step.id)}
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Move step ${index + 1} up`}
                          title="Move up"
                          disabled={running || index === 0}
                          onClick={() => onMove(index, -1)}
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Move step ${index + 1} down`}
                          title="Move down"
                          disabled={running || index === steps.length - 1}
                          onClick={() => onMove(index, 1)}
                        >
                          <ChevronDown size={13} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Remove step ${index + 1}: ${name}`}
                          title="Remove step"
                          disabled={running}
                          onClick={() => onRemove(step.id)}
                        >
                          <X size={13} />
                        </button>
                      </div>
                      {editingId === step.id && onEdit && (
                        <SequenceStepEditor
                          step={step}
                          onCancel={() => setEditingId(null)}
                          onSave={(options) => {
                            onEdit(step.id, options);
                            setEditingId(null);
                          }}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
              <div className="sequence-endpoint result-endpoint">
                <i />
                Final sequence result
              </div>
            </>
          )}
          {!running && !isCurrentResult && !!steps.length && (
            <p className="sequence-hint">{runHint}</p>
          )}
          <div className="sequence-footer">
            <span>Reset keeps saved steps. Use the pencil to edit saved parameters.</span>
            <button
              type="button"
              className="text-button"
              disabled={running || !steps.length}
              onClick={onClear}
            >
              <Trash2 size={12} />
              Clear sequence
            </button>
          </div>
        </div>
      </details>
      {status && (
        <p className={`sequence-status ${isCurrentResult ? "sequence-success" : ""}`} role="status">
          {running && <span className="status-dot" />}
          {status}
        </p>
      )}
      {phase === "error" && (
        <div className="sequence-error" role="alert">
          <strong>Sequence did not finish.</strong>
          <p>{error}</p>
          <span>No partial output is ready to save. Correct the step or retry this sequence.</span>
        </div>
      )}

      <div className="sequence-overview">
        <ol className="sequence-timeline" aria-label="Sequence overview">
          <li className="timeline-endpoint">
            <div className="timeline-tile">
              {inputPreviewUrl ? <img src={inputPreviewUrl} alt="" /> : <ImageIcon size={23} />}
            </div>
            <span>{inputLabel}</span>
          </li>
          {!steps.length && (
            <li className="timeline-placeholder">
              <ArrowRight size={16} />
              <span>
                Add the selected method.
                <br />
                Then run your saved steps.
              </span>
            </li>
          )}
          {steps.map((step, index) => {
            const name = methods.find((item) => item.id === step.method)?.short ?? "Unavailable";
            const Icon =
              step.method === "equalize"
                ? ChartNoAxesColumn
                : step.category === "intensity"
                  ? Spline
                  : Grid3X3;
            const complete =
              isCurrentResult || (running && index < (progress?.completedSteps ?? 0));
            const active =
              running && progress?.state === "processing" && progress.step === index + 1;
            return (
              <li
                key={step.id}
                className={active ? "timeline-active" : complete ? "timeline-complete" : ""}
              >
                <div className="timeline-tile">
                  <Icon size={27} aria-hidden="true" />
                </div>
                <span>
                  {index + 1}. {name}
                </span>
              </li>
            );
          })}
          <li className="timeline-endpoint">
            <div className="timeline-tile">
              {resultPreviewUrl ? <img src={resultPreviewUrl} alt="" /> : <ImageIcon size={23} />}
            </div>
            <span>{isCurrentResult ? "Final result" : "After Run"}</span>
          </li>
        </ol>
        <div className="sequence-actions">
          <button
            type="button"
            className="studio-button secondary"
            onClick={onAdd}
            disabled={!canAdd || running || steps.length >= MAX_SEQUENCE_STEPS}
          >
            <Plus size={14} />
            Add step
          </button>
          <button
            type="button"
            className="studio-button primary"
            onClick={onRun}
            disabled={!canRun || running || !steps.length || !!validationError}
          >
            <Play size={13} />
            {running ? "Running…" : "Run sequence"}
          </button>
        </div>
      </div>
    </section>
  );
}
