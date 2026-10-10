import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LearningAssistant } from "@/components/learning-assistant";
import type { LearningContext } from "@/lib/learning-context";

const key = "lumalab.assistant-position.v1";
const context: LearningContext = {
  mode: "studio",
  status: "ready",
  selected: null,
  sequence: [],
  resultSequence: [],
  resultOperation: null,
  noise: null,
  measurements: {},
};
beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(170);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains("assistant-chat") ? 400 : 50;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const widget = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".assistant-widget")!;

it("keeps opening separate from keyboard movement, saves placement, and restores it on remount", () => {
  const first = render(<LearningAssistant context={context} />);
  const before = Number.parseFloat(widget(first.container).style.left);
  fireEvent.keyDown(screen.getByRole("button", { name: "Move LUMA AI" }), { key: "ArrowLeft" });
  expect(Number.parseFloat(widget(first.container).style.left)).toBeCloseTo(before - 20);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ y: 1 });
  const chosen = widget(first.container).style.left;
  first.unmount();
  const second = render(<LearningAssistant context={context} />);
  expect(widget(second.container).style.left).toBe(chosen);
  fireEvent.click(screen.getByRole("button", { name: "Open LUMA AI" }));
  expect(screen.getByRole("dialog", { name: "LUMA AI" })).toBeInTheDocument();
});

it("clamps keyboard movement at both viewport edges and keeps the panel on screen", () => {
  const { container } = render(<LearningAssistant context={context} />);
  const handle = screen.getByRole("button", { name: "Move LUMA AI" });
  for (let i = 0; i < 30; i++) {
    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    fireEvent.keyDown(handle, { key: "ArrowUp", shiftKey: true });
  }
  expect(widget(container).style.left).toBe("12px");
  expect(widget(container).style.top).toBe("12px");
  fireEvent.click(screen.getByRole("button", { name: "Open LUMA AI" }));
  const panel = screen.getByRole("dialog");
  expect(Number.parseFloat(panel.style.top)).toBeGreaterThan(62);
  expect(
    Number.parseFloat(panel.style.top) + Number.parseFloat(panel.style.maxHeight),
  ).toBeLessThanOrEqual(innerHeight);
  fireEvent.keyDown(panel, { key: "Escape" });
  expect(screen.getByRole("button", { name: "Open LUMA AI" })).toHaveFocus();
});

it("resets the position and removes the saved preference", () => {
  const { container } = render(<LearningAssistant context={context} />);
  const original = widget(container).style.left;
  fireEvent.keyDown(screen.getByRole("button", { name: "Move LUMA AI" }), { key: "ArrowLeft" });
  fireEvent.click(screen.getByRole("button", { name: "Open LUMA AI" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset position" }));
  expect(widget(container).style.left).toBe(original);
  expect(localStorage.getItem(key)).toBeNull();
});

it("rejects invalid saved coordinates and keeps movement and reset usable when storage is blocked", () => {
  localStorage.setItem(key, JSON.stringify({ x: 4, y: -1 }));
  const { container } = render(<LearningAssistant context={context} />);
  const original = Number.parseFloat(widget(container).style.left);
  expect(original).toBe(innerWidth - 170 - 12);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  fireEvent.keyDown(screen.getByRole("button", { name: "Move LUMA AI" }), { key: "ArrowLeft" });
  expect(Number.parseFloat(widget(container).style.left)).toBeCloseTo(original - 20);
  fireEvent.click(screen.getByRole("button", { name: "Open LUMA AI" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset position" }));
  expect(Number.parseFloat(widget(container).style.left)).toBe(original);
});

it("shares the chosen position between mounted workspace assistants", () => {
  const { container } = render(
    <>
      <LearningAssistant context={context} />
      <LearningAssistant context={{ ...context, mode: "noise" }} />
    </>,
  );
  fireEvent.keyDown(screen.getAllByRole("button", { name: "Move LUMA AI" })[0]!, {
    key: "ArrowLeft",
  });
  const widgets = container.querySelectorAll<HTMLElement>(".assistant-widget");
  expect(widgets[0]!.style.left).toBe(widgets[1]!.style.left);
});

it("places the launcher clear of a workspace action without reserving footer space", () => {
  const action = { left: 800, top: 700, right: 1000, bottom: 756 };
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (
    this: HTMLElement,
  ) {
    return (this.hasAttribute("data-workspace-action") ? [action] : []) as unknown as DOMRectList;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(action as DOMRect);
  const { container } = render(
    <main className="studio-shell">
      <button data-workspace-action>Run sequence</button>
      <LearningAssistant context={context} />
    </main>,
  );
  const launcher = widget(container);
  const x = Number.parseFloat(launcher.style.left),
    y = Number.parseFloat(launcher.style.top);
  expect(
    x + 170 <= action.left || x >= action.right || y + 50 <= action.top || y >= action.bottom,
  ).toBe(true);
});
