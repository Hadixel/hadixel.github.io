import Image from "next/image";
import type { ComponentProps } from "@kmodern/contracts";
import { LogoLoop } from "@/components/reactbits/index";
import type { BlockRendererProps } from "./types";
import { ShimmerImage } from "@/components/shimmer-image";

export function UspRowBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["uspRow"];
  const label = p.label?.trim();
  const speed = p.items.length > 8 ? Math.min(150, p.items.length * 3) : 40;
  return (
    <div
      role="group"
      className="w-full border-y border-flame-800/60 bg-flame-950 py-2.5 sm:py-4"
      dir="rtl"
      aria-label={label ?? p.items.map((item) => item.title).join("، ")}
    >
      <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 sm:gap-6">
        {label && (
          <span className="flex shrink-0 items-center gap-2 whitespace-nowrap border-e border-flame-700/50 pe-3 text-micro font-bold text-flame-200/85 sm:pe-5 sm:text-xs">
            <span aria-hidden className="size-1.5 rounded-pill bg-flame-400" />
            {label}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <LogoLoop
            className="max-w-full"
            speed={speed}
            /* The marks render at 24px (36px from `sm`), so a marquee gap wider
               than the logo itself leaves more air than artwork. Roughly the
               logo's own height reads as a rail instead of a scatter. */
            gap="gap-5 sm:gap-7"
            items={p.items.map((it, i) => {
              const isBimax = it.title.includes("بیمکث") || (typeof it.image === "string" && it.image.includes("bimax"));
              const shouldInvert = Boolean(it.imageInvert) && !isBimax;
              return it.image ? (
                <span key={i} className="relative block h-6 w-32 shrink-0 overflow-hidden sm:h-9 sm:w-40">
                  <ShimmerImage
                    src={it.image}
                    alt={it.title}
                    fill
                    sizes="160px"
                    className={`object-contain opacity-80 transition-opacity hover:opacity-100 ${shouldInvert ? "brightness-150 invert" : "brightness-150"}`}
                  />
                </span>
              ) : (
                <span key={i} dir="rtl" className="flex shrink-0 items-center gap-2 whitespace-nowrap sm:gap-3">
                  <span aria-hidden className="size-1.5 rounded-pill bg-flame-500" />
                  <span className="text-sm font-bold text-white/80">{it.title}</span>
                  {it.text && <span className="text-xs text-white/35">{it.text}</span>}
                </span>
              );
            })}
          />
        </div>
      </div>
    </div>
  );
}
