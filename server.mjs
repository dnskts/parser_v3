// server.mjs
// Простой Node-сервер без внешних зависимостей.
// Раздаёт статику и даёт REST для управления файлами-провайдерами (client/parsers/api/*.json).

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = __dirname;              // корень проекта (там, где public/, client/)
const API_DIR = path.join(ROOT, 'client', 'parsers', 'api');

// Убедимся, что папка есть
fs.mkdirSync(API_DIR, { recursive: true });

function send(res, code, data, headers = {}) {
    const h = { 'Cache-Control': 'no-store', ...headers };
    if (typeof data === 'object' && !Buffer.isBuffer(data)) {
        h['Content-Type'] = 'application/json; charset=utf-8';
        res.writeHead(code, h);
        res.end(JSON.stringify(data));
    } else {
        res.writeHead(code, h);
        res.end(data);
    }
}

function contentTypeByExt(ext) {
    switch (ext) {
        case '.html': return 'text/html; charset=utf-8';
        case '.js':   return 'application/javascript; charset=utf-8';
        case '.css':  return 'text/css; charset=utf-8';
        case '.json': return 'application/json; charset=utf-8';
        case '.svg':  return 'image/svg+xml';
        case '.png':  return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        default:      return 'application/octet-stream';
    }
}

function serveStatic(req, res) {
    // ВАЖНО: не используем fileURLToPath для HTTP-URL; просто парсим путь
    const { pathname: rawPath } = new URL(req.url, 'http://localhost');
    // Корень сайта редиректим на public/index.html
    const pathname = rawPath === '/' ? '/public/index.html' : rawPath;

    // Нормализуем путь, обрезаем ведущий слэш и собираем абсолютный путь внутри ROOT
    const safeRelative = pathname.replace(/^\/+/, '');
    const absPath = path.join(ROOT, safeRelative);

    // Защита от выхода за пределы корня
    if (!absPath.startsWith(ROOT)) {
        return send(res, 403, 'Forbidden');
    }

    fsp.readFile(absPath)
        .then(buf => {
            const ct = contentTypeByExt(path.extname(absPath).toLowerCase());
            send(res, 200, buf, { 'Content-Type': ct });
        })
        .catch(() => send(res, 404, 'Not found'));
}

async function listProviders() {
    const files = await fsp.readdir(API_DIR);
    const out = [];
    for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const p = path.join(API_DIR, f);
        try {
            const txt = await fsp.readFile(p, 'utf-8');
            const obj = JSON.parse(txt);
            obj.id = obj.id || path.basename(f, '.json');
            out.push(obj);
        } catch { /* пропускаем битые */ }
    }
    out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return out;
}

function genId() { return 'p_' + Math.random().toString(36).slice(2, 10); }

async function createProvider(body) {
    const name = (body.name || '').trim();
    const baseUrl = (body.baseUrl || '').trim();
    const type = (body.type || 'air').trim();
    if (!name || !baseUrl) throw new Error('name and baseUrl are required');

    const id = genId();
    const record = {
        id,
        name,
        type,
        baseUrl,
        authType: body.authType || 'none',
        token: body.token || '',
        username: body.username || '',
        password: body.password || '',
        note: body.note || ''
    };
    const dest = path.join(API_DIR, id + '.json');
    await fsp.writeFile(dest, JSON.stringify(record, null, 2), 'utf-8');
    return record;
}

async function deleteProvider(id) {
    const p = path.join(API_DIR, id + '.json');
    await fsp.unlink(p);
}

const server = http.createServer(async (req, res) => {
    try {
        const { pathname } = new URL(req.url, 'http://localhost');

        // REST: /api/providers
        if (pathname === '/api/providers' && req.method === 'GET') {
            const list = await listProviders();
            return send(res, 200, list);
        }
        if (pathname === '/api/providers' && req.method === 'POST') {
            const chunks = [];
            for await (const ch of req) chunks.push(ch);
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
            try {
                const created = await createProvider(body);
                return send(res, 201, created);
            } catch (e) {
                return send(res, 400, String(e.message || e));
            }
        }
        if (pathname.startsWith('/api/providers/') && req.method === 'DELETE') {
            const id = pathname.split('/').pop();
            try {
                await deleteProvider(id);
                res.writeHead(204, { 'Cache-Control': 'no-store' });
                return res.end();
            } catch {
                return send(res, 404, 'Not found');
            }
        }

        // Остальное — статика
        return serveStatic(req, res);
    } catch (e) {
        console.error(e);
        send(res, 500, 'Server error');
    }
});

const PORT = 8000;
server.listen(PORT, () => {
    console.log(`Server ready: http://127.0.0.1:${PORT}/public/index.html`);
});
