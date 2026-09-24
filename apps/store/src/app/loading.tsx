export default function Loading() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10" aria-label="در حال بارگذاری" role="status">
      <div className="h-10 w-52 animate-pulse rounded-card bg-plaster" />
      <div className="mt-4 h-4 w-80 max-w-full animate-pulse rounded bg-plaster" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="aspect-[0.82] animate-pulse rounded-card bg-plaster" />)}
      </div>
    </div>
  );
}
