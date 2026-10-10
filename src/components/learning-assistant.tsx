import { GripVertical, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, useId, type FormEvent } from "react";
import { explainLearning } from "@/lib/learning-context";
import { AiMarkdown } from "./ai-markdown";
import { plainExplanation } from "@/lib/markdown-text";
import { RecommendationReview } from "./recommendation-review";
import type { SequenceRecommendation, LearningContext } from "@/lib/learning-context";
import { describeOperation } from "@/lib/enhancement-methods";
import { useFloatingAssistant } from "@/hooks/use-floating-assistant";

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
  const floating = useFloatingAssistant(open);
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
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
  const launcherRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const signature = JSON.stringify(context);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (open) document.getElementById(`${id}-question`)?.focus();
  }, [open, id]);
  const close = () => {
    setOpen(false);
    launcherRef.current?.focus();
  };

  const run = async (action: "result" | "sequence" | "next") => {
    if (controller.current) return;
    const requestController = new AbortController();
    controller.current = requestController;
    setLastAction(action);
    setBusy(true);
    setError("");
    setAnswer(null);
    setCopied(false);
    setAskedQuestion(
      question.trim() ||
        {
          result: "Explain this result",
          sequence: "Explain my sequence",
          next: "Suggest what to try next",
        }[action],
    );
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

  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!busy && question.trim()) void run("result");
  };

  return (
    <section
      ref={floating.widgetRef}
      style={floating.widgetStyle}
      className={`assistant-widget${open ? " is-open" : ""}${floating.dragging ? " is-dragging" : ""}`}
      aria-label="Luma AI chat"
    >
      <span ref={floating.safeAreaRef} className="assistant-safe-area" aria-hidden="true" />
      <div className="assistant-launcher">
        <button
          type="button"
          className="assistant-drag-handle"
          aria-label="Move LUMA AI"
          aria-describedby={`${id}-move-help`}
          title="Drag to move; use arrow keys to reposition"
          {...floating.handleProps}
        >
          <GripVertical size={17} aria-hidden="true" />
        </button>
        <span id={`${id}-move-help`} className="sr-only">
          Drag this handle or use arrow keys to move LUMA AI. Hold Shift for larger steps. Reset
          position is available in the assistant panel.
        </span>
        <button
          ref={launcherRef}
          className="assistant-toggle"
          type="button"
          aria-label={open ? "Close LUMA AI" : "Open LUMA AI"}
          aria-expanded={open}
          aria-controls={id}
          aria-haspopup="dialog"
          title={open ? "Close LUMA AI" : "Open LUMA AI"}
          data-light-surface
          onClick={() => (open ? close() : setOpen(true))}
        >
          <Sparkles size={21} aria-hidden="true" />
          <span>LUMA AI</span>
        </button>
      </div>
      {open && (
        <div
          ref={floating.panelRef}
          style={floating.panelStyle}
          id={id}
          className="assistant-chat"
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${id}-title`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
        >
          <header className="assistant-chat-header">
            <span className="assistant-avatar">
              <Sparkles size={16} aria-hidden="true" />
            </span>
            <div>
              <strong id={`${id}-title`}>LUMA AI</strong>
              <span>Image learning assistant</span>
            </div>
            <button
              className="assistant-close"
              type="button"
              aria-label="Close Luma AI chat"
              onClick={close}
            >
              <X size={17} />
            </button>
          </header>
          <div className="assistant-position-actions">
            <button type="button" className="text-button" onClick={floating.reset}>
              Reset position
            </button>
          </div>
          <div className="assistant-chat-messages" aria-live="polite">
            <p className="assistant-disclaimer">
              Ask about your current settings or results. Images stay on your device; only
              experiment details and your question are sent.
            </p>
            {askedQuestion && <p className="assistant-user-message">{askedQuestion}</p>}
            {busy && (
              <p className="assistant-waiting" role="status">
                <span className="assistant-pulse" /> Thinking…
              </p>
            )}
            {error && (
              <div className="studio-alert assistant-error" role="alert">
                <span>{error}</span>
                <button className="text-button" type="button" onClick={() => void run(lastAction)}>
                  Retry explanation
                </button>
              </div>
            )}
            {answer && (
              <div className="assistant-reply">
                <div className="assistant-reply-meta">
                  <span>{answer.label}</span>
                  {(answer.signature !== signature || answer.sourceKey !== sourceKey) && (
                    <span className="assistant-stale" role="status">
                      Your experiment changed. This describes the earlier settings; ask again to
                      update.
                    </span>
                  )}
                </div>
                <span className="eyebrow assistant-generated-label">AI-GENERATED · GROQ</span>
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
                    Response reached its limit. Ask a narrower question.
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
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
          <div className="assistant-chat-actions" aria-label="Suggested questions">
            <button type="button" disabled={busy} onClick={() => void run("result")}>
              Explain this result
            </button>
            {context.mode === "studio" && (
              <button
                type="button"
                disabled={busy || !context.sequence.length}
                onClick={() => void run("sequence")}
              >
                Explain my sequence
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void run("next")}>
              Suggest what to try next
            </button>
          </div>
          <form className="assistant-chat-form" onSubmit={submitQuestion}>
            <label className="sr-only" htmlFor={`${id}-question`}>
              Learning question
            </label>
            <textarea
              id={`${id}-question`}
              maxLength={800}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about your image…"
              rows={1}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button type="submit" aria-label="Send question" disabled={busy || !question.trim()}>
              <Send size={16} />
            </button>
          </form>
          <p className="assistant-footnote">
            AI can make mistakes · MATLAB controls remain available
          </p>
        </div>
      )}
    </section>
  );
}
