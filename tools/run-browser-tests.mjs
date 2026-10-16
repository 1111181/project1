// 跑 tests/browser/ 下的全部浏览器回归探针，打印汇总。
//
// 用法：
//   node tools/serve.mjs 8000        # 另开一个终端，保持运行
//   node tools/run-browser-tests.mjs
//
// 需要本机装了 Edge 或 Chrome。可以用环境变量指定：
//   BROWSER_PATH="C:\path\to\msedge.exe" node tools/run-browser-tests.mjs

import { spawn } from 'node:child_process';
import { readdirSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROBE_DIR = join(ROOT, 'tests', 'browser');
const PORT = Number(process.env.PORT ?? 8000);
const BASE = `http://localhost:${PORT}`;

const CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const browser = CANDIDATES.find((path) => existsSync(path));
if (!browser) {
  console.error('找不到 Edge 或 Chrome。用 BROWSER_PATH 环境变量指定可执行文件路径。');
  process.exit(2);
}

/** 服务器没起来的话，后面每个探针都会失败，先拦一下省时间。 */
async function serverIsUp() {
  try {
    const response = await fetch(BASE, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** 用无头浏览器打开一个页面，把渲染完的 DOM 打出来。 */
function dumpDom(url, profileDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(browser, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--hide-scrollbars',
      // 无头模式不产生新帧，rAF 不回调；探针自己会装替身，这里给足虚拟时间
      '--virtual-time-budget=60000',
      `--user-data-dir=${profileDir}`,
      '--dump-dom',
      url,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });

    const killer = setTimeout(() => child.kill(), 400000);
    child.on('error', reject);
    child.on('close', () => {
      clearTimeout(killer);
      resolve(out);
    });
  });
}

/** 从 dump 出来的 DOM 里取回探针打印的结果。 */
function readResult(html) {
  const match = html.match(/<pre id="out"[^>]*>([\s\S]*?)<\/pre>/);
  if (!match) return null;
  return match[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function main() {
  if (!(await serverIsUp())) {
    console.error(`连不上 ${BASE}。先在另一个终端跑：node tools/serve.mjs ${PORT}`);
    process.exit(2);
  }

  const probes = readdirSync(PROBE_DIR)
    .filter((name) => name.endsWith('-probe.html'))
    .sort();

  const profileDir = mkdtempSync(join(tmpdir(), 'todo-probe-'));
  let totalPass = 0;
  let totalFail = 0;
  let totalEnv = 0;
  const failing = [];

  try {
    for (const probe of probes) {
      const url = `${BASE}/tests/browser/${probe}`;
      const text = readResult(await dumpDom(url, profileDir));

      if (text === null) {
        console.log(`?  ${probe}：没有拿到结果（探针可能卡住或被杀了）`);
        failing.push(probe);
        continue;
      }

      const lines = text.split('\n').filter((line) => /^[✓✗]/.test(line));
      const bad = lines.filter((line) => line.startsWith('✗'));
      // drag-probe 第 0 项是「rAF 在无头环境里不回调」的环境诊断，本身就是证据，不算失败
      const envOnly = bad.filter((line) => line.includes('rAF'));
      const real = bad.filter((line) => !line.includes('rAF'));

      totalPass += lines.length - bad.length;
      totalFail += real.length;
      totalEnv += envOnly.length;

      const total = lines.length;
      const mark = real.length === 0 ? '✓' : '✗';
      console.log(`${mark}  ${probe}：${total - bad.length}/${total}`
        + (envOnly.length ? `（另有 ${envOnly.length} 项环境诊断）` : ''));

      for (const line of real) {
        console.log(`     ${line}`);
        failing.push(`${probe} ${line}`);
      }
    }
  } finally {
    rmSync(profileDir, { recursive: true, force: true });
  }

  console.log('');
  console.log(`合计：${totalPass} 项通过，${totalFail} 项失败`
    + (totalEnv ? `，${totalEnv} 项环境诊断（预期存在）` : ''));

  if (totalFail > 0) {
    console.log('');
    console.log('失败明细：');
    for (const line of failing) console.log(`  ${line}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
