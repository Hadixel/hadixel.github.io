/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MediaPickerButton } from "./media-picker-button";
import { DeviceUploadButton } from "./device-upload-button";
import { ImageUploadInput } from "./image-upload-input";

describe("MediaPickerButton", () => {
  it("renders trigger button with default label", () => {
    const onPick = vi.fn();
    const html = renderToStaticMarkup(createElement(MediaPickerButton, { onPick }));
    expect(html).toContain("انتخاب از رسانه");
  });

  it("renders trigger button with custom label", () => {
    const onPick = vi.fn();
    const html = renderToStaticMarkup(createElement(MediaPickerButton, { onPick, label: "انتخاب کاور" }));
    expect(html).toContain("انتخاب کاور");
  });
});

describe("DeviceUploadButton", () => {
  it("renders upload button with default label and hidden file input", () => {
    const onUpload = vi.fn();
    const html = renderToStaticMarkup(createElement(DeviceUploadButton, { onUpload }));
    expect(html).toContain("بارگذاری از دستگاه");
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/*"');
  });

  it("renders custom label when provided", () => {
    const onUpload = vi.fn();
    const html = renderToStaticMarkup(
      createElement(DeviceUploadButton, { onUpload, label: "آپلود مستقیم" })
    );
    expect(html).toContain("آپلود مستقیم");
  });
});

describe("ImageUploadInput", () => {
  it("renders text input and both upload / picker action buttons", () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      createElement(ImageUploadInput, {
        name: "coverImage",
        value: "https://example.com/cover.jpg",
        onChange,
      })
    );
    // Has the text input with value and name
    expect(html).toContain('name="coverImage"');
    expect(html).toContain('value="https://example.com/cover.jpg"');
    // Has "بارگذاری از دستگاه"
    expect(html).toContain("بارگذاری از دستگاه");
    // Has "انتخاب از رسانه"
    expect(html).toContain("انتخاب از رسانه");
    // Has clear button ✕
    expect(html).toContain("✕");
  });

  it("renders image preview thumbnail when valid image URL is present", () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      createElement(ImageUploadInput, {
        value: "https://example.com/photo.png",
        onChange,
      })
    );
    expect(html).toContain('alt="پیش‌نمایش تصویر"');
  });

  it("renders without preview thumbnail when value is empty", () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      createElement(ImageUploadInput, {
        value: "",
        onChange,
      })
    );
    expect(html).not.toContain('alt="پیش‌نمایش تصویر"');
    expect(html).not.toContain("✕");
  });
});
