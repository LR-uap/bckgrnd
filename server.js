const express = require('express');
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;

const backgroundsPath = path.join(__dirname, 'backgrounds');
const upload = multer();

// Détecte la bounding box verticale utile de l’image (pixels non transparents)
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

// Fonction utilitaire : traitement d’image
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

  // Resize background proportionnellement
  if (ratioBg > ratioTarget) {
    background.resize(Jimp.AUTO, targetH);
    const offsetX = background.bitmap.width - targetW;
    background.crop(offsetX, 0, targetW, targetH);
  } else {
    background.resize(targetW, Jimp.AUTO);
    background.crop(0, 0, targetW, targetH);
  }

  // Composite image sur le fond
  background.composite(img, 0, 0, {
    mode: Jimp.BLEND_SOURCE_OVER,
    opacitySource: 1,
    opacityDest: 1
  });

  return background.getBufferAsync(Jimp.MIME_PNG);
}

// === GET avec image par URL ===
app.get('/add-bg', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).json({ error: 'Missing image URL' });

    const img = await Jimp.read(imageUrl);
    const backgrounds = fs.readdirSync(backgroundsPath).filter(file => /\.(jpg|jpeg|png)$/i.test(file));
    const randomBg = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    const background = await Jimp.read(path.join(backgroundsPath, randomBg));

    const outputBuffer = await processImage(img, background);
    res.set('Content-Type', 'image/png');
    res.send(outputBuffer);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === POST avec image par blob (upload direct) ===
app.post('/add-bg-from-blob', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });

    const img = await Jimp.read(req.file.buffer);
    const backgrounds = fs.readdirSync(backgroundsPath).filter(file => /\.(jpg|jpeg|png)$/i.test(file));
    const randomBg = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    const background = await Jimp.read(path.join(backgroundsPath, randomBg));

    const outputBuffer = await processImage(img, background);
    res.set('Content-Type', 'image/png');
    res.send(outputBuffer);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Background API running on port ${PORT}`);
});
