// public/modules/loader.js
// Отвечает за загрузку входных данных. Сейчас — ручная загрузка XML.
// В будущем здесь же можно добавить:
// - поддержку других форматов (CSV/JSON);
// - автозагрузку из папки на FTP (через бекенд/веб-воркер/WEBDAV и т.п.).

export function initLoader({ fileInputEl, dropZoneEl, onFileContent }){
    // Загрузка через input
    fileInputEl.addEventListener('change', async (e)=>{
        const file = e.target.files?.[0];
        if(file) readFile(file, onFileContent);
        fileInputEl.value = ''; // очищаем для повторной загрузки того же файла
    });

    // Drag & Drop
    ;['dragenter','dragover'].forEach(evtName=>{
        dropZoneEl.addEventListener(evtName, (e)=>{
            e.preventDefault(); e.stopPropagation();
            dropZoneEl.classList.add('dragover');
        });
    });
    ;['dragleave','drop'].forEach(evtName=>{
        dropZoneEl.addEventListener(evtName, (e)=>{
            e.preventDefault(); e.stopPropagation();
            dropZoneEl.classList.remove('dragover');
        });
    });
    dropZoneEl.addEventListener('drop', (e)=>{
        const file = e.dataTransfer.files?.[0];
        if(file) readFile(file, onFileContent);
    });
}

// Чтение файла как текст
function readFile(file, cb){
    const reader = new FileReader();
    reader.onload = ()=> cb(String(reader.result), file.name);
    reader.onerror = ()=> alert('Ошибка чтения файла');
    reader.readAsText(file, 'utf-8');
}
