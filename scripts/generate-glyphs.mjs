/**
 * Generates MapLibre-compatible SDF glyph PBF files from TID UI TTF fonts.
 * Output: public/fonts/{fontName}/{start}-{end}.pbf
 *
 * Usage: node scripts/generate-glyphs.mjs
 */

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Pbf from "pbf";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Polyfill canvas for tiny-sdf ─────────────────────────────────────────────
global.document = {
  createElement: (tag) => {
    if (tag === "canvas") return createCanvas(1, 1);
    throw new Error(`Unsupported: ${tag}`);
  },
};

// Import after polyfill
const { default: TinySDF } = await import("tiny-sdf");

// ── Config ────────────────────────────────────────────────────────────────────
const FONTS = [
  { file: "TID-Regular.ttf", name: "TID UI Regular" },
  { file: "TID-Bold.ttf",    name: "TID UI Bold" },
];
const FONT_SIZE = 24;
const BUFFER    = 3;
const RADIUS    = 8;
const CUTOFF    = 0.25;

// Character ranges to generate (covers Basic Latin + Latin-1 Supplement)
const RANGES = [
  [0,   255],
  [256, 511],
];

// ── PBF write helpers (MapLibre glyph format) ─────────────────────────────────
// pbf v4: callbacks receive (obj, pbf)
function writeGlyph(g, pbf) {
  pbf.writeVarintField(1, g.id);
  if (g.bitmap.length > 0) pbf.writeBytesField(2, g.bitmap);
  pbf.writeVarintField(3, g.width);
  pbf.writeVarintField(4, g.height);
  pbf.writeSVarintField(5, g.left);
  pbf.writeSVarintField(6, g.top);
  pbf.writeVarintField(7, g.advance);
}

function writeFontstack({ name, range, glyphs }, pbf) {
  pbf.writeStringField(1, name);
  pbf.writeStringField(2, range);
  for (const glyph of glyphs) {
    pbf.writeMessage(3, writeGlyph, glyph);
  }
}

function encodeGlyphs(fontName, rangeLabel, glyphs) {
  const pbf = new Pbf();
  pbf.writeMessage(1, writeFontstack, { name: fontName, range: rangeLabel, glyphs });
  return Buffer.from(pbf.finish());
}

// ── Main ──────────────────────────────────────────────────────────────────────
for (const { file, name } of FONTS) {
  const fontPath = join(ROOT, "src/app/fonts", file);

  // Register with @napi-rs/canvas so the font is available for rendering
  GlobalFonts.registerFromPath(fontPath, name);

  // Create TinySDF renderer for this font
  const sdf = new TinySDF(FONT_SIZE, BUFFER, RADIUS, CUTOFF, name, "normal");

  const outDir = join(ROOT, "public/fonts", name);
  mkdirSync(outDir, { recursive: true });

  for (const [start, end] of RANGES) {
    const glyphs = [];

    for (let code = start; code <= end; code++) {
      // Skip control characters (0–31) and DEL (127)
      if (code < 32 || code === 127) continue;

      const char = String.fromCodePoint(code);

      // Let TinySDF render the char + compute SDF
      const result = sdf.draw(char);

      glyphs.push({
        id:      code,
        bitmap:  result.data,
        width:   result.glyphWidth  ?? result.width,
        height:  result.glyphHeight ?? result.height,
        left:    result.glyphLeft   ?? 0,
        top:     result.glyphTop    ?? 0,
        advance: result.glyphAdvance ?? (result.glyphWidth ?? result.width) + 1,
      });
    }

    const rangeLabel = `${start}-${end}`;
    const buf = encodeGlyphs(name, rangeLabel, glyphs);
    const outPath = join(outDir, `${rangeLabel}.pbf`);
    writeFileSync(outPath, buf);
    console.log(`✓ ${name}  ${rangeLabel}.pbf  (${glyphs.length} glyphs)`);
  }
}

console.log("\nDone! Glyph PBFs written to public/fonts/");
