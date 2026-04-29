import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm focus-visible:ring-brand-500",
        secondary:
          "bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-700 shadow-sm focus-visible:ring-slate-500",
        outline:
          "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 active:bg-slate-100 focus-visible:ring-slate-300",
        ghost: "text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-300",
        danger:
          "bg-red-600 text-white hover:bg-red-700 shadow-sm focus-visible:ring-red-500",
        link: "text-brand-600 hover:text-brand-700 underline-offset-2 hover:underline px-0",
      },
      size: {
        sm: "h-8 px-3 text-sm rounded-md gap-1.5",
        md: "h-10 px-4 text-sm rounded-lg",
        lg: "h-11 px-5 text-base rounded-lg",
        icon: "size-10 rounded-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    icon?: ReactNode;
    asChild?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant, size, loading, icon, asChild, disabled, className, children, ...rest }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size }), className)}
        {...rest}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
        <Slottable>{children}</Slottable>
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
