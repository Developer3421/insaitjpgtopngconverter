#!/usr/bin/env node
/**
 * Local JPEG → PNG converter.
 *
 * Usage:
 *   node scripts/convert.mjs <input.jpg> [output.png]
 *   node scripts/convert.mjs file1.jpg file2.jpeg ...   (batch – PNG saved next to each source)
 *
 * Or via npm:
 *   npm run convert -- photo.jpg
 */

import { existsSync } from "fs";
import { extname, basename, dirname, join } from "path";

const { default: sharp } = await import("sharp");

const SUPPORTED = new Set([".jpg", ".jpeg"]);

function toPngPath(inputPath) {
  const dir = dirname(inputPath);
  const name = basename(inputPath, extname(inputPath));
  return join(dir, `${name}.png`);
}

async function convertFile(inputPath, outputPath) {
  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }
  const ext = extname(inputPath).toLowerCase();
  if (!SUPPORTED.has(ext)) {
    throw new Error(`Unsupported file type "${ext}". Only .jpg/.jpeg are accepted.`);
  }

  const dest = outputPath ?? toPngPath(inputPath);
  await sharp(inputPath).png().toFile(dest);
  return dest;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(
      [
        "Usage:",
        "  node scripts/convert.mjs <input.jpg> [output.png]",
        "  node scripts/convert.mjs file1.jpg file2.jpeg ...",
        "",
        "If output.png is omitted the PNG is saved alongside the source file.",
      ].join("\n")
    );
    process.exit(0);
  }

  // Two-argument form: node convert.mjs input.jpg output.png
  if (
    args.length === 2 &&
    SUPPORTED.has(extname(args[0]).toLowerCase()) &&
    extname(args[1]).toLowerCase() === ".png"
  ) {
    try {
      const dest = await convertFile(args[0], args[1]);
      console.log(`✓  ${args[0]}  →  ${dest}`);
    } catch (err) {
      console.error(`✗  ${err.message}`);
      process.exit(1);
    }
    return;
  }

  // Batch form: one or more input files, output next to each
  let hasError = false;
  for (const inputPath of args) {
    try {
      const dest = await convertFile(inputPath);
      console.log(`✓  ${inputPath}  →  ${dest}`);
    } catch (err) {
      console.error(`✗  ${inputPath}: ${err.message}`);
      hasError = true;
    }
  }
  if (hasError) process.exit(1);
}

main();
