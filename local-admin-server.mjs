import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const root = resolve('website');
const apiOrigin = process.env.API_ORIGIN || 'http://127.0.0.1:3001';
const port = Number(process.env.WEB_PORT || 8081);

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

function sendText(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function staticFilePath(pathname) {
  const cleanPath = pathname === '/' ? '/admin.html' : pathname;
  const relativePath = decodeURIComponent(cleanPath).replace(/^\/+/, '');
  const filePath = resolve(root, relativePath);
  const pathFromRoot = relative(root, filePath);

  if (pathFromRoot.startsWith('..') || pathFromRoot === '..' || resolve(pathFromRoot) === pathFromRoot) {
    return null;
  }

  return filePath;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (url.pathname.startsWith('/api')) {
      const headers = new Headers(req.headers);
      headers.delete('host');
      const hasBody = !['GET', 'HEAD'].includes(req.method || 'GET');
      const upstream = await fetch(`${apiOrigin}${url.pathname}${url.search}`, {
        method: req.method,
        headers,
        body: hasBody ? req : undefined,
        duplex: hasBody ? 'half' : undefined,
      });
      const responseHeaders = {};
      upstream.headers.forEach((value, key) => {
        if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
          responseHeaders[key] = value;
        }
      });

      res.writeHead(upstream.status, responseHeaders);
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }

    const filePath = staticFilePath(url.pathname);
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      sendText(res, 404, 'Not found');
      return;
    }

    res.writeHead(200, {
      'content-type': mimeTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
    });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    sendText(res, 500, error instanceof Error ? error.message : String(error));
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`admin app listening on http://127.0.0.1:${port}`);
});
