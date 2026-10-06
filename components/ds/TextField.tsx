"use client";

import {
  forwardRef,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { ChevronDown, CircleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

export const fieldClassName = cn(
  "block w-full min-w-0 rounded-md bg-surface-raised px-3.5 text-fg placeholder:text-fg-tertiary",
  "type-body outline-none transition-[background-color,box-shadow] duration-[var(--d-fast)]",
  "focus:bg-surface focus:shadow-[0_0_0_2px_var(--accent)] focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-40",
  "aria-[invalid=true]:shadow-[0_0_0_2px_var(--destructive)]",
);

type FieldChrome = {
  label?: ReactNode;
  /** Visually hide the label but keep it for AT. */
  hideLabel?: boolean;
  help?: ReactNode;
  error?: ReactNode;
  className?: string;
};

function useFieldIds(id?: string) {
  const auto = useId();
  const fieldId = id ?? auto;
  return { fieldId, helpId: `${fieldId}-help`, errorId: `${fieldId}-error` };
}

function Chrome({
  fieldId,
  helpId,
  errorId,
  label,
  hideLabel,
  help,
  error,
  className,
  children,
}: FieldChrome & {
  fieldId: string;
  helpId: string;
  errorId: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <label
          htmlFor={fieldId}
          className={
            hideLabel
              ? "sr-only"
              : "type-meta mb-1.5 block font-semibold text-fg-secondary"
          }
        >
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p
          id={errorId}
          className="type-meta mt-1.5 flex items-center gap-1 text-destructive"
        >
          <CircleAlert
            size={14}
            strokeWidth={2}
            aria-hidden
            className="shrink-0"
          />
          {error}
        </p>
      ) : help ? (
        <p id={helpId} className="type-meta mt-1.5 text-fg-tertiary">
          {help}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(
  props: { help?: ReactNode; error?: ReactNode },
  ids: { helpId: string; errorId: string },
  extra?: string,
) {
  return (
    [props.error ? ids.errorId : props.help ? ids.helpId : null, extra]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

type InputProps = Omit<ComponentPropsWithoutRef<"input">, "className"> &
  FieldChrome & { inputClassName?: string };

/** 44 px filled field, label above, help/error below (spec §5.5). */
export const TextField = forwardRef<HTMLInputElement, InputProps>(
  function TextField(
    { label, hideLabel, help, error, className, inputClassName, id, ...rest },
    ref,
  ) {
    const ids = useFieldIds(id);
    return (
      <Chrome
        {...ids}
        label={label}
        hideLabel={hideLabel}
        help={help}
        error={error}
        className={className}
      >
        <input
          ref={ref}
          id={ids.fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(
            { help, error },
            ids,
            rest["aria-describedby"],
          )}
          className={cn(fieldClassName, "h-11", inputClassName)}
          {...rest}
        />
      </Chrome>
    );
  },
);

type TextAreaProps = Omit<ComponentPropsWithoutRef<"textarea">, "className"> &
  FieldChrome & { inputClassName?: string; maxAutoHeight?: number };

/** Auto-growing textarea, 112 → 320 px (spec §5.5). */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea(
    {
      label,
      hideLabel,
      help,
      error,
      className,
      inputClassName,
      id,
      maxAutoHeight = 320,
      onInput,
      ...rest
    },
    forwarded,
  ) {
    const ids = useFieldIds(id);
    const local = useRef<HTMLTextAreaElement | null>(null);
    const grow = useCallback(() => {
      const el = local.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, maxAutoHeight)}px`;
    }, [maxAutoHeight]);
    useLayoutEffect(grow, [grow, rest.value]);
    return (
      <Chrome
        {...ids}
        label={label}
        hideLabel={hideLabel}
        help={help}
        error={error}
        className={className}
      >
        <textarea
          ref={(el) => {
            local.current = el;
            if (typeof forwarded === "function") forwarded(el);
            else if (forwarded) forwarded.current = el;
          }}
          id={ids.fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(
            { help, error },
            ids,
            rest["aria-describedby"],
          )}
          onInput={(e) => {
            grow();
            onInput?.(e);
          }}
          className={cn(
            fieldClassName,
            "min-h-28 resize-none py-3",
            inputClassName,
          )}
          {...rest}
        />
      </Chrome>
    );
  },
);

type SelectProps = Omit<ComponentPropsWithoutRef<"select">, "className"> &
  FieldChrome & { inputClassName?: string };

/** Native select styled as a field with a trailing chevron. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    {
      label,
      hideLabel,
      help,
      error,
      className,
      inputClassName,
      id,
      children,
      ...rest
    },
    ref,
  ) {
    const ids = useFieldIds(id);
    return (
      <Chrome
        {...ids}
        label={label}
        hideLabel={hideLabel}
        help={help}
        error={error}
        className={className}
      >
        <div className="relative">
          <select
            ref={ref}
            id={ids.fieldId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(
              { help, error },
              ids,
              rest["aria-describedby"],
            )}
            className={cn(
              fieldClassName,
              "h-11 appearance-none pr-10",
              inputClassName,
            )}
            {...rest}
          >
            {children}
          </select>
          <ChevronDown
            size={16}
            strokeWidth={2}
            aria-hidden
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-fg-tertiary"
          />
        </div>
      </Chrome>
    );
  },
);

/** Borderless Manrope title input for event / Place creation (spec §5.5). */
export const TitleInput = forwardRef<
  HTMLInputElement,
  Omit<ComponentPropsWithoutRef<"input">, "type">
>(function TitleInput({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      type="text"
      className={cn(
        "type-title-2 block w-full border-0 border-b border-transparent bg-transparent px-0 pb-1 text-fg outline-none placeholder:text-fg-tertiary",
        "focus:border-hairline focus-visible:outline-none",
        className,
      )}
      {...rest}
    />
  );
});
