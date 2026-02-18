const fileInput = document.getElementById("fileInput");
const modeSelect = document.getElementById("modeSelect");
const colorModeSelect = document.getElementById("colorModeSelect");
const themeColorInput = document.getElementById("themeColorInput");
const scaleRange = document.getElementById("scaleRange");
const levelsRange = document.getElementById("levelsRange");
const contrastRange = document.getElementById("contrastRange");
const textureRange = document.getElementById("textureRange");
const renderBtn = document.getElementById("renderBtn");
const resetBtn = document.getElementById("resetBtn");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusEl = document.getElementById("status");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const defaults = {
  mode: "dot",
  colorMode: "mono",
  themeColor: "#c74634",
  scale: 8,
  levels: 2,
  contrast: 110,
  texture: 55,
};

let sourceImage = null;
let sourceFilename = "";

function setStatus(text) {
  statusEl.textContent = text;
}

function readAsImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Unable to decode image."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function quantize(value, levels) {
  const step = 255 / (levels - 1);
  return Math.round(value / step) * step;
}

function adjustContrast(value, contrastPercent) {
  const c = contrastPercent / 100;
  return Math.max(0, Math.min(255, (value - 128) * c + 128));
}

function toGrayArray(imgData, contrast, levels) {
  const { data, width, height } = imgData;
  const arr = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4;
    const gray = luminance(data[p], data[p + 1], data[p + 2]);
    arr[i] = quantize(adjustContrast(gray, contrast), levels);
  }
  return arr;
}

function ditherFloyd(gray, width, height, levels) {
  const out = new Float32Array(gray);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const oldVal = out[i];
      const newVal = quantize(oldVal, levels);
      const err = oldVal - newVal;
      out[i] = newVal;
      if (x + 1 < width) out[i + 1] += (err * 7) / 16;
      if (x - 1 >= 0 && y + 1 < height) out[i + width - 1] += (err * 3) / 16;
      if (y + 1 < height) out[i + width] += (err * 5) / 16;
      if (x + 1 < width && y + 1 < height) out[i + width + 1] += err / 16;
    }
  }
  return out;
}

function ditherAtkinson(gray, width, height, levels) {
  const out = new Float32Array(gray);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const oldVal = out[i];
      const newVal = quantize(oldVal, levels);
      const err = (oldVal - newVal) / 8;
      out[i] = newVal;
      if (x + 1 < width) out[i + 1] += err;
      if (x + 2 < width) out[i + 2] += err;
      if (x - 1 >= 0 && y + 1 < height) out[i + width - 1] += err;
      if (y + 1 < height) out[i + width] += err;
      if (x + 1 < width && y + 1 < height) out[i + width + 1] += err;
      if (y + 2 < height) out[i + width * 2] += err;
    }
  }
  return out;
}

const bayer4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function ditherBayer(gray, width, height, levels) {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const threshold = ((bayer4[y % 4][x % 4] + 0.5) / 16 - 0.5) * 32;
      out[i] = quantize(gray[i] + threshold, levels);
    }
  }
  return out;
}

function ditherThreshold(gray, levels) {
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    out[i] = quantize(gray[i], levels);
  }
  return out;
}

function fitToPixels(img, targetMax) {
  const ratio = Math.min(targetMax / img.width, targetMax / img.height, 1);
  return {
    width: Math.max(1, Math.round(img.width * ratio)),
    height: Math.max(1, Math.round(img.height * ratio)),
  };
}

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hexToRgb(hex) {
  const cleaned = hex.replace("#", "");
  const full = cleaned.length === 3
    ? cleaned.split("").map((n) => n + n).join("")
    : cleaned;
  const num = Number.parseInt(full, 16);
  return [
    (num >> 16) & 255,
    (num >> 8) & 255,
    num & 255,
  ];
}

function mixWhiteToColor(color, darkness) {
  return [
    clamp255(255 - darkness * (255 - color[0])),
    clamp255(255 - darkness * (255 - color[1])),
    clamp255(255 - darkness * (255 - color[2])),
  ];
}

function getPixelColor(values, idx, colorMode, sourceRgba, themeRgb) {
  const v = Math.max(0, Math.min(255, values[idx]));
  const darkness = 1 - v / 255;

  if (colorMode === "mono") {
    const c = clamp255(v);
    return [c, c, c];
  }

  if (colorMode === "theme") {
    return mixWhiteToColor(themeRgb, darkness);
  }

  const p = idx * 4;
  const src = [sourceRgba[p], sourceRgba[p + 1], sourceRgba[p + 2]];
  return mixWhiteToColor(src, darkness);
}

function getInkColor(idx, colorMode, sourceRgba, themeRgb) {
  if (colorMode === "mono") return [20, 20, 20];
  if (colorMode === "theme") return themeRgb;
  const p = idx * 4;
  return [sourceRgba[p], sourceRgba[p + 1], sourceRgba[p + 2]];
}

function renderRoundDot(values, width, height, scale, levels, colorMode, sourceRgba, themeRgb, textureIntensity) {
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const v = Math.max(0, Math.min(255, values[i]));
      const darkness = 1 - v / 255;
      const textureBoost = 0.6 + textureIntensity * 0.9;
      const radius = (darkness * scale * 0.45 * levels * textureBoost) / Math.max(levels - 1, 1);
      if (radius <= 0.2) continue;

      let color;
      if (colorMode === "mono") color = [17, 17, 17];
      else if (colorMode === "theme") color = themeRgb;
      else {
        const p = i * 4;
        color = [sourceRgba[p], sourceRgba[p + 1], sourceRgba[p + 2]];
      }

      ctx.beginPath();
      ctx.arc(x * scale + scale / 2, y * scale + scale / 2, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
      ctx.fill();
    }
  }
}

function renderPixel(values, width, height, scale, colorMode, sourceRgba, themeRgb) {
  canvas.width = width * scale;
  canvas.height = height * scale;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const [r, g, b] = getPixelColor(values, i, colorMode, sourceRgba, themeRgb);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}

function drawLine(x1, y1, x2, y2, color, alpha, thickness) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function renderHorizontalHatch(values, width, height, scale, colorMode, sourceRgba, themeRgb, textureIntensity) {
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const thickness = Math.max(1, scale * (0.1 + textureIntensity * 0.12));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const v = Math.max(0, Math.min(255, values[i]));
      const darkness = 1 - v / 255;
      if (darkness < 0.06) continue;
      const color = getInkColor(i, colorMode, sourceRgba, themeRgb);
      const x0 = x * scale;
      const y0 = y * scale;
      const lineCount = 1 + Math.floor(darkness * (1.4 + textureIntensity * 3.8));
      const step = scale / (lineCount + 1);
      for (let n = 1; n <= lineCount; n += 1) {
        const yy = y0 + n * step;
        drawLine(x0 + scale * 0.1, yy, x0 + scale * 0.9, yy, color, darkness, thickness);
      }
    }
  }
}

function renderVerticalHatch(values, width, height, scale, colorMode, sourceRgba, themeRgb, textureIntensity) {
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const thickness = Math.max(1, scale * (0.1 + textureIntensity * 0.12));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const v = Math.max(0, Math.min(255, values[i]));
      const darkness = 1 - v / 255;
      if (darkness < 0.06) continue;
      const color = getInkColor(i, colorMode, sourceRgba, themeRgb);
      const x0 = x * scale;
      const y0 = y * scale;
      const lineCount = 1 + Math.floor(darkness * (1.4 + textureIntensity * 3.8));
      const step = scale / (lineCount + 1);
      for (let n = 1; n <= lineCount; n += 1) {
        const xx = x0 + n * step;
        drawLine(xx, y0 + scale * 0.1, xx, y0 + scale * 0.9, color, darkness, thickness);
      }
    }
  }
}

function renderCrossHatch(values, width, height, scale, colorMode, sourceRgba, themeRgb, textureIntensity) {
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const thickness = Math.max(1, scale * (0.08 + textureIntensity * 0.11));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const v = Math.max(0, Math.min(255, values[i]));
      const darkness = 1 - v / 255;
      if (darkness < 0.06) continue;
      const color = getInkColor(i, colorMode, sourceRgba, themeRgb);
      const x0 = x * scale;
      const y0 = y * scale;
      drawLine(x0 + scale * 0.12, y0 + scale * 0.88, x0 + scale * 0.88, y0 + scale * 0.12, color, darkness, thickness);
      if (darkness > 0.3 - textureIntensity * 0.12) {
        drawLine(x0 + scale * 0.12, y0 + scale * 0.12, x0 + scale * 0.88, y0 + scale * 0.88, color, darkness * 0.9, thickness);
      }
      if (darkness > 0.62 - textureIntensity * 0.15) {
        drawLine(x0 + scale * 0.5, y0 + scale * 0.08, x0 + scale * 0.5, y0 + scale * 0.92, color, darkness * 0.8, thickness);
      }
    }
  }
}

function hashNoise(x, y, s) {
  const t = Math.sin((x * 127.1 + y * 311.7 + s * 17.3) * 0.0174533) * 43758.5453;
  return t - Math.floor(t);
}

function renderGrainStipple(values, width, height, scale, colorMode, sourceRgba, themeRgb, textureIntensity) {
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const v = Math.max(0, Math.min(255, values[i]));
      const darkness = 1 - v / 255;
      if (darkness < 0.05) continue;
      const color = getInkColor(i, colorMode, sourceRgba, themeRgb);
      const x0 = x * scale;
      const y0 = y * scale;
      const count = 1 + Math.floor(darkness * (2.5 + textureIntensity * 6.5));
      const dotSize = Math.max(1, scale * (0.14 + textureIntensity * 0.2));
      for (let n = 0; n < count; n += 1) {
        const rx = hashNoise(x, y, n + 1);
        const ry = hashNoise(y, x, n + 11);
        const px = x0 + rx * (scale - dotSize);
        const py = y0 + ry * (scale - dotSize);
        ctx.globalAlpha = 0.35 + darkness * 0.65;
        ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        ctx.fillRect(px, py, dotSize, dotSize);
      }
      ctx.globalAlpha = 1;
    }
  }
}

function renderOriginalImage() {
  if (!sourceImage) {
    setStatus("Select an input image first.");
    return;
  }

  const fit = fitToPixels(sourceImage, 960);
  canvas.width = fit.width;
  canvas.height = fit.height;
  ctx.drawImage(sourceImage, 0, 0, fit.width, fit.height);
  setStatus(`Showing original image (${fit.width}x${fit.height}).`);
}

function resetControls() {
  modeSelect.value = defaults.mode;
  colorModeSelect.value = defaults.colorMode;
  themeColorInput.value = defaults.themeColor;
  scaleRange.value = String(defaults.scale);
  levelsRange.value = String(defaults.levels);
  contrastRange.value = String(defaults.contrast);
  textureRange.value = String(defaults.texture);
  syncThemeColorState();
}

function syncThemeColorState() {
  const enabled = colorModeSelect.value === "theme";
  themeColorInput.disabled = !enabled;
  themeColorInput.style.opacity = enabled ? "1" : "0.5";
}

function processImage() {
  if (!sourceImage) {
    setStatus("Select an input image first.");
    return;
  }

  const mode = modeSelect.value;
  const colorMode = colorModeSelect.value;
  const scale = Number(scaleRange.value);
  const levels = Number(levelsRange.value);
  const contrast = Number(contrastRange.value);
  const textureIntensity = Number(textureRange.value) / 100;
  const themeRgb = hexToRgb(themeColorInput.value);

  const small = fitToPixels(sourceImage, 260);
  const temp = document.createElement("canvas");
  temp.width = small.width;
  temp.height = small.height;
  const tctx = temp.getContext("2d");
  tctx.drawImage(sourceImage, 0, 0, small.width, small.height);

  const imgData = tctx.getImageData(0, 0, small.width, small.height);
  const sourceRgba = imgData.data;
  const gray = toGrayArray(imgData, contrast, levels);

  let dithered;
  if (mode === "floyd") dithered = ditherFloyd(gray, small.width, small.height, levels);
  else if (mode === "atkinson") dithered = ditherAtkinson(gray, small.width, small.height, levels);
  else if (mode === "bayer") dithered = ditherBayer(gray, small.width, small.height, levels);
  else dithered = ditherThreshold(gray, levels);

  if (mode === "dot") {
    renderRoundDot(dithered, small.width, small.height, scale, levels, colorMode, sourceRgba, themeRgb, textureIntensity);
  } else if (mode === "floyd") {
    renderHorizontalHatch(dithered, small.width, small.height, scale, colorMode, sourceRgba, themeRgb, textureIntensity);
  } else if (mode === "atkinson") {
    renderVerticalHatch(dithered, small.width, small.height, scale, colorMode, sourceRgba, themeRgb, textureIntensity);
  } else if (mode === "bayer") {
    renderCrossHatch(dithered, small.width, small.height, scale, colorMode, sourceRgba, themeRgb, textureIntensity);
  } else {
    renderGrainStipple(dithered, small.width, small.height, scale, colorMode, sourceRgba, themeRgb, textureIntensity);
  }

  setStatus(`Rendered ${mode} with ${colorMode} color mode at ${canvas.width}x${canvas.height} (texture ${Math.round(textureIntensity * 100)}).`);
}

fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    sourceImage = await readAsImage(file);
    sourceFilename = file.name.replace(/\.[^.]+$/, "");
    resetControls();
    renderOriginalImage();
    setStatus(`Loaded ${file.name}. Original image is shown; click Render to dither.`);
  } catch (error) {
    setStatus(error.message);
  }
});

renderBtn.addEventListener("click", processImage);

resetBtn.addEventListener("click", () => {
  if (!sourceImage) {
    setStatus("Select an input image first.");
    return;
  }
  resetControls();
  renderOriginalImage();
});

colorModeSelect.addEventListener("change", syncThemeColorState);
syncThemeColorState();

copyBtn.addEventListener("click", async () => {
  if (!canvas.width || !canvas.height) {
    setStatus("Render or load an image before copying.");
    return;
  }

  if (!navigator.clipboard || !window.ClipboardItem) {
    setStatus("Clipboard image copy is not supported in this browser.");
    return;
  }

  try {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    setStatus("Copied PNG to clipboard.");
  } catch {
    setStatus("Copy failed. Try download instead.");
  }
});

downloadBtn.addEventListener("click", () => {
  if (!canvas.width || !canvas.height) {
    setStatus("Render or load an image before downloading.");
    return;
  }

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${sourceFilename || "dither"}-${modeSelect.value}-${colorModeSelect.value}.png`;
  a.click();
  setStatus("Download started.");
});
