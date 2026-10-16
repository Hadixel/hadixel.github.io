import Link from "next/link";
import Image from "next/image";

type HeroLink = {
  href: string;
  label: string;
  newTab?: boolean;
};

type HeroImage = {
  src: string;
  alt?: string;
};

/**
 * «گالری» — the appliance on the wall.
 *
 * The store sells built-in kitchen appliances, so the hero shows one: the object
 * stands in a plaster alcove, lit and framed like a gallery shows its pieces, and
 * the copy sits beside it as a wall label. This is the storefront's documented
 * language — white canvas, plaster, ink, Farhang display, flame blue as the only
 * chromatic signal — after the imagery-free «شعله» era, and it refuses the
 * category's stock split-hero by treating the whole first viewport as one wall.
 *
 * Server-rendered and JS-free: the one load moment (alcove up, object settles,
 * label lines in sequence) runs in CSS from an already-visible default state and
 * never runs when the shopper asks for reduced motion. The secondary action is
 * deliberate: it opens the category of the object on the wall, so the picture and
 * the destination agree.
 */
export function HomeHero({
  title,
  subtitle,
  cta,
  image,
}: {
  title: string;
  subtitle?: string;
  cta?: HeroLink | null;
  image?: HeroImage | null;
}) {
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <div className="home-hero-inner">
        <div className="home-hero-label">
          <h1 id="home-hero-title" className="home-hero-title">
            {title}
          </h1>
          {subtitle && <p className="home-hero-subtitle">{subtitle}</p>}
          <div className="home-hero-actions">
            {cta && (
              <Link
                href={cta.href}
                target={cta.newTab ? "_blank" : undefined}
                rel={cta.newTab ? "noopener noreferrer" : undefined}
                className="home-hero-primary"
              >
                {cta.label}
                <svg
                  aria-hidden
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="home-hero-primary-arrow"
                >
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </svg>
              </Link>
            )}
            <Link href="/category/oven-datees" className="home-hero-secondary">
              مشاهده فرهای داتیس
            </Link>
          </div>
        </div>

        <figure className="home-hero-object">
          <div className="home-hero-frame">
            <div className="home-hero-alcove" aria-hidden="true" />
            {image && (
              <Image
                className="home-hero-img"
                src={image.src}
                alt={image.alt ?? ""}
                width={646}
                height={645}
                style={{ height: "clamp(320px, 54vh, 560px)" }}
              />
            )}
          </div>
          {image?.alt && <figcaption className="home-hero-plate">{image.alt}</figcaption>}
        </figure>
      </div>
    </section>
  );
}
