import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-card text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Flame blue — the single spark, activation moments only
        primary: "bg-flame-700 text-white hover:bg-flame-800",
        // Ink — solid action without chroma
        ink: "bg-ink text-white hover:bg-charcoal",
        // Hairline outline on canvas
        outline: "border border-plaster bg-canvas text-ink hover:bg-plaster",
        // Quiet tertiary
        ghost: "text-ash hover:bg-plaster hover:text-ink",
        // Destructive (admin)
        destructive: "bg-red-700 text-white hover:bg-red-800",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-5",
        lg: "h-12 px-8",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
