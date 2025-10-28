// public/modules/loader.js
// Загрузка входных данных: только через input[type=file multiple].
// Вызывает onBatchStart(files) один раз перед пачкой и onFileContent(content, fileName) для каждого файла.

export function initLoader({ fileInputEl, onFileContent, onBatchStart }){
    fileInputEl.addEventListener('change', async (e)=>{
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        // Сообщаем приложению, что начинается новая пачка — оно очистит таблицу/состояние
        if (typeof onBatchStart === 'function') {
            try { await onBatchStart(files); } catch {}
        }

        for (const file of files) {
            try{
                const text = await readFileAsText(file);
                await onFileContent(text, file.name);
            }catch{
                alert(`Ошибка чтения файла: ${file.name}`);
            }
        }

        // очищаем input, чтобы можно было выбрать те же файлы снова
        fileInputEl.value = '';
    });
}

function readFileAsText(file){
    return new Promise((resolve, reject)=>{
        const reader = new FileReader();
        reader.onload = ()=> resolve(String(reader.result));
        reader.onerror = ()=> reject(reader.error || new Error('read error'));
        reader.readAsText(file, 'utf-8');
    });
}
