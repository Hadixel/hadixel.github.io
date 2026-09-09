import { componentSchemas, pageBlocksSchema } from "@kmodern/schema";
// Bootstrap: default Settings (011/016/017 defaults) + first AdminUser
// (010: bootstrap credential forces password change on first login — never a
// runtime default password).
// Run: pnpm --filter @kmodern/db db:bootstrap
//   ADMIN_EMAIL=owner@kmodern.ir ADMIN_PASSWORD=<strong> pnpm db:bootstrap
import "dotenv/config";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { db } from "../src/client.js";
import { settingKeys } from "@kmodern/schema";

const DEFAULTS: Record<string, unknown> = {
  [settingKeys.storeName]: "خانه مدرن",
  [settingKeys.storeTagline]: "فروشگاه لوازم خانگی",
  [settingKeys.storeContact]: "",
  [settingKeys.storeLogo]: "",
  [settingKeys.blogDefaultByline]: "خانه مدرن",
  [settingKeys.seoDefaultTitle]: "خانه مدرن | فروشگاه لوازم خانگی",
  [settingKeys.seoDefaultDescription]: "فروشگاه لوازم خانگی خانه مدرن — اجاق‌گاز، فر، هود و سینک",
  [settingKeys.shippingLocalFeeMode]: "FLAT",
  [settingKeys.shippingLocalFlatFee]: 200000,
  [settingKeys.shippingPostWeightCap]: 0, // post off until raised (011)
  [settingKeys.shippingPostFallbackFee]: 0, // 0 = post unavailable
  [settingKeys.shippingMaxCodTotal]: 50000000,
  [settingKeys.shippingBarberiNote]: "هزینه باربری هنگام تحویل (پس‌کرایه) دریافت می‌شود.",
  [settingKeys.paymentC2cCardNumber]: "",
  [settingKeys.paymentC2cCardHolder]: "",
  [settingKeys.paymentC2cBankName]: "",
  [settingKeys.inventoryLowStockThreshold]: 3,
  [settingKeys.checkoutOnlineReserveMinutes]: 30,
  [settingKeys.checkoutC2cReserveHours]: 48,
  [settingKeys.smsProviderConfigured]: false,
  [settingKeys.adminAlertMobile]: "",
};

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

async function main() {
  const prisma = db();
  try {
    // 1. Settings upsert
    for (const [key, value] of Object.entries(DEFAULTS)) {
      await prisma.setting.upsert({
        where: { key },
        update: {},
        create: { key, value: value as never },
      });
    }
    console.log(`settings ensured: ${Object.keys(DEFAULTS).length}`);

    // 2. System pages (005: Home/About/Contact system pages, block-editable)
    const pages: Array<{ slug: string; title: string; kind: "SYSTEM"; blocks: unknown[] }> = [
      {
        slug: "home",
        title: "خانه",
        kind: "SYSTEM",
        blocks: [
          { id: "b-hero", type: "hero", props: { title: "خانه مدرن", subtitle: "لوازم خانگی باکیفیت", visible: true, mobileVisible: true } },
        ],
      },
      { slug: "about", title: "درباره ما", kind: "SYSTEM", blocks: [] },
      { slug: "contact", title: "تماس با ما", kind: "SYSTEM", blocks: [] },
    ];
    for (const p of pages) {
      await prisma.page.upsert({
        where: { slug: p.slug },
        update: {},
        create: {
          slug: p.slug,
          title: p.title,
          kind: p.kind,
          status: "PUBLISHED",
          draftBlocks: p.blocks,
          publishedBlocks: p.blocks,
        },
      });
    }
    console.log("system pages ensured:", pages.length);

    // 3. Menus (006): header/footer/mobile scaffolds
    for (const [location, name] of [
      ["HEADER", "منوی اصلی"],
      ["FOOTER", "منوی فوتر"],
      ["MOBILE", "منوی موبایل"],
    ] as const) {
      await prisma.menu.upsert({
        where: { location },
        update: {},
        create: { location, name, items: { create: [] } },
      });
    }
    console.log("menus ensured: 3");

    // 3b. Guarded content seeding — only when the target is empty, so owner
    // edits in the admin are never clobbered by a reseed.
    const FA_ROOTS: Record<string, string> = {
      sink: "سینک",
      hood: "هود",
      oven: "فر",
      stove: "اجاق گاز",
      "air-fryer": "سرخ‌کن",
    };
    const rootCatId = async (key: string) =>
      (await prisma.category.findUnique({ where: { slug: `${key}-datees` } }))?.id;

    // Menus: HEADER/FOOTER/MOBILE scaffolds get items only while empty.
    const header = await prisma.menu.findUnique({
      where: { location: "HEADER" },
      include: { items: true },
    });
    const mobileMenu = await prisma.menu.findUnique({ where: { location: "MOBILE" } });
    if (header && header.items.length === 0) {
      // MOBILE mirrors HEADER; decide once, before the first item lands
      const seedMobile = Boolean(mobileMenu) &&
        (await prisma.menuItem.count({ where: { menuId: mobileMenu!.id } })) === 0;
      const topKeys = ["oven", "stove", "hood", "sink", "air-fryer"] as const;
      for (const [i, key] of topKeys.entries()) {
        const catId = await rootCatId(key);
        if (!catId) continue;
        const data = {
          sortOrder: i,
          label: FA_ROOTS[key],
          target: { type: "CATEGORY", targetId: catId },
          childSource: "CATEGORY" as const,
          categoryId: catId,
          display: "MEGA" as const,
        };
        await prisma.menuItem.create({ data: { ...data, menuId: header.id } });
        if (seedMobile && mobileMenu) await prisma.menuItem.create({ data: { ...data, menuId: mobileMenu.id } });
      }
      console.log("HEADER/MOBILE menu items seeded");
    }

    // MOBILE empty but HEADER already populated (partial previous seed): copy over
    if (mobileMenu && header && header.items.length > 0 &&
        (await prisma.menuItem.count({ where: { menuId: mobileMenu.id } })) === 0) {
      for (const [i, src] of header.items.sort((a, b) => a.sortOrder - b.sortOrder).entries()) {
        await prisma.menuItem.create({
          data: {
            menuId: mobileMenu.id,
            sortOrder: i,
            label: src.label,
            target: src.target as never,
            childSource: src.childSource,
            categoryId: src.categoryId,
            display: src.display,
          },
        });
      }
      console.log("MOBILE menu items mirrored from HEADER");
    }

    const footer = await prisma.menu.findUnique({
      where: { location: "FOOTER" },
      include: { items: true },
    });
    if (footer && footer.items.length === 0) {
      const aboutPage = await prisma.page.findUnique({ where: { slug: "about" } });
      const contactPage = await prisma.page.findUnique({ where: { slug: "contact" } });
      const links: Array<{ label: string; target: unknown }> = [];
      if (aboutPage && aboutPage.publishedBlocks.length > 0) links.push({ label: "درباره ما", target: { type: "PAGE", targetId: aboutPage.id } });
      if (contactPage && contactPage.publishedBlocks.length > 0) links.push({ label: "تماس با ما", target: { type: "PAGE", targetId: contactPage.id } });
      links.push({ label: "وبلاگ", target: { type: "BLOG_INDEX" } });
      links.push({ label: "محصولات", target: { type: "EXTERNAL", url: "/products", newTab: false } });
      for (const [i, l] of links.entries()) {
        await prisma.menuItem.create({
          data: { menuId: footer.id, sortOrder: i, label: l.label, target: l.target as never },
        });
      }
      console.log("FOOTER menu items seeded");
    }

    // Home page blocks
    const homePage = await prisma.page.findUnique({ where: { slug: "home" } });
    // empty OR still the original single-hero bootstrap scaffold (never owner content)
    const currentBlocks = Array.isArray(homePage?.publishedBlocks)
      ? (homePage.publishedBlocks as unknown[])
      : [];
    // the untouched bootstrap scaffold is a single hero block with id b-hero
    const first = currentBlocks[0] as { id?: string; type?: string } | undefined;
    const isScaffold =
      currentBlocks.length === 0 ||
      (currentBlocks.length === 1 && first?.id === "b-hero" && first?.type === "hero");
    if (
      homePage &&
      isScaffold
    ) {
      const catIds = {
        oven: await rootCatId("oven"),
        stove: await rootCatId("stove"),
        hood: await rootCatId("hood"),
        sink: await rootCatId("sink"),
        airFryer: await rootCatId("air-fryer"),
      };
      const img = (slug: string, variant: string) => `/products/${slug}/${variant}/img-1.jpg`;
      const blocks = [
        {
          id: "home-hero",
          type: "hero",
          props: {
            title: "خانه مدرن",
            subtitle: "فروشگاه لوازم خانگی — فر، اجاق گاز، هود و سینک",
            cta: { label: "مشاهده محصولات", link: { type: "EXTERNAL", url: "/products", newTab: false } },
            image: { src: img("datees-built-in-electric-oven-666", "variant-black"), alt: "فر توکار برقی داتیس" },
            overlay: true,
            padding: "md",
            visible: true,
            mobileVisible: true,
          },
        },
        {
          id: "home-usp",
          type: "uspRow",
          props: {
            items: [
              { title: "ارسال سراسری", text: "ارسال به تمام نقاط ایران" },
              { title: "ضمانت اصالت", text: "کالای اورجینال با گارانتی معتبر" },
              { title: "پرداخت امن", text: "درگاه پرداخت مطمئن" },
              { title: "پشتیبانی", text: "پاسخ‌گویی در تمام روزهای هفته" },
            ],
            padding: "sm",
            visible: true,
            mobileVisible: true,
          },
        },
        {
          id: "home-cats",
          type: "categoryTiles",
          props: {
            title: "خرید بر اساس دسته‌بندی",
            categories: [
              { categoryId: catIds.oven, image: img("datees-built-in-electric-oven-675", "variant-black") },
              { categoryId: catIds.stove, image: img("datees-5-burner-gas-cooktop-551", "variant-black") },
              { categoryId: catIds.hood, image: img("datees-volira-built-in-hood", "variant-black") },
              { categoryId: catIds.sink, image: img("datees-stainless-steel-double-bowl-sink-180", "variant-steel") },
              { categoryId: catIds.airFryer, image: img("datees-dual-basket-air-fryer-202", "variant-black") },
            ].filter((c) => c.categoryId),
            padding: "md",
            visible: true,
            mobileVisible: true,
          },
        },
        {
          id: "home-best",
          type: "productGrid",
          props: {
            title: "پرفروش‌ترین‌ها",
            source: { kind: "ALL" },
            limit: 8,
            padding: "md",
            visible: true,
            mobileVisible: true,
          },
        },
        {
          id: "home-banner",
          type: "banner",
          props: {
            title: "آشپزخانه‌ای متفاوت بسازید",
            subtitle: "هودهای مخفی داتیس با طراحی مدرن",
            image: {
              src: img("datees-volira-built-in-hood", "variant-black"),
              alt: "هود توکار داتیس",
              link: catIds.hood ? { type: "CATEGORY", targetId: catIds.hood } : undefined,
            },
            padding: "md",
            visible: true,
            mobileVisible: true,
          },
        },
        {
          id: "home-testimonials",
          type: "testimonials",
          props: {
            title: "نظر مشتریان",
            items: [
              { quote: "فر توکاری که خریدم دقیقاً همون چیزی بود که توی سایت دیدم. بسته‌بندی عالی و تحویل سریع.", author: "مریم احمدی", role: "کرمان" },
              { quote: "سینک استیل کیفیت خیلی خوبی داره و نصاب هم راحت نصبش کرد. ممنون از تیم کمدرن.", author: "علی رضایی", role: "تهران" },
              { quote: "هود مخفی آشپزخانه رو واقعاً مدرن کرده. پشتیبانی هم برای سوالاتم سریع جواب داد.", author: "زهرا کریمی", role: "شیراز" },
            ],
            padding: "lg",
            visible: true,
            mobileVisible: true,
          },
        },
        {
          id: "home-trust",
          type: "trustBadges",
          props: {
            items: [
              { icon: "truck", label: "ارسال سریع" },
              { icon: "shield", label: "ضمانت اصالت کالا" },
              { icon: "credit-card", label: "پرداخت در محل" },
              { icon: "headset", label: "۷ روز ضمانت بازگشت" },
            ],
            padding: "sm",
            visible: true,
            mobileVisible: true,
          },
        },
        {
          id: "home-blog",
          type: "blogTeaser",
          props: { title: "از وبلاگ", limit: 3, padding: "md", visible: true, mobileVisible: true },
        },
      ];
      const parsed = pageBlocksSchema.safeParse(blocks);
      if (!parsed.success) throw new Error(`home blocks invalid: ${parsed.error.message}`);
      // pageBlocksSchema only checks the envelope — validate props per type
      // so a prop typo fails the seed, not the page (same rules as admin save)
      for (const b of blocks) {
        const check = componentSchemas[b.type as keyof typeof componentSchemas].safeParse(b.props);
        if (!check.success) {
          throw new Error(`home block "${b.id}" (${b.type}) props invalid: ${check.error.message}`);
        }
      }
      await prisma.page.update({
        where: { id: homePage.id },
        data: { publishedBlocks: blocks as never, draftBlocks: blocks as never },
      });
      console.log(`home page blocks seeded: ${blocks.length}`);
    }

    // 4. First admin user (010): from env, must change password at first login
    const email = process.env.ADMIN_EMAIL ?? "owner@kmodern.ir";
    const pw = process.env.ADMIN_PASSWORD;
    if (!pw) throw new Error("ADMIN_PASSWORD env required for bootstrap (min 12 chars)");
    if (pw.length < 12) throw new Error("ADMIN_PASSWORD too short (min 12)");
    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (!existing) {
      await prisma.adminUser.create({
        data: {
          email,
          passwordHash: hashPassword(pw),
          name: "Owner",
          role: "OWNER",
          mustChangePassword: true,
        },
      });
      console.log(`admin created: ${email} (must change password on first login)`);
    } else {
      console.log(`admin exists: ${email} (skipped)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });