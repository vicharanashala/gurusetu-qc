import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LlmConfig, LlmConfigSchema } from './schemas/llm-config.schema';
import { LlmConfigService } from './llm-config.service';
import { LlmConfigController } from './llm-config.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LlmConfig.name, schema: LlmConfigSchema },
    ]),
  ],
  controllers: [LlmConfigController],
  providers: [LlmConfigService],
  exports: [LlmConfigService],
})
export class LlmConfigModule {}
