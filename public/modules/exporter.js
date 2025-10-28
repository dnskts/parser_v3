// public/modules/exporter.js
// Экспорт: каждая строка таблицы уходит ОТДЕЛЬНЫМ БЛОКОМ в массиве.
// Блок имеет вид: { "<category>": [ <record> ] }.
// Поля — только из главной таблицы (ваша карта), тариф и таксы — раздельно.

function toNumberOrEmpty(v){
    if (v === null || v === undefined || v === '') return '';
    const n = Number(String(v).replace(/\s+/g,'').replace(',', '.'));
    return Number.isFinite(n) ? n : '';
}

// Суммируем таксы из текстового списка формата "CODE = amount" (по строкам / через ';')
function sumTaxesFromList(spisokTaks){
    if (!spisokTaks) return '';
    const parts = String(spisokTaks)
        .split(/\r?\n|;/)
        .map(s => s.trim())
        .filter(Boolean);

    let sum = 0;
    let found = false;

    for (const line of parts) {
        const m = line.match(/= *(-?\d+(?:[.,]\d+)?)/) || line.match(/(-?\d+(?:[.,]\d+)?)(?!.*\d)/);
        if (m) {
            const num = Number(m[1].replace(',', '.'));
            if (Number.isFinite(num)) { sum += num; found = true; }
        }
    }
    return found ? sum : '';
}

// Карта: ключи нашей схемы -> имена в выгрузке
const FIELD_MAP = {
    nomerProdukta:          'Product Number',
    dataSozdaniya:          'Date Created',
    tipProdukta:            'Product Type',
    operatsiya:             'Operation',
    nomerZakaza:            'Order Number',
    passazhirFamiliya:      'Last Name',
    passazhirImya:          'First Name',
    pnr:                    'PNR',
    punktOtpravleniya:      'Origin',
    punktPribytiya:         'Destination',
    sborPostavshchika:      'Supplier Fee',
    komissiyaPostavshchika: 'Supplier Commission',
    valyuta:                'Currency',
    spisokTaks:             'Taxes',               // текстовый список такс (как есть)
    dataVyleta:             'Departure Date',
    emd:                    'EMD',
    kategoriyaEmd:          'EMD Category',
    shtrafZaVozvrat:        'Refund Penalty',
    kodPerevozchika:        'Carrier Code',
    issueDate:              'Issue Date',
    realizationDate:        'Realization Date'
};

// Сборка одной записи экспорта (ТОЛЬКО перечисленные поля + денежный блок)
function buildExportRecord(row){
    const out = {};

    // Переносим простые поля
    for (const [srcKey, dstKey] of Object.entries(FIELD_MAP)) {
        out[dstKey] = row[srcKey] ?? '';
    }

    // Денежный блок: тариф и таксы отдельно
    const baseFare = toNumberOrEmpty(row.stoimost); // Базовый тариф → Base Fare

    // НДС — оставляем пустым, пока нет явного источника
    const vat = '';

    // Таксы без НДС: предпочитаем числовое row.taxes, иначе — суммируем список
    let taxesExclVat = '';
    if (row.taxes !== undefined && row.taxes !== null && row.taxes !== '') {
        taxesExclVat = toNumberOrEmpty(row.taxes);
    }
    if (taxesExclVat === '') {
        taxesExclVat = sumTaxesFromList(row.spisokTaks);
    }

    // Итоговая стоимость (если можем посчитать)
    let totalPrice = '';
    if (baseFare !== '' && taxesExclVat !== '') {
        totalPrice = Number(baseFare) + Number(taxesExclVat);
    }

    out['Base Fare'] = baseFare;
    out['VAT'] = vat;
    out['Total Taxes (excl. VAT)'] = taxesExclVat;
    out['Total Price'] = totalPrice;

    return out;
}

export const Exporter = {
    /**
     * Возвращает массив блоков, по одному на каждую строку:
     * [
     *   { "air": [ {...record1...} ] },
     *   { "air": [ {...record2...} ] },
     *   { "hotel": [ {...record3...} ] }
     * ]
     */
    toUnifiedJson({ category, rows }){
        const blocks = [];

        const pushRecord = (cat, row) => {
            const key = String(cat || '').toLowerCase() || 'air';
            const mapped = buildExportRecord(row || {});
            blocks.push({ [key]: [ mapped ] });
        };

        if (category && Array.isArray(rows)) {
            for (const r of rows) pushRecord(category, r);
        } else if (Array.isArray(rows)) {
            for (const r of rows) {
                const cat = String(r?.category || category || 'air').toLowerCase();
                pushRecord(cat, r);
            }
        }

        return blocks;
    }
};
