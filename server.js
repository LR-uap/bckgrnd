const express = require('express');
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;
const backgroundsPath = path.join(__dirname, 'backgrounds');
const upload = multer();

async function removeWhiteBackground(image) {
  image.rgba(true);
  const threshold = 240;

  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    if (r > threshold && g > threshold && b > threshold) {
      this.bitmap.data[idx + 3] = 0;
    }
  });

  return image;
}

app.post('/add-bg-from-blob', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });

    let img = await Jimp.read(req.file.buffer);
    img = await removeWhiteBackground(img);

    const backgrounds = fs.readdirSync(backgroundsPath).filter(file => /\.(jpg|jpeg|png)$/i.test(file));
    const randomBg = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    const background = await Jimp.read(path.join(backgroundsPath, randomBg));

    background.resize(img.bitmap.width, img.bitmap.height);
    background.composite(img, 0, 0, {
      mode: Jimp.BLEND_SOURCE_OVER,
      opacitySource: 1,
      opacityDest: 1
    });

    const outputBuffer = await background.getBufferAsync(Jimp.MIME_PNG);
    res.set('Content-Type', 'image/png');
    res.send(outputBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('✅ NodeJS server is running (Jimp + random background)');
});

app.listen(PORT, () => {
  console.log(`🎨 Background server running on port ${PORT}`);
});
