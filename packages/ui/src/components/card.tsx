import * as React from "react";

import { cn } from "../cn";

/* Card: plaster plinth — separation by surface stepping, never shadows.
   Radius 10px (Showcase rule). */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-card bg-plaster text-ink", className)}
      {...props}
    />
  );
}

/* White card floating over imagery (hero buy-card) */
function CardFloating({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-xl bg-canvas text-ink shadow-[0_8px_24px_rgba(0,0,0,0.15)]", className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 p-5", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("text-lg font-bold text-ink", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center p-5 pt-0", className)} {...props} />;
}

export { Card, CardFloating, CardHeader, CardTitle, CardContent, CardFooter };
