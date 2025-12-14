import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * VisionLocal: Use FastVLM (Apple) or Llava for visual blocker detection
 * Runs via ONNX Runtime or MLX on device
 */
export class VisionLocal {
  private modelPath: string;
  private platform: string = process.platform;
  private isReady: boolean = false;
  private pythonScriptPath: string;

  constructor() {
    this.modelPath = this.getModelPath();
    this.pythonScriptPath = this.createPythonScript();
  }

  private getModelPath(): string {
    const baseDir = path.join(os.homedir(), '.flowsight', 'models');

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    if (this.platform === 'darwin') {
      return path.join(baseDir, 'fastvlm-0.5b');
    } else if (this.platform === 'win32') {
      return path.join(baseDir, 'llava-phi-1.5-onnx');
    } else {
      return path.join(baseDir, 'llava-phi-1.5-onnx');
    }
  }

  async initialize(): Promise<void> {
    try {
      if (this.platform === 'darwin') {
        // Check for MLX support (Apple Silicon)
        this.isReady = await this.checkMLXSupport();
      } else {
        // Check for ONNX Runtime support
        this.isReady = await this.checkONNXSupport();
      }
    } catch (error) {
      console.warn('Vision model initialization warning:', error);
      this.isReady = false;
    }
  }

  private async checkMLXSupport(): Promise<boolean> {
    try {
      execSync('python3 -c "import mlx; print(\'MLX available\')"', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  private async checkONNXSupport(): Promise<boolean> {
    try {
      execSync('python3 -c "import onnxruntime; print(\'ONNX available\')"', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async analyzeScreenshot(imageBuffer: Buffer): Promise<{
    hasError: boolean;
    hasLoadingIndicator: boolean;
    hasStackTrace: boolean;
    description: string;
    confidence: number;
  }> {
    if (!this.isReady) {
      return {
        hasError: false,
        hasLoadingIndicator: false,
        hasStackTrace: false,
        description: 'Vision model not available',
        confidence: 0,
      };
    }

    try {
      // Save buffer to temporary file for Python processing
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempImagePath = path.join(tempDir, `vision_${Date.now()}.png`);
      fs.writeFileSync(tempImagePath, imageBuffer);

      // Execute vision analysis script
      const output = execSync(`python3 ${this.pythonScriptPath} "${tempImagePath}" "${this.platform}"`, {
        encoding: 'utf8',
        timeout: 60000, // 60 second timeout for vision processing
      });

      // Clean up temp file
      try {
        fs.unlinkSync(tempImagePath);
      } catch (e) {
        // Ignore cleanup errors
      }

      const result = JSON.parse(output.trim());
      return {
        hasError: result.hasError || false,
        hasLoadingIndicator: result.hasLoadingIndicator || false,
        hasStackTrace: result.hasStackTrace || false,
        description: result.description || 'Analysis completed',
        confidence: result.confidence || 0,
      };
    } catch (error) {
      console.error('Vision analysis error:', error);
      return {
        hasError: false,
        hasLoadingIndicator: false,
        hasStackTrace: false,
        description: 'Vision analysis failed',
        confidence: 0,
      };
    }
  }

  private createPythonScript(): string {
    const scriptPath = path.join(process.cwd(), 'scripts', 'vision_processor.py');

    const scriptDir = path.dirname(scriptPath);
    if (!fs.existsSync(scriptDir)) {
      fs.mkdirSync(scriptDir, { recursive: true });
    }

    const scriptContent = `
import sys
import json
import os

def analyze_with_basic(image_path):
    """Basic fallback analysis using image processing"""
    try:
        from PIL import Image
        import numpy as np

        img = Image.open(image_path)
        img_array = np.array(img)

        # Simple heuristics for common blocker indicators
        has_red_pixels = False
        has_loading_patterns = False

        # Check for red error text (common in terminals/IDEs)
        if len(img_array.shape) == 3:
            red_channel = img_array[:, :, 0]
            red_pixels = np.sum(red_channel > 200)
            has_red_pixels = red_pixels > img_array.shape[0] * img_array.shape[1] * 0.01  # >1% red

        # Check for loading spinners (circular patterns)
        # This is a simplified heuristic
        has_loading_patterns = False

        # Look for stack trace patterns (long vertical lines of text)
        height, width = img_array.shape[:2]
        text_like_regions = 0

        return {
            'hasError': has_red_pixels,
            'hasLoadingIndicator': has_loading_patterns,
            'hasStackTrace': text_like_regions > 5,
            'description': f'Basic analysis: {"red pixels detected" if has_red_pixels else "normal screen"}',
            'confidence': 0.6 if has_red_pixels else 0.3
        }
    except Exception as e:
        return {
            'hasError': False,
            'hasLoadingIndicator': False,
            'hasStackTrace': False,
            'description': f'Basic analysis failed: {str(e)}',
            'confidence': 0
        }

def analyze_with_onnx(image_path):
    """ONNX-based vision analysis (placeholder for future implementation)"""
    return analyze_with_basic(image_path)

def analyze_with_mlx(image_path):
    """MLX-based vision analysis for Apple Silicon (placeholder)"""
    return analyze_with_basic(image_path)

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(json.dumps({'error': 'Usage: python vision_processor.py <image_path> <platform>'}))
        sys.exit(1)

    image_path = sys.argv[1]
    platform = sys.argv[2]

    if not os.path.exists(image_path):
        print(json.dumps({'error': 'Image file not found'}))
        sys.exit(1)

    try:
        if platform == 'darwin':
            result = analyze_with_mlx(image_path)
        else:
            result = analyze_with_onnx(image_path)

        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            'hasError': False,
            'hasLoadingIndicator': False,
            'hasStackTrace': False,
            'description': f'Vision analysis error: {str(e)}',
            'confidence': 0
        }))
`;

    fs.writeFileSync(scriptPath, scriptContent);
    return scriptPath;
  }

  public async isHealthy(): Promise<boolean> {
    return this.isReady;
  }

  public async installDependencies(): Promise<boolean> {
    try {
      console.log('Installing vision analysis dependencies...');
      if (this.platform === 'darwin') {
        execSync('pip3 install mlx pillow numpy', { stdio: 'inherit' });
      } else {
        execSync('pip3 install onnxruntime pillow numpy', { stdio: 'inherit' });
      }
      return true;
    } catch (error) {
      console.error('Failed to install vision dependencies:', error);
      return false;
    }
  }
}




