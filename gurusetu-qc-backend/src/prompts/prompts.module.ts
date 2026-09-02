import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PromptConfig, PromptConfigSchema } from './schemas/prompt-config.schema';
import { PromptsService } from './prompts.service';
import { PromptsController } from './prompts.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PromptConfig.name, schema: PromptConfigSchema },
    ]),
  ],
  controllers: [PromptsController],
  providers: [PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}
