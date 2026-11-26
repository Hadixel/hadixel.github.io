"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PROVINCE_ALIASES, scoreOptionMatch } from "../lib/picker-search";

export interface PickerOption {
  id: string | number;
  name: string;
  aliases?: string[];
}

export interface SearchablePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: PickerOption[] | string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  aliasesMap?: Record<string, string[]>;
}

export function SearchablePicker({
  id: propId,
  value,
  onChange,
  options,
  placeholder = "انتخاب کنید",
  searchPlaceholder = "جستجو (فارسی یا انگلیسی)...",
  emptyMessage = "موردی یافت نشد",
  disabled = false,
  aliasesMap = PROVINCE_ALIASES,
}: SearchablePickerProps) {
  const generatedId = useId();
  const id = propId || generatedId;
  const listboxId = `${id}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const normalizedOptions = useMemo<PickerOption[]>(() => {
    return options.map((opt) => {
      if (typeof opt === "string") {
        return { id: opt, name: opt, aliases: aliasesMap?.[opt] || [] };
      }
      return {
        id: opt.id,
        name: opt.name,
        aliases: opt.aliases || aliasesMap?.[opt.name] || [],
      };
    });
  }, [options, aliasesMap]);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return normalizedOptions;
    const scored: Array<{ opt: PickerOption; score: number }> = [];
    for (const opt of normalizedOptions) {
      const score = scoreOptionMatch(searchQuery, opt.name, opt.aliases);
      if (score > 0) {
        scored.push({ opt, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.opt);
  }, [normalizedOptions, searchQuery]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      const selectedIdx = normalizedOptions.findIndex((opt) => opt.name === value);
      setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0);
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isOpen, normalizedOptions, value]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || highlightedIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
    if (item && typeof item.scrollIntoView === "function") {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, isOpen]);

  function handleSelect(selectedValue: string) {
    onChange(selectedValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((prev) => (filteredOptions.length > 0 ? (prev + 1) % filteredOptions.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((prev) => (filteredOptions.length > 0 ? (prev - 1 + filteredOptions.length) % filteredOptions.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (filteredOptions.length > 0 && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        handleSelect(filteredOptions[highlightedIndex].name);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setIsOpen(false);
    }
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsOpen(true);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-card border border-fog bg-canvas px-3 py-2 text-sm text-ink outline-none transition placeholder:text-slate-line hover:border-slate-300 focus:border-flame-700 focus:ring-2 focus:ring-flame-100 disabled:cursor-not-allowed disabled:bg-plaster disabled:text-ash disabled:hover:border-fog"
      >
        <span className={`truncate text-right ${value ? "font-medium text-ink" : "text-ash"}`}>
          {value || placeholder}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-ash transition-transform duration-200 ${isOpen ? "rotate-180 text-flame-700" : ""}`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1.5 overflow-hidden rounded-card border border-plaster bg-canvas shadow-[0_12px_32px_rgba(17,17,17,0.12)]">
          <div className="border-b border-plaster p-2 bg-canvas">
            <div className="relative flex items-center">
              <svg
                className="pointer-events-none absolute right-2.5 size-4 text-ash"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-md border border-fog bg-plaster/50 pr-8 pl-7 text-xs text-ink outline-none transition placeholder:text-ash/70 focus:border-flame-700 focus:bg-canvas focus:ring-1 focus:ring-flame-200"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute left-2 rounded p-0.5 text-ash transition hover:text-ink"
                  aria-label="پاک کردن جستجو"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="max-h-60 overflow-y-auto p-1.5 space-y-0.5"
          >
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-ash">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((option, index) => {
                const isSelected = option.name === value;
                const isHighlighted = index === highlightedIndex;
                return (
                  <div
                    key={option.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(option.name)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`flex items-center justify-between rounded-md px-3 py-2 text-xs cursor-pointer transition select-none ${
                      isSelected
                        ? "bg-flame-50 font-bold text-flame-800"
                        : isHighlighted
                        ? "bg-plaster text-ink"
                        : "text-ink hover:bg-plaster"
                    }`}
                  >
                    <span>{option.name}</span>
                    {isSelected && (
                      <svg
                        className="size-4 shrink-0 text-flame-700"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
