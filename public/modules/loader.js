// public/modules/loader.js
// Отвечает за загрузку входных данных. Теперь поддерживает множественную загрузку:
// - input[type=file multiple]
// - drag&drop нескольких файлов
//
// Колбэк onFileContent вызывается ДЛЯ КАЖДОГО файла: onFileContent(content, fileName)

export function initLoader({ fileInputEl, dropZoneEl, onFileContent }){
    // Загрузка через input (несколько файлов)
    fileInputEl.addEventListener('change', async (e)=>{
        const files = Array.from(e.target.files || []);
        await _handleFiles(files, onFileContent);
        fileInputEl.value = ''; // очищаем для повторной загрузки тех же файлов
    });

    // Drag & Drop (несколько файлов)
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
    dropZoneEl.addEventListener('drop', async (e)=>{
        const files = Array.from(e.dataTransfer.files || []);
        await _handleFiles(files, onFileContent);
    });
}

async function _handleFiles(files, onFileContent){
    // фильтр по расширению .xml (мягко: если нет — всё равно попытаемся прочитать)
    for (const file of files) {
        await _readFile(file).then(text => onFileContent(text, file.name))
            .catch(()=> alert(`Ошибка чтения файла: ${file.name}`));
    }
}

function _readFile(file){
    return new Promise((resolve, reject)=>{
        const reader = new FileReader();
        reader.onload = ()=> resolve(String(reader.result));
        reader.onerror = ()=> reject(reader.error || new Error('read error'));
        reader.readAsText(file, 'utf-8');
    });
}
