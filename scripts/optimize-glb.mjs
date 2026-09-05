#!/usr/bin/env node
/**
 * Shrink the badge GLBs in `assets/glb/` so they can be bundled into the app.
 *
 * The source models are photogrammetry scans: 280k-610k triangles and 2048px
 * textures each, which added up to 165 MB of bundled assets. They are rendered
 * as ~100px tiles (`CountryBadge3DPreview`) and a single fullscreen unlock
 * modal, so nearly all of that detail never reaches a pixel. Decimating to a
 * ~20k triangle budget with 512px textures brings the set down to ~8 MB with no
 * visible difference at those sizes.
 *
 * Deliberately emits plain glTF with no compression extensions:
 * react-native-filament ships the Draco *glue* (DracoCache.cpp.o) but not the
 * decoder itself — `nm libgltfio_core.a | grep _ZN5draco` finds nothing — so
 * Draco-compressed models come out empty in release builds. EXT_meshopt_compression
 * is linked and would work, but plain float32 is small enough already and keeps
 * the assets loadable by any glTF viewer.
 *
 * Writes in place, but targets an absolute budget rather than a reduction
 * factor, so re-running is a no-op for models that already meet it. Drop a new
 * high-poly badge into `assets/glb/` and re-run; only that one is touched.
 * The originals live in git history if you need them back.
 *
 * Re-run via: `npm run glb:optimize` (add `-- --triangles 60000 --texture 1024`
 * for a gentler pass if a new model loses too much shape).
 */

import { readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  flatten,
  join as joinMeshes,
  prune,
  resample,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const GLB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'glb');

const DEFAULTS = { triangles: 20000, texture: 512, quality: 82 };

function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (key && key in opts) opts[key] = Number(argv[i + 1]);
  }
  return opts;
}

function countTriangles(doc) {
  return doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, prim) => sum + (prim.getIndices()?.getCount() ?? 0) / 3, 0);
}

function largestTexture(doc) {
  return doc
    .getRoot()
    .listTextures()
    .reduce((max, tex) => Math.max(max, ...(tex.getSize() ?? [0, 0])), 0);
}

function mb(bytes) {
  return `${(bytes / 1048576).toFixed(2)} MB`.padStart(9);
}

const { triangles: budget, texture: texTarget, quality } = parseArgs(process.argv.slice(2));

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const files = readdirSync(GLB_DIR).filter((f) => f.endsWith('.glb')).sort();
let before = 0;
let after = 0;
let touched = 0;

for (const file of files) {
  const path = join(GLB_DIR, file);
  const sizeBefore = statSync(path).size;
  before += sizeBefore;

  const doc = await io.read(path);
  const tris = countTriangles(doc);
  const texSize = largestTexture(doc);

  // Both targets already met — skip, so repeated runs don't decimate a model
  // that was optimised on an earlier pass (or re-encode its JPEGs again).
  if (tris <= budget * 1.1 && texSize <= texTarget) {
    after += sizeBefore;
    console.log(
      `${basename(file).padEnd(16)} ${mb(sizeBefore)}  bereits optimiert ` +
        `(${Math.round(tris).toLocaleString('de-DE')} tris, ${texSize}px)`,
    );
    continue;
  }

  const transforms = [
    dedup(),
    flatten(),
    joinMeshes(),
    // simplify() needs welded (index-shared) vertices to collapse edges at all.
    weld(),
  ];
  if (tris > budget) {
    transforms.push(
      simplify({
        simplifier: MeshoptSimplifier,
        ratio: budget / tris,
        error: 0.005,
        lockBorder: false,
      }),
    );
  }
  transforms.push(resample(), prune({ keepAttributes: false }));
  if (texSize > texTarget) {
    transforms.push(
      textureCompress({
        encoder: sharp,
        targetFormat: 'jpeg',
        resize: [texTarget, texTarget],
        quality,
      }),
    );
  }

  await doc.transform(...transforms);
  await io.write(path, doc);

  const sizeAfter = statSync(path).size;
  after += sizeAfter;
  touched++;

  console.log(
    `${basename(file).padEnd(16)} ${mb(sizeBefore)} -> ${mb(sizeAfter)}  ` +
      `(${Math.round(countTriangles(doc)).toLocaleString('de-DE')} tris)`,
  );
}

console.log(
  `\n${touched} von ${files.length} Modellen bearbeitet: ` +
    `${mb(before)} -> ${mb(after)} (${(100 - (after / before) * 100).toFixed(1)}% kleiner)`,
);
