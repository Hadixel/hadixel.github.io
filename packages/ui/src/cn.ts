import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge, validators } from "tailwind-merge";

const { isArbitraryLength, isArbitraryValue, isArbitraryVariable } = validators;

/* `rounded-pill` and `text-micro` are tokens declared in `tailwind.css`'s
   `@theme`, not values tailwind-merge ships with. Left to its defaults the
   merger files them under a catch-all group: `rounded-pill` never conflicts
   with `rounded-card`, and `text-micro` reads as a colour, so it drops any
   `text-<colour>` beside it. Teaching the merger the two scales is what keeps
   `cn`'s override promise true for the tokens the design system declares —
   without it a `className` override silently loses. */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["pill"],
      text: ["micro"],
    },
    classGroups: {
      rounded: [{ rounded: ["card", "pill", isArbitraryVariable, isArbitraryValue] }],
      "font-size": [
        {
          text: [
            "micro",
            "xs",
            "sm",
            "base",
            "lg",
            "xl",
            "2xl",
            "3xl",
            "4xl",
            "5xl",
            "6xl",
            "7xl",
            "8xl",
            "9xl",
          ],
        },
        { text: [isArbitraryLength, isArbitraryVariable, isArbitraryValue] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}