// public/app.js
// Точка входа приложения. Здесь подключаем загрузчик, реестр парсеров, схему, таблицу и экспорт.

import { initLoader } from './modules/loader.js';
import { ParserRegistry } from './modules/parser-registry.js';
import { Schema } from './modules/schema.js';
import { Table } from './modules/table.js';
import { Exporter } from './modules/exporter.js';

// Глобальные (в рамках вкладки) хранилища текущих данных
const AppState = {
    unifiedRows: [],
    rawPayload: null,
    category: null,
    sourceName: '—', // название активного парсера/источника
    fileName: '—'    // имя загруженного файла
};

// Инициализация таблицы
const table = new Table({
    headEl: document.getElementById('tableHead'),
    bodyEl: document.getElementById('tableBody'),
    columns: Schema.getColumns()
});

// Обновление UI статуса
function setStatus(msg, type = 'info'){
    const el = document.getElementById('status');
    el.textContent = msg;
    el.style.color = type === 'error' ? '#c62828' : '#6b7c93';
}

// Установка «Парсер: <имя>»
function setSourceName(name){
    AppState.sourceName = name || '—';
    const el = document.getElementById('sourceName');
    if (el) el.textContent = AppState.sourceName;
}

// Установка «Файл: <имя>»
function setFileName(name){
    AppState.fileName = name || '—';
    const el = document.getElementById('fileName');
    if (el) el.textContent = AppState.fileName;
}

// При старте показываем дефолт
setSourceName('—');
setFileName('—');

// Инициализация загрузчика (только XML на этом этапе)
initLoader({
    fileInputEl: document.getElementById('fileInput'),
    dropZoneEl: document.getElementById('dropZone'),
    onFileContent: async (content, fileName) => {
        setStatus(`Файл «${fileName}» загружен. Анализируем...`);
        setSourceName('—');  // сброс перед попыткой парсинга
        setFileName(fileName || '—');

        AppState.rawPayload = content;

        // 1) Определяем поставщика и категорию из XML
        const { supplierCode, category } = ParserRegistry.detectFromXml(content);
        if(!supplierCode){
            setStatus('Не удалось определить поставщика из XML. Убедитесь, что в корне есть <Supplier ...> или <order_snapshot>.', 'error');
            return;
        }

        // 2) Динамически подгружаем парсер по коду
        try{
            setStatus(`Определён поставщик: ${supplierCode} (${category || 'category?'}). Загружаем парсер...`);
            const parser = await ParserRegistry.loadXmlParser(supplierCode);
            if(!parser?.parse){
                setStatus(`Парсер "${supplierCode}" не содержит метод parse()`, 'error');
                return;
            }

            // Поставим «Парсер: …»
            const parserDisplay = parser.displayName || parser.supplierCode || supplierCode;
            setSourceName(parserDisplay);

            // 3) Парсим и маппим к единой схеме
            const result = await parser.parse(content);
            if(!result?.rows?.length){
                setStatus('Парсер отработал, но данных не найдено.', 'error');
                return;
            }
            AppState.category = result.category;
            AppState.unifiedRows = Schema.normalizeRows(result.rows);

            // 4) Рендер таблицы
            table.setRows(AppState.unifiedRows);
            setStatus(`Готово. Найдено записей: ${AppState.unifiedRows.length}.`);
        }catch(err){
            console.error(err);
            setStatus(`Ошибка загрузки/исполнения парсера: ${err.message}`, 'error');
            setSourceName('—');
        }
    }
});

// Экспорт JSON
document.getElementById('exportJsonBtn').addEventListener('click', ()=>{
    if(!AppState.unifiedRows?.length || !AppState.category){
        setStatus('Нет данных для экспорта. Сначала загрузите XML и дождитесь таблицы.', 'error');
        return;
    }
    const json = Exporter.toUnifiedJson({
        category: AppState.category,
        rows: AppState.unifiedRows,
        rawPayload: AppState.rawPayload
    });

    const blob = new Blob([JSON.stringify(json, null, 2)], {type: 'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_${AppState.category}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('JSON сформирован и выгружен.');
});
