import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePromptDto {
  @IsString()
  @MinLength(100)
  @MaxLength(60_000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  versionLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  editedBy?: { id?: string; name?: string };

  /**
   * When true, the caller is asking us to forget the saved override and
   * re-seed with the bundled default. Body content is ignored.
   */
  @IsOptional()
  @IsBoolean()
  reset?: boolean;
}
