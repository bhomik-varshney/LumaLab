import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

const storageKey = "lumalab.assistant-position.v1";
const positionEvent = "lumalab-assistant-position";
type Position = { x: number; y: number };
type Bounds = { left: number; top: number; right: number; bottom: number };
// Only a position preference is shared between the studio and playground launchers.
let sessionPosition: Position | null = null;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));

function readPosition(): Position | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (
      value &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y) &&
      value.x >= 0 &&
      value.x <= 1 &&
      value.y >= 0 &&
      value.y <= 1
    )
      return value;
    return null;
  } catch {
    /* Storage may be disabled; the session preference still works. */
    return sessionPosition;
  }
}

function publish(position: Position | null) {
  sessionPosition = position;
  try {
    if (position) localStorage.setItem(storageKey, JSON.stringify(position));
    else localStorage.removeItem(storageKey);
  } catch {
    /* Keep using the in-memory preference. */
  }
  window.dispatchEvent(new Event(positionEvent));
}

export function useFloatingAssistant(open: boolean) {
  const widgetRef = useRef<HTMLElement>(null);
  const safeAreaRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [preference, setPreference] = useState<Position | null>(null);
  const [geometry, setGeometry] = useState<{
    bounds: Bounds;
    width: number;
    height: number;
    panelHeight: number;
    controls: Bounds[];
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
    initial: Position | null;
    current: Position | null;
  } | null>(null);

  useEffect(() => {
    const sync = () => setPreference(readPosition());
    const storage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        sessionPosition = null;
        sync();
      }
    };
    sync();
    window.addEventListener(positionEvent, sync);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(positionEvent, sync);
      window.removeEventListener("storage", storage);
    };
  }, []);

  useEffect(() => {
    const measure = () => {
      const widget = widgetRef.current;
      if (!widget || !safeAreaRef.current || widget.offsetWidth === 0) return;
      const safe = getComputedStyle(safeAreaRef.current);
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const right = left + (viewport?.width ?? innerWidth);
      const bottom = top + (viewport?.height ?? innerHeight);
      const gap = 12;
      const headerBottom =
        document.querySelector(".studio-header")?.getBoundingClientRect().bottom ?? top;
      const bounds = {
        left: left + (parseFloat(safe.paddingLeft) || 0) + gap,
        top: Math.min(
          Math.max(top + (parseFloat(safe.paddingTop) || 0), headerBottom) + gap,
          bottom - widget.offsetHeight - gap,
        ),
        right: right - (parseFloat(safe.paddingRight) || 0) - gap,
        bottom: bottom - (parseFloat(safe.paddingBottom) || 0) - gap,
      };
      setGeometry({
        bounds,
        width: widget.offsetWidth,
        height: widget.offsetHeight,
        panelHeight: panelRef.current?.offsetHeight || 580,
        controls: Array.from(
          document.querySelectorAll<HTMLElement>(
            ".studio-shell button, .studio-shell input, .studio-shell select, .studio-shell summary, .studio-shell [role='slider']",
          ),
        )
          .filter(
            (element) => !element.closest(".assistant-widget") && element.getClientRects().length,
          )
          .map((element) => element.getBoundingClientRect())
          .filter(
            (rect) =>
              rect.bottom > bounds.top &&
              rect.top < bounds.bottom &&
              rect.right > bounds.left &&
              rect.left < bounds.right,
          )
          .map(({ left, top, right, bottom }) => ({ left, top, right, bottom })),
      });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (widgetRef.current) observer?.observe(widgetRef.current);
    if (panelRef.current) observer?.observe(panelRef.current);
    const header = document.querySelector(".studio-header");
    if (header) observer?.observe(header);
    const content = document.querySelector(".studio-content");
    if (content) observer?.observe(content);
    const mutations = new MutationObserver(measure);
    if (content)
      mutations.observe(content, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden", "open", "disabled"],
      });
    measure();
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer?.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [open]);

  const bounds = geometry?.bounds;
  const preferredLeft =
    bounds && geometry
      ? bounds.left +
        (preference?.x ?? 1) * Math.max(0, bounds.right - bounds.left - geometry.width)
      : undefined;
  const preferredTop =
    bounds && geometry
      ? bounds.top +
        (preference?.y ?? 1) * Math.max(0, bounds.bottom - bounds.top - geometry.height)
      : undefined;
  // Keep the preferred anchor, but yield to nearby controls as the workspace scrolls.
  // This reclaims the footer band without making save/sequence/image controls inaccessible.
  const placement = useMemo(() => {
    if (!geometry || preferredLeft === undefined || preferredTop === undefined || dragging)
      return { left: preferredLeft, top: preferredTop };
    const { bounds, width, height, controls } = geometry;
    const clear = (x: number, y: number) =>
      controls.every(
        (rect) =>
          x + width <= rect.left - 4 ||
          x >= rect.right + 4 ||
          y + height <= rect.top - 4 ||
          y >= rect.bottom + 4,
      );
    if (clear(preferredLeft, preferredTop)) return { left: preferredLeft, top: preferredTop };
    const candidates: Position[] = [{ x: bounds.left, y: bounds.bottom - height }];
    for (const rect of controls)
      candidates.push(
        { x: rect.left - width - 8, y: preferredTop },
        { x: rect.right + 8, y: preferredTop },
        { x: preferredLeft, y: rect.top - height - 8 },
        { x: preferredLeft, y: rect.bottom + 8 },
      );
    const candidate = candidates
      .map(({ x, y }) => ({
        x: clamp(x, bounds.left, bounds.right - width),
        y: clamp(y, bounds.top, bounds.bottom - height),
      }))
      .sort(
        (a, b) =>
          Math.hypot(a.x - preferredLeft, a.y - preferredTop) -
          Math.hypot(b.x - preferredLeft, b.y - preferredTop),
      )
      .find(({ x, y }) => clear(x, y));
    return candidate
      ? { left: candidate.x, top: candidate.y }
      : { left: preferredLeft, top: preferredTop };
  }, [geometry, preferredLeft, preferredTop, dragging]);
  const { left, top } = placement;
  const normalize = (x: number, y: number): Position => {
    if (!geometry || !bounds) return { x: 1, y: 1 };
    const width = Math.max(0, bounds.right - bounds.left - geometry.width);
    const height = Math.max(0, bounds.bottom - bounds.top - geometry.height);
    return {
      x: width ? clamp((x - bounds.left) / width, 0, 1) : 0,
      y: height ? clamp((y - bounds.top) / height, 0, 1) : 0,
    };
  };
  const reset = () => {
    setPreference(null);
    publish(null);
  };
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || left === undefined || top === undefined) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left,
      top,
      initial: preference,
      current: preference,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.clientX - active.x,
      dy = event.clientY - active.y;
    if (!dragging && Math.hypot(dx, dy) < 5) return;
    setDragging(true);
    active.current = normalize(active.left + dx, active.top + dy);
    setPreference(active.current);
  };
  const finish = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    drag.current = null;
    if (cancel) setPreference(active.initial);
    else if (active.current !== active.initial) publish(active.current);
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction || left === undefined || top === undefined) return;
    event.preventDefault();
    const distance = event.shiftKey ? 60 : 20;
    const next = normalize(left + direction[0] * distance, top + direction[1] * distance);
    setPreference(next);
    publish(next);
  };
  const panelWidth = bounds ? Math.min(390, bounds.right - bounds.left) : 390;
  const above = bounds && top !== undefined ? Math.max(0, top - bounds.top - 12) : 580;
  const below =
    bounds && top !== undefined && geometry
      ? Math.max(0, bounds.bottom - top - geometry.height - 12)
      : 0;
  const panelAbove = above >= Math.min(580, geometry?.panelHeight ?? 580) || above >= below;
  const panelHeight = Math.min(580, panelAbove ? above : below);
  return {
    widgetRef,
    safeAreaRef,
    panelRef,
    dragging,
    reset,
    widgetStyle: left === undefined ? undefined : { left, top, right: "auto", bottom: "auto" },
    panelStyle:
      bounds && left !== undefined && top !== undefined && geometry
        ? {
            left: clamp(left + geometry.width - panelWidth, bounds.left, bounds.right - panelWidth),
            top: clamp(
              panelAbove
                ? top - Math.min(panelHeight, geometry.panelHeight) - 12
                : top + geometry.height + 12,
              bounds.top,
              bounds.bottom - Math.min(panelHeight, geometry.panelHeight),
            ),
            right: "auto",
            bottom: "auto",
            width: panelWidth,
            maxHeight: panelHeight,
          }
        : undefined,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => finish(event),
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
      onKeyDown,
    },
  };
}
