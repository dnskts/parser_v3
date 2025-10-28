// public/modules/table.js
// Отрисовка таблицы на всю ширину с горизонтальным скроллом.
// Добавлено: подсветка статусов в колонке "Операция" (Продажа/Возврат/Войд/Обмен).

export class Table{
    constructor({ headEl, bodyEl, columns }){
        this.headEl = headEl;
        this.bodyEl = bodyEl;
        this.columns = columns;
        this._renderHead();
    }

    _renderHead(){
        const tr = document.createElement('tr');
        this.columns.forEach(col=>{
            const th = document.createElement('th');
            // Текст заголовка берём как есть — оформление (capitalize) делает CSS
            th.textContent = col.title;
            tr.appendChild(th);
        });
        this.headEl.innerHTML = '';
        this.headEl.appendChild(tr);
    }

    _makeStatusBadge(text){
        // Нормализуем значение для сравнения
        const raw = String(text || '').trim();
        const v = raw.toLowerCase();

        // Сопоставление вариантов написания
        const isSale = v === 'продажа' || v === 'sale';
        const isRefund = v === 'возврат' || v === 'refund';
        const isVoid = v === 'void' || v === 'войд' || v === 'anul' || v === 'аннулирование';
        const isExchange = v === 'обмен' || v === 'exchange' || v === 'reissue' || v === 'reroute';

        const span = document.createElement('span');
        span.classList.add('status-badge');

        if (isSale) {
            span.classList.add('status-sale');
            span.textContent = raw || 'Продажа';
        } else if (isRefund) {
            span.classList.add('status-refund');
            span.textContent = raw || 'Возврат';
        } else if (isVoid) {
            span.classList.add('status-void');
            span.textContent = raw || 'Войд';
        } else if (isExchange) {
            span.classList.add('status-exchange');
            span.textContent = raw || 'Обмен';
        } else {
            // если это незнакомое значение — вернём просто текст без бейджа
            span.textContent = raw;
            span.classList.remove('status-badge');
        }

        return span;
    }

    _formatCell(value, col){
        // Специальная окраска для колонки "Операция"
        if ((col.key || '').toLowerCase() === 'operatsiya') {
            return this._makeStatusBadge(value);
        }

        // Базовое форматирование по типу (если тип есть в колонке)
        const t = col.type || 'string';
        if (value === '' || value === null || value === undefined) {
            return document.createTextNode('');
        }

        if (t === 'number' || t === 'integer') {
            const n = Number(value);
            return document.createTextNode(Number.isFinite(n) ? n.toLocaleString('ru-RU') : String(value));
        }

        if (t === 'boolean') {
            return document.createTextNode(value === true ? 'Да' : value === false ? 'Нет' : '');
        }

        if (t === 'date') {
            // В Schema.normalizeRows дата уже приводится к ISO-формату "YYYY-MM-DD HH:mm:ss"
            return document.createTextNode(String(value));
        }

        // По умолчанию: строка
        return document.createTextNode(String(value));
    }

    setRows(rows){
        this.bodyEl.innerHTML = '';

        for(const row of rows){
            const tr = document.createElement('tr');

            this.columns.forEach(col=>{
                const td = document.createElement('td');

                const content = this._formatCell(row[col.key], col);
                if (content instanceof Node) {
                    td.appendChild(content);
                } else {
                    td.textContent = String(content ?? '');
                }

                tr.appendChild(td);
            });

            this.bodyEl.appendChild(tr);
        }
    }
}
