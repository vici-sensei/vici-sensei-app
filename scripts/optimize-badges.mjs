// Turns the full-size badge masters in assets-src/badges/ into the small, square, web-ready files
// the app actually serves, and writes the manifest that maps each master to its content hash.
//
//   npm run badges:optimize
//
// Two sizes per master, both center-cropped to a square to match how the app shows them (a
// rounded-full circle with object-cover -- see app/components/ui/AchievementCard.tsx):
//   thumb/  the 64px circle in the list/grid views (192px covers a 3x phone screen)
//   full/   the enlarged circle in BadgeImageModal (shown at up to 512 CSS px)
// A master smaller than a target is never upscaled -- the output just uses the master's own
// shorter side instead.
//
// Output filenames carry a hash of the master's bytes plus the settings below
// (`<name>.<hash>.webp`), so /images/badges/ can be served with `immutable` (see public/_headers):
// a changed master or changed setting produces a new URL, never a stale cached copy. The hashes
// are written to lib/achievements/badgeImageHashes.json, which lib/achievements/badgeImages.ts
// reads to build those URLs. Re-running is incremental -- unchanged masters are skipped, and
// outputs for masters that changed or were removed are deleted.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "assets-src/badges");
const OUT_DIR = path.join(ROOT, "public/images/badges");
const MANIFEST_PATH = path.join(ROOT, "lib/achievements/badgeImageHashes.json");

const SIZES = {
  thumb: { side: 192, quality: 75 },
  full: { side: 768, quality: 80 },
};

const SOURCE_EXTENSIONS = new Set([".webp", ".png", ".jpg", ".jpeg"]);

function hashOf(sourceBytes) {
  return createHash("sha256")
    .update(sourceBytes)
    .update(JSON.stringify(SIZES))
    .digest("hex")
    .slice(0, 8);
}

function outName(masterFile, hash) {
  return `${path.parse(masterFile).name}.${hash}.webp`;
}

function kb(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

const masters = readdirSync(SRC_DIR)
  .filter((file) => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()))
  .sort();

// Two masters differing only by extension (a.png / a.webp) would collide on the same output name.
const stems = new Set();
for (const file of masters) {
  const stem = path.parse(file).name;
  if (stems.has(stem)) throw new Error(`Two masters share the name "${stem}" -- rename one.`);
  stems.add(stem);
}

const manifest = {};
const wanted = { thumb: new Set(), full: new Set() };
let generated = 0;
let skipped = 0;
let thumbBytes = 0;
let fullBytes = 0;

for (const size of Object.keys(SIZES)) mkdirSync(path.join(OUT_DIR, size), { recursive: true });

for (const file of masters) {
  const input = path.join(SRC_DIR, file);
  const hash = hashOf(readFileSync(input));
  manifest[file] = hash;

  let wroteAny = false;
  for (const [size, { side, quality }] of Object.entries(SIZES)) {
    const name = outName(file, hash);
    const target = path.join(OUT_DIR, size, name);
    wanted[size].add(name);

    let exists = true;
    try {
      statSync(target);
    } catch {
      exists = false;
    }

    if (!exists) {
      const { width, height } = await sharp(input).metadata();
      const edge = Math.min(side, width, height);
      await sharp(input)
        .resize(edge, edge, { fit: "cover", position: "centre" })
        .webp({ quality, effort: 5 })
        .toFile(target);
      wroteAny = true;
    }

    const bytes = statSync(target).size;
    if (size === "thumb") thumbBytes += bytes;
    else fullBytes += bytes;
  }
  if (wroteAny) generated++;
  else skipped++;
}

let removed = 0;
for (const size of Object.keys(SIZES)) {
  const dir = path.join(OUT_DIR, size);
  for (const file of readdirSync(dir)) {
    if (!wanted[size].has(file)) {
      rmSync(path.join(dir, file));
      removed++;
    }
  }
}

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

console.log(
  `Badges: ${masters.length} masters -> ${generated} (re)generated, ${skipped} up to date, ${removed} stale files removed.`
);
console.log(
  `  thumb/ ${kb(thumbBytes)} total (avg ${kb(thumbBytes / masters.length)}), full/ ${kb(fullBytes)} total (avg ${kb(fullBytes / masters.length)})`
);
