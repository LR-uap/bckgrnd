const express = require('express');
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { tmpdir } = require('os');
const { v4: uuidv4 } = require('uuid');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 10000;

const backgroundsPath = path.join(__dirname, 'backgrounds');
const upload = multer();

// Vérifie si l’URL correspond à une vidéo
function isVideo(url) {
  return /\.(mp4|webm|gif|tgs)$/i.test(url);
}

// Capture un screenshot aléatoire depuis une vidéo
async function captureScreenshotFromVideo(url) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(tmpdir(), `${uuidv4()}.png`);
    const randomPercent = Math.floor(Math.random() * 9) + 1;
    const tmstmp = `${randomPercent}0%`;
    ffmpeg(url)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .screenshots({
        timestamps: [tmstmp],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '800x?'
      });
  });
}

// Capture un screenshot depuis un .tgs (Lottie → PNG via puppeteer)
async function renderTgsToPng(tgsUrl) {
  const outputPath = path.join(tmpdir(), `${uuidv4()}.png`);
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  await page.setContent(`
    <html>
    <body style="margin:0; background:transparent;">
      <div id="lottie" style="width:512px;height:512px;"></div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.9.6/lottie.min.js"></script>
      <script>
        async function loadTgs() {
          const response = await fetch('${tgsUrl}');
          const buffer = await response.arrayBuffer();
          const jsonText = new TextDecoder().decode(buffer);
          const animationData = JSON.parse(jsonText);
          lottie.loadAnimation({
            container: document.getElementById('lottie'),
            renderer: 'canvas',
            loop: false,
            autoplay: true,
            animationData
          });
          setTimeout(() => window.screenshot(), 1000);
        }
        loadTgs();
      </script>
    </body>
    </html>
  `);

  await page.exposeFunction('screenshot', async () => {
    await page.screenshot({ path: outputPath, omitBackground: true });
    await browser.close();
  });

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (fs.existsSync(outputPath)) {
        resolve(outputPath);
      } else {
        reject(new Error('Failed to render TGS'));
      }
    }, 1500);
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

// === GET URL : vidéo ou image ===
app.get('/add-bg', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).json({ error: 'Missing image URL' });

    let img;
    if (isVideo(imageUrl)) {
      let screenshotPath;
      if (/\.tgs$/i.test(imageUrl)) {
        console.log('📥 TGS detected → Rendering screenshot...');
        screenshotPath = await renderTgsToPng(imageUrl);
      } else {
        console.log('📥 Video detected → Capturing screenshot...');
        screenshotPath = await captureScreenshotFromVideo(imageUrl);
      }
      img = await Jimp.read(screenshotPath);
      fs.unlink(screenshotPath, () => {}); // nettoyage
      // Note : PAS de fond aléatoire ici, juste renvoyer le PNG pur
      const buffer = await img.getBufferAsync(Jimp.MIME_PNG);
      res.set('Content-Type', 'image/png');
      return res.send(buffer);
    } else {
      img = await Jimp.read(imageUrl);
      const backgrounds = fs.readdirSync(backgroundsPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
      const randomBg = backgrounds[Math.floor(Math.random() * backgrounds.length)];
      const background = await Jimp.read(path.join(backgroundsPath, randomBg));
      const outputBuffer = await processImage(img, background);
      res.set('Content-Type', 'image/png');
      return res.send(outputBuffer);
    }
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
