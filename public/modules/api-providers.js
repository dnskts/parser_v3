// public/modules/api-providers.js
// Хранение подключений не в браузере, а в ФАЙЛАХ:
// каждый провайдер — JSON-файл в client/parsers/api/<id>.json
// Для работы нужен локальный сервер (server.mjs), который умеет читать/писать эти файлы.

const API_BASE = '/api/providers';

async function http(method, path = '', data){
    const opt = { method, headers: {} };
    if (data){
        opt.headers['Content-Type'] = 'application/json';
        opt.body = JSON.stringify(data);
    }
    const res = await fetch(API_BASE + path, opt);
    if (!res.ok){
        const text = await res.text().catch(()=> '');
        throw new Error(text || (res.status + ' ' + res.statusText));
    }
    // Пустой ответ на DELETE — ок.
    if (res.status === 204) return null;
    return res.json();
}

export const ApiProviders = {
    /** Получить все подключения (читает файлы из client/parsers/api). */
    async getAll(){
        return http('GET', '');
    },
    /** Добавить новое подключение (создаёт файл). */
    async add({ name, type, baseUrl, authType='none', token='', username='', password='', note='' }){
        return http('POST', '', { name, type, baseUrl, authType, token, username, password, note });
    },
    /** Удалить подключение по id (удаляет соответствующий файл). */
    async remove(id){
        return http('DELETE', '/' + encodeURIComponent(id));
    }
};
