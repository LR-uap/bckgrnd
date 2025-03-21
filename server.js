const express = require('express');
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;

const backgroundsPath = path.join(__dirname, 'backgrounds');
const upload = multer();

// Fonction utilitaire : traitement d’image
async function processImage(img, background) {
  const { width: targetW, height: targetH } = img.bitmap;
  const ratioBg = background.bitmap.width / background.bitmap.height;
  const ratioTarget = targetW / targetH;

  // ✅ Resize background proportionally (conserve ratio)
  if (ratioBg > ratioTarget) {
    // Fond plus large → adapter hauteur
    background.resize(Jimp.AUTO, targetH);
    const offsetX = background.bitmap.width - targetW; // aligner à droite
    background.crop(offsetX, 0, targetW, targetH);     // couper à gauche
  } else {
    // Fond plus haut → adapter largeur
    background.resize(targetW, Jimp.AUTO);
    const offsetY = 0; // top alignment uniquement
    background.crop(0, offsetY, targetW, targetH);     // couper en bas si besoin
  }

  // ✅ Superposer l’image en haut à droite
  background.composite(img, 0, 0, {
    mode: Jimp.BLEND_SOURCE_OVER,
    opacitySource: 1,
    opacityDest: 1
  });

  // ✅ Agrandir image finale ×2
  //background.resize(background.bitmap.width * 2, background.bitmap.height * 2);

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
