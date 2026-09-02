import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';

import { loadConfig, AppConfig } from './config/configuration';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { LlmModule } from './llm/llm.module';
import { LlmConfigModule } from './llm-config/llm-config.module';
import { PromptsModule } from './prompts/prompts.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => loadConfig() as unknown as Record<string, unknown>],
      envFilePath: ['.env'],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        uri: config.get('mongoUri', { infer: true }) as string,
      }),
    }),
    AuthModule,
    LlmConfigModule,
    LlmModule,
    PromptsModule,
    EvaluationsModule,
  ],
  providers: [
    // Global: every route is authenticated unless it opts out with @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
