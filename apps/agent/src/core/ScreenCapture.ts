import { desktopCapturer, ipcMain } from 'electron';
import sharp from 'sharp';
import crypto from 'crypto';

/**
 * ScreenCapture handles screenshots LOCALLY and INSTANTLY discards the image
 * after extracting metadata. No storage, no transmission.
 */
export class ScreenCapture {
  private lastHash: string = '';
  private debounceMs: number = 3000;
  private lastCaptureTime: number = 0;

  public async captureAndAnalyze(): Promise<{
    changed: boolean;
    hash: string;
    metadata: { width: number; height: number; colors: number };
  }> {
    const now = Date.now();

    // Debounce rapid captures
    if (now - this.lastCaptureTime < this.debounceMs) {
      return { changed: false, hash: this.lastHash, metadata: {} as any };
    }

    try {
      // Get display stream
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 }
      });

      if (sources.length === 0) throw new Error('No display sources available');

      const source = sources[0];
      if (!source.thumbnail) throw new Error('No thumbnail available');

      // Convert thumbnail to buffer (stays in memory, never written to disk)
      const thumbnail = source.thumbnail;
      const buffer = thumbnail.toPNG();

      // Hash immediately (for change detection)
      const hash = crypto.createHash('md5').update(buffer).digest('hex');
      const changed = hash !== this.lastHash;
      this.lastHash = hash;

      // CRITICAL: Extract metadata ONLY, then instantly free memory
      const image = sharp(buffer);
      const metadata = await image.metadata();

      // Clean up - overwrite buffer in memory
      buffer.fill(0);

      this.lastCaptureTime = now;

      return {
        changed,
        hash,
        metadata: {
          width: metadata.width || 0,
          height: metadata.height || 0,
          colors: metadata.hasAlpha ? 4 : 3,
        },
      };
    } catch (error) {
      console.error('ScreenCapture error:', error);
      return { changed: false, hash: this.lastHash, metadata: {} as any };
    }
  }

  public async captureForAnalysis(): Promise<{
    buffer: Buffer;
    metadata: { width: number; height: number; colors: number };
  } | null> {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 }
      });

      if (sources.length === 0 || !sources[0].thumbnail) {
        return null;
      }

      const thumbnail = sources[0].thumbnail;
      const buffer = thumbnail.toPNG();
      const image = sharp(buffer);
      const metadata = await image.metadata();

      return {
        buffer,
        metadata: {
          width: metadata.width || 0,
          height: metadata.height || 0,
          colors: metadata.hasAlpha ? 4 : 3,
        },
      };
    } catch (error) {
      console.error('ScreenCapture error:', error);
      return null;
    }
  }
}

// IPC handler: Dashboard requests screenshot analysis
ipcMain.handle('screenshot:analyze', async () => {
  const capturer = new ScreenCapture();
  return capturer.captureAndAnalyze();
});

ipcMain.handle('screenshot:capture', async () => {
  const capturer = new ScreenCapture();
  return capturer.captureForAnalysis();
});
