import Link from "next/link";
import { PageBuilder } from "@/content/components/page-builder";

export default function NewPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/pages" className="text-sm text-ash hover:underline">صفحات</Link>
        <h1 className="text-xl font-bold text-ink">صفحه جدید</h1>
      </div>
      <PageBuilder page={{ title: "", slug: "", kind: "CUSTOM", status: "DRAFT", blocks: [], seo: {} }} />
    </div>
  );
}