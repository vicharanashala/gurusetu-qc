import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { EvaluationsService } from './evaluations.service';
import {
  CreateTextEvaluationDto,
  CreateYoutubeEvaluationDto,
} from './dto/create-evaluation.dto';
import { QueryEvaluationDto } from './dto/query-evaluation.dto';
import { EvaluationSourceType } from './schemas/evaluation.schema';

@Controller('evaluations')
export class EvaluationsController {
  constructor(
    private readonly service: EvaluationsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Create an evaluation from raw text.
   */
  @Post('text')
  @HttpCode(HttpStatus.ACCEPTED)
  async fromText(@Body() dto: CreateTextEvaluationDto) {
    const evaluation = await this.service.createFromText({ dto });
    return this.present(evaluation);
  }

  /**
   * Create an evaluation from a YouTube URL.
   */
  @Post('youtube')
  @HttpCode(HttpStatus.ACCEPTED)
  async fromYoutube(@Body() dto: CreateYoutubeEvaluationDto) {
    const evaluation = await this.service.createFromYoutube({ dto });
    return this.present(evaluation);
  }

  /**
   * Create an evaluation from an uploaded file (audio, video, or text).
   * multipart/form-data with `file` field.
   */
  @Post('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file'))
  async fromUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title?: string,
    @Body('language') language?: string,
    @Body('createdBy') createdBy?: string,
    @Body('tags') tags?: string,
  ) {
    const parsedTags = tags
      ? tags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;
    const evaluation = await this.service.createFromFile({
      file,
      title,
      language,
      createdBy,
      tags: parsedTags,
    });
    return this.present(evaluation);
  }

  @Get()
  async list(@Query() query: QueryEvaluationDto) {
    const result = await this.service.list(query);
    return {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      items: result.items.map((e) => this.present(e)),
    };
  }

  @Get('stats')
  async stats() {
    return this.service.stats();
  }

  @Get(':evaluationId')
  async get(@Param('evaluationId') evaluationId: string) {
    const evaluation = await this.service.findOne(evaluationId);
    return this.present(evaluation);
  }

  @Post(':evaluationId/rerun')
  @HttpCode(HttpStatus.ACCEPTED)
  async rerun(@Param('evaluationId') evaluationId: string) {
    const evaluation = await this.service.rerun(evaluationId);
    return this.present(evaluation);
  }

  @Delete(':evaluationId')
  async remove(@Param('evaluationId') evaluationId: string) {
    return this.service.remove(evaluationId);
  }

  // ===== Helpers =====

  private present(doc: any) {
    const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    // surface only the most useful fields; keep raw documents out of the response
    const { _id, __v, ...rest } = o;
    return {
      ...rest,
      progress: rest.progressPercent,
    };
  }
}
