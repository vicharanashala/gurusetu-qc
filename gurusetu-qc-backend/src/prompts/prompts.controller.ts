import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PromptsService } from './prompts.service';
import { UpdatePromptDto } from './dto/update-prompt.dto';

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
  async update(@Body() dto: UpdatePromptDto) {
    const doc = await this.service.update(dto);
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
  async reset(@Body() body: { editedBy?: { id?: string; name?: string } } = {}) {
    const doc = await this.service.reset(body?.editedBy);
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
}
