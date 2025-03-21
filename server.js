const express = require('express');
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;

const backgroundsPath = path.join(__dirname, 'backgrounds');
const upload = multer();

app.get('/add-bg', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).json({ error: 'Missing image URL' });

    const img = await Jimp.read(imageUrl);
    const backgrounds = fs.readdirSync(backgroundsPath).filter(file => /\.(jpg|jpeg|png)$/i.test(file));
    const randomBg = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    const bgPath = path.join(backgroundsPath, randomBg);
    const background = await Jimp.read(bgPath);

    const { width: targetW, height: targetH } = img.bitmap;
    const ratioBg = background.bitmap.width / background.bitmap.height;
    const ratioTarget = targetW / targetH;

    if (ratioBg > ratioTarget) {
      background.resize(Jimp.AUTO, targetH);
      const offsetX = background.bitmap.width - targetW;
      background.crop(offsetX, 0, targetW, targetH);
    } else {
      background.resize(targetW, Jimp.AUTO);
      const offsetY = background.bitmap.height - targetH;
      background.crop(0, offsetY, targetW, targetH);
    }

    background.composite(img, 0, 0, {
      mode: Jimp.BLEND_SOURCE_OVER,
      opacitySource: 1,
      opacityDest: 1
    });

    background.resize(background.bitmap.width * 2, background.bitmap.height * 2);

    const outputBuffer = await background.getBufferAsync(Jimp.MIME_PNG);
    res.set('Content-Type', 'image/png');
    res.send(outputBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/add-bg-from-blob', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });

    const img = await Jimp.read(req.file.buffer);
    const backgrounds = fs.readdirSync(backgroundsPath).filter(file => /\.(jpg|jpeg|png)$/i.test(file));
    const randomBg = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    const bgPath = path.join(backgroundsPath, randomBg);
    const background = await Jimp.read(bgPath);

    const { width: targetW, height: targetH } = img.bitmap;
    const ratioBg = background.bitmap.width / background.bitmap.height;
    const ratioTarget = targetW / targetH;

    if (ratioBg > ratioTarget) {
      background.resize(Jimp.AUTO, targetH);
      const offsetX = background.bitmap.width - targetW;
      background.crop(offsetX, 0, targetW, targetH);
    } else {
      background.resize(targetW, Jimp.AUTO);
      const offsetY = background.bitmap.height - targetH;
      background.crop(0, offsetY, targetW, targetH);
    }

    background.composite(img, 0, 0, {
      mode: Jimp.BLEND_SOURCE_OVER,
      opacitySource: 1,
      opacityDest: 1
    });

    background.resize(background.bitmap.width * 2, background.bitmap.height * 2);

    const outputBuffer = await background.getBufferAsync(Jimp.MIME_PNG);
    res.set('Content-Type', 'image/png');
    res.send(outputBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Background API running on port ${PORT}`);
});
