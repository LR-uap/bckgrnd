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

// Vérifie si une URL est une vidéo (MP4, GIF, WEBM)
function isVideo(url) {
  return /\.(mp4|webm|gif)$/i.test(url);
}

// Capture un screenshot d'une vidéo à un moment aléatoire
async function captureScreenshotFromVideo(url) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(tmpdir(), `${uuidv4()}.png`);
    const randomPercent = Math.floor(Math.random() * 9) + 1;
    const timestamp = `${randomPercent}0%`;

    ffmpeg(url)
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

// Ajoute un fond aléatoire à une image
async function processImage(img, background) {
  const { width: targetW, height: targetH } = img.bitmap;
  
  // Redimensionne le fond pour correspondre à la taille de l'image
  background.resize(targetW, Jimp.AUTO);
  background.crop(0, 0, targetW, targetH);

  background.composite(img, 0, 0, {
    mode: Jimp.BLEND_SOURCE_OVER,
    opacitySource: 1,
    opacityDest: 1
  });

  return background.getBufferAsync(Jimp.MIME_PNG);
}

// === ROUTE 1 : Ajoute un fond aux images UNIQUEMENT ===
app.get('/add-bg', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).json({ error: 'Missing image URL' });

    // ❌ On ne traite PAS les vidéos ici, on les ignore
    if (isVideo(imageUrl)) {
      return res.status(400).json({ error: 'Videos are not supported in /add-bg' });
    }

    const img = await Jimp.read(imageUrl);

    // Sélectionne un fond aléatoire
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

// === ROUTE 2 : Screenshot d'une vidéo SEULEMENT ===
app.get('/screenshot', async (req, res) => {
  try {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: 'Missing video URL' });

    // ❌ On ne traite QUE les vidéos ici
    if (!isVideo(videoUrl)) {
      return res.status(400).json({ error: 'Only videos are supported in /screenshot' });
    }

    console.log(`[INFO] Capturing screenshot from video: ${videoUrl}`);
    const screenshotPath = await captureScreenshotFromVideo(videoUrl);
    const img = await Jimp.read(screenshotPath);

    // ✅ Envoie le screenshot brut, sans fond
    res.set('Content-Type', 'image/png');
    res.send(await img.getBufferAsync(Jimp.MIME_PNG));

    // Nettoyage du fichier temporaire
    fs.unlink(screenshotPath, () => {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// === ROUTE 3 : Ajout de fond à un fichier image (POST) ===
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

// === ROUTE 4 : Ping pour garder le serveur actif ===
app.get('/ping', (req, res) => {
  res.status(200).json({ message: 'Server is alive' });
});

app.listen(PORT, () => {
  console.log(`✅ Background API running on port ${PORT}`);
});
