export default function PanelLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-ash" role="status" aria-live="polite">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-fog border-t-flame-700 motion-reduce:animate-none" aria-hidden="true" />
      در حال بارگذاری…
    </div>
  );
}
