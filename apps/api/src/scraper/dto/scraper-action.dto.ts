// What the gateway accepts when an operator does something to a scrape that changes no row.
//
// Starting a scrape, cancelling one, and applying a manufacturer's price list to the review snapshot
// are three actions with nothing to write and something to remember. The panel wrote each of those
// audit lines itself, inline, after the fact, inside a `try/catch` whose whole purpose was to make
// sure a failure could not reach the operator — which is to say that the trail could be silently
// incomplete and the operator would be told the work was done.
//
// The action is therefore a closed set rather than a free string. A route that accepted any action
// name would be a route that writes whatever it is told, and the only thing standing between that and
// an audit trail full of invented history would be that nobody thought of it. Three names, chosen
// here, is a list somebody has to update deliberately.

import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, Length } from "class-validator";

/** The scraper actions the panel may record, and no others. */
export const SCRAPER_ACTIONS = [
  "SCRAPER_STARTED",
  "SCRAPER_CANCEL_REQUESTED",
  "SCRAPER_PRICE_LIST_APPLIED",
] as const;

export type ScraperAction = (typeof SCRAPER_ACTIONS)[number];

export class RecordScraperActionDto {
  @IsIn(SCRAPER_ACTIONS, { message: "این رویداد اسکرپر شناخته نشده است." })
  action!: ScraperAction;

  /** The job or report the action concerned, when there is one. */
  @IsOptional()
  @IsString({ message: "شناسه باید متن باشد." })
  @IsNotEmpty({ message: "شناسه نمی‌تواند خالی باشد." })
  @Length(1, 64, { message: "شناسه بیش از حد طولانی است." })
  entityId?: string;

  /**
   * What the action did, in the caller's own words.
   *
   * Unvalidated by design, and the reason is that this is a *report* rather than an instruction: the
   * gateway stores what happened and does not act on it. The fields a shopper or an operator's
   * decisions depend on are typed, checked, and owned by the feature that made the change.
   */
  @IsOptional()
  @IsObject({ message: "جزئیات رویداد باید شیء باشد." })
  meta?: Record<string, unknown>;
}
