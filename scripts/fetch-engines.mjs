#!/usr/bin/env node
// Downloads/builds the on-device inference engines for THIS machine's OS into
// src-tauri/engines/<os>/ so Tauri can bundle them as resources.
//
//   npm run fetch-engines            # normal use (macOS, Windows, CI)
//   LLAMA_TAG=b1234 npm run fetch-engines     # pin a llama.cpp release
//   WHISPER_TAG=v1.7.6 npm run fetch-engines  # pin a whisper.cpp release
//   WHISPER_VULKAN=1 npm run fetch-engines    # Windows: build whisper with Vulkan GPU
//                                             # (needs Vulkan SDK + VS Build Tools + CMake)
//
// Result:
//   engines/<os>/llama/llama-server[.exe] (+ shared libs)
//   engines/<os>/whisper/whisper-cli[.exe] (+ shared libs on Windows prebuilt)
//   engines/<os>/samples/jfk.wav
//   engines/<os>/VERSIONS.json
//
// Plain Node (>=18), no npm dependencies, so it runs identically on every OS.

import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { cp, mkdir, readdir, rm, writeFile, chmod, stat } from "node:fs/promises";
import { tmpdir, cpus } from "node:os";
import { join, dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OS = { darwin: "macos", win32: "windows", linux: "linux" }[process.platform];
if (!OS) throw new Error(`unsupported platform: ${process.platform}`);
const ARCH = process.arch; // "arm64" | "x64"
const EXE = OS === "windows" ? ".exe" : "";
const OUT = join(ROOT, "src-tauri", "engines", OS);
const WORK = join(tmpdir(), `efl-sprite-engines-${Date.now()}`);

const log = (...a) => console.log("[fetch-engines]", ...a);

function run(cmd, args, opts = {}) {
  log("$", cmd, args.join(" "));
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} exited with ${r.status ?? r.error}`);
}

async function gh(path) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "efl-sprite-fetch" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(`https://api.github.com/${path}`, { headers });
  if (!r.ok) throw new Error(`GitHub API ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

const release = (repo, tag) =>
  gh(`repos/${repo}/releases/${tag ? `tags/${tag}` : "latest"}`);

/**
 * Release that actually carries a binary matching `patterns`.
 * Needed because llama.cpp (since v0.8.0, Oct 2026) publishes version tags like
 * `v0.8.0` with no binaries; the binaries live on build tags like `b11960`.
 * With an explicit tag we use it as-is; otherwise scan recent releases newest-first.
 */
async function releaseWithAsset(repo, tag, patterns) {
  if (tag) return release(repo, tag);
  const list = await gh(`repos/${repo}/releases?per_page=30`);
  const hit = list.find((r) => !r.draft && r.assets.some((a) => patterns.some((re) => re.test(a.name))));
  if (!hit) throw new Error(`no recent ${repo} release has an asset matching ${patterns.join(" | ")}`);
  return hit;
}

async function download(url, dest) {
  log("download", url);
  const r = await fetch(url, { headers: { "User-Agent": "efl-sprite-fetch" } });
  if (!r.ok || !r.body) throw new Error(`download ${url}: ${r.status}`);
  await mkdir(dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(r.body), createWriteStream(dest));
}

function extract(archive, dest) {
  if (archive.endsWith(".zip")) {
    if (OS === "windows") {
      // PowerShell's Expand-Archive: avoids GNU tar (no zip support) shadowing bsdtar in Git Bash.
      run("powershell", ["-NoProfile", "-Command",
        `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${dest}' -Force`]);
    } else {
      run("unzip", ["-q", "-o", archive, "-d", dest]);
    }
  } else {
    run("tar", ["-xzf", archive, "-C", dest]);
  }
}

async function findFile(dir, name) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = await findFile(p, name);
      if (hit) return hit;
    } else if (entry.name === name) {
      return p;
    }
  }
  return null;
}

/** Copy the directory that contains `binary` (binary + its sibling libs) into `dest`. */
async function installDirOf(binary, dest) {
  await rm(dest, { recursive: true, force: true });
  // dereference: release archives ship libs as symlinks (libggml-rpc.0.dylib → …).
  // Copying links would leave them pointing into WORK, which is deleted afterwards,
  // and Tauri's bundler then fails with "resource path … doesn't exist".
  await cp(dirname(binary), dest, { recursive: true, dereference: true });
  if (OS !== "windows") {
    for (const f of await readdir(dest)) {
      const p = join(dest, f);
      if ((await stat(p)).isFile()) await chmod(p, 0o755);
    }
  }
}

function pickAsset(rel, patterns) {
  for (const re of patterns) {
    const a = rel.assets.find((x) => re.test(x.name));
    if (a) return a;
  }
  throw new Error(
    `no matching asset in ${rel.tag_name} for ${patterns.join(" | ")}\n` +
      `available: ${rel.assets.map((a) => a.name).join(", ")}`,
  );
}

// ---------------------------------------------------------------- llama.cpp
// Pinned so macOS, Windows and CI all bundle the same engine build.
// Bump deliberately (check the release has bin-macos-arm64 + bin-win-vulkan-x64 assets),
// or run with LLAMA_TAG=latest to pick the newest build that has binaries.
const LLAMA_DEFAULT_TAG = "b11960";

async function fetchLlama() {
  const ext = /\.(zip|tar\.gz)$/;
  const patterns = {
    macos: [new RegExp(`bin-macos-${ARCH}` + ext.source)],
    // Vulkan runs on NVIDIA, AMD and Intel GPUs; CPU build as fallback.
    windows: [new RegExp("bin-win-vulkan-x64" + ext.source), new RegExp("bin-win-cpu-x64" + ext.source)],
    linux: [new RegExp("bin-ubuntu-x64" + ext.source)],
  }[OS];
  const envTag = process.env.LLAMA_TAG ?? LLAMA_DEFAULT_TAG;
  const rel = await releaseWithAsset("ggml-org/llama.cpp", envTag === "latest" ? undefined : envTag, patterns);
  const asset = pickAsset(rel, patterns);
  const archive = join(WORK, asset.name);
  await download(asset.browser_download_url, archive);
  const dir = join(WORK, "llama");
  await mkdir(dir, { recursive: true });
  extract(archive, dir);
  const bin = await findFile(dir, `llama-server${EXE}`);
  if (!bin) throw new Error(`llama-server${EXE} not found in ${asset.name}`);
  await installDirOf(bin, join(OUT, "llama"));
  return { tag: rel.tag_name, asset: asset.name };
}

// -------------------------------------------------------------- whisper.cpp
async function fetchWhisper() {
  const useSource = OS !== "windows" || process.env.WHISPER_VULKAN === "1";
  const winPatterns = [/^whisper-bin-x64\.zip$/];
  // Source builds only need a tag; the Windows prebuilt needs a release that has the zip.
  const rel = useSource
    ? await release("ggml-org/whisper.cpp", process.env.WHISPER_TAG)
    : await releaseWithAsset("ggml-org/whisper.cpp", process.env.WHISPER_TAG, winPatterns);
  const tag = rel.tag_name;

  if (!useSource) {
    // Windows prebuilt (CPU). small.en on a modern CPU transcribes 45 s of speech in a few seconds.
    const asset = pickAsset(rel, winPatterns);
    const archive = join(WORK, asset.name);
    await download(asset.browser_download_url, archive);
    const dir = join(WORK, "whisper");
    await mkdir(dir, { recursive: true });
    extract(archive, dir);
    const bin = await findFile(dir, `whisper-cli${EXE}`);
    if (!bin) throw new Error(`whisper-cli${EXE} not found in ${asset.name}`);
    await installDirOf(bin, join(OUT, "whisper"));
    await download(
      `https://raw.githubusercontent.com/ggml-org/whisper.cpp/${tag}/samples/jfk.wav`,
      join(OUT, "samples", "jfk.wav"),
    );
    return { tag, build: "prebuilt-cpu", asset: asset.name };
  }

  // macOS (Metal) / Linux / Windows+Vulkan: build from source.
  // Static libs → a single self-contained whisper-cli binary, no dylib/rpath issues.
  const src = join(WORK, "whisper.cpp");
  run("git", ["clone", "--depth", "1", "--branch", tag, "https://github.com/ggml-org/whisper.cpp.git", src]);
  const flags = [
    "-B", "build", "-DCMAKE_BUILD_TYPE=Release", "-DBUILD_SHARED_LIBS=OFF",
    "-DWHISPER_BUILD_TESTS=OFF", "-DWHISPER_BUILD_SERVER=OFF",
  ];
  if (OS === "windows") flags.push("-DGGML_VULKAN=ON");
  run("cmake", flags, { cwd: src });
  run("cmake", ["--build", "build", "--config", "Release", "-j", String(cpus().length), "--target", "whisper-cli"], { cwd: src });
  const bin = await findFile(join(src, "build"), `whisper-cli${EXE}`);
  if (!bin) throw new Error("whisper-cli build output not found");
  const dest = join(OUT, "whisper");
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await cp(bin, join(dest, `whisper-cli${EXE}`));
  await mkdir(join(OUT, "samples"), { recursive: true });
  await cp(join(src, "samples", "jfk.wav"), join(OUT, "samples", "jfk.wav"));
  const build = OS === "macos" ? "source-metal" : OS === "windows" ? "source-vulkan" : "source-cpu";
  return { tag, build };
}

// ----------------------------------------------------------------- smoke test
function smoke(bin, args) {
  const r = spawnSync(bin, args, { encoding: "utf8", cwd: dirname(bin) });
  if (r.status !== 0) {
    throw new Error(`${bin} ${args.join(" ")} failed (${r.status ?? r.error}):\n${r.stderr?.slice(-2000)}`);
  }
  log("ok:", bin);
}

async function main() {
  log(`target: ${OS}/${ARCH} → ${OUT}`);
  await mkdir(WORK, { recursive: true });
  await mkdir(OUT, { recursive: true });
  let llama, whisper;
  try {
    llama = await fetchLlama();
    whisper = await fetchWhisper();
  } finally {
    await rm(WORK, { recursive: true, force: true });
  }
  // Verify AFTER the temp dir is gone, so anything still pointing into it fails here
  // instead of later in `tauri dev`.
  {
    smoke(join(OUT, "llama", `llama-server${EXE}`), ["--version"]);
    smoke(join(OUT, "whisper", `whisper-cli${EXE}`), ["--help"]);
    if (!existsSync(join(OUT, "samples", "jfk.wav"))) throw new Error("samples/jfk.wav missing");
    await writeFile(
      join(OUT, "VERSIONS.json"),
      JSON.stringify({ os: OS, arch: ARCH, llama, whisper, fetchedAt: new Date().toISOString() }, null, 2) + "\n",
    );
    log("done", JSON.stringify({ llama, whisper }));
  }
}

main().catch((e) => {
  console.error("[fetch-engines] FAILED:", e.message);
  process.exit(1);
});
