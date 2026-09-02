import { YoutubeService } from '../src/youtube/youtube.service';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../src/config/configuration';

describe('YoutubeService.extractVideoId', () => {
  let svc: YoutubeService;

  beforeAll(() => {
    svc = new YoutubeService({
      get: (k: keyof AppConfig) => '/opt/homebrew/bin/yt-dlp' as any,
    } as unknown as ConfigService<AppConfig, true>);
  });

  const cases: Array<[string, string]> = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ];

  it.each(cases)('extracts %s -> %s', (url, expected) => {
    expect(svc.extractVideoId(url)).toBe(expected);
  });

  it('throws on invalid URLs', () => {
    expect(() => svc.extractVideoId('https://example.com')).toThrow(/Could not extract/);
  });
});
