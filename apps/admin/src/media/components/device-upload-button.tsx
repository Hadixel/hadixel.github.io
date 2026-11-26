"use client";

import { useRef, useState } from "react";
import { cn } from "@kmodern/ui";

export interface DeviceUploadButtonProps {
  onUpload: (url: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
  accept?: string;
  onError?: (error: string) => void;
}

/**
 * Direct device upload button.
 * Triggers a native file picker without opening the media modal,
 * uploads to /api/admin/media/upload, and calls onUpload with the resulting URL.
 */
export function DeviceUploadButton({
  onUpload,
  label = "بارگذاری از دستگاه",
  className,
  disabled,
  accept = "image/*",
  onError,
}: DeviceUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.set("file", file);

      const response = await fetch("/api/admin/media/upload", {
        method: "POST",
        body: fd,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "بارگذاری فایل ناموفق بود");
      }

      if (!data.url) {
        throw new Error("آدرس فایل در پاسخ دریافت نشد");
      }

      onUpload(data.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "بارگذاری فایل ناموفق بود";
      setError(message);
      onError?.(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="inline-flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileChange}
      />
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => fileInputRef.current?.click()}
        aria-busy={uploading}
        className={cn(
          "form-control-compact inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-ink transition hover:border-slate-line disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        {uploading ? (
          <>
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-flame-600 border-t-transparent" />
            <span>در حال بارگذاری فایل…</span>
          </>
        ) : (
          <>
            <span aria-hidden="true">📤</span>
            <span>{label}</span>
          </>
        )}
      </button>
      {error && (
        <span role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
