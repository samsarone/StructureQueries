import chokidar from "chokidar";
import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const publicDir = resolve(rootDir, "public");
const distDir = resolve(rootDir, "dist");
const watchMode = process.argv.includes("--watch");

const buildConfig = {
  entryPoints: {
    background: resolve(rootDir, "src/background.ts"),
    content: resolve(rootDir, "src/content.ts"),
    popup: resolve(rootDir, "src/popup.ts")
  },
  bundle: true,
  outdir: distDir,
  format: "iife",
  target: "chrome120",
  sourcemap: true,
  logLevel: "info"
};

async function copyPublicAssets() {
  await mkdir(distDir, { recursive: true });
  await cp(publicDir, distDir, { recursive: true, force: true });
}

async function cleanDist() {
  await rm(distDir, { recursive: true, force: true });
}

if (watchMode) {
  await cleanDist();
  await copyPublicAssets();

  const ctx = await context(buildConfig);
  await ctx.watch();

  chokidar.watch(publicDir, { ignoreInitial: true }).on("all", async () => {
    try {
      await copyPublicAssets();
      console.log("[client] copied public assets");
    } catch (error) {
      console.error("[client] failed to copy public assets", error);
    }
  });

  console.log("[client] watching for changes");
} else {
  await cleanDist();
  await copyPublicAssets();
  await build(buildConfig);
  console.log("[client] build complete");
}
