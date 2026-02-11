// public/modules/schema.js
// --------------------------------------------------------------
// ЕДИНАЯ СХЕМА ДАННЫХ ДЛЯ ТАБЛИЦЫ
// --------------------------------------------------------------
// Зачем нужна схема:
// 1) Описывает список столбцов (ключ = внутреннее имя поля на английском).
// 2) Хранит русские заголовки для отображения в интерфейсе.
// 3) Приводит типы данных к нужному формату (число, дата, булево).
//
// ВАЖНО: Теперь ВСЕ внутренние ключи — на корректном английском,
// согласованы с экспортом JSON. Это упростит поддержку и интеграции.
// --------------------------------------------------------------

function toNumber(val) {
    // Преобразуем значение к числу. Если не получилось — возвращаем пустую строку.
    if (val === null || val === undefined || val === '') return '';
    // Проверяем, является ли значение числом или строкой, содержащей число
    const strVal = String(val).trim();
    if (strVal === '') return '';
    
    // Удаляем лишние символы и заменяем запятую на точку
    const cleanVal = strVal.replace(/[^\d.,\-+e]/gi, '').replace(',', '.');
    if (cleanVal === '') return '';
    
    const n = Number(cleanVal);
    return Number.isFinite(n) ? n : '';
}
function toBoolean(val) {
    // Преобразуем к true/false. Если распознать не удалось — возвращаем пустую строку.
    if (val === null || val === undefined || val === '') return '';
    const s = String(val).trim().toLowerCase();
    if (['true','1','y','yes','да','д','истина','on','enabled'].includes(s)) return true;
    if (['false','0','n','no','нет','н','ложь','off','disabled'].includes(s)) return false;
    return '';
}
function toIsoDate(val) {
    // Преобразуем к формату "YYYY-MM-DD HH:mm:ss" для единообразия.
    if (val === null || val === undefined || val === '') return '';
    const s = String(val).trim();
    const dmY = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
    const yMd = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

    let d;
    if (dmY.test(s)) {
        const m = s.match(dmY);
        d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    } else if (yMd.test(s)) {
        const m = s.match(yMd);
        d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    } else {
        const t = Date.parse(s);
        if (Number.isFinite(t)) d = new Date(t);
    }

    if (!d || isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const Schema = {
    // ------------------------------------------------------------
    // Описание колонок:
    // key   — внутренний ключ поля (английский, используется во всех скриптах)
    // title — заголовок, который видит пользователь в таблице (русский)
    // type  — тип данных (number/date/boolean/string)
    // ------------------------------------------------------------
    _columns: [
        { key: 'productNumber',       title: 'Номер продукта',        type: 'string'  },
        { key: 'dateCreated',         title: 'Дата создания',         type: 'date'    },
        { key: 'productType',         title: 'Тип продукта',          type: 'string'  },
        { key: 'operation',           title: 'Операция',              type: 'string'  },
        { key: 'orderNumber',         title: 'Номер заказа',          type: 'string'  },

        { key: 'lastName',            title: 'Пассажир Фамилия',      type: 'string'  },
        { key: 'firstName',           title: 'Пассажир Имя',          type: 'string'  },
        { key: 'pnr',                 title: 'PNR',                   type: 'string'  },
        { key: 'origin',              title: 'Пункт отправления',     type: 'string'  },
        { key: 'destination',         title: 'Пункт прибытия',        type: 'string'  },
        { key: 'hotel',               title: 'Отель',                 type: 'string'  }, // название отеля

        // Денежные значения
        { key: 'totalPrice',          title: 'Стоимость',             type: 'number'  },
        { key: 'fare',                title: 'Тариф',                 type: 'number'  },
        { key: 'taxes',               title: 'Таксы',                 type: 'number'  },
        { key: 'vat',                 title: 'Vat',                   type: 'number'  },
        { key: 'railService',         title: 'Сервис ЖД',             type: 'number'  },

        { key: 'supplierFee',         title: 'Сбор поставщика',       type: 'number'  },
        { key: 'supplierCommission',  title: 'Комиссия поставщика',   type: 'number'  },
        { key: 'currency',            title: 'Валюта',                type: 'string'  },

        // Дополнительно храним «Список такс» для наглядности в UI (в экспорт не идёт)
        { key: 'taxesList',           title: 'Список такс',           type: 'string'  },

        { key: 'departureDate',       title: 'Дата вылета',           type: 'date'    },
        { key: 'emd',                 title: 'EMD?',                  type: 'boolean' },
        { key: 'emdCategory',         title: 'Категория EMD',         type: 'string'  },
        { key: 'refundPenalty',       title: 'Штраф за возврат?',     type: 'boolean' },
        { key: 'carrierCode',         title: 'Код перевозчика',       type: 'string'  },
        { key: 'issueDate',           title: 'Дата выписки',          type: 'date'    },
        { key: 'realizationDate',     title: 'Дата реализации',       type: 'date'    },
        
        { key: 'apiLink',             title: 'API',                   type: 'string'  },

        // Служебное поле для логики (не показываем в таблице, но оставляем, если нужно)
        // { key: 'category',         title: '(Категория)',           type: 'string'  },
    ],

    getColumns(){ return this._columns; },

    // Приведение типов + авто-расчёт «Дата реализации»
    normalizeRows(rows){
        const cols = this._columns;
        return (rows || []).map((raw)=>{
            const out = {};
            // Заполняем все поля по списку колонок, даже если их ещё нет в данных
            for (const col of cols) out[col.key] = raw[col.key] ?? '';

            // Приведение типов согласно схеме
            for (const col of cols) {
                const v = out[col.key];
                switch (col.type) {
                    case 'number': case 'integer': out[col.key] = toNumber(v); break;
                    case 'boolean': out[col.key] = toBoolean(v); break;
                    case 'date': out[col.key] = toIsoDate(v); break;
                    default: out[col.key] = (v === null || v === undefined) ? '' : String(v);
                }
            }

            // Бизнес-правило: "Дата реализации"
            // Для air/rail = Issue Date, для hotel = (если есть Check-Out) иначе Issue Date.
            out.realizationDate = this.computeRealizationDate({
                category: raw.category || '',
                issueDate: out.issueDate,
                checkOutDate: out.checkOutDate || '' // поле может прийти из парсера отелей (если добавим)
            });

            return out;
        });
    },

    computeRealizationDate(row){
        const cat = String(row.category || '').toLowerCase();
        if (cat === 'air' || cat === 'rail') return row.issueDate || '';
        if (cat === 'hotel') return row.checkOutDate || row.issueDate || '';
        return row.issueDate || '';
    }
};
