// server.mjs
// Лёгкий статический сервер для разработки (без зависимостей).
// Раздаёт файлы из корня проекта, чтобы работали пути /public/... и /client/...

import http from 'http';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === НАСТРОЙКИ ===
const HOST = '127.0.0.1';
const PORT = 8000;                 // при занятости порта поменяйте, например на 8080
const ROOT = __dirname;            // корень проекта (где лежат /public и /client)
const DEFAULT_FILE = '/public/index.html';

// MIME-типы (важно для ES-модулей: .js -> text/javascript)
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.htm':  'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.mjs':  'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xml':  'application/xml; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.txt':  'text/plain; charset=utf-8'
};

// Безопасное построение пути (без выхода выше ROOT)
function safeJoin(root, reqPath) {
    const decoded = decodeURIComponent(reqPath);
    const clean = decoded.split('?')[0].split('#')[0];
    const p = path.normalize(path.join(root, clean));
    if (!p.startsWith(root)) return null; // попытка выйти за корень
    return p;
}

const server = http.createServer(async (req, res) => {
    try {
        let reqPath = req.url || '/';

        // Редирект корня на /public/index.html
        if (reqPath === '/' || reqPath === '') {
            reqPath = DEFAULT_FILE;
        }

        // Безопасный абсолютный путь к файлу
        let filePath = safeJoin(ROOT, reqPath);
        if (!filePath) {
            res.writeHead(403, {'Content-Type': 'text/plain; charset=utf-8'});
            return res.end('Forbidden');
        }

        // Если запрашивают директорию — пробуем index.html внутри неё
        let stat;
        try {
            stat = await fsp.stat(filePath);
            if (stat.isDirectory()) {
                filePath = path.join(filePath, 'index.html');
                stat = await fsp.stat(filePath);
            }
        } catch {
            // 404
            res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
            return res.end('Not Found');
        }

        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';

        // Заголовки: кэш отключаем, CORS на всякий случай
        res.writeHead(200, {
            'Content-Type': mime,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Access-Control-Allow-Origin': '*'
        });

        const stream = fs.createReadStream(filePath);
        stream.on('error', (err) => {
            console.error(err);
            res.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'});
            res.end('Internal Server Error');
        });
        stream.pipe(res);
    } catch (err) {
        console.error(err);
        res.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'});
        res.end('Internal Server Error');
    }
});

server.listen(PORT, HOST, () => {
    console.log(`Dev server running at http://${HOST}:${PORT}/public/index.html`);
});
