// public/app.js
// Управление загрузкой файлов, маршрутизация к парсерам, отрисовка таблицы,
// статусы файлов (успех/ошибка) и теперь — список всех использованных парсеров.

import { initLoader } from './modules/loader.js';
import { ParserRegistry } from './modules/parser-registry.js';
import { Schema } from './modules/schema.js';
import { Table } from './modules/table.js';
import { Exporter } from './modules/exporter.js';

const AppState = {
    unifiedRows: [],       // все собранные строки таблицы
    rawPayloads: [],       // исходные тексты XML (если нужно)
    lastCategory: null,    // не критично при смешанных категориях
    files: [],             // [{name, ok, message}]
    parsers: []            // уникальные displayName использованных парсеров
};

const table = new Table({
    headEl: document.getElementById('tableHead'),
    bodyEl: document.getElementById('tableBody'),
    columns: Schema.getColumns()
});

// ============== UI helpers ==============

function setStatus(msg, type = 'info'){
    const el = document.getElementById('status');
    el.textContent = msg;
    el.style.color = type === 'error' ? '#c62828' : '#6b7c93';
}

function renderFileList(){
    const wrap = document.getElementById('fileList');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!AppState.files.length) {
        const span = document.createElement('span');
        span.className = 'file-tag';
        span.textContent = '—';
        wrap.appendChild(span);
        return;
    }
    for (const f of AppState.files) {
        const tag = document.createElement('span');
        tag.className = 'file-tag ' + (f.ok ? 'success' : 'error');
        tag.textContent = f.name;
        if (!f.ok && f.message) tag.title = f.message; // всплывающая подсказка с ошибкой
        wrap.appendChild(tag);
    }
}

function renderParserList(){
    const wrap = document.getElementById('parserList');
    if (!wrap) return;
    wrap.innerHTML = '';
    const names = Array.from(new Set(AppState.parsers)); // уникальные
    if (!names.length) {
        const span = document.createElement('span');
        span.className = 'file-tag';
        span.textContent = '—';
        wrap.appendChild(span);
        return;
    }
    for (const name of names) {
        const tag = document.createElement('span');
        tag.className = 'file-tag';  // нейтральный бейдж (без зелёного/красного)
        tag.textContent = name;
        wrap.appendChild(tag);
    }
}

function upsertFileStatus(name, { ok, message }){
    const idx = AppState.files.findIndex(f => f.name === name);
    const rec = { name, ok: !!ok, message: message || '' };
    if (idx >= 0) AppState.files[idx] = rec; else AppState.files.push(rec);
    renderFileList();
}

function addParserName(displayName){
    if (!displayName) return;
    AppState.parsers.push(displayName);
    renderParserList();
}

// Инициализация пустого состояния панелей
renderFileList();
renderParserList();

// ============== Лоадер ==============

initLoader({
    fileInputEl: document.getElementById('fileInput'),

    // Перед началом новой пачки файлов — очищаем всё
    onBatchStart: async (files) => {
        AppState.unifiedRows = [];
        AppState.rawPayloads = [];
        AppState.lastCategory = null;
        AppState.files = [];
        AppState.parsers = [];
        table.setRows([]);
        renderFileList();
        renderParserList();
        setStatus(`Очищено. Загружаем файлов: ${files.length}…`);
    },

    // Содержимое каждого файла
    onFileContent: async (content, fileName) => {
        setStatus(`Файл «${fileName}» загружен. Анализируем...`);

        const markError = (msg)=>{
            upsertFileStatus(fileName, { ok: false, message: msg });
            setStatus(`Ошибка при обработке «${fileName}»: ${msg}`, 'error');
        };
        const markOk = ()=>{
            upsertFileStatus(fileName, { ok: true, message: '' });
        };

        // Определяем поставщика и категорию
        const det = ParserRegistry.detectFromXml(content);
        const supplierCode = det?.supplierCode;
        const category = det?.category;

        if(!supplierCode){
            markError('Не удалось определить поставщика по содержимому XML.');
            return;
        }

        try{
            const parser = await ParserRegistry.loadXmlParser(supplierCode);
            if(!parser?.parse){
                markError(`Парсер "${supplierCode}" не содержит метод parse().`);
                return;
            }

            const parserDisplay = parser.displayName || parser.supplierCode || supplierCode;

            const result = await parser.parse(content);

            // Если парсер вернул пусто — считаем это ошибкой для файла
            if(!result?.rows?.length){
                markError('Парсер отработал, но данных не найдено.');
                return;
            }

            // Ок — добавляем данные
            const normalized = Schema.normalizeRows(result.rows);
            AppState.unifiedRows.push(...normalized);
            AppState.rawPayloads.push(content);
            AppState.lastCategory = result.category || category || null;

            table.setRows(AppState.unifiedRows);
            markOk();

            // Добавляем название парсера в общий список (уникальность обеспечит renderParserList)
            addParserName(parserDisplay);

            setStatus(`Готово: добавлено ${normalized.length} записей из «${fileName}». Всего строк: ${AppState.unifiedRows.length}.`);
        }catch(err){
            console.error(err);
            markError(err?.message || 'Неизвестная ошибка при парсинге.');
        }
    }
});

// ============== Экспорт JSON ==============

document.getElementById('exportJsonBtn').addEventListener('click', ()=>{
    if(!AppState.unifiedRows?.length){
        setStatus('Нет данных для экспорта. Сначала загрузите XML-файлы.', 'error');
        return;
    }
    const json = Exporter.toUnifiedJson({
        rows: AppState.unifiedRows
    });

    const blob = new Blob([JSON.stringify(json, null, 2)], {type: 'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('JSON сформирован и выгружен.');
});
