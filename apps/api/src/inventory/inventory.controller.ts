// Stock, as the panel's operator sees it.
//
// The lifecycle itself — reserve, commit, release, restock — is in `inventory.service.ts` and has been
// since ticket 08, deliberately free of Nest decorators so the orders service and the tests can reach
// it without a container. This controller is only the operator's edge onto one operation of it: the
// manual adjustment, which is the one thing an operator does to stock that is not an order.
//
// The panel had its own implementation of this, and it was a fourth copy of the rules rather than a
// third: its own compare-and-set, its own reserved-stock floor, and its own audit write, all inside a
// transaction the gateway knew nothing about. Two of the three guarantees here — that an adjustment
// cannot push available stock below what is already reserved, and that a concurrent order cannot be
// overwritten by a stale read of the row — are the reason this exists as a gateway route.
//
// Two refusals are worth distinguishing, because an operator can act on one and not the other. A
// variant that does not exist is a 404. A variant whose stock moved underneath the adjustment is a
// 409: the operator's number was fine, the row was not, and re-reading is the correct response rather
// than retyping the delta.

import { Body, Controller, Inject, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { ConflictException, NotFoundException } from "../common/exceptions/gateway.exception.js";
import { writeAudit } from "../common/audit.js";
import { requireAdmin } from "../auth/identity.js";
import { AuthService } from "../auth/auth.service.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { createPrismaClient } from "../prisma/client.js";
import { AdjustStockDto } from "./dto/inventory.dto.js";

@Controller("inventory")
export class InventoryController {
  constructor(
    private readonly auth: AuthService,
    // The data client arrives through the module that owns it, the same as every other feature. The
    // service file next door is decorator-free on purpose so the tests can drive it directly; a
    // controller has no such excuse and takes the client the way the rest of the gateway does.
    @Inject(DATA_CLIENT) private readonly db: ReturnType<typeof createPrismaClient>,
  ) {}

  /**
   * Apply an operator's stock adjustment to one variant.
   *
   * The whole operation is one transaction: the compare-and-set, the write, and the audit line. A
   * failure anywhere leaves the variant exactly as it was, and — because the audit line is inside the
   * transaction rather than after it — leaves no trace of an adjustment that did not happen, which is
   * the guarantee the panel's copy could not make: it committed the stock change and then wrote the
   * audit row separately, so a failed audit write was a changed row nobody could account for.
   *
   * `delta` rather than an absolute count, because the two answer different questions. "There are
   * three left" is wrong the moment an order has been placed since the operator looked, and it
   * silently discards a concurrent change; "add two" is right regardless of what the row now says.
   */
  @Post("variants/:id/adjust")
  async adjust(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: AdjustStockDto,
  ): Promise<{ stock: number; reserved: number }> {
    const admin = await requireAdmin(this.auth, req);

    try {
      return await this.run(id, body.delta, body.note ?? null, admin.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "VARIANT_NOT_FOUND") throw new NotFoundException("تنوع پیدا نشد.");
      // The row moved between the read and the write. Distinct from a 404 because the operator's input
      // was not the problem and retrying the same delta against a fresh read is exactly right.
      if (message === "STOCK_CONFLICT") {
        throw new ConflictException("موجودی هم‌زمان تغییر کرده؛ دوباره تلاش کنید");
      }
      // Taking stock below what is already promised to a customer would oversell the variant, so the
      // floor is a refusal rather than a clamp: silently reducing the adjustment would write a number
      // the operator did not ask for.
      if (message === "STOCK_RESERVED") {
        throw new ConflictException("موجودی قابل تزریق کمتر از مقدار رزروشده است");
      }
      throw error;
    }
  }

  private async run(
    variantId: string,
    delta: number,
    note: string | null,
    adminUserId: string,
  ): Promise<{ stock: number; reserved: number }> {
    return this.db.$transaction(async (tx) => {
      const variant = await tx.variant.findUnique({ where: { id: variantId } });
      if (!variant) throw new Error("VARIANT_NOT_FOUND");
      if (variant.stock + delta < variant.reserved) throw new Error("STOCK_RESERVED");

      // The compare-and-set. Naming both the stock and the reserved count in the `where` is what makes
      // this safe against a concurrent order: a plain read-then-write would let an adjustment computed
      // from a stale row overwrite a hold taken in between, which is how a sold unit reappears.
      const updated = await tx.variant.updateMany({
        where: { id: variantId, stock: variant.stock, reserved: variant.reserved },
        data: { stock: { increment: delta } },
      });
      if (updated.count !== 1) throw new Error("STOCK_CONFLICT");

      const after = variant.stock + delta;
      await writeAudit(tx, {
        adminUserId,
        action: "STOCK_ADJUSTED",
        entityType: "VARIANT",
        entityId: variantId,
        meta: { delta, note, before: variant.stock, after, sku: variant.sku },
      });

      return { stock: after, reserved: variant.reserved };
    });
  }
}
