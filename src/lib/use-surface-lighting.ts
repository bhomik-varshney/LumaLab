import { useEffect, type RefObject } from "react";

/** Delegated lighting: one scheduled CSS update per frame, without React renders. */
export function useSurfaceLighting(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const enabled = window.matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    let frame = 0;
    let surface: HTMLElement | null = null;
    let x = 0;
    let y = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      surface?.style.removeProperty("--light-active");
      surface?.style.removeProperty("--light-x");
      surface?.style.removeProperty("--light-y");
      surface = null;
    };
    const move = (event: PointerEvent) => {
      if (!enabled.matches || event.pointerType !== "mouse") return;
      const next =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-light-surface]")
          : null;
      if (next !== surface) {
        reset();
        surface = next;
      }
      if (!surface) return;
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!surface || !enabled.matches) return;
        const bounds = surface.getBoundingClientRect();
        surface.style.setProperty(
          "--light-x",
          `${Math.max(0, Math.min(bounds.width, x - bounds.left))}px`,
        );
        surface.style.setProperty(
          "--light-y",
          `${Math.max(0, Math.min(bounds.height, y - bounds.top))}px`,
        );
        surface.style.setProperty("--light-active", "1");
      });
    };
    node.addEventListener("pointermove", move, { passive: true });
    node.addEventListener("pointerleave", reset);
    enabled.addEventListener("change", reset);
    return () => {
      reset();
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", reset);
      enabled.removeEventListener("change", reset);
    };
  }, [root]);
}
