import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppConfig } from './config/configuration';
import { mkdirSync } from 'fs';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const config = app.get(ConfigService<AppConfig, true>);

  // Ensure required directories exist
  const uploadDir = config.get('uploadDir', { infer: true });
  const tempDir = config.get('tempDir', { infer: true });
  mkdirSync(uploadDir, { recursive: true });
  mkdirSync(tempDir, { recursive: true });

  // Body parsers — re-configure with a generous limit (default is 100kb).
  // Express's json/urlencoded parsers automatically skip multipart/form-data,
  // so they coexist cleanly with multer on the upload route.
  app.useBodyParser('json', { limit: '25mb' });
  app.useBodyParser('urlencoded', { limit: '25mb', extended: true });
  // multer (multipart) is wired per-route via @UseInterceptors(FileInterceptor).

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Root info endpoint
  app.getHttpAdapter().get('/health', (_req: any, res: any) => {
    res.json({
      status: 'ok',
      service: 'gurusetu-qc-backend',
      time: new Date().toISOString(),
    });
  });

  const port = config.get('port', { infer: true }) as number;
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 GuruSetu QC backend listening on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
