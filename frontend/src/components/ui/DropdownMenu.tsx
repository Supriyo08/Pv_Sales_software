import * as Radix from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "../../lib/cn";

export const DropdownMenu = Radix.Root;
export const DropdownMenuTrigger = Radix.Trigger;
export const DropdownMenuGroup = Radix.Group;

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof Radix.Content>,
  ComponentPropsWithoutRef<typeof Radix.Content>
>(({ className, sideOffset = 6, ...rest }, ref) => (
  <Radix.Portal>
    <Radix.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-44 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg shadow-slate-200/60",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className
      )}
      {...rest}
    />
  </Radix.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof Radix.Item>,
  ComponentPropsWithoutRef<typeof Radix.Item> & { inset?: boolean }
>(({ className, inset, ...rest }, ref) => (
  <Radix.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-slate-700 outline-none transition",
      "focus:bg-slate-100 focus:text-slate-900",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      inset && "pl-8",
      className
    )}
    {...rest}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof Radix.Label>,
  ComponentPropsWithoutRef<typeof Radix.Label>
>(({ className, ...rest }, ref) => (
  <Radix.Label
    ref={ref}
    className={cn("px-2.5 py-1.5 text-xs font-medium text-slate-500", className)}
    {...rest}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof Radix.Separator>,
  ComponentPropsWithoutRef<typeof Radix.Separator>
>(({ className, ...rest }, ref) => (
  <Radix.Separator ref={ref} className={cn("my-1 h-px bg-slate-100", className)} {...rest} />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export { Check, ChevronRight };
