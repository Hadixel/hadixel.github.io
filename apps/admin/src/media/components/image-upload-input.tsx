"use client";

import Image from "next/image";
import { useState } from "react";
import { Input, cn } from "@kmodern/ui";
import { DeviceUploadButton } from "./device-upload-button";
import { MediaPickerButton } from "./media-picker-button";

export interface ImageUploadInputProps {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  id?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  showPreview?: boolean;
}

/**
 * Composite image upload input with:
 * 1. Direct device upload button ("بارگذاری از دستگاه")
 * 2. Media picker modal button ("انتخاب از رسانه")
 * 3. Text URL input for manual entry or reading server action formData
 * 4. Thumbnail preview for instant visual confirmation
 */
export function ImageUploadInput({
  value,
  onChange,
  name,
  id,
  placeholder = "آدرس تصویر (URL)",
  required,
  disabled,
  className,
  inputClassName,
  showPreview = true,
}: ImageUploadInputProps) {
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const handleUploadSuccess = (url: string) => {
    onChange(url);
    setSuccessNotice("تصویر با موفقیت بارگذاری شد.");
    setTimeout(() => setSuccessNotice(null), 3000);
  };

  const isImage = value && /\.(jpe?g|png|webp|gif|svg|avif)($|\?)/i.test(value);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {showPreview && value ? (
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-card border border-plaster bg-plaster shadow-xs">
            {isImage ? (
              <Image
                src={value}
                alt="پیش‌نمایش تصویر"
                fill
                sizes="36px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-micro text-ash">
                فایل
              </span>
            )}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <Input
            id={id}
            name={name}
            value={value}
            dir="ltr"
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled}
            className={cn("w-full", inputClassName)}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DeviceUploadButton
            onUpload={handleUploadSuccess}
            disabled={disabled}
          />
          <MediaPickerButton
            onPick={handleUploadSuccess}
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={disabled}
              className="rounded p-1 text-xs text-ash transition hover:bg-plaster hover:text-red-600"
              title="پاک کردن مقدار"
              aria-label="پاک کردن مقدار"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {successNotice && (
        <p role="status" aria-live="polite" className="text-xs text-emerald-600">
          {successNotice}
        </p>
      )}
    </div>
  );
}
