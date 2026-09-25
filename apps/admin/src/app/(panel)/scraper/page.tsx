import { redirect } from "next/navigation";
import { SCRAPER_SOURCE_OPTIONS } from "@kmodern/scraper/source-options";
import { ScraperPanel } from "@/components/scraper-panel";
import { getAdminUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ScraperPage() {
  const ctx = await getAdminUser();
  if (!ctx) redirect("/login");

  if (ctx.admin.role !== "OWNER") {
    return (
      <div className="rounded-card border border-plaster bg-white p-6 text-sm leading-7 text-ink">
        <h1 className="text-lg font-bold">دسترسی محدود</h1>
        <p className="mt-2 text-ash">اجرای اسکرپر فقط برای نقش مالک فروشگاه فعال است.</p>
      </div>
    );
  }

  const sources = SCRAPER_SOURCE_OPTIONS;

  return <ScraperPanel sources={sources} />;
}
