import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse border-3 border-foreground", className)}
      {...props}
    />
  )
}

export { Skeleton }
