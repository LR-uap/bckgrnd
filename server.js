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

function isVideo(url) {
  return /\.(mp4|webm|gif)$/i.test(url);
}

async function captureScreenshotFromVideoFile(inputPath) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(tmpdir(), `${uuidv4()}.png`);
    const randomPercent = Math.floor(Math.random() * 9) + 1;
    const timestamp = `${randomPercent}0%`;

    ffmpeg(inputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '800x?'
      });
  });
}

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

  const bgRatio = background.bitmap.width / background.bitmap.height;
  const targetRatio = targetW / targetH;

  if (bgRatio > targetRatio) {
    background.resize(Jimp.AUTO, targetH);
    const cropX = background.bitmap.width - targetW;
    background.crop(cropX, 0, targetW, targetH);
  } else {
    background.resize(targetW, Jimp.AUTO);
    const cropY = 0;
    const cropHeight = targetH;
    background.crop(0, cropY, targetW, cropHeight);
  }

  background.composite(img, 0, 0, {
    mode: Jimp.BLEND_SOURCE_OVER,
    opacitySource: 1,
    opacityDest: 1
  });

  return background.getBufferAsync(Jimp.MIME_PNG);
}

app.get('/add-bg', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).json({ error: 'Missing image URL' });
    if (isVideo(imageUrl)) return res.status(400).json({ error: 'Videos are not supported in /add-bg' });

    const img = await Jimp.read(imageUrl);
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

app.get('/screenshot', async (req, res) => {
  try {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: 'Missing video URL' });
    if (!isVideo(videoUrl)) return res.status(400).json({ error: 'Only videos are supported in /screenshot' });

    console.log(`[INFO] Capturing screenshot from video: ${videoUrl}`);
    const screenshotPath = await captureScreenshotFromVideo(videoUrl);
    const img = await Jimp.read(screenshotPath);

    res.set('Content-Type', 'image/png');
    res.send(await img.getBufferAsync(Jimp.MIME_PNG));

    fs.unlink(screenshotPath, () => {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Nouvelle route : screenshot depuis un blob vidéo
app.post('/screenshot-from-blob', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });

    const tempInputPath = path.join(tmpdir(), `${uuidv4()}.webm`); // ou .mp4/.gif selon ton besoin
    fs.writeFileSync(tempInputPath, req.file.buffer);

    const screenshotPath = await captureScreenshotFromVideoFile(tempInputPath);
    const img = await Jimp.read(screenshotPath);

    res.set('Content-Type', 'image/png');
    res.send(await img.getBufferAsync(Jimp.MIME_PNG));

    fs.unlink(tempInputPath, () => {});
    fs.unlink(screenshotPath, () => {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

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

// ✅ Suppression du fond via blob
app.post('/remove-bg-from-blob', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const image = await Jimp.read(req.file.buffer);
    image.background(0x00000000);

    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
      const red = this.bitmap.data[idx + 0];
      const green = this.bitmap.data[idx + 1];
      const blue = this.bitmap.data[idx + 2];
      const alpha = this.bitmap.data[idx + 3];

      if (red > 240 && green > 240 && blue > 240 && alpha > 200) {
        this.bitmap.data[idx + 3] = 0;
      }
    });

    res.set('Content-Type', 'image/png');
    res.send(await image.getBufferAsync(Jimp.MIME_PNG));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/ping', (req, res) => {
  res.status(200).json({ message: 'Server is alive' });
});

app.listen(PORT, () => {
  console.log(`✅ Background API running on port ${PORT}`);
});
