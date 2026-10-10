import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RefObject } from "react";
import type { Region } from "@/lib/matlab-api";
import { clampRegion, containedBounds, sourcePoint } from "@/lib/region";
export function RegionSelector({
  stage,
  width,
  height,
  region,
  onApply,
  onClear,
  onFit,
  onSelect,
  disabled,
  viewKey,
}: {
  stage: RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  region: Region | null;
  onApply: (region: Region) => void;
  onClear: () => void;
  onFit: (region: Region) => void;
  onSelect: () => void;
  disabled: boolean;
  viewKey: string;
}) {
  const [open, setOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Region | null>(null);
  const [error, setError] = useState("");
  const [, layout] = useState(0);
  const drag = useRef<{
    point: { x: number; y: number };
    region: Region | null;
    kind: "draw" | "move" | "resize";
  } | null>(null);
  useEffect(() => {
    setDraft(region);
    setDrawing(false);
  }, [region, width, height]);
  useEffect(() => {
    const target = stage.current;
    if (!target) return;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => layout((value) => value + 1));
    observer?.observe(target);
    window.addEventListener("resize", refresh);
    const image = target.querySelector("img");
    image?.addEventListener("load", refresh);
    function refresh() {
      layout((value) => value + 1);
    }
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", refresh);
      image?.removeEventListener("load", refresh);
    };
  }, [stage, viewKey]);
  const bounds = () => {
    const image = stage.current?.querySelector<HTMLImageElement>(".comparison-image");
    return image ? containedBounds(image.getBoundingClientRect(), width, height) : null;
  };
  const geometry = bounds();
  const box = stage.current?.getBoundingClientRect();
  const rect =
    draft && geometry && box
      ? {
          left: geometry.left - box.left + (draft.x * geometry.width) / width,
          top: geometry.top - box.top + (draft.y * geometry.height) / height,
          width: (draft.width * geometry.width) / width,
          height: (draft.height * geometry.height) / height,
        }
      : null;
  const point = (event: React.PointerEvent) => {
    const b = bounds();
    return b ? sourcePoint(event.clientX, event.clientY, b, width, height) : null;
  };
  const begin = (event: React.PointerEvent, kind: "draw" | "move" | "resize") => {
    if (!drawing || disabled) return;
    const start = point(event);
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { point: start, region: draft, kind };
    setError("");
    if (kind === "draw")
      setDraft({
        x: Math.min(start.x, width - 8),
        y: Math.min(start.y, height - 8),
        width: 8,
        height: 8,
      });
  };
  const move = (event: React.PointerEvent) => {
    if (!drag.current) return;
    event.stopPropagation();
    const end = point(event);
    if (!end) return;
    const { point: start, region: initial, kind } = drag.current;
    if (kind === "draw")
      setDraft(
        clampRegion(
          {
            x: Math.min(start.x, end.x),
            y: Math.min(start.y, end.y),
            width: Math.abs(end.x - start.x),
            height: Math.abs(end.y - start.y),
          },
          width,
          height,
        ),
      );
    else if (initial)
      setDraft(
        clampRegion(
          kind === "move"
            ? { ...initial, x: initial.x + end.x - start.x, y: initial.y + end.y - start.y }
            : {
                ...initial,
                width: initial.width + end.x - start.x,
                height: initial.height + end.y - start.y,
              },
          width,
          height,
        ),
      );
  };
  const confirm = () => {
    if (
      !draft ||
      !Object.values(draft).every(Number.isInteger) ||
      draft.x < 0 ||
      draft.y < 0 ||
      draft.width < 8 ||
      draft.height < 8 ||
      draft.x + draft.width > width ||
      draft.y + draft.height > height
    ) {
      setError("Use whole pixels and a region of at least 8 × 8 within the image.");
      return;
    }
    onApply({ ...draft });
    setDrawing(false);
    setError("");
  };
  return (
    <div className="region-controls">
      <button
        className="studio-button secondary"
        disabled={disabled || width < 8 || height < 8}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setDrawing(!open);
          if (!open) onSelect();
        }}
      >
        Select region
      </button>
      <span>
        {region
          ? `${region.width} × ${region.height} pixels · processing only this region`
          : "Full image"}
      </span>
      {open && (
        <div className="region-editor">
          <p>
            Drag a rectangle. Drag inside to move it; use its corner to resize. Coordinates start at
            0.
          </p>
          <button
            className="studio-button secondary"
            disabled={disabled}
            aria-pressed={drawing}
            onClick={() => {
              setDrawing(!drawing);
              onSelect();
            }}
          >
            {" "}
            {drawing ? "Finish drawing" : "Draw / move region"}
          </button>
          {(["x", "y", "width", "height"] as const).map((key) => (
            <label key={key}>
              Region {key}
              <input
                type="number"
                min={key === "x" || key === "y" ? 0 : 8}
                max={key === "x" || key === "width" ? width : height}
                step={1}
                disabled={disabled}
                value={draft?.[key] ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...(draft ?? {
                      x: 0,
                      y: 0,
                      width: Math.min(64, width),
                      height: Math.min(64, height),
                    }),
                    [key]: Number(event.target.value),
                  })
                }
              />
            </label>
          ))}
          <button className="studio-button primary" disabled={disabled || !draft} onClick={confirm}>
            Apply to region
          </button>
          <button
            className="studio-button secondary"
            disabled={!draft || disabled}
            onClick={() => draft && onFit(clampRegion(draft, width, height))}
          >
            Fit region
          </button>
          <button
            className="studio-button secondary"
            disabled={disabled || (!draft && !region)}
            onClick={() => {
              setDraft(null);
              setDrawing(false);
              onClear();
            }}
          >
            Clear region
          </button>
          {error && <p role="alert">{error}</p>}
          <small>
            Neighborhood filters read surrounding pixels. Only the selected rectangle changes.
          </small>
        </div>
      )}
      {stage.current &&
        createPortal(
          <div
            className="region-overlay"
            data-interactive={drawing && !disabled}
            onPointerDown={(event) => begin(event, "draw")}
            onPointerMove={move}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            {rect && (
              <div
                className="region-rectangle"
                style={rect}
                onPointerDown={(event) => begin(event, "move")}
              >
                <span>
                  {draft!.width} × {draft!.height}
                </span>
                {drawing && (
                  <button
                    className="region-handle"
                    aria-label="Resize region; numeric dimensions below image"
                    onPointerDown={(event) => begin(event, "resize")}
                  />
                )}
              </div>
            )}
          </div>,
          stage.current,
        )}
    </div>
  );
}
