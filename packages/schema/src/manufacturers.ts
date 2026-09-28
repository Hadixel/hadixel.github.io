// The Iranian manufacturer strip the storefront's home page shows, and the set the seed scripts write
// into `Setting`.
//
// It is here rather than in the seed directory because it is not seed material. A seed file is a
// script's private input; this is a curated list the storefront renders and a test asserts against, and
// the storefront reached it by way of `packages/db` forwarding into `apps/api/seed/` — a package
// importing an app, through a shim, for a list of brand names. `@kmodern/schema` is where shared
// vocabulary lives, and the two consumers are now the gateway (which seeds it) and the storefront (which
// displays it), with no edge between them and no shim in between.
//
// The shape is a structural type rather than an interface, because the list is inferred: an entry with
// no `image` and one with `imageInvert` are both valid, and a type that made `image` required would be
// a lie about the data.

export interface IranianManufacturer {
  title: string;
  text: string;
  image?: string;
  /** A dark-on-dark logo that has to be inverted to be legible on the strip's background. */
  imageInvert?: boolean;
}

export const IRANIAN_MANUFACTURERS: IranianManufacturer[] = [
  { title: "کن", text: "هود · سینک · فر · اجاق", image: "/brands/kan.png" },
  { title: "اخوان", text: "هود · سینک · فر · اجاق", image: "/brands/akhavan.png" },
  { title: "بیمکث", text: "هود · سینک · فر · اجاق", image: "/brands/bimax.svg", imageInvert: true },
  { title: "استیل البرز", text: "هود · سینک · فر · اجاق", image: "/brands/steel-alborz.png" },
  { title: "داتیس", text: "هود · سینک · فر · اجاق", image: "/brands/datees-color.png" },
  { title: "آلتون", text: "هود · سینک · فر · اجاق", image: "/brands/alton.webp" },
  { title: "ایلیا استیل", text: "هود · سینک · فر · اجاق", image: "/brands/ilia-steel.webp" },
  { title: "آنامیس", text: "هود · سینک · فر · اجاق" },
  { title: "پیکو", text: "هود · سینک · اجاق", image: "/brands/peiko.png" },
  { title: "روبینا", text: "هود · فر · اجاق" },
  { title: "تاکنو", text: "هود · فر · اجاق", image: "/brands/tacno.webp" },
  { title: "سینجر", text: "هود · فر · اجاق" },
  { title: "سانترا", text: "هود · فر · اجاق" },
  { title: "آرویک", text: "هود · اجاق", image: "/brands/arvik.png" },
  { title: "میلان گاز", text: "هود · اجاق" },
  { title: "امرسان", text: "هود" },
  { title: "درسا", text: "هود" },
  { title: "مکاپا", text: "هود" },
  { title: "سیمر", text: "هود" },
  { title: "هادسون", text: "هود" },
  { title: "بنس", text: "هود" },
  { title: "جهان گاز", text: "هود" },
  { title: "درخشان", text: "هود · سینک", image: "/brands/derakhshan.png" },
  { title: "فرامکو", text: "سینک" },
  { title: "نیک کالا", text: "اجاق" },
  { title: "رابیتس", text: "فر" },
  { title: "پرنیان استیل", text: "فر" },
  { title: "تولیپس", text: "فر" },
  { title: "ساتین", text: "فر" },
] as const;
