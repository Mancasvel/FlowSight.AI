#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

const MODELS_CONFIG = {
  'phi3-mini': {
    url: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct/resolve/main/model.safetensors',
    size: '7.6GB',
    description: 'Phi-3 mini model for Ollama'
  },
  'llava-phi': {
    url: 'https://huggingface.co/microsoft/llava-phi-3-mini/resolve/main/model.onnx',
    size: '2.1GB',
    description: 'LLaVA-Phi model for vision analysis'
  }
};

async function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let downloaded = 0;
    let totalSize = 0;

    const request = https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      totalSize = parseInt(response.headers['content-length'], 10);

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress) {
          onProgress(downloaded, totalSize);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    request.on('error', (err) => {
      fs.unlink(destPath, () => reject(err));
    });

    file.on('error', (err) => {
      fs.unlink(destPath, () => reject(err));
    });
  });
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function downloadModel(modelName, modelConfig) {
  const modelsDir = path.join(os.homedir(), '.flowsight', 'models');
  const modelDir = path.join(modelsDir, modelName);
  ensureDir(modelDir);

  const filename = path.basename(modelConfig.url);
  const destPath = path.join(modelDir, filename);

  if (fs.existsSync(destPath)) {
    console.log(`✅ ${modelName} already downloaded`);
    return;
  }

  console.log(`⬇️  Downloading ${modelName} (${modelConfig.size})...`);
  console.log(`   ${modelConfig.description}`);

  try {
    await downloadFile(modelConfig.url, destPath, (downloaded, total) => {
      if (total > 0) {
        const percent = ((downloaded / total) * 100).toFixed(1);
        process.stdout.write(`\r   Progress: ${percent}% (${(downloaded / 1024 / 1024).toFixed(1)}MB)`);
      }
    });

    console.log(`\n✅ ${modelName} downloaded successfully`);
  } catch (error) {
    console.error(`❌ Failed to download ${modelName}:`, error.message);
  }
}

async function main() {
  console.log('🚀 FlowSight AI - Model Downloader');
  console.log('===================================\n');

  const modelsToDownload = process.argv.slice(2);

  if (modelsToDownload.length === 0) {
    console.log('Available models:');
    Object.entries(MODELS_CONFIG).forEach(([name, config]) => {
      console.log(`  ${name}: ${config.description} (${config.size})`);
    });
    console.log('\nUsage: npm run download:models [model1] [model2] ...');
    console.log('Example: npm run download:models phi3-mini llava-phi');
    return;
  }

  for (const modelName of modelsToDownload) {
    if (MODELS_CONFIG[modelName]) {
      await downloadModel(modelName, MODELS_CONFIG[modelName]);
    } else {
      console.log(`❌ Unknown model: ${modelName}`);
    }
  }

  console.log('\n🎉 Model download complete!');
  console.log('You can now run the FlowSight agent.');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { downloadModel, MODELS_CONFIG };




