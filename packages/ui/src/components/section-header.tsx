import { cn } from "../cn";

/* Section header: the title, then the flame dot between two hairlines, then the
   supporting line. Centring is the default — a section reads as an anchor, not
   as a column of left-aligned text. "see all" stays a quiet text
   affordance — the top nav already carries the primary all-products link, so a
   filled button here would compete with it. Air below does the separating; a
   hairline rule under every title read as a spreadsheet border on a storefront. */
export function SectionHeader({
  title,
  seeAllHref,
  description,
  align = "center",
  className,
}: {
  title: string;
  seeAllHref?: string;
  description?: string;
  align?: "start" | "center";
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap gap-x-6 gap-y-3 sm:mb-6 md:mb-9",
        centered ? "flex-col items-center text-center" : "items-end justify-between",
        className,
      )}
    >
      <div className={cn("min-w-0", centered && "flex flex-col items-center")}>
        {/* Hierarchy comes from size/weight/leading only: Persian is cursive, so
            letter-spacing would pull the joins apart instead of tightening. */}
        <h2 className="text-balance font-display text-2xl font-extrabold leading-tight text-ink sm:text-3xl">
          {title}
        </h2>
        <span aria-hidden className="mt-2 flex items-center gap-2 md:mt-3">
          <span className="h-px w-10 bg-fog" />
          <span className="size-1.5 rounded-pill bg-flame-700" />
          <span className="h-px w-10 bg-fog" />
        </span>
        {description && (
          <p className={cn("mt-2 max-w-2xl text-sm leading-7 text-ash md:mt-3 hidden sm:block", centered && "mx-auto")}>{description}</p>
        )}
        {centered && seeAllHref && (
          <div className="order-first mb-1 self-end sm:hidden">
            <SeeAll href={seeAllHref} />
          </div>
        )}
        {centered && seeAllHref && (
          <div className="mt-3 hidden sm:block md:mt-4">
            <SeeAll href={seeAllHref} />
          </div>
        )}
      </div>
      {!centered && seeAllHref && <SeeAll href={seeAllHref} />}
    </div>
  );
}

function SeeAll({ href, className }: { href: string; className?: string }) {
  return (
    <a href={href} className={cn("group inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ink", className)}>
      <span className="relative">
        مشاهده همه
        <span
          aria-hidden
          className="absolute inset-x-0 -bottom-1 h-px bg-fog transition-colors duration-200 group-hover:bg-flame-700 motion-reduce:transition-none"
        />
      </span>
      {/* Fixed leftward arrow: "forward" in RTL, not a mirrored glyph. */}
      <svg
        aria-hidden
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-transform duration-200 group-hover:-translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
      >
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
    </a>
  );
}
