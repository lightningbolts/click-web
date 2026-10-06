import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type Props = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  type?: "checkbox" | "radio";
};

/** Native 20 px checkbox / radio tinted with `--action` (spec §5.2). */
export const Checkbox = forwardRef<HTMLInputElement, Props>(function Checkbox(
  { className, type = "checkbox", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "size-5 shrink-0 cursor-pointer accent-[var(--action)] disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...rest}
    />
  );
});
