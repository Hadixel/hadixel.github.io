import Link from "next/link";
import { getSettingOrDefault } from "@/lib/settings";
import { jalaliYear, latinDigits, toFaDigits } from "@kmodern/contracts";
import { settingKeys } from "@kmodern/contracts/setting-keys";
import { loadFooter } from "@/lib/nav";

/*
 * Footer — ink surface, RTL. The start (right) column carries identity plus the
 * contact channels the owner actually configured; link groups sit beside it in
 * equal-width columns. `store.contact` is a free-text field, so channels are
 * parsed out of it and a channel renders only when it carries a real target —
 * a bare "واتساپ تلگرام" note must never become a dead `tel:` link.
 *
 * The link groups are one read from the gateway: the menu's own links, the ones pointing at a page
 * with nothing published on them already removed, and the root categories. It used to read the menu,
 * every category and every page row here and drop the empty pages by comparing resolved hrefs as
 * strings — a rule about two tables that lived in a footer component, so it could only be tested by
 * rendering one.
 */

export async function SiteFooter() {
  const [storeName, contact, footer] = await Promise.all([
    getSettingOrDefault<string>(settingKeys.storeName, "خانه مدرن"),
    getSettingOrDefault<string>(settingKeys.storeContact, ""),
    loadFooter(),
  ]);
  const channels = parseChannels(contact);

  const groups: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [];
  if (footer.links.length > 0 && footer.name) {
    groups.push({ title: footer.name, links: footer.links });
  }
  if (footer.categories.length > 0) {
    groups.push({
      title: "دسته‌بندی‌ها",
      links: footer.categories,
    });
  }
  groups.push({
    title: "حساب و خرید",
    links: [
      { href: "/account", label: "حساب من" },
      { href: "/orders", label: "سفارش‌های من" },
      { href: "/cart", label: "سبد خرید" },
      { href: "/blog", label: "وبلاگ" },
    ],
  });

  return (
    <footer className="mt-16 w-full bg-ink text-white">
      {/* Identity band (start/right) then an equal-width link band; the two
          sit side by side only from lg, where a split column would strand one
          of them. */}
      <div className="mx-auto grid max-w-[1440px] gap-x-8 gap-y-10 px-4 py-12 sm:grid-cols-2 sm:py-14 lg:grid-cols-12 lg:gap-y-12">
        <div className="sm:col-span-2 lg:col-span-4 lg:pe-6">
          <Link href="/" className="inline-flex items-center gap-2.5 font-display text-xl font-black">
            <span className="size-2 rounded-pill bg-flame-600" aria-hidden />
            {storeName}
          </Link>

          {channels.length > 0 && (
            <section className="mt-8" aria-labelledby="footer-channels">
              <h2 id="footer-channels" className="mb-4 flex items-center gap-2 text-xs font-bold text-white/50">
                <span aria-hidden className="h-px w-6 bg-white/15" />
                راه‌های ارتباطی
                <span aria-hidden className="h-px w-6 bg-white/15" />
              </h2>
              <ul className="flex flex-wrap gap-2">
                {channels.map((channel) => (
                  <li key={channel.href}>
                    <a
                      href={channel.href}
                      {...(channel.external ? { target: "_blank", rel: "noreferrer" } : {})}
                      className="inline-flex items-center gap-2 rounded-pill border border-white/12 bg-white/5 px-3 py-1.5 text-sm text-white/70 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
                    >
                      {CHANNEL_ICONS[channel.kind]()}
                      <span dir={channel.labelLtr ? "ltr" : undefined}>{channel.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="grid gap-x-8 gap-y-9 sm:col-span-2 sm:grid-cols-3 sm:gap-y-10 lg:col-span-8">
          {groups.map((group) => (
            <FooterGroup key={group.title} title={group.title}>
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </FooterGroup>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto max-w-[1440px] px-4">
          <ul className="flex flex-nowrap items-center justify-between gap-x-3 border-b border-white/10 py-5 text-[11px] text-white/60 sm:flex-wrap sm:gap-x-8 sm:gap-y-3 sm:text-xs">
            {[
              { icon: TruckIcon, label: "ارسال سراسری" },
              { icon: ShieldIcon, label: "ضمانت اصالت" },
              { icon: LockIcon, label: "پرداخت امن" },
            ].map((trust) => (
              <li key={trust.label} className="inline-flex items-center gap-2">
                <span className="text-flame-600">{trust.icon()}</span>
                {trust.label}
              </li>
            ))}
          </ul>
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-3 text-xs text-white/50">
            <span>© {toFaDigits(jalaliYear())} {storeName}</span>
            <span>تمام حقوق برای فروشگاه محفوظ است</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="text-center">
      <h2 className="mb-5 flex items-center justify-center gap-2 pb-3 text-xs font-bold text-white/50">
        <span aria-hidden className="h-px w-6 bg-white/15" />
        {title}
        <span aria-hidden className="h-px w-6 bg-white/15" />
      </h2>
      <ul className="space-y-3.5 text-sm text-white/65">{children}</ul>
    </div>
  );
}

// ---------------------------------------------------------------- channels

type ChannelKind = "whatsapp" | "telegram" | "instagram" | "phone" | "mail" | "link";

interface Channel {
  kind: ChannelKind;
  label: string;
  labelLtr: boolean;
  href: string;
  external: boolean;
}

const CHANNEL_ICONS: Record<ChannelKind, () => React.ReactElement> = {
  whatsapp: () => (
    <Icon>
      <path d="M20.5 7a3 3 0 0 0-3-3h-11a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h1.1v3.4l4.9-3.4h5a3 3 0 0 0 3-3V7Z" />
      <path d="M9.7 9.4c.2-.4.6-.6.9-.4l.9.5c.3.2.3.5.2.7l-.3.6c.7 1.3 1.7 2.3 3 3l.6-.3c.3-.1.5-.1.7.2l.5.9c.2.3 0 .6-.4.8-.4.2-.9.2-1.4 0-2.1-.6-3.7-2.2-4.3-4.3-.2-.5-.2-1 0-1.4Z" />
    </Icon>
  ),
  telegram: () => (
    <Icon>
      <path d="M21 3 10.5 12.5" />
      <path d="M21 3 14.2 21l-3.7-8.5L2.5 8.5 21 3Z" />
    </Icon>
  ),
  instagram: () => (
    <Icon>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.2 6.9h.01" strokeWidth={2.6} />
    </Icon>
  ),
  phone: () => (
    <Icon>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.1.96.35 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.35 1.85.6 2.81.7A2 2 0 0 1 22 16.92Z" />
    </Icon>
  ),
  mail: () => (
    <Icon>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.6 7.2 7.35 5.2a2 2 0 0 0 2.1 0L20.4 7.2" />
    </Icon>
  ),
  link: () => (
    <Icon>
      <path d="M10 13.5a5 5 0 0 0 7.07.07l2.5-2.5a5 5 0 0 0-7.07-7.07L11.09 5.4" />
      <path d="M14 10.5a5 5 0 0 0-7.07-.07l-2.5 2.5a5 5 0 0 0 7.07 7.07l1.41-1.41" />
    </Icon>
  ),
};

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-4 shrink-0"
    >
      {children}
    </svg>
  );
}

const TruckIcon = () => (
  <Icon>
    <path d="M2 6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v9H2V6Z" />
    <path d="M14 9.5h3.6a1 1 0 0 1 .83.45L21 13.5V15h-7V9.5Z" />
    <circle cx="6.5" cy="17.5" r="2" />
    <circle cx="17" cy="17.5" r="2" />
  </Icon>
);

const ShieldIcon = () => (
  <Icon>
    <path d="M12 2.8 4.8 5.4v5.4c0 4.5 3 8.1 7.2 10.4 4.2-2.3 7.2-5.9 7.2-10.4V5.4L12 2.8Z" />
    <path d="m9 11.8 2.1 2.1 3.9-4.2" />
  </Icon>
);

const LockIcon = () => (
  <Icon>
    <rect x="4.5" y="10.5" width="15" height="11" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </Icon>
);

const HOST_KINDS: Array<[ChannelKind, RegExp]> = [
  ["whatsapp", /(^|\.)(wa\.me|whatsapp\.com|whatsapp\.net)$/],
  ["telegram", /(^|\.)(t\.me|telegram\.me|telegram\.org)$/],
  ["instagram", /(^|\.)(instagram\.com|instagr\.am)$/],
];

// Channel names the owner may type as a label in front of a target.
const KEYWORD_KINDS: Array<[ChannelKind, string, RegExp]> = [
  ["whatsapp", "واتساپ", /واتساپ|whatsapp/i],
  ["telegram", "تلگرام", /تلگرام|telegram/i],
  ["instagram", "اینستاگرام", /اینستاگرام|اینستا|instagram/i],
  ["mail", "ایمیل", /ایمیل|mail/i],
  ["phone", "تلفن", /تلفن|تماس|شماره/i],
];

const DEFAULTS: Record<ChannelKind, string> = {
  whatsapp: "واتساپ",
  telegram: "تلگرام",
  instagram: "اینستاگرام",
  phone: "تلفن",
  mail: "ایمیل",
  link: "",
};

const LINK_RE = /(?:https?:\/\/|www\.|mailto:|tel:)[^\s،,;؛|]+/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const NUMBER_RE = /[\d۰-۹٠-٩][\d۰-۹٠-٩+\-()\s]*/;

function channelFromSegment(segment: string): Channel | null {
  const text = segment.trim();
  if (!text) return null;

  const link = text.match(LINK_RE);
  const email = link ? null : text.match(EMAIL_RE);
  let kind: ChannelKind;
  let href: string;
  let fallback: string;
  let rest: string;

  if (link) {
    const raw = link[0];
    const at = link.index ?? 0;
    rest = (text.slice(0, at) + " " + text.slice(at + raw.length)).trim();
    if (/^mailto:/i.test(raw)) {
      kind = "mail";
      href = `mailto:${raw.slice("mailto:".length)}`;
      fallback = raw.slice("mailto:".length);
    } else if (/^tel:/i.test(raw)) {
      kind = "phone";
      href = `tel:${latinDigits(raw.slice("tel:".length))}`;
      fallback = raw.slice("tel:".length).trim();
    } else {
      href = /^www\./i.test(raw) ? `https://${raw}` : raw;
      let host = "";
      try {
        host = new URL(href).hostname;
      } catch {
        return null;
      }
      kind = HOST_KINDS.find(([, re]) => re.test(host))?.[0] ?? "link";
      fallback = host;
    }
  } else if (email) {
    kind = "mail";
    href = `mailto:${email[0]}`;
    fallback = email[0];
    const at = email.index ?? 0;
    rest = (text.slice(0, at) + " " + text.slice(at + email[0].length)).trim();
  } else {
    // A number is a target only when the entry is a bare number, optionally
    // behind a "تلفن" label — prose around it would make a dead tel: link.
    const number = text.match(NUMBER_RE);
    if (!number) return null;
    const at = number.index ?? 0;
    if (text.slice(at + number[0].length).trim()) return null;
    const digits = latinDigits(number[0]);
    if (digits.replace(/\D/g, "").length < 7) return null;
    kind = "phone";
    href = `tel:${digits.replace(/[^\d+]/g, "")}`;
    fallback = number[0].trim();
    rest = text.slice(0, at).trim();
  }

  // A typed name beats a host, so "پشتیبانی واتساپ" reads as واتساپ rather than
  // wa.me; a number or an address is its own label and wins over both.
  const keyword = KEYWORD_KINDS.find(([, , re]) => re.test(rest));
  const typed = rest.replace(LINK_RE, " ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").trim();
  const label =
    kind === "phone" || kind === "mail"
      ? fallback || DEFAULTS[kind]
      : keyword?.[1] || typed || DEFAULTS[kind] || fallback;

  return {
    kind,
    label,
    // Latin targets (hosts, addresses, numbers) must read left to right.
    labelLtr: kind === "phone" || /\p{sc=Latin}/u.test(label),
    href,
    external: /^https?:/i.test(href),
  };
}

function parseChannels(raw: string): Channel[] {
  const seen = new Set<string>();
  const channels: Channel[] = [];
  for (const segment of raw.split(/[\n\r,،;؛|]+/)) {
    const channel = channelFromSegment(segment);
    if (!channel || seen.has(channel.href)) continue;
    seen.add(channel.href);
    channels.push(channel);
  }
  return channels;
}
