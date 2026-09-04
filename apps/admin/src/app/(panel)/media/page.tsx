import { faDigits } from "@/lib/date";
import { listMedia } from "@/lib/media";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { MediaLibrary } from "./media-library";

export default async function MediaPage() {
  const items = await listMedia();
  const totalBytes = 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="مدیا"
          subtitle={`${faDigits(items.length)} فایل`}
          actions={
            <form action="/api/admin/media/upload" method="post" encType="multipart/form-data" className="flex items-center gap-2">
              <input type="file" name="file" className="text-sm text-ash" />
              <button type="submit" className="rounded-card bg-ink px-4 py-2 text-sm text-white hover:bg-graphite">آپلود</button>
            </form>
          }
        />
      </Card>
      <MediaLibrary items={items} />
    </div>
  );
}