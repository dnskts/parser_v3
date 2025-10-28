// public/app.js
// Точка входа приложения.

import { initLoader } from './modules/loader.js';
import { ParserRegistry } from './modules/parser-registry.js';
import { Schema } from './modules/schema.js';
import { Table } from './modules/table.js';
import { Exporter } from './modules/exporter.js';

// Глобальное состояние
const AppState = {
    unifiedRows: [],     // накапливаем все строки из всех файлов
    rawPayloads: [],     // массив исходных XML (для payloadRef при желании)
    lastCategory: null,  // категория последнего обработанного файла
    sourceName: '—',
    fileName: '—',
    filesProcessed: 0
};

// Таблица
const table = new Table({
    headEl: document.getElementById('tableHead'),
    bodyEl: document.getElementById('tableBody'),
    columns: Schema.getColumns()
});

// UI helpers
function setStatus(msg, type = 'info'){
    const el = document.getElementById('status');
    el.textContent = msg;
    el.style.color = type === 'error' ? '#c62828' : '#6b7c93';
}
function setSourceName(name){
    AppState.sourceName = name || '—';
    const el = document.getElementById('sourceName');
    if (el) el.textContent = AppState.sourceName;
}
function setFileName(name){
    AppState.fileName = name || '—';
    const el = document.getElementById('fileName');
    if (el) el.textContent = AppState.fileName;
}

// Стартовые значения
setSourceName('—');
setFileName('—');

// Инициализация загрузчика
initLoader({
    fileInputEl: document.getElementById('fileInput'),
    dropZoneEl: document.getElementById('dropZone'),
    onFileContent: async (content, fileName) => {
        // Для каждого файла — отдельная попытка парсинга
        setStatus(`Файл «${fileName}» загружен. Анализируем...`);
        setFileName(fileName || '—');
        setSourceName('—'); // сброс до загрузки парсера

        // Определяем поставщика
        const { supplierCode, category } = ParserRegistry.detectFromXml(content);
        if(!supplierCode){
            setStatus(`Не удалось определить поставщика из XML файла «${fileName}». Пропускаю.`, 'error');
            return;
        }

        try{
            const parser = await ParserRegistry.loadXmlParser(supplierCode);
            if(!parser?.parse){
                setStatus(`Парсер "${supplierCode}" не содержит метод parse().`, 'error');
                return;
            }

            // Показать имя парсера/файл
            const parserDisplay = parser.displayName || parser.supplierCode || supplierCode;
            setSourceName(parserDisplay);

            // Парсинг
            const result = await parser.parse(content);
            if(!result?.rows?.length){
                setStatus(`Парсер отработал, но данных не найдено в «${fileName}».`, 'error');
                return;
            }

            // Нормализуем и добавляем в общий список
            const normalized = Schema.normalizeRows(result.rows);
            // В normalized сохраняются наши вычисления (типы/даты/булевы)
            AppState.unifiedRows.push(...normalized);
            AppState.rawPayloads.push(content);
            AppState.lastCategory = result.category || category || null;
            AppState.filesProcessed += 1;

            // Перерисовка
            table.setRows(AppState.unifiedRows);
            setStatus(`Готово: добавлено ${normalized.length} записей из «${fileName}». Всего строк: ${AppState.unifiedRows.length}. Файлов обработано: ${AppState.filesProcessed}.`);
        }catch(err){
            console.error(err);
            setStatus(`Ошибка при обработке «${fileName}»: ${err.message}`, 'error');
            // sourceName оставляем последним успешным
        }
    }
});

// Экспорт JSON (поддержка нескольких категорий)
document.getElementById('exportJsonBtn').addEventListener('click', ()=>{
    if(!AppState.unifiedRows?.length){
        setStatus('Нет данных для экспорта. Сначала загрузите XML-файлы.', 'error');
        return;
    }
    const json = Exporter.toUnifiedJson({
        // Передаём все строки, Exporter сам разложит их по веткам по полю row.category
        rows: AppState.unifiedRows,
        // для совместимости оставим rawPayloads: можно склеить/сохранить последний — на ваш выбор
        rawPayload: AppState.rawPayloads[AppState.rawPayloads.length - 1] || null
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
