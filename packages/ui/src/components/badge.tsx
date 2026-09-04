import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../cn";

/* Status badges: identical pill anatomy, fill-only differentiation
   (Showcase rule — never differentiate by shape). 30px pill radius. */
const badgeVariants = cva(
  "inline-flex items-center rounded-[30px] px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        // Activation — the spark
        flame: "bg-flame-700 text-white",
        // Soft sibling of the spark
        pale: "bg-flame-100 text-ink",
        // De-emphasized / sold-out
        slate: "bg-slate-line text-white",
        // Monochrome on plaster
        ink: "bg-ink text-white",
        outline: "border border-fog bg-canvas text-ash",
      },
    },
    defaultVariants: { variant: "slate" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
