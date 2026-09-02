import { Module, Global } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LlmConfigModule } from '../llm-config/llm-config.module';

@Global()
@Module({
  imports: [LlmConfigModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
