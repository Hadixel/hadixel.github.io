// Discounts, at the operator's edge.
//
// The panel had its own, and it had three separate defects that only became visible once the write
// moved:
//
//   1. The audit line was written *after* the row was committed, so a failed audit write was a
//      discount nobody could account for and the operator was told it had saved.
//   2. The targets were counted in a read that happened before the write, so a product deleted in
//      between left a discount naming something that no longer exists — applied at the till against
//      nothing, silently, because the till only asks whether an id is in the list it was handed.
//   3. A duplicate code was caught by matching the *text* of a Prisma error, which reports a
//      collision and an unrelated failure with the same sentence and breaks the day the driver
//      changes its wording.
//
// The code is the fourth, and it is the one the migration cannot fix on its own. `Discount_code_idx`
// is an ordinary index: the model comment says "unique nullable" and the migration says
// `CREATE INDEX`, not `CREATE UNIQUE INDEX`. So nothing in the database stops two coupons sharing a
// code, and the till's `coupons.find(...)` answers with whichever came back first. The DTO
// canonicalises the code, which is what makes *spelling* collisions impossible; this controller asks
// about *duplicate* codes rather than catching a driver error, because asking is the only version
// that works without the unique index. Adding that index is a migration and belongs with the schema,
// not with this slice — so the check is asked inside the transaction and the race between two
// operators saving the same code at the same moment is still open, and is named here rather than
// papered over.

import { Body, Controller, Delete, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { writeAudit } from "../common/audit.js";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { SaveDiscountDto, UpdateDiscountDto } from "./dto/discount.dto.js";
import { DiscountCodeTakenException, DiscountNotFoundException } from "./exceptions/discount.exception.js";
import {
  assertDiscountIsSane,
  assertTargetsExist,
  mergeDiscount,
  toCreateData,
} from "./discounts.service.js";

type Tx = Prisma.TransactionClient;

/** What a saved discount answers with: the id, and the code it landed on. */
export interface DiscountSaved {
  id: string;
  code: string | null;
}

@Controller("discounts")
export class DiscountsController {
  constructor(
    private readonly auth: AuthService,
    // The data client arrives through the module that owns it, the same as every other feature.
    // `PrismaClient` named rather than `ReturnType<typeof createPrismaClient>`: the generated client
    // exports the type in its own right, and a constructor parameter typed through a factory's return
    // type couples this controller to how the client happens to be built.
    @Inject(DATA_CLIENT) private readonly db: PrismaClient,
  ) {}

  @Post()
  async create(@Req() req: Request, @Body() body: SaveDiscountDto): Promise<DiscountSaved> {
    const admin = await requireAdmin(this.auth, req);

    // One transaction: the row, the answer about a duplicate code and the audit line commit or
    // none of them do, and the operator's answer is only sent after all three.
    return this.db.$transaction(async (tx) => {
      const data = toCreateData(body);
      const shape = { ...data, code: data.code ?? undefined };

      assertDiscountIsSane(shape);
      await assertTargetsExist(tx, shape);
      if (data.code) await this.assertCodeFree(tx, data.code, null);

      const discount = await tx.discount.create({ data });

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "DISCOUNT_CREATED",
        entityType: "DISCOUNT",
        entityId: discount.id,
        meta: { type: data.type, scope: data.scope, mode: data.mode, code: data.code },
      });

      return { id: discount.id, code: discount.code };
    });
  }

  @Patch(":id")
  async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: UpdateDiscountDto,
  ): Promise<DiscountSaved> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const existing = await tx.discount.findUnique({ where: { id } });
      // A lookup before anything is written, rather than a bare `update`, because an update against
      // an id that is not there is a Prisma error and the panel reported that as "ذخیره انجام نشد" —
      // indistinguishable from a database being down. A stale form is a 404 and says so.
      if (!existing) throw new DiscountNotFoundException();

      // Merged before it is judged. Every rule in `assertDiscountIsSane` is about the discount, not
      // about the request, so an update that sends only the value has to be checked against the mode
      // and window the discount already had — otherwise clearing a coupon's code by switching it to
      // automatic is a rule nothing sees.
      const shape = mergeDiscount(existing, body);
      assertDiscountIsSane(shape);
      await assertTargetsExist(tx, shape);

      // A coupon with no code stores null, whatever the form sent. An automatic discount always does,
      // so a code left behind by a coupon that became automatic cannot sit in the column shadowing a
      // real one.
      const code = shape.mode === "COUPON" ? shape.code ?? null : null;
      if (code && code !== existing.code) await this.assertCodeFree(tx, code, id);

      const discount = await tx.discount.update({
        where: { id },
        data: {
          type: shape.type,
          scope: shape.scope,
          mode: shape.mode,
          code,
          value: shape.value,
          maxAmount: body.maxAmount ?? null,
          productIds: shape.productIds,
          categoryIds: shape.categoryIds,
          collectionIds: shape.collectionIds,
          startsAt: shape.startsAt,
          endsAt: shape.endsAt,
          minOrderSubtotal: body.minOrderSubtotal ?? null,
          maxUsesTotal: body.maxUsesTotal ?? null,
          maxUsesPerCustomer: body.maxUsesPerCustomer ?? null,
          ...(body.status === undefined ? {} : { status: body.status }),
        },
      });

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "DISCOUNT_UPDATED",
        entityType: "DISCOUNT",
        entityId: id,
        meta: { type: shape.type, scope: shape.scope, mode: shape.mode, code },
      });

      return { id: discount.id, code: discount.code };
    });
  }

  @Delete(":id")
  async remove(@Req() req: Request, @Param("id") id: string): Promise<{ deleted: true }> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const discount = await tx.discount.findUnique({ where: { id } });
      // The panel had no existence check here, so a stale form raised a raw Prisma error instead of a
      // sentence an operator could read.
      if (!discount) throw new DiscountNotFoundException();

      // Nothing cascades and nothing needs to: the orders that used this discount record it as an
      // id inside `appliedDiscounts`, so removing the row cannot orphan a row that points at it —
      // which is the difference from a category, whose spec-field values are real foreign keys.
      await tx.discount.delete({ where: { id } });

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "DISCOUNT_DELETED",
        entityType: "DISCOUNT",
        entityId: id,
        meta: { code: discount.code, type: discount.type },
      });

      return { deleted: true };
    });
  }

  /**
   * Is this code free?
   *
   * Asked rather than caught, for the reason the header gives: the panel matched a Prisma error's
   * text, which is a rule about a driver's wording. `findFirst` rather than `findUnique` because
   * `code` is not unique in the schema — `findUnique` would not type-check, and pretending otherwise
   * would hide exactly the fact this method exists to work around.
   *
   * `exceptId` is the discount being edited, so re-saving a coupon without touching its code is not
   * a collision with itself. That is a real case: the panel's form always sends the whole discount,
   * so every save of an unchanged coupon arrives carrying the code it already has.
   */
  private async assertCodeFree(tx: Tx, code: string, exceptId: string | null): Promise<void> {
    const taken = await tx.discount.findFirst({
      where: { code, ...(exceptId === null ? {} : { id: { not: exceptId } }) },
      select: { id: true },
    });
    if (taken) throw new DiscountCodeTakenException(code);
  }
}
