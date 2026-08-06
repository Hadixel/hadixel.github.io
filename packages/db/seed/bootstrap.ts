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
  [settingKeys.storeName]: "کمدرن",
  [settingKeys.storeTagline]: "فروشگاه لوازم خانگی",
  [settingKeys.storeContact]: "",
  [settingKeys.storeLogo]: "",
  [settingKeys.blogDefaultByline]: "کمدرن",
  [settingKeys.seoDefaultTitle]: "کمدرن | فروشگاه لوازم خانگی",
  [settingKeys.seoDefaultDescription]: "فروشگاه لوازم خانگی کمدرن — اجاق‌گاز، فر، هود و سینک",
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
          { id: "b-hero", type: "hero", props: { title: "کمدرن", subtitle: "لوازم خانگی باکیفیت", visible: true, mobileVisible: true } },
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