import { cn } from "./utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-gray-800", className)}
    />
  );
}
