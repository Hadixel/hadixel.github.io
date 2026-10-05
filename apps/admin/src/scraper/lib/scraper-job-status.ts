import type { ScraperJobStatus } from "@/scraper/lib/scraper-types";

/**
 * The one definition of "this job is still in flight". `running` and `cancelling` are the only two
 * statuses a run can be cancelled from, so both mean the same thing to every caller: the process
 * still holds the job, and the panel must keep polling it.
 *
 * It lives here, in a module that imports nothing but a type, because both sides of the panel's
 * own route boundary need it and only one of them may import `scraper-jobs` — that module reads
 * and writes the output directory through `node:fs`, so a client bundle that reached for it would
 * carry the whole job manager with it. The manager imports this instead; the panel's hook imports
 * this instead; neither re-derives the pair.
 */
export function isJobStatusActive(status: ScraperJobStatus | null | undefined): boolean {
  return status === "running" || status === "cancelling";
}
