"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  cn,
} from "@kmodern/ui";

export { DeviceUploadButton, type DeviceUploadButtonProps } from "./device-upload-button";

interface MediaItem {
  url: string;
  key: string;
}

type LoadState = "idle" | "loading" | "ready" | "error";

/**
 * Accessible media picker button with direct device upload and drag-and-drop support.
 * Displays existing media items fetched from /api/admin/media, supports direct uploads
 * to /api/admin/media/upload, and provides a prominent dropzone when the library is empty.
 */
export function MediaPickerButton({
  label = "انتخاب از رسانه",
  onPick,
  className,
}: {
  label?: string;
  onPick: (url: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const loadMedia = async (signal?: AbortSignal) => {
    setState("loading");
    try {
      const response = await fetch("/api/admin/media", { signal, cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "بارگذاری رسانه ناموفق بود");
      setItems(Array.isArray(body.items) ? body.items : []);
      setState("ready");
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState("error");
    }
  };

  useEffect(() => {
    if (!open) {
      setUploadError(null);
      setIsDragging(false);
      dragCounter.current = 0;
      setFilterQuery("");
      return;
    }

    const controller = new AbortController();
    void loadMedia(controller.signal);
    return () => controller.abort();
  }, [open]);

  const retry = () => {
    setState("idle");
    void loadMedia();
  };

  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    try {
      const fd = new FormData();
      fd.set("file", file);

      const response = await fetch("/api/admin/media/upload", {
        method: "POST",
        body: fd,
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "بارگذاری فایل ناموفق بود");
      }

      if (!body.url) {
        throw new Error("آدرس فایل در پاسخ دریافت نشد");
      }

      onPick(body.url);
      setOpen(false);
      void loadMedia();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "بارگذاری فایل ناموفق بود");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleUpload(file);
    }
  };

  const filteredItems = filterQuery
    ? items.filter((it) => it.key.toLowerCase().includes(filterQuery.toLowerCase()))
    : items;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "form-control-compact text-ink transition hover:border-slate-line whitespace-nowrap",
            className
          )}
        >
          {label}
        </button>
      </DialogTrigger>
      <DialogContent
        className="relative max-h-[85vh] max-w-2xl overflow-y-auto"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Hidden native file input for direct device upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />

        {/* Drag-and-drop visual overlay */}
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-flame-500 bg-white/95 p-6 text-center shadow-lg">
            <div className="mb-2 text-3xl">📥</div>
            <p className="text-sm font-semibold text-ink">تصویر را اینجا رها کنید</p>
            <p className="mt-1 text-xs text-ash">فایل به صورت مستقیم بارگذاری و در فرم انتخاب خواهد شد</p>
          </div>
        )}

        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-plaster pb-3">
            <div>
              <DialogTitle>انتخاب فایل رسانه</DialogTitle>
              <DialogDescription>یک فایل را انتخاب کنید یا تصویر جدیدی از دستگاه خود بارگذاری نمایید.</DialogDescription>
            </div>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="form-control-compact flex items-center gap-1.5 border-flame-500 bg-flame-50 text-flame-700 hover:bg-flame-100 font-medium"
            >
              {uploading ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-flame-600 border-t-transparent" />
                  <span>در حال بارگذاری فایل…</span>
                </>
              ) : (
                <>
                  <span aria-hidden="true">📤</span>
                  <span>بارگذاری از دستگاه</span>
                </>
              )}
            </button>
          </div>
        </DialogHeader>

        {uploadError && (
          <div role="alert" className="mt-3 rounded-card border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {uploadError}
          </div>
        )}

        {uploading && (
          <div role="status" aria-live="polite" className="mt-3 flex items-center justify-center gap-2 rounded-card bg-flame-50 p-3 text-xs font-medium text-flame-700">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-flame-600 border-t-transparent" />
            <span>در حال بارگذاری فایل…</span>
          </div>
        )}

        {state === "loading" || state === "idle" ? (
          <p className="py-10 text-center text-sm text-ash">در حال بارگذاری…</p>
        ) : state === "error" ? (
          <div className="py-8 text-center" role="alert">
            <p className="mb-3 text-sm text-red-700">بارگذاری فهرست رسانه ناموفق بود.</p>
            <button type="button" onClick={retry} className="form-control-compact">
              تلاش دوباره
            </button>
          </div>
        ) : items.length === 0 ? (
          /* Prominent dropzone / upload button when no files are present */
          <div className="my-6 flex flex-col items-center justify-center rounded-card border-2 border-dashed border-fog p-8 text-center transition hover:border-flame-400">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-flame-50 text-flame-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-ink">فایلی در کتابخانه رسانه موجود نیست</p>
            <p className="mt-1 max-w-sm text-xs text-ash">
              تصویر مورد نظر خود را بکشید و در این بخش رها کنید، یا با دکمه زیر مستقیماً از حافظه دستگاه بارگذاری نمایید.
            </p>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 form-control-compact flex items-center gap-1.5 border-flame-600 bg-flame-600 text-white hover:bg-flame-700 font-medium"
            >
              {uploading ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>در حال بارگذاری فایل…</span>
                </>
              ) : (
                <>
                  <span aria-hidden="true">📤</span>
                  <span>بارگذاری از دستگاه</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {items.length > 6 && (
              <input
                type="search"
                placeholder="جستجو در نام فایل‌ها…"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="w-full rounded-card border border-fog px-3 py-1.5 text-xs text-ink placeholder:text-ash focus:border-flame-500 focus:outline-none"
              />
            )}
            {filteredItems.length === 0 ? (
              <p className="py-8 text-center text-xs text-ash">موردی با این عبارت یافت نشد.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {filteredItems.map((item) => {
                  const isImage = /\.(jpe?g|png|webp|gif|svg|avif)$/i.test(item.url);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        onPick(item.url);
                        setOpen(false);
                      }}
                      title={item.url}
                      aria-label={`انتخاب ${item.key}`}
                      className="group overflow-hidden rounded-card border border-plaster transition hover:border-flame-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame-300"
                    >
                      {isImage ? (
                        <span className="relative block aspect-square bg-plaster">
                          <Image src={item.url} alt="" fill sizes="140px" className="object-contain p-1" unoptimized />
                        </span>
                      ) : (
                        <span className="flex aspect-square items-center justify-center bg-plaster text-xs text-ash">{item.key.split(".").pop()}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
