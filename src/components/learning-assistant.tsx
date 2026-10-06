import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, useId, type FormEvent, type PointerEvent } from "react";
import { explainLearning } from "@/lib/learning-context";
import { AiMarkdown } from "./ai-markdown";
import { plainExplanation } from "@/lib/markdown-text";
import { RecommendationReview } from "./recommendation-review";
import type { SequenceRecommendation, LearningContext } from "@/lib/learning-context";
import { describeOperation } from "@/lib/enhancement-methods";

const positionEvent = "lumalab-assistant-position-change";

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
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    left: number;
    top: number;
  } | null>(null);
  const draggedRef = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const id = useId();
  const signature = JSON.stringify(context);

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lumalab-assistant-position");
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("left" in parsed) ||
        !("top" in parsed) ||
        typeof parsed.left !== "number" ||
        typeof parsed.top !== "number"
      )
        return;
      const bounds = launcherRef.current?.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(parsed.left, window.innerWidth - (bounds?.width ?? 140) - 8)),
        top: Math.max(8, Math.min(parsed.top, window.innerHeight - (bounds?.height ?? 48) - 8)),
      });
    } catch {
      // Ignore unavailable or malformed saved positioning and use the default corner.
    }
  }, []);

  useEffect(() => {
    if (!position) return;
    try {
      localStorage.setItem("lumalab-assistant-position", JSON.stringify(position));
    } catch {
      // Moving the chat still works when browser storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent(positionEvent, { detail: position }));
  }, [position]);

  useEffect(() => {
    const syncPosition = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const value: unknown = event.detail;
      if (
        typeof value !== "object" ||
        value === null ||
        !("left" in value) ||
        !("top" in value) ||
        typeof value.left !== "number" ||
        typeof value.top !== "number"
      )
        return;
      const { left, top } = value;
      setPosition((current) => {
        if (current && current.left === left && current.top === top) return current;
        const bounds = launcherRef.current?.getBoundingClientRect();
        return {
          left: Math.max(8, Math.min(left, window.innerWidth - (bounds?.width ?? 140) - 8)),
          top: Math.max(8, Math.min(top, window.innerHeight - (bounds?.height ?? 48) - 8)),
        };
      });
    };
    window.addEventListener(positionEvent, syncPosition);
    return () => window.removeEventListener(positionEvent, syncPosition);
  }, []);

  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) draggedRef.current = true;
      if (!draggedRef.current) return;
      const bounds = launcherRef.current?.getBoundingClientRect();
      setPosition({
        left: Math.max(
          8,
          Math.min(drag.left + deltaX, window.innerWidth - (bounds?.width ?? 56) - 8),
        ),
        top: Math.max(
          8,
          Math.min(drag.top + deltaY, window.innerHeight - (bounds?.height ?? 56) - 8),
        ),
      });
    };
    const stop = (event: globalThis.PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  const beginDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const bounds = launcherRef.current?.getBoundingClientRect();
    if (!bounds) return;
    draggedRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: bounds.left,
      top: bounds.top,
    };
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

  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const launcherBounds = launcherRef.current?.getBoundingClientRect();
  const widgetLeft = position?.left ?? launcherBounds?.left ?? viewportWidth - 156;
  const widgetTop = position?.top ?? launcherBounds?.top ?? viewportHeight - 78;
  const panelWidth = Math.min(360, viewportWidth - 24);
  const panelOpensBelow = widgetTop < viewportHeight / 2;
  const panelStyle = {
    left: widgetLeft + 148 + panelWidth > viewportWidth - 8 ? "auto" : 0,
    right: widgetLeft + 148 + panelWidth > viewportWidth - 8 ? 0 : "auto",
    top: panelOpensBelow ? "calc(100% + 12px)" : "auto",
    bottom: panelOpensBelow ? "auto" : "calc(100% + 12px)",
    maxHeight: panelOpensBelow
      ? Math.max(160, viewportHeight - widgetTop - 72)
      : Math.max(160, widgetTop - 24),
  };

  return (
    <section
      className={`assistant-widget${open ? " is-open" : ""}`}
      aria-label="Luma AI chat"
      style={
        position
          ? { left: position.left, top: position.top, right: "auto", bottom: "auto" }
          : undefined
      }
    >
      <button
        ref={launcherRef}
        className="assistant-toggle"
        type="button"
        aria-label="Luma AI — AI Learning Assistant. Drag to move"
        aria-expanded={open}
        aria-controls={id}
        title="Drag to move · Click to chat"
        onPointerDown={beginDrag}
        onClick={() => {
          if (draggedRef.current) {
            draggedRef.current = false;
            return;
          }
          setOpen((value) => !value);
        }}
      >
        <Sparkles size={18} aria-hidden="true" />
        <span>Luma AI</span>
        <MessageCircle className="assistant-chat-indicator" size={14} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="assistant-chat" style={panelStyle}>
          <header className="assistant-chat-header">
            <span className="assistant-avatar">
              <Sparkles size={16} aria-hidden="true" />
            </span>
            <div>
              <strong>Luma AI</strong>
              <span>Image learning assistant</span>
            </div>
            <button
              className="assistant-close"
              type="button"
              aria-label="Close Luma AI chat"
              onClick={() => setOpen(false)}
            >
              <X size={17} />
            </button>
          </header>
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
