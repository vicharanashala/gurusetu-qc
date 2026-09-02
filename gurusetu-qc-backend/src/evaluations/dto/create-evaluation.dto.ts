import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { EvaluationSourceType } from '../schemas/evaluation.schema';

export class CreateTextEvaluationDto {
  @IsEnum(EvaluationSourceType)
  sourceType!: EvaluationSourceType;

  @IsString()
  @MaxLength(180000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsString({ each: true })
  tags?: string[];
}

export class CreateYoutubeEvaluationDto {
  @IsEnum(EvaluationSourceType)
  sourceType!: EvaluationSourceType;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsString({ each: true })
  tags?: string[];
}
