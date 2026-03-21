import chokidar from "chokidar";
import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const publicDir = resolve(rootDir, "public");
const distDir = resolve(rootDir, "dist");
const watchMode = process.argv.includes("--watch");

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function getServerHttpOrigin() {
  const rawValue =
    process.env.STRUCTUREDQUERIES_SERVER_ORIGIN ??
    process.env.STRUCTUREDQUERIES_SERVER_HTTP_ORIGIN ??
    "https://structuredqueries.samsar.one";

  return trimTrailingSlash(rawValue.trim());
}

function deriveWebSocketOrigin(httpOrigin) {
  if (httpOrigin.startsWith("https://")) {
    return `wss://${httpOrigin.slice("https://".length)}`;
  }

  if (httpOrigin.startsWith("http://")) {
    return `ws://${httpOrigin.slice("http://".length)}`;
  }

  throw new Error(
    `Unsupported StructuredQueries server origin: ${httpOrigin}. Expected http:// or https://.`
  );
}

const serverHttpOrigin = getServerHttpOrigin();
const serverWsOrigin = deriveWebSocketOrigin(serverHttpOrigin);
const serverWsUrl = `${serverWsOrigin}/ws/plugin`;

const buildConfig = {
  entryPoints: {
    background: resolve(rootDir, "src/background.ts"),
    content: resolve(rootDir, "src/content.ts"),
    offscreen: resolve(rootDir, "src/offscreen.ts"),
    popup: resolve(rootDir, "src/popup.ts")
  },
  bundle: true,
  outdir: distDir,
  format: "iife",
  target: "chrome120",
  sourcemap: true,
  logLevel: "info",
  define: {
    __STRUCTUREDQUERIES_SERVER_HTTP_ORIGIN__: JSON.stringify(serverHttpOrigin),
    __STRUCTUREDQUERIES_SERVER_WS_URL__: JSON.stringify(serverWsUrl)
  }
};

async function copyPublicAssets() {
  await mkdir(distDir, { recursive: true });
  await cp(publicDir, distDir, { recursive: true, force: true });

  const manifestPath = resolve(distDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  manifest.host_permissions = [
    ...new Set([
      ...(Array.isArray(manifest.host_permissions)
        ? manifest.host_permissions
        : []),
      "http://*/*",
      "https://*/*",
      `${serverHttpOrigin}/*`
    ])
  ];
  manifest.content_security_policy = {
    ...manifest.content_security_policy,
    extension_pages: `script-src 'self'; object-src 'self'; connect-src 'self' ${serverHttpOrigin} ${serverWsOrigin};`
  };

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
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

  console.log(`[client] watching for changes (${serverHttpOrigin})`);
} else {
  await cleanDist();
  await copyPublicAssets();
  await build(buildConfig);
  console.log(`[client] build complete (${serverHttpOrigin})`);
}
