import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PromptConfig, PromptConfigSchema } from './schemas/prompt-config.schema';
import { PromptRevision, PromptRevisionSchema } from './schemas/prompt-revision.schema';
import { PromptsService } from './prompts.service';
import { PromptsController } from './prompts.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PromptConfig.name, schema: PromptConfigSchema },
      { name: PromptRevision.name, schema: PromptRevisionSchema },
    ]),
  ],
  controllers: [PromptsController],
  providers: [PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}
