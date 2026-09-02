import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { loadConfig, AppConfig } from './config/configuration';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { LlmModule } from './llm/llm.module';
import { PromptsModule } from './prompts/prompts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        () => {
          const cfg = loadConfig();
          return {
            port: cfg.port,
            nodeEnv: cfg.nodeEnv,
            mongoUri: cfg.mongoUri,
            uploadDir: cfg.uploadDir,
            tempDir: cfg.tempDir,
            llmProvider: cfg.llmProvider,
            minimax: cfg.minimax,
            openai: cfg.openai,
            ytDlpPath: cfg.ytDlpPath,
            ffmpegPath: cfg.ffmpegPath,
            maxUploadMb: cfg.maxUploadMb,
            maxTranscriptChars: cfg.maxTranscriptChars,
          } as AppConfig;
        },
      ],
      envFilePath: ['.env'],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        uri: config.get('mongoUri', { infer: true }) as string,
      }),
    }),
    LlmModule,
    PromptsModule,
    EvaluationsModule,
  ],
})
export class AppModule {}
