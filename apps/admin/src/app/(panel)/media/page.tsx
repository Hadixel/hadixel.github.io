import { faDigits } from "@/lib/date";
import { readThrough } from "@/lib/reads";
import { Card, CardHeader } from "@/components/ui";
import { MediaUpload } from "./media-upload";
import { MediaLibrary } from "./media-library";

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
        <CardHeader
          title="مدیا"
          subtitle={`${faDigits(items.length)} فایل`}
          actions={<MediaUpload />}
        />
      </Card>
      <MediaLibrary items={items} />
    </div>
  );
}
