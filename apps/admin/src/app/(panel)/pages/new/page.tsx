import { PageBuilder } from "@/components/page-builder";

export default function NewPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center gap-3">
        <a href="/pages" className="text-sm text-slate-500 hover:underline">صفحات</a>
        <h1 className="text-xl font-bold text-slate-900">صفحه جدید</h1>
      </div>
      <PageBuilder page={{ title: "", slug: "", kind: "CUSTOM", status: "DRAFT", blocks: [], seo: {} }} />
    </div>
  );
}