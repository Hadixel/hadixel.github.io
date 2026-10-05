"use client";

import { useId, type ReactNode } from "react";
import { toFaDigits } from "@kmodern/contracts";

/**
 * One stage of the scraper flow, as a real `<section>` rather than a `<div>` in a stack.
 *
 * The page used to be a single `space-y-6` div holding six cards, which reads as one long screen:
 * the operator could see «تنظیمات اجرا» and «نتایج محصولات» at the same time with nothing saying
 * that the first is an instruction and the second is the result of obeying it. The three stages
 * are numbered because their order is the page's actual argument — set the run up, watch it come
 * in, then review what it produced and decide what enters the shop — and an operator who lands
 * mid-page can tell which stage they are looking at.
 *
 * The heading is `h2` and the cards inside are `h3`, which is why every card's own heading was
 * demoted from `h2`: a heading level that skips is a heading level that says nothing. The section
 * is labelled by that heading through `aria-labelledby`, so a screen reader can list the stages
 * without reading the cards.
 */
export function PanelSection({
  step,
  title,
  description,
  children,
}: {
  /** 1-based position in the flow. Omit for a section that is not a stage. */
  step?: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div>
        <h2 id={headingId} className="text-lg font-bold text-ink">
          {step === undefined ? null : (
            <>
              <span className="text-sm font-semibold text-flame-600">{toFaDigits(step)}.</span>{" "}
            </>
          )}
          {title}
        </h2>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-ash">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}