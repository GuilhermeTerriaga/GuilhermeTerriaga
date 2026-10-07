import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const config = {
  lines: [
    { text: '$Guilherme = "hi!"', color: "#9CD9F0" },
    { text: '$About = "Dev, Nerd and Tech Lover!"', color: "#CDEE69" },
    {
      text: '$About2 = "Currently studying Go, Node, Elixir and WEB stuff"',
      color: "#CDEE69",
    },
    {
      text: '$Degree = "Bachelor\'s degree in Information Systems - 100% complete"',
      color: "#E09690",
    },
    { text: '$Job = "dev @ArthurInc"', color: "#E09690" },
    { text: "Sudo Welcome --to-my-GitHub!", color: "#90e090" },
    { text: ">", color: "#ffffff", cursorInfinite: true },
  ],
  timing: {
    initialDelay: 800, // ms antes da primeira linha
    charDuration: 40, // ms por caractere
    lineGap: 300, // ms entre terminar uma linha e começar a próxima
    cursorBlinkPeriod: 1000, // ms do ciclo de piscada
    tailDuration: 2500, // ms de "cauda" no final (pra ver o cursor piscando)
  },
  output: {
    fps: 20,
    width: 480, // largura final do GIF (null = manter 650)
    gifPath: "saida.gif",
    framesDir: ".frames",
    keepFrames: false,
  },
};

// ─────────────────────────────────────────────────────────────

async function main() {
  const template = await fs.readFile("index.html", "utf8");
  const configJson = JSON.stringify(config).replace(/</g, "\\u003c");
  const html = template.replace("__CONFIG__", configJson);

  const tmpPath = path.resolve(".render.html");
  await fs.writeFile(tmpPath, html);

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 700, height: 520 },
    deviceScaleFactor: 1,
  });
  await page.goto("file://" + tmpPath);
  await page.evaluate(() => document.fonts.ready);

  const totalDuration = await page.evaluate(() => window.TOTAL_DURATION);
  const fps = config.output.fps;
  const totalFrames = Math.ceil((totalDuration / 1000) * fps);

  // Captura frame a frame
  const framesDir = path.resolve(config.output.framesDir);
  await fs.rm(framesDir, { recursive: true, force: true });
  await fs.mkdir(framesDir, { recursive: true });

  const win = page.locator(".fakeWindow");
  for (let i = 0; i < totalFrames; i++) {
    const t = (i * 1000) / fps;
    await page.evaluate((tt) => window.renderAt(tt), t);
    await win.screenshot({
      path: path.join(framesDir, `f_${String(i).padStart(5, "0")}.png`),
      animations: "disabled",
    });
  }
  await browser.close();

  // Monta o GIF

  const pre = [];
  if (config.output.width) {
    pre.push(`scale=${config.output.width}:-1:flags=lanczos`);
  }
  pre.push("split[s0][s1]");

  const graph =
    `[0:v]${pre.join(",")};` +
    `[s0]palettegen=stats_mode=diff[p];` +
    `[s1][p]paletteuse=dither=bayer:bayer_scale=3[out]`;

  await run("ffmpeg", [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    path.join(framesDir, "f_%05d.png"),
    "-filter_complex",
    graph,
    "-map",
    "[out]",
    "-loop",
    "0",
    config.output.gifPath,
  ]);
  const dur = (totalDuration / 1000).toFixed(1);
  console.log(
    `${config.output.gifPath}  (${totalFrames} frames @ ${fps}fps, ${dur}s)`,
  );

  if (!config.output.keepFrames) {
    await fs.rm(framesDir, { recursive: true, force: true });
  }
  await fs.rm(tmpPath, { force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
