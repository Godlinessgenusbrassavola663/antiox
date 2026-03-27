// Workaround for vitest thenable module trap.
//
// src/stream.ts exports a function named `then`, which makes the module
// namespace a thenable object. Vitest's module runner internally awaits
// dynamic imports, causing an infinite loop when loading any module that
// has a `then` export. Using createRequire to load the CJS build avoids
// the thenable trap because require() is synchronous.
//
// Run `npx tsup` to rebuild dist/ if stream source changes.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const stream = require("../dist/stream.cjs");

type S = typeof import("../src/stream");

export const map: S["map"] = stream.map;
export const filter: S["filter"] = stream.filter;
export const asyncMap: S["then"] = stream.then;
export const filterMap: S["filterMap"] = stream.filterMap;
export const take: S["take"] = stream.take;
export const skip: S["skip"] = stream.skip;
export const takeWhile: S["takeWhile"] = stream.takeWhile;
export const skipWhile: S["skipWhile"] = stream.skipWhile;
export const chunks: S["chunks"] = stream.chunks;
export const collect: S["collect"] = stream.collect;
export const fold: S["fold"] = stream.fold;
export const merge: S["merge"] = stream.merge;
export const chain: S["chain"] = stream.chain;
export const zip: S["zip"] = stream.zip;
export const flatten: S["flatten"] = stream.flatten;
export const tap: S["tap"] = stream.tap;
export const pipe: S["pipe"] = stream.pipe;
export const bufferUnordered: S["bufferUnordered"] = stream.bufferUnordered;
export const buffered: S["buffered"] = stream.buffered;
