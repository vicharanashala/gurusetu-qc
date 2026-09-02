import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { LlmConfigService } from './llm-config.service';
import { UpdateLlmConfigDto } from './dto/update-llm-config.dto';
import { LlmService } from '../llm/llm.service';
import { decryptSecret } from '../common/crypto/secret-box';

@Controller('llm-config')
export class LlmConfigController {
  constructor(
    private readonly service: LlmConfigService,
    private readonly llm: LlmService,
  ) {}

  /** Current provider settings. The API key is masked, never returned in full. */
  @Get()
  async get() {
    return this.service.getPublic();
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async update(@Req() req: Request, @Body() dto: UpdateLlmConfigDto) {
    const admin = (req as any).admin as { username?: string } | undefined;
    await this.service.update(dto, admin?.username);
    return this.service.getPublic();
  }

  /**
   * Round-trips a one-token prompt to the configured provider so the admin gets
   * a real yes/no before running an evaluation against it.
   */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  async test(@Body() dto?: Partial<UpdateLlmConfigDto>) {
    const stored = await this.service.resolve();

    // Test what's on screen if the admin supplied it, otherwise what's saved.
    // An omitted apiKey means "use the stored one", matching PUT semantics.
    const cfg = {
      ...stored,
      ...(dto?.protocol ? { protocol: dto.protocol } : {}),
      ...(dto?.baseUrl !== undefined
        ? { baseUrl: dto.baseUrl.trim().replace(/\/$/, '') }
        : {}),
      ...(dto?.model !== undefined ? { model: dto.model.trim() } : {}),
      ...(dto?.authHeader ? { authHeader: dto.authHeader } : {}),
      ...(dto?.apiKey ? { apiKey: dto.apiKey.trim() } : {}),
    };

    const started = Date.now();
    try {
      const res = await this.llm.chat(
        [
          { role: 'system', content: 'Reply with the single word: ok' },
          { role: 'user', content: 'ping' },
        ],
        { maxTokens: 16, temperature: 0, override: cfg },
      );
      const latencyMs = Date.now() - started;
      const result = {
        ok: true,
        message: `Responded in ${latencyMs}ms: "${res.content.trim().slice(0, 80)}"`,
        latencyMs,
        model: res.model,
      };
      await this.service.recordTest(result);
      return result;
    } catch (err) {
      const latencyMs = Date.now() - started;
      const result = {
        ok: false,
        message: (err as Error).message.slice(0, 300),
        latencyMs,
      };
      await this.service.recordTest(result);
      return result;
    }
  }
}
