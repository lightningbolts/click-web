"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { cloneElement, isValidElement, type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export const menuContentClassName =
  "ds-anim-popover z-[90] min-w-[200px] max-w-[320px] rounded-md bg-bg-elevated p-1.5 text-fg shadow-overlay outline-none";

const itemCls =
  "type-body flex h-9 cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 outline-none data-[highlighted]:bg-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-40";

/** Radix dropdown menu with Quiet Presence styling (spec §5.4). */
export const Menu = Dropdown.Root;
export const MenuTrigger = Dropdown.Trigger;
export const MenuGroup = Dropdown.Group;
export const MenuSub = Dropdown.Sub;

export function MenuContent({
  className,
  align = "end",
  sideOffset = 6,
  ...rest
}: ComponentPropsWithoutRef<typeof Dropdown.Content>) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(menuContentClassName, className)}
        {...rest}
      />
    </Dropdown.Portal>
  );
}

export function MenuItem({
  icon: Icon,
  destructive,
  trailing,
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<typeof Dropdown.Item> & {
  icon?: LucideIcon;
  destructive?: boolean;
  trailing?: ReactNode;
}) {
  const decorate = (label: ReactNode) => (
    <>
      {Icon ? (
        <Icon
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className={destructive ? "" : "text-fg-secondary"}
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing ? (
        <span className="type-meta text-fg-tertiary">{trailing}</span>
      ) : null}
    </>
  );
  // With `asChild` Radix slots onto exactly one element, so the icon and label go inside it.
  const content =
    rest.asChild && isValidElement<{ children?: ReactNode }>(children)
      ? cloneElement(children as ReactElement<{ children?: ReactNode }>, undefined, decorate(children.props.children))
      : decorate(children);
  return (
    <Dropdown.Item
      className={cn(itemCls, destructive && "text-destructive", className)}
      {...rest}
    >
      {content}
    </Dropdown.Item>
  );
}

export function MenuRadioGroup(
  props: ComponentPropsWithoutRef<typeof Dropdown.RadioGroup>,
) {
  return <Dropdown.RadioGroup {...props} />;
}

export function MenuRadioItem({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<typeof Dropdown.RadioItem>) {
  return (
    <Dropdown.RadioItem className={cn(itemCls, className)} {...rest}>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <Dropdown.ItemIndicator>
        <Check
          size={16}
          strokeWidth={2.25}
          aria-hidden
          className="text-accent"
        />
      </Dropdown.ItemIndicator>
    </Dropdown.RadioItem>
  );
}

export function MenuSubTrigger({
  icon: Icon,
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<typeof Dropdown.SubTrigger> & {
  icon?: LucideIcon;
}) {
  return (
    <Dropdown.SubTrigger
      className={cn(itemCls, "data-[state=open]:bg-hover", className)}
      {...rest}
    >
      {Icon ? (
        <Icon
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className="text-fg-secondary"
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span aria-hidden className="text-fg-tertiary">
        ›
      </span>
    </Dropdown.SubTrigger>
  );
}

export function MenuSubContent({
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof Dropdown.SubContent>) {
  return (
    <Dropdown.Portal>
      <Dropdown.SubContent
        sideOffset={6}
        className={cn(menuContentClassName, className)}
        {...rest}
      />
    </Dropdown.Portal>
  );
}

export function MenuLabel({
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof Dropdown.Label>) {
  return (
    <Dropdown.Label className={cn("px-2.5 py-1.5", className)} {...rest} />
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return (
    <Dropdown.Separator
      className={cn("mx-1 my-1.5 h-px bg-hairline", className)}
    />
  );
}
