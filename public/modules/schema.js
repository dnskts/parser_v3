// public/modules/schema.js
// Единая схема полей на основе файла «поля б24 услуги.xlsx».
// Каждый столбец имеет: key (внутренний ключ, camelCase), title (заголовок по-русски), type.
// Допустимые типы: 'string' | 'integer' | 'number' | 'date' | 'boolean'.
//
// Важно:
// - Нормализация автоматически приводит boolean/number/date к единообразию.
// - "Дата реализации": для air/rail = "Дата выписки"; для hotel = "Дата выезда" (если есть, иначе дата выписки).

function toNumber(val) {
    if (val === null || val === undefined || val === '') return '';
    // допускаем пробелы и запятые как разделители
    const s = String(val).trim().replace(/\s+/g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : '';
}

function toBoolean(val) {
    if (val === null || val === undefined || val === '') return '';
    const s = String(val).trim().toLowerCase();
    if (['true','1','y','yes','да','д','истина'].includes(s)) return true;
    if (['false','0','n','no','нет','н','ложь'].includes(s)) return false;
    return '';
}

function toIsoDate(val) {
    if (val === null || val === undefined || val === '') return '';
    // Пытаемся распознать дату в распространённых форматах, включая "дд.мм.гггг", "гггг-мм-дд", с/без времени
    const s = String(val).trim();
    // Заменим русские точки на дефисы для Date.parse; отдельно попробуем dd.mm.yyyy hh:mm:ss
    const dmY = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
    const yMd = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

    let d;
    if (dmY.test(s)) {
        const m = s.match(dmY);
        const dd = Number(m[1]);
        const MM = Number(m[2]);
        const yyyy = Number(m[3]);
        const hh = Number(m[4] || 0);
        const mm = Number(m[5] || 0);
        const ss = Number(m[6] || 0);
        d = new Date(yyyy, MM - 1, dd, hh, mm, ss);
    } else if (yMd.test(s)) {
        const m = s.match(yMd);
        const yyyy = Number(m[1]);
        const MM = Number(m[2]);
        const dd = Number(m[3]);
        const hh = Number(m[4] || 0);
        const mm = Number(m[5] || 0);
        const ss = Number(m[6] || 0);
        d = new Date(yyyy, MM - 1, dd, hh, mm, ss);
    } else {
        const t = Date.parse(s);
        if (Number.isFinite(t)) d = new Date(t);
    }

    if (!d || isNaN(d.getTime())) return '';
    // Возвращаем ISO-строку без таймзоны (локальная дата/время), чтобы не «прыгал» часовой пояс
    const pad = n => String(n).padStart(2, '0');
    const iso = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return iso;
}

export const Schema = {
    // Колонки и их типы (строго по вашему Excel)
    _columns: [
        { key: 'nomerProdukta',        title: 'Номер продукта',        type: 'string'  },
        { key: 'dataSozdaniya',        title: 'Дата создания',         type: 'date'    },
        { key: 'tipProdukta',          title: 'Тип продукта',          type: 'string'  },
        { key: 'operatsiya',           title: 'Операция',              type: 'string'  },
        { key: 'nomerZakaza',          title: 'Номер заказа',          type: 'string'  },
        { key: 'passazhirFamiliya',    title: 'Пассажир Фамилия',      type: 'string'  },
        { key: 'passazhirImya',        title: 'Пассажир Имя',          type: 'string'  },
        { key: 'pnr',                  title: 'PNR',                   type: 'string'  },
        { key: 'punktOtpravleniya',    title: 'Пункт отправления',     type: 'string'  },
        { key: 'punktPribytiya',       title: 'Пункт прибытия',        type: 'string'  },
        { key: 'stoimost',             title: 'Стоимость',             type: 'number'  },
        { key: 'sborPostavshchika',    title: 'Сбор поставщика',       type: 'number'  },
        { key: 'komissiyaPostavshchika', title: 'Комиссия поставщика', type: 'number'  },
        { key: 'valyuta',              title: 'Валюта',                type: 'string'  },
        { key: 'spisokTaks',           title: 'Список такс',           type: 'string'  }, // при желании можно позже распарсить в структуру
        { key: 'dataVyleta',           title: 'Дата вылета',           type: 'date'    },
        { key: 'emd',                  title: 'EMD?',                  type: 'boolean' },
        { key: 'shtrafZaVozvrat',      title: 'Штраф за возврат?',     type: 'boolean' },
        { key: 'kodPerevozchika',      title: 'Код перевозчика',       type: 'string'  },
        { key: 'issueDate',            title: 'Дата выписки',          type: 'date'    },
        { key: 'realizationDate',      title: 'Дата реализации',       type: 'date'    }
    ],

    // Получить список колонок
    getColumns(){ return this._columns; },

    // Нормализация и приведение типов
    normalizeRows(rows){
        const cols = this._columns;
        return (rows || []).map((raw)=>{
            const out = {};
            // 1) Скопируем значения по ключам, даже если парсер не все вернул
            for (const col of cols) {
                out[col.key] = raw[col.key] ?? '';
            }
            // 2) Приведение типов
            for (const col of cols) {
                const v = out[col.key];
                switch (col.type) {
                    case 'number':
                    case 'integer':
                        out[col.key] = toNumber(v);
                        break;
                    case 'boolean':
                        out[col.key] = toBoolean(v);
                        break;
                    case 'date':
                        out[col.key] = toIsoDate(v);
                        break;
                    default:
                        // string — оставляем как есть
                        out[col.key] = (v === null || v === undefined) ? '' : String(v);
                }
            }
            // 3) Автовычисление Даты реализации по правилам домена
            out.realizationDate = this.computeRealizationDate({
                category: raw.category || '',              // категория (air/rail/hotel/transfer) парсер пусть присылает отдельно
                issueDate: out.issueDate,                  // уже приведённая дата
                checkOutDate: out.checkOutDate || ''      // если появится поле «Дата выезда» — учтём
            });
            return out;
        });
    },

    // Бизнес-правило по "Дате реализации"
    computeRealizationDate(row){
        const cat = String(row.category || '').toLowerCase();
        if (cat === 'air' || cat === 'rail') {
            return row.issueDate || '';
        }
        if (cat === 'hotel') {
            // в данной схеме поля checkOutDate нет; если добавим — учтётся здесь
            return row.checkOutDate || row.issueDate || '';
        }
        // transfer / прочее
        return row.issueDate || '';
    }
};
