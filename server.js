const express = require('express');
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { tmpdir } = require('os');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 10000;

const backgroundsPath = path.join(__dirname, 'backgrounds');
const upload = multer();

// Vérifie si l’URL correspond à une vidéo
function isVideo(url) {
  return /\.(mp4|webm|gif)$/i.test(url);
}

// Capture un screenshot aléatoire depuis une vidéo
async function captureScreenshotFromVideo(url) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(tmpdir(), `${uuidv4()}.png`);
    const randomSec = Math.floor(Math.random() * 4) + 1; // Random timestamp between 1 and 5 seconds
    ffmpeg(url)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .screenshots({
        timestamps: ['50%'],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '800x?'
      });
  });
}

// Bounding box verticale utile (non transparent)
function getContentBoundingBox(image) {
  const { width, height, data } = image.bitmap;
  let top = height, bottom = 0;
  for (let y = 0; y < height; y++) {
    let hasContent = false;
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const alpha = data[idx + 3];
      if (alpha > 10) {
        hasContent = true;
        break;
      }
    }
    if (hasContent) {
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { top, bottom };
}

// Traitement image avec fond
async function processImage(img, background) {
  const { width: targetW, height: targetH } = img.bitmap;
  const bbox = getContentBoundingBox(img);
  const contentHeight = bbox.bottom - bbox.top + 1;
  const paddingBottom = targetH - bbox.bottom - 1;
  const paddingTop = bbox.top;

  if (paddingBottom > paddingTop) {
    const newCanvas = new Jimp(targetW, targetH, 0x00000000);
    const cropped = img.clone().crop(0, bbox.top, targetW, contentHeight);
    const offsetY = paddingBottom - paddingTop;
    newCanvas.composite(cropped, 0, offsetY);
    img = newCanvas;
  }

  const ratioBg = background.bitmap.width / background.bitmap.height;
  const ratioTarget = targetW / targetH;

  if (ratioBg > ratioTarget) {
    background.resize(Jimp.AUTO, targetH);
    const offsetX = background.bitmap.width - targetW;
    background.crop(offsetX, 0, targetW, targetH);
  } else {
    background.resize(targetW, Jimp.AUTO);
    background.crop(0, 0, targetW, targetH);
  }

  background.composite(img, 0, 0, {
    mode: Jimp.BLEND_SOURCE_OVER,
    opacitySource: 1,
    opacityDest: 1
  });

  return background.getBufferAsync(Jimp.MIME_PNG);
}

// === GET URL : video ou image ===
app.get('/add-bg', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).json({ error: 'Missing image URL' });

    let img;
    if (isVideo(imageUrl)) {
      const screenshotPath = await captureScreenshotFromVideo(imageUrl);
      img = await Jimp.read(screenshotPath);
      fs.unlink(screenshotPath, () => {}); // nettoyage temporaire
    } else {
      img = await Jimp.read(imageUrl);
    }

    const backgrounds = fs.readdirSync(backgroundsPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    const randomBg = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    const background = await Jimp.read(path.join(backgroundsPath, randomBg));

    const outputBuffer = await processImage(img, background);
    res.set('Content-Type', 'image/png');
    res.send(outputBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// === POST blob ===
app.post('/add-bg-from-blob', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const img = await Jimp.read(req.file.buffer);
    const backgrounds = fs.readdirSync(backgroundsPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    const randomBg = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    const background = await Jimp.read(path.join(backgroundsPath, randomBg));

    const outputBuffer = await processImage(img, background);
    res.set('Content-Type', 'image/png');
    res.send(outputBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Background API running on port ${PORT}`);
});
