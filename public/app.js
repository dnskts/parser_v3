// public/app.js
import { initLoader } from './modules/loader.js';
import { ParserRegistry } from './modules/parser-registry.js';
import { Schema } from './modules/schema.js';
import { Table } from './modules/table.js';
import { Exporter } from './modules/exporter.js';

const AppState = {
    unifiedRows: [],
    rawPayloads: [],
    lastCategory: null,
    sourceName: '—',
    fileNames: []
};

const table = new Table({
    headEl: document.getElementById('tableHead'),
    bodyEl: document.getElementById('tableBody'),
    columns: Schema.getColumns()
});

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
function setFileNames(){
    const el = document.getElementById('fileName');
    const list = AppState.fileNames.length ? AppState.fileNames.join('; ') : '—';
    if (el) el.textContent = list;
}

// стартовые значения
setSourceName('—');
setFileNames();

// Инициализация загрузчика (с onBatchStart — очистка)
initLoader({
    fileInputEl: document.getElementById('fileInput'),
    onBatchStart: async (files) => {
        AppState.unifiedRows = [];
        AppState.rawPayloads = [];
        AppState.lastCategory = null;
        AppState.sourceName = '—';
        AppState.fileNames = [];
        table.setRows([]);
        setSourceName('—');
        setFileNames();
        setStatus(`Очищено. Загружаем файлов: ${files.length}…`);
    },
    onFileContent: async (content, fileName) => {
        setStatus(`Файл «${fileName}» загружен. Анализируем...`);
        if (!AppState.fileNames.includes(fileName)) {
            AppState.fileNames.push(fileName);
            setFileNames();
        }

        const { supplierCode, category } = ParserRegistry.detectFromXml(content);
        if(!supplierCode){
            setStatus(`Не удалось определить поставщика для «${fileName}». Пропускаю.`, 'error');
            return;
        }

        try{
            const parser = await ParserRegistry.loadXmlParser(supplierCode);
            if(!parser?.parse){
                setStatus(`Парсер "${supplierCode}" не содержит метод parse().`, 'error');
                return;
            }

            const parserDisplay = parser.displayName || parser.supplierCode || supplierCode;
            setSourceName(parserDisplay);

            const result = await parser.parse(content);
            if(!result?.rows?.length){
                setStatus(`Парсер отработал, но данных не найдено в «${fileName}».`, 'error');
                return;
            }

            const normalized = Schema.normalizeRows(result.rows);
            AppState.unifiedRows.push(...normalized);
            AppState.rawPayloads.push(content);
            AppState.lastCategory = result.category || category || null;

            table.setRows(AppState.unifiedRows);
            setStatus(`Готово: добавлено ${normalized.length} записей из «${fileName}». Всего строк: ${AppState.unifiedRows.length}.`);
        }catch(err){
            console.error(err);
            setStatus(`Ошибка при обработке «${fileName}»: ${err.message}`, 'error');
        }
    }
});

// Экспорт JSON — ТОЛЬКО поля главной таблицы
document.getElementById('exportJsonBtn').addEventListener('click', ()=>{
    if(!AppState.unifiedRows?.length){
        setStatus('Нет данных для экспорта. Сначала загрузите XML-файлы.', 'error');
        return;
    }
    const json = Exporter.toUnifiedJson({
        rows: AppState.unifiedRows
        // rawPayload больше не передаём и не сохраняем
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
