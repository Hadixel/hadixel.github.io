"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@kmodern/ui";

export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * The panel's multi-select. It is not in the component kit because nothing else in the product needs
 * one: it closes on outside click and on Escape, it shows "همه" as an empty selection rather than as
 * an extra checked box, and `allowCustom` lets an operator type a value the catalogue has never seen
 * — which for a scraper is the normal case, not the edge case.
 */
export function MultiSelectField({
  label,
  values,
  options,
  onChange,
  disabled,
  placeholder = "همه",
  allowCustom = false,
}: {
  label: string;
  values: string[];
  options: MultiSelectOption[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  allowCustom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const selectedOptions = values.map((value) => options.find((option) => option.value === value) ?? { value, label: value });
  const visibleOptions = [...options, ...values.filter((value) => !options.some((option) => option.value === value)).map((value) => ({ value, label: value }))];

  const toggle = (value: string) => {
    if (values.includes(value)) onChange(values.filter((item) => item !== value));
    else onChange([...values, value]);
  };

  const addDraft = () => {
    const additions = draft.split(/[،,]/).map((value) => value.trim()).filter(Boolean);
    if (!additions.length) return;
    const next = [...values];
    for (const value of additions) {
      if (!next.includes(value) && !next.some((item) => item.toLocaleLowerCase("en") === value.toLocaleLowerCase("en"))) next.push(value);
    }
    onChange(next);
    setDraft("");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-card border border-fog bg-white px-3 py-2 text-right text-sm text-ink hover:bg-plaster disabled:cursor-not-allowed disabled:bg-plaster disabled:text-ash"
      >
        <span className="truncate">{values.length ? `${values.length} مورد انتخاب شده` : placeholder}</span>
        <span aria-hidden="true" className="shrink-0 text-xs text-ash">▾</span>
      </button>
      {open ? (
        <div role="listbox" aria-label={label} aria-multiselectable="true" className="absolute z-30 mt-1 max-h-64 w-full min-w-[220px] overflow-y-auto rounded-card border border-fog bg-white p-2 shadow-lg">
          <label className="mb-1 flex cursor-pointer items-center gap-2 rounded-card px-2 py-1.5 text-xs font-semibold text-ink hover:bg-plaster">
            <input type="checkbox" checked={values.length === 0} onChange={() => onChange([])} disabled={disabled} />
            همه
          </label>
          {visibleOptions.map((option) => {
            const checked = values.includes(option.value);
            return (
              <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-card px-2 py-1.5 text-sm text-ink hover:bg-plaster">
                <input type="checkbox" checked={checked} onChange={() => toggle(option.value)} disabled={disabled} />
                <span className="min-w-0 truncate">{option.label}</span>
              </label>
            );
          })}
          {allowCustom ? (
            <div className="mt-1 border-t border-plaster pt-2">
              <div className="flex gap-1.5">
                <Input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addDraft();
                    }
                  }}
                  placeholder="مقدار دلخواه؛ Enter یا کاما"
                  aria-label={`افزودن مقدار ${label}`}
                  disabled={disabled}
                />
                <Button type="button" variant="outline" size="sm" onClick={addDraft} disabled={disabled}>افزودن</Button>
              </div>
            </div>
          ) : null}
          {selectedOptions.length > 0 ? <p className="mt-2 truncate px-2 text-micro text-ash" title={selectedOptions.map((option) => option.label).join("، ")}>انتخاب‌شده: {selectedOptions.map((option) => option.label).join("، ")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
