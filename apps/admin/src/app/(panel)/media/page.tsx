import { toFaDigits } from "@kmodern/contracts";
import { readThrough } from "@/lib/reads";
import { Card, CardHeader } from "@kmodern/ui";
import { MediaUpload } from "@/media/components/media-upload";
import { MediaLibrary } from "@/media/components/media-library";

interface MediaItem {
  url: string;
  key: string;
}

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  // The gateway's walk, not a local one. The panel used to list the media directory itself and filter it
  // by its own copy of the key rule, so the picker could offer a key the gateway would then refuse to
  // delete — and on a deployment with a local root in a different directory from the panel's, the panel
  // listed a tree the storefront never served.
  const { items } = await readThrough<{ items: MediaItem[] }>("/media");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">مدیا</h2>
            <p className="mt-0.5 text-sm text-ash">{`${toFaDigits(items.length)} فایل`}</p>
          </div>
          <div className="shrink-0"><MediaUpload /></div>
        </CardHeader>
      </Card>
      <MediaLibrary items={items} />
    </div>
  );
}
