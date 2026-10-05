/** A link to one of the run's output files, served by the panel's own download view. */
export function DownloadLink({ filename, label, description }: { filename: string; label: string; description: string }) {
  return (
    <a
      href={`/api/admin/scraper?download=${encodeURIComponent(filename)}`}
      className="form-control-link"
    >
      <span className="block font-medium">{label}</span>
      <span className="mt-0.5 block text-xs text-ash">{description}</span>
      <span className="mt-1 block text-micro text-ash" dir="ltr">{filename}</span>
    </a>
  );
}
