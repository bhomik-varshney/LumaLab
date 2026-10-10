import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import {
  comparisonKey,
  experimentScope,
  experimentTitle,
  experimentParameters,
  operationTitle,
  boundedHistory,
  saveExperiment,
} from "@/lib/experiments";
import type { Experiment } from "@/lib/experiments";

type Props = {
  tab: "compare" | "history" | null;
  onTab: (tab: "compare" | "history" | null) => void;
  history: Experiment[];
  onHistory: (entries: Experiment[]) => void;
  current: Experiment | null;
  onRestore: (entry: Experiment) => void;
  onContinue: (entry: Experiment) => void;
  busy: boolean;
};
export function ExperimentWorkbench({
  tab,
  onTab,
  history,
  onHistory,
  current,
  onRestore,
  onContinue,
  busy,
}: Props) {
  const lastTab = useRef<"compare" | "history">("compare");
  useEffect(() => {
    if (tab) lastTab.current = tab;
  }, [tab]);
  const [comparisons, setComparisons] = useState<Experiment[]>([]);
  const [capacity, setCapacity] = useState(2);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Experiment | null>(null);
  const [notice, setNotice] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [pending, setPending] = useState<Experiment | null>(null);
  const [focused, setFocused] = useState(false);
  const add = (entry: Experiment) => {
    if (
      comparisons.some(
        (item) =>
          item.id === entry.id ||
          (comparisonKey(item) === comparisonKey(entry) &&
            item.result.url === entry.result.url &&
            item.result.method === entry.result.method &&
            JSON.stringify(item.result.parameters) === JSON.stringify(entry.result.parameters) &&
            JSON.stringify(item.result.steps) === JSON.stringify(entry.result.steps)),
      )
    ) {
      setNotice("This result is already in the comparison.");
      return;
    }
    if (comparisons.length && comparisonKey(comparisons[0]!) !== comparisonKey(entry)) {
      setPending(entry);
      return;
    }
    if (comparisons.length >= capacity) {
      setNotice(
        capacity === 2
          ? "Choose Add third result to compare three experiments."
          : "Remove a result before adding another.",
      );
      return;
    }
    setComparisons((previous) => [...previous, entry]);
    setSelected(entry.id);
    setNotice("");
    onTab("compare");
  };
  const actions = (entry: Experiment) => (
    <div className="experiment-actions">
      <button
        className="studio-button secondary"
        disabled={busy}
        onClick={() => {
          onRestore(entry);
          onTab(null);
        }}
      >
        Use as active output
      </button>
      <button className="studio-button primary" disabled={busy} onClick={() => onContinue(entry)}>
        Continue from result
      </button>
      {!history.some((item) => item.result.url === entry.result.url) && (
        <button
          className="studio-button secondary"
          onClick={() => {
            const next = boundedHistory([entry, ...history]);
            onHistory(next);
            setNotice(
              next.includes(entry)
                ? "Result added to history."
                : "This result exceeds the history image limit. It is still available to save or compare.",
            );
          }}
        >
          Add to history
        </button>
      )}
      <button className="studio-button secondary" onClick={() => saveExperiment(entry)}>
        Save PNG
      </button>
    </div>
  );
  const details = (entry: Experiment) => (
    <div className="experiment-details">
      <strong>{experimentTitle(entry.result)}</strong>
      <p>
        Input: {entry.source} · {experimentScope(entry.result)}
      </p>
      <time>{new Date(entry.at).toLocaleString()}</time>
      {entry.result.steps && (
        <ol>
          {entry.result.steps.map((step, index) => (
            <li key={index}>{operationTitle(step)}</li>
          ))}
        </ol>
      )}
      {!entry.result.steps && <p>{experimentParameters(entry.result)}</p>}
      {entry.noise && entry.result.method !== "noise" && (
        <p>
          Noisy input:{" "}
          {experimentParameters({
            ...entry.result,
            steps: [],
            noise: entry.noise,
          })}
        </p>
      )}
      <p>
        MATLAB · full output {entry.result.enhanced.width} × {entry.result.enhanced.height} · mean{" "}
        {entry.result.enhanced.mean.toFixed(2)} · deviation{" "}
        {entry.result.enhanced.deviation.toFixed(2)}
      </p>
      {entry.result.roiAnalysis && (
        <p>
          Selected region · original mean {entry.result.roiAnalysis.original.mean.toFixed(2)} →
          result mean {entry.result.roiAnalysis.enhanced.mean.toFixed(2)} · result deviation{" "}
          {entry.result.roiAnalysis.enhanced.deviation.toFixed(2)}
        </p>
      )}
      {actions(entry)}
    </div>
  );
  const chosen = comparisons.find((entry) => entry.id === selected) ?? comparisons[0];
  return (
    <Dialog
      open={tab !== null}
      onOpenChange={(open) => {
        if (!open) onTab(null);
      }}
    >
      <DialogContent
        className="experiment-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document
            .querySelector<HTMLButtonElement>(
              lastTab.current === "history"
                ? ".experiment-entry button:last-child"
                : ".experiment-entry button:first-child",
            )
            ?.focus();
        }}
      >
        <DialogTitle>Experiment workspace</DialogTitle>
        <DialogDescription>
          Compare real MATLAB outputs or revisit completed experiments. Your original upload stays
          unchanged.
        </DialogDescription>
        <div className="experiment-toolbar">
          <div className="segmented" role="group" aria-label="Experiment view">
            <button aria-pressed={tab === "compare"} onClick={() => onTab("compare")}>
              A/B/C Compare
            </button>
            <button aria-pressed={tab === "history"} onClick={() => onTab("history")}>
              History · {history.length}
            </button>
          </div>
          {tab === "compare" && (
            <>
              <button
                className="studio-button secondary"
                disabled={!current || busy}
                onClick={() => current && add(current)}
              >
                Add current result
              </button>
              {capacity === 2 && (
                <button
                  className="studio-button secondary"
                  onClick={() => {
                    setCapacity(3);
                    setNotice("Choose a new method in the studio, then add its completed result.");
                  }}
                >
                  Add third result
                </button>
              )}
            </>
          )}
        </div>
        <div className="experiment-body">
          {notice && (
            <p role="status" className="experiment-notice">
              {notice}
            </p>
          )}
          {pending && (
            <div className="experiment-notice" role="alert">
              <p>This result uses a different input or region. Start a new comparison with it?</p>
              <button
                className="studio-button secondary"
                onClick={() => {
                  setComparisons([pending]);
                  setSelected(pending.id);
                  setPending(null);
                  setCapacity(2);
                  onTab("compare");
                }}
              >
                Start new comparison
              </button>
              <button className="studio-button secondary" onClick={() => setPending(null)}>
                Keep existing comparison
              </button>
            </div>
          )}
          {tab === "compare" ? (
            <>
              {!comparisons.length && (
                <p className="experiment-empty">
                  Choose a method in the studio, wait for MATLAB, then Add current result. Change a
                  setting and add a second result.
                </p>
              )}
              {!!comparisons.length && (
                <>
                  <p>
                    Input: {comparisons[0]!.source} · {experimentScope(comparisons[0]!.result)} ·
                    All panels fit the same image proportions.
                  </p>
                  {comparisons[0]!.result.roiUrl && (
                    <label className="experiment-focus">
                      <input
                        type="checkbox"
                        checked={focused}
                        onChange={(event) => setFocused(event.target.checked)}
                      />{" "}
                      Focus on selected region
                    </label>
                  )}
                  <div
                    className="experiment-compare-grid"
                    style={{ gridTemplateColumns: `repeat(${capacity}, minmax(0, 1fr))` }}
                  >
                    {comparisons.map((entry, index) => (
                      <article
                        className="experiment-card"
                        data-selected={chosen?.id === entry.id}
                        key={entry.id}
                      >
                        <button
                          className="experiment-select"
                          aria-pressed={chosen?.id === entry.id}
                          onClick={() => setSelected(entry.id)}
                        >
                          <span>
                            {String.fromCharCode(65 + index)} · {experimentTitle(entry.result)}
                          </span>
                          <img
                            src={
                              focused ? (entry.result.roiUrl ?? entry.result.url) : entry.result.url
                            }
                            alt={`Result ${String.fromCharCode(65 + index)}: ${experimentTitle(entry.result)}`}
                          />
                          <small>
                            {experimentParameters(entry.result)}
                            {chosen?.id === entry.id ? " · Selected" : ""}
                          </small>
                        </button>
                        <button
                          className="studio-button secondary"
                          onClick={() => {
                            setComparisons((previous) =>
                              previous.filter((item) => item.id !== entry.id),
                            );
                            setSelected(null);
                          }}
                        >
                          Remove result {String.fromCharCode(65 + index)}
                        </button>
                      </article>
                    ))}
                    {comparisons.length < capacity && (
                      <div className="experiment-empty">
                        {comparisons.length === 1 ? "Result B" : "Next result"}
                        <p>
                          Close this panel, choose another setting, then add the completed result.
                        </p>
                      </div>
                    )}
                  </div>
                  <details className="experiment-original">
                    <summary>Original input reference</summary>
                    <img
                      src={
                        focused
                          ? (comparisons[0]!.result.roiOriginalUrl ??
                            comparisons[0]!.result.originalUrl)
                          : comparisons[0]!.result.originalUrl
                      }
                      alt="Original comparison input"
                    />
                  </details>
                  {chosen && details(chosen)}
                </>
              )}
            </>
          ) : (
            <>
              <p className="experiment-retention">
                Session only · up to 12 results and 48 MiB of image references. Refresh clears
                history. Large results may be omitted; the active output remains available to save.
                Images stay in this browser and MATLAB bridge.
              </p>
              {!!history.length && (
                <div className="experiment-clear">
                  {confirmClear ? (
                    <>
                      <span>
                        Clear recent history? Active output and comparisons stay available.
                      </span>
                      <button
                        className="studio-button secondary"
                        onClick={() => {
                          onHistory([]);
                          setPreview(null);
                          setConfirmClear(false);
                        }}
                      >
                        Confirm clear history
                      </button>
                      <button
                        className="studio-button secondary"
                        onClick={() => setConfirmClear(false)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="studio-button secondary"
                      onClick={() => setConfirmClear(true)}
                    >
                      Clear history
                    </button>
                  )}
                </div>
              )}
              {!history.length ? (
                <p className="experiment-empty">
                  No completed experiments yet. Change an enhancement setting, run a sequence, or
                  try the Noise Playground.
                </p>
              ) : (
                <div className="experiment-history-layout">
                  <div className="experiment-history-list">
                    {history.map((entry) => (
                      <article
                        key={entry.id}
                        className="experiment-history-row"
                        data-selected={preview?.id === entry.id}
                      >
                        <button onClick={() => setPreview(entry)}>
                          <img src={entry.result.url} alt="" />
                          <span>
                            <strong>{experimentTitle(entry.result)}</strong>
                            <small>
                              {entry.source} · {experimentScope(entry.result)}
                            </small>
                            <time>{new Date(entry.at).toLocaleTimeString()}</time>
                          </span>
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Remove ${experimentTitle(entry.result)} from history`}
                          onClick={() => {
                            onHistory(history.filter((item) => item.id !== entry.id));
                            if (preview?.id === entry.id) setPreview(null);
                          }}
                        >
                          ×
                        </button>
                      </article>
                    ))}
                  </div>
                  <div className="experiment-history-preview">
                    {preview ? (
                      <>
                        <img
                          src={
                            focused
                              ? (preview.result.roiUrl ?? preview.result.url)
                              : preview.result.url
                          }
                          alt="History result preview"
                        />
                        {preview.result.roiUrl && (
                          <label className="experiment-focus">
                            <input
                              type="checkbox"
                              checked={focused}
                              onChange={(event) => setFocused(event.target.checked)}
                            />{" "}
                            Focus on selected region (Save PNG keeps the full output)
                          </label>
                        )}
                        {details(preview)}
                        <button className="studio-button secondary" onClick={() => add(preview)}>
                          Add to comparison
                        </button>
                      </>
                    ) : (
                      <p>Select an experiment to preview its image and exact settings.</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
