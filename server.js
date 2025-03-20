const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const app = express();
const upload = multer();
const PORT = process.env.PORT || 10000;

const backgroundsPath = path.join(__dirname, 'backgrounds');

app.get('/add-bg', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).json({ error: 'Missing image URL' });

    const img = await Jimp.read(imageUrl);

    const backgrounds = fs.readdirSync(backgroundsPath).filter(file => /\.(jpg|jpeg|png)$/i.test(file));
    const randomBg = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    const bgPath = path.join(backgroundsPath, randomBg);
    const background = await Jimp.read(bgPath);

    background.resize(img.bitmap.width, img.bitmap.height);
    background.composite(img, 0, 0, { mode: Jimp.BLEND_SOURCE_OVER });

    const buffer = await background.getBufferAsync(Jimp.MIME_PNG);
    res.set('Content-Type', 'image/png');
    res.send(buffer);

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

    background.resize(img.bitmap.width, img.bitmap.height);
    background.composite(img, 0, 0, { mode: Jimp.BLEND_SOURCE_OVER });

    const buffer = await background.getBufferAsync(Jimp.MIME_PNG);
    res.set('Content-Type', 'image/png');
    res.send(buffer);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Background API running on port ${PORT}`);
});