import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { PromptActor, PromptsService } from './prompts.service';
import { UpdatePromptDto } from './dto/update-prompt.dto';

/** Editor identity comes from the verified session (AuthGuard sets req.admin). */
function actorFrom(req: Request): PromptActor {
  const admin = (req as any).admin as { sub?: string; username?: string } | undefined;
  const fwd = req.headers['x-real-ip'] ?? req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim() || req.ip;
  return {
    id: admin?.sub,
    username: admin?.username,
    ip,
    userAgent: req.headers['user-agent']?.slice(0, 300),
  };
}

@Controller('prompts')
export class PromptsController {
  private readonly logger = new Logger(PromptsController.name);

  constructor(private readonly service: PromptsService) {}

  /** Return the active system prompt that AnalysisService will use. */
  @Get('current')
  async current() {
    const active = await this.service.getActive();
    const bundled = this.service.getDefault();
    return {
      active: {
        content: active.content,
        versionLabel: active.versionLabel,
        isDefault: active.isDefault,
        updatedAt: active.updatedAt,
        length: active.content.length,
      },
      bundled: {
        content: bundled.content,
        versionLabel: bundled.versionLabel,
        length: bundled.content.length,
      },
    };
  }

  /** Update the active prompt. */
  @Put('current')
  @HttpCode(HttpStatus.OK)
  async update(@Body() dto: UpdatePromptDto, @Req() req: Request) {
    const doc = await this.service.update(dto, actorFrom(req));
    return {
      versionLabel: doc.versionLabel,
      isDefault: doc.isDefault,
      length: doc.content.length,
      updatedAt: (doc as any).updatedAt,
    };
  }

  /** Reset to the bundled default. */
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async reset(@Req() req: Request) {
    const doc = await this.service.reset(actorFrom(req));
    return {
      versionLabel: doc.versionLabel,
      isDefault: doc.isDefault,
      length: doc.content.length,
      updatedAt: (doc as any).updatedAt,
    };
  }

  /** Last N history entries, most recent first. */
  @Get('history')
  async history(@Query('limit') limitRaw?: string) {
    const limit = Math.max(1, Math.min(50, parseInt(limitRaw ?? '10', 10) || 10));
    const items = await this.service.getHistory(limit);
    return {
      items: items.map((h) => ({
        versionLabel: h.versionLabel,
        note: h.note,
        editedAt: h.editedAt,
        editedBy: h.editedBy,
        length: h.content?.length ?? 0,
        // history items can be large; include a short preview only
        preview: (h.content ?? '').slice(0, 200),
      })),
    };
  }

  /** Append-only audit log of every prompt change, newest first. */
  @Get('revisions')
  async revisions(@Query('limit') limitRaw?: string) {
    const limit = Math.max(1, Math.min(500, parseInt(limitRaw ?? '50', 10) || 50));
    return { items: await this.service.listRevisions(limit) };
  }

  /** One revision with its full prompt text. */
  @Get('revisions/:rev')
  async revision(@Param('rev', ParseIntPipe) rev: number) {
    const item = await this.service.getRevision(rev);
    if (!item) throw new NotFoundException(`Prompt revision not found: ${rev}`);
    return item;
  }
}
