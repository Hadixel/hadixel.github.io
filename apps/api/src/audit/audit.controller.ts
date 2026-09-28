// The audit trail, as the panel reads it.

import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { AuditService } from "./audit.service.js";
import { AuditQueryDto } from "./dto/audit.dto.js";

@Controller("audit")
export class AuditController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  /**
   * A page of the trail, and the operators it can be filtered by.
   *
   * Both in one answer because the page cannot render its filter without the second, and a dropdown
   * fetched separately is a dropdown that can disagree with the list it filters.
   */
  @Get()
  async list(@Req() req: Request, @Query() query: AuditQueryDto) {
    await requireAdmin(this.auth, req);
    return this.audit.list({
      action: query.action,
      adminUserId: query.admin,
      limit: query.size,
      offset: (query.page - 1) * query.size,
    });
  }
}
