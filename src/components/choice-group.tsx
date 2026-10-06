import type { KeyboardEvent } from "react";

type Choice = { value: string; label: string; accessibleLabel?: string; disabled?: boolean };

/** A small mutually exclusive set, with one tab stop and arrow-key navigation. */
export function ChoiceGroup({
  label,
  value,
  choices,
  onChange,
  disabled = false,
  className = "",
}: {
  label: string;
  value: string;
  choices: Choice[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      disabled ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
    )
      return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index +
              (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) +
              buttons.length) %
            buttons.length;
    buttons[next]?.focus();
    buttons[next]?.click();
  };
  return (
    <div
      className={`segmented choice-group ${className}`}
      role="group"
      aria-label={label}
      onKeyDown={navigate}
    >
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          aria-label={choice.accessibleLabel ?? choice.label}
          aria-pressed={value === choice.value}
          tabIndex={value === choice.value ? 0 : -1}
          disabled={disabled || choice.disabled}
          onClick={() => onChange(choice.value)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
