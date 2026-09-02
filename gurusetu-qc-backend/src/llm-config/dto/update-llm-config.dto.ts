import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateLlmConfigDto {
  @IsIn(['anthropic', 'openai', 'mock'])
  protocol!: 'anthropic' | 'openai' | 'mock';

  @IsOptional() @IsString() @MaxLength(120)
  label?: string;

  @IsOptional() @IsString() @MaxLength(500)
  baseUrl?: string;

  @IsOptional() @IsString() @MaxLength(200)
  model?: string;

  /**
   * Omit to keep the stored key unchanged; send '' to clear it. This is what
   * lets the UI show a masked key without ever round-tripping the real one.
   */
  @IsOptional() @IsString() @MaxLength(500)
  apiKey?: string;

  @IsOptional() @IsIn(['x-api-key', 'bearer'])
  authHeader?: 'x-api-key' | 'bearer';

  @IsOptional() @IsNumber() @Min(256) @Max(200000)
  maxTokens?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(2)
  temperature?: number;

  @IsOptional() @IsBoolean()
  thinkingEnabled?: boolean;
}
