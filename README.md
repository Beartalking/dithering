# Dither Lab

A lightweight local web tool that converts any image into stylized dithering textures.

This project runs fully in the browser (HTML/CSS/JavaScript), with no build step and no dependencies.

## What It Does

- Upload an image and preview results instantly
- Apply multiple texture-focused dithering styles
- Adjust output controls (scale, levels, contrast, texture intensity)
- Choose color treatment:
  - Monochrome
  - Preserve Original Tone
  - Theme Tint
- Export output as PNG:
  - Copy to clipboard
  - Download file

## Dithering Styles

- `Round Dot (Primary)`: circular halftone dots
- `Horizontal Hatch`: horizontal line texture
- `Vertical Hatch`: vertical line texture
- `Cross Hatch`: layered cross-line texture
- `Grain Stipple`: grainy dotted texture

## Project Files

- `index.html`: UI layout and controls
- `styles.css`: visual styling and responsive layout
- `script.js`: image processing and dithering logic

## How To Use

1. Open `index.html` directly in your browser, or serve the folder locally.
2. Upload an image from `Input Image`.
3. Click `Render` to generate the dither output.
4. Change style and sliders to tune the look:
   - `Pixel Scale`
   - `Levels`
   - `Contrast`
   - `Texture Intensity`
5. Choose a color treatment if needed.
6. Export with:
   - `Copy PNG`
   - `Download PNG`

## Recommended Local Server (Optional)

Some browsers require a secure context for image clipboard APIs.  
If `Copy PNG` does not work when opening the file directly, run:

```bash
python3 -m http.server 8000
```

Then open: `http://localhost:8000`

## Notes

- `Reset to Original` restores default controls and shows the source image again.
- Output quality/feel depends on both `Pixel Scale` and `Texture Intensity`.

