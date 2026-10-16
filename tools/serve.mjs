// 本地预览用的极简静态服务器。零依赖，只用 Node 内置模块。
//
// 用法：node tools/serve.mjs [端口]      （默认 8000）
//
// 为什么需要它：本项目用 ES modules，双击 index.html 从 file:// 打开会被浏览器
// 以 CORS 为由拦截。必须经 http 提供。这台机器上没有 python，所以自带一个。

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PORT = Number(process.argv[2] ?? 8000);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    // 防目录穿越：规范化之后必须仍在 ROOT 里面
    const filePath = normalize(join(ROOT, pathname));
    if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(filePath);
    if (!info.isFile()) {
      response.writeHead(404).end('Not Found');
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      // 开发期不要缓存，免得改完看不到效果
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`静态服务器已启动：http://localhost:${PORT}/`);
  console.log(`根目录：${ROOT}`);
});
