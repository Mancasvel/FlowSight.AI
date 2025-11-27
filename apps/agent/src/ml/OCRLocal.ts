import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * OCRLocal: Extract text from screen using PaddleOCR
 * Runs locally, no cloud API calls
 */
export class OCRLocal {
  private isReady: boolean = false;
  private pythonScriptPath: string;

  constructor() {
    this.pythonScriptPath = this.createPythonScript();
  }

  async initialize(): Promise<void> {
    try {
      // Check if PaddleOCR is installed
      execSync('python3 -c "import paddleocr"', { stdio: 'ignore' });
      this.isReady = true;
    } catch {
      console.log('Installing PaddleOCR... Run: pip3 install paddlepaddle paddleocr');
      try {
        execSync('pip3 install paddlepaddle paddleocr', { stdio: 'inherit' });
        this.isReady = true;
      } catch (error) {
        console.error('Failed to install PaddleOCR:', error);
        this.isReady = false;
      }
    }
  }

  async extractText(imageBuffer: Buffer): Promise<{
    text: string;
    confidence: number;
    detectedLanguages: string[];
  }> {
    if (!this.isReady) {
      throw new Error('OCR not initialized. Run: pip3 install paddleocr');
    }

    try {
      // Save buffer to temporary file
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempImagePath = path.join(tempDir, `ocr_${Date.now()}.png`);
      fs.writeFileSync(tempImagePath, imageBuffer);

      // Execute OCR script
      const output = execSync(`python3 ${this.pythonScriptPath} "${tempImagePath}"`, {
        encoding: 'utf8',
        timeout: 30000, // 30 second timeout
      });

      // Clean up temp file
      try {
        fs.unlinkSync(tempImagePath);
      } catch (e) {
        // Ignore cleanup errors
      }

      const result = JSON.parse(output.trim());
      return {
        text: result.text || '',
        confidence: result.confidence || 0,
        detectedLanguages: result.languages || ['en'],
      };
    } catch (error) {
      console.error('OCR extraction error:', error);
      return {
        text: '',
        confidence: 0,
        detectedLanguages: [],
      };
    }
  }

  private createPythonScript(): string {
    const scriptPath = path.join(process.cwd(), 'scripts', 'ocr_processor.py');

    const scriptDir = path.dirname(scriptPath);
    if (!fs.existsSync(scriptDir)) {
      fs.mkdirSync(scriptDir, { recursive: true });
    }

    const scriptContent = `
import sys
import json
import os
from paddleocr import PaddleOCR

def extract_text(image_path):
    try:
        # Initialize OCR (download models on first run)
        ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)
        results = ocr.ocr(image_path, cls=True)

        text_lines = []
        total_confidence = 0
        count = 0

        if results:
            for line in results:
                if line:
                    for word_info in line:
                        if len(word_info) >= 2:
                            text = word_info[1][0] if isinstance(word_info[1], list) else str(word_info[1])
                            confidence = word_info[1][1] if isinstance(word_info[1], list) and len(word_info[1]) > 1 else 0.5
                            text_lines.append(text)
                            total_confidence += confidence
                            count += 1

        return {
            'text': ' '.join(text_lines),
            'confidence': total_confidence / count if count > 0 else 0,
            'languages': ['en']
        }
    except Exception as e:
        return {
            'text': '',
            'confidence': 0,
            'languages': [],
            'error': str(e)
        }

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(json.dumps({'error': 'Usage: python ocr_processor.py <image_path>'}))
        sys.exit(1)

    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        print(json.dumps({'error': 'Image file not found'}))
        sys.exit(1)

    result = extract_text(image_path)
    print(json.dumps(result))
`;

    fs.writeFileSync(scriptPath, scriptContent);
    return scriptPath;
  }

  public async isHealthy(): Promise<boolean> {
    try {
      execSync('python3 -c "import paddleocr; print(\'OK\')"', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  public async installDependencies(): Promise<boolean> {
    try {
      console.log('Installing PaddleOCR dependencies...');
      execSync('pip3 install paddlepaddle paddleocr', { stdio: 'inherit' });
      this.isReady = true;
      return true;
    } catch (error) {
      console.error('Failed to install OCR dependencies:', error);
      return false;
    }
  }
}
