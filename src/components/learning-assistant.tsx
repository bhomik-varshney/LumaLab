import { useEffect, useRef, useState, useId } from "react";
import { explainLearning } from "@/lib/learning-context";
import { AiMarkdown } from "./ai-markdown";
import { plainExplanation } from "@/lib/markdown-text";
import { RecommendationReview } from "./recommendation-review";
import type {
  SequenceRecommendation,
  LearningAnswer,
  LearningContext,
} from "@/lib/learning-context";
import { describeOperation } from "@/lib/enhancement-methods";
export function LearningAssistant({
  context,
  sourceKey = "",
  sourceLabel = "Clean original",
  sequenceLength = context.sequence.length,
  acceptDisabled = false,
  onAccept,
}: {
  context: LearningContext;
  sourceKey?: string;
  sourceLabel?: string;
  sequenceLength?: number;
  acceptDisabled?: boolean;
  onAccept?: (recommendation: SequenceRecommendation, mode: "append" | "replace") => string | null;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState<{
    text: string;
    signature: string;
    label: string;
    truncated: boolean;
    sourceKey: string;
    sourceLabel: string;
    recommendation: SequenceRecommendation | null;
    issue: string | undefined;
  } | null>(null);
  const [lastAction, setLastAction] = useState<"result" | "sequence" | "next">("result");
  const [copied, setCopied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const id = useId();
  const signature = JSON.stringify(context);
  useEffect(() => () => controller.current?.abort(), []);
  const run = async (action: "result" | "sequence" | "next") => {
    if (controller.current) return;
    const requestController = new AbortController();
    controller.current = requestController;
    setLastAction(action);
    setBusy(true);
    setError("");
    setAnswer(null);
    setCopied(false);
    const label =
      context.mode === "noise"
        ? `Noise experiment · ${context.noise?.type ?? "clean image"}`
        : action === "sequence"
          ? `Saved sequence · ${context.sequence.length} steps`
          : context.selected
            ? describeOperation(context.selected)
            : "No operation selected";
    try {
      const result = await explainLearning(action, question, context, requestController.signal);
      if (!requestController.signal.aborted)
        setAnswer({
          text: result.explanation,
          signature,
          label,
          truncated: result.truncated,
          sourceKey,
          sourceLabel,
          recommendation: result.recommendation ?? null,
          issue: result.recommendationIssue,
        });
    } catch (error) {
      if (!requestController.signal.aborted) setError((error as Error).message);
    } finally {
      if (controller.current === requestController) {
        controller.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <section className="assistant-panel" aria-label="AI Learning Assistant">
      <button
        className="assistant-toggle text-button"
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        AI Learning Assistant <span>{open ? "Close" : "Optional · Open"}</span>
      </button>
      {open && (
        <div id={id} className="assistant-body">
          <p className="filter-guidance">
            Explain your settings and measured results. Only metadata and your question go to Groq;
            images stay local. AI suggestions may be mistaken.
          </p>
          <label htmlFor={`${id}-question`}>
            Learning question <span>(optional)</span>
          </label>
          <textarea
            id={`${id}-question`}
            maxLength={800}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Why might median help with impulse noise?"
            rows={2}
          />
          <div className="assistant-actions">
            <button
              type="button"
              className="studio-button secondary"
              disabled={busy}
              onClick={() => void run("result")}
            >
              Explain this result
            </button>
            {context.mode === "studio" && (
              <button
                type="button"
                className="studio-button secondary"
                disabled={busy || !context.sequence.length}
                onClick={() => void run("sequence")}
              >
                Explain my sequence
              </button>
            )}
            <button
              type="button"
              className="studio-button secondary"
              disabled={busy}
              onClick={() => void run("next")}
            >
              Suggest what to try next
            </button>
          </div>
          {busy && <p role="status">Asking Groq… MATLAB controls remain available.</p>}
          {error && (
            <div className="studio-alert" role="alert">
              <span>{error}</span>
              <button className="text-button" type="button" onClick={() => void run(lastAction)}>
                Retry explanation
              </button>
            </div>
          )}
          {answer && (
            <div className="ai-explanation">
              <p className="eyebrow">AI-GENERATED · GROQ</p>
              <p className="filter-guidance">{answer.label}</p>
              {(answer.signature !== signature || answer.sourceKey !== sourceKey) && (
                <p role="status" className="filter-guidance">
                  Your experiment changed. This explanation describes the earlier settings; ask
                  again to update.
                </p>
              )}
              <div className="ai-answer">
                <AiMarkdown text={answer.text} />
              </div>
              {answer.issue && (
                <p className="recommendation-unavailable" role="status">
                  Not executable — {answer.issue}
                </p>
              )}
              {answer.recommendation && (
                <RecommendationReview
                  key={answer.signature + answer.text}
                  recommendation={answer.recommendation}
                  sourceLabel={answer.sourceLabel}
                  existingLength={sequenceLength}
                  disabled={
                    acceptDisabled ||
                    answer.signature !== signature ||
                    answer.sourceKey !== sourceKey
                  }
                  stale={answer.signature !== signature || answer.sourceKey !== sourceKey}
                  onAccept={onAccept}
                />
              )}
              {answer.truncated && (
                <p className="filter-guidance">
                  Response reached its length limit. Ask a narrower question.
                </p>
              )}
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(plainExplanation(answer.text))
                    .then(() => setCopied(true))
                    .catch(() =>
                      setError("Copy is unavailable. Select the explanation text to copy it."),
                    )
                }
              >
                {copied ? "Copied" : "Copy explanation"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
