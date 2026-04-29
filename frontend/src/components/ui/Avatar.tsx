import * as RadixAvatar from "@radix-ui/react-avatar";
import { cn } from "../../lib/cn";

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = { sm: "size-7 text-xs", md: "size-9 text-sm", lg: "size-12 text-base" };
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <RadixAvatar.Root
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white font-semibold ring-2 ring-white shadow-sm",
        sizes[size],
        className
      )}
    >
      {src && <RadixAvatar.Image src={src} alt={name} className="size-full rounded-full object-cover" />}
      <RadixAvatar.Fallback>{initials || "?"}</RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}
