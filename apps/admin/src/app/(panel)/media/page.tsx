import { faDigits } from "@/lib/date";
import { listMedia } from "@/lib/media";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { MediaUpload } from "./media-upload";
import { MediaLibrary } from "./media-library";

export default async function MediaPage() {
  const items = await listMedia();

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