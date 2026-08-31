import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

export function FcCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("fc-card", className)} {...props}>
      {children}
    </div>
  );
}

type FcButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function FcButton({
  className,
  variant = "primary",
  type = "button",
  children,
  ...props
}: FcButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 px-4 py-2.5 disabled:opacity-40",
        variant === "primary" ? "fc-btn-primary" : "fc-btn-secondary",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function FcChip({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("fc-chip", className)} {...props}>
      {children}
    </span>
  );
}

export const FcInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function FcInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn("fc-input min-h-11 w-full px-3 py-2.5", className)}
        {...props}
      />
    );
  },
);

export function FcTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn("fc-input fc-textarea w-full px-3 py-2.5", className)}
      {...props}
    />
  );
}

export function FcField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex w-full min-w-0 flex-col gap-1.5", className)}>
      <span className="text-sm font-semibold text-on-surface">{label}</span>
      {children}
    </label>
  );
}

export function FcPageShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-h-screen bg-background text-on-surface", className)}>
      {children}
    </div>
  );
}

export function FcSectionHeader({
  title,
  subtitle,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6", className)}>
      <h2 className="text-2xl md:text-[32px] font-bold leading-tight tracking-tight text-on-surface">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-2 text-base font-medium text-on-surface-variant">{subtitle}</p>
      ) : null}
    </div>
  );
}
