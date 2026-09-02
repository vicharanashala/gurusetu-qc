import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  EvaluationSourceType,
  EvaluationStatus,
} from '../schemas/evaluation.schema';

export class QueryEvaluationDto {
  @IsOptional()
  @IsEnum(EvaluationStatus)
  status?: EvaluationStatus;

  @IsOptional()
  @IsEnum(EvaluationSourceType)
  sourceType?: EvaluationSourceType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
