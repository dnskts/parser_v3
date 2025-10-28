// public/modules/schema.js
// Единая схема таблицы данных.
// Новое поле: "Отель" (hotelName), тип string.

function toNumber(val) {
    if (val === null || val === undefined || val === '') return '';
    const s = String(val).trim().replace(/\s+/g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : '';
}
function toBoolean(val) {
    if (val === null || val === undefined || val === '') return '';
    const s = String(val).trim().toLowerCase();
    if (['true','1','y','yes','да','д','истина','istina'].includes(s)) return true;
    if (['false','0','n','no','нет','н','ложь','lozh'].includes(s)) return false;
    return '';
}
function toIsoDate(val) {
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
    _columns: [
        { key: 'nomerProdukta',          title: 'Номер продукта',        type: 'string'  },
        { key: 'dataSozdaniya',          title: 'Дата создания',         type: 'date'    },
        { key: 'tipProdukta',            title: 'Тип продукта',          type: 'string'  },
        { key: 'operatsiya',             title: 'Операция',              type: 'string'  },
        { key: 'nomerZakaza',            title: 'Номер заказа',          type: 'string'  },
        { key: 'passazhirFamiliya',      title: 'Пассажир Фамилия',      type: 'string'  },
        { key: 'passazhirImya',          title: 'Пассажир Имя',          type: 'string'  },
        { key: 'pnr',                    title: 'PNR',                   type: 'string'  },
        { key: 'punktOtpravleniya',      title: 'Пункт отправления',     type: 'string'  },
        { key: 'punktPribytiya',         title: 'Пункт прибытия',        type: 'string'  },
        { key: 'hotelName',              title: 'Отель',                 type: 'string'  }, // NEW

        // Денежные
        { key: 'stoimost',               title: 'Стоимость',             type: 'number'  },
        { key: 'fareValue',              title: 'Тариф',                 type: 'number'  }, // экспорт: Fare
        { key: 'taxesValue',             title: 'Таксы',                 type: 'number'  }, // экспорт: Taxes
        { key: 'vat',                    title: 'Vat',                   type: 'number'  }, // экспорт: VAT
        { key: 'railService',            title: 'Сервис ЖД',             type: 'number'  },

        { key: 'sborPostavshchika',      title: 'Сбор поставщика',       type: 'number'  },
        { key: 'komissiyaPostavshchika', title: 'Комиссия поставщика',   type: 'number'  },
        { key: 'valyuta',                title: 'Валюта',                type: 'string'  },
        { key: 'spisokTaks',             title: 'Список такс',           type: 'string'  },

        { key: 'dataVyleta',             title: 'Дата вылета',           type: 'date'    },
        { key: 'emd',                    title: 'EMD?',                  type: 'boolean' },
        { key: 'kategoriyaEmd',          title: 'Категория EMD',         type: 'string'  },
        { key: 'shtrafZaVozvrat',        title: 'Штраф за возврат?',     type: 'boolean' },
        { key: 'kodPerevozchika',        title: 'Код перевозчика',       type: 'string'  },
        { key: 'issueDate',              title: 'Дата выписки',          type: 'date'    },
        { key: 'realizationDate',        title: 'Дата реализации',       type: 'date'    }
    ],

    getColumns(){ return this._columns; },

    normalizeRows(rows){
        const cols = this._columns;
        return (rows || []).map((raw)=>{
            const out = {};
            for (const col of cols) out[col.key] = raw[col.key] ?? '';

            // Приведение типов
            for (const col of cols) {
                const v = out[col.key];
                switch (col.type) {
                    case 'number': case 'integer': out[col.key] = toNumber(v); break;
                    case 'boolean': out[col.key] = toBoolean(v); break;
                    case 'date': out[col.key] = toIsoDate(v); break;
                    default: out[col.key] = (v === null || v === undefined) ? '' : String(v);
                }
            }

            // Правило "Дата реализации"
            out.realizationDate = this.computeRealizationDate({
                category: raw.category || '',
                issueDate: out.issueDate,
                checkOutDate: out.checkOutDate || ''
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
