import { useState } from "react";
import type { SequenceRecommendation } from "@/lib/learning-context";
import { methods, describeOperation } from "@/lib/enhancement-methods";
import { MAX_SEQUENCE_STEPS } from "@/lib/processing-sequence";
import { AiMarkdown } from "./ai-markdown";
export function RecommendationReview({
  recommendation,
  sourceLabel,
  existingLength,
  disabled,
  stale,
  onAccept,
}: {
  recommendation: SequenceRecommendation;
  sourceLabel: string;
  existingLength: number;
  disabled: boolean;
  stale: boolean;
  onAccept?:
    ((value: SequenceRecommendation, mode: "append" | "replace") => string | null) | undefined;
}) {
  const [review, setReview] = useState(false),
    [confirm, setConfirm] = useState(false),
    [accepted, setAccepted] = useState(false),
    [error, setError] = useState("");
  const acceptSequence = (mode: "append" | "replace") => {
    if (disabled || !onAccept || accepted) return;
    const issue = onAccept(recommendation, mode);
    if (issue) {
      setError(issue);
      return;
    }
    setAccepted(true);
    setConfirm(false);
  };
  return (
    <div className="recommendation-review" aria-label="AI-recommended sequence">
      <span className="small-tag">AI SUGGESTION · VALIDATED OPERATIONS</span>
      <h3>{recommendation.title}</h3>
      <AiMarkdown text={recommendation.reason} />
      <p className="filter-guidance">
        Input: {recommendation.input === "noisy" ? "Noisy realization" : "Clean original"} ·{" "}
        {sourceLabel}
      </p>
      <ol className="recommendation-steps">
        {recommendation.steps.map((step, index) => (
          <li key={index}>
            <strong>{methods.find((item) => item.id === step.method)?.name ?? step.method}</strong>
            <span>{describeOperation(step)}</span>
            <details>
              <summary>Why this step?</summary>
              <AiMarkdown text={step.explanation} />
            </details>
          </li>
        ))}
      </ol>
      {accepted ? (
        <p role="status">
          Added to the sequence builder. Inspect or edit the steps, then choose Run sequence when
          ready.
        </p>
      ) : (
        <>
          <p className="filter-guidance">
            Reviewing or adding these steps does not process the image.
          </p>
          {stale && (
            <p role="status">The experiment changed. Ask again before using this suggestion.</p>
          )}
          {!onAccept && (
            <p className="filter-guidance">Sequence acceptance is unavailable in this view.</p>
          )}
          <button
            className="studio-button secondary"
            type="button"
            disabled={disabled || !onAccept}
            onClick={() => setReview((value) => !value)}
          >
            {review ? "Hide review actions" : "Review sequence"}
          </button>
          {review && (
            <div className="recommendation-actions">
              {existingLength ? (
                <>
                  <button
                    className="studio-button primary"
                    type="button"
                    disabled={
                      disabled || existingLength + recommendation.steps.length > MAX_SEQUENCE_STEPS
                    }
                    onClick={() => acceptSequence("append")}
                  >
                    Append {recommendation.steps.length} steps
                  </button>
                  <button
                    className="studio-button secondary"
                    type="button"
                    disabled={disabled}
                    onClick={() => setConfirm(true)}
                  >
                    Replace saved sequence…
                  </button>
                  {existingLength + recommendation.steps.length > MAX_SEQUENCE_STEPS && (
                    <p className="filter-guidance">
                      Appending would exceed six steps. Remove steps or explicitly replace the saved
                      sequence.
                    </p>
                  )}
                  {confirm && (
                    <div
                      className="recommendation-confirm"
                      role="group"
                      aria-label="Confirm sequence replacement"
                    >
                      <p>Replace your {existingLength} saved steps with this suggestion?</p>
                      <button
                        className="studio-button secondary"
                        type="button"
                        disabled={disabled}
                        onClick={() => acceptSequence("replace")}
                      >
                        Confirm replacement
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setConfirm(false)}
                      >
                        Keep my sequence
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <button
                  className="studio-button primary"
                  type="button"
                  disabled={disabled}
                  onClick={() => acceptSequence("append")}
                >
                  Use this sequence
                </button>
              )}
            </div>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
