// public/modules/exporter.js
// Экспорт: каждая строка таблицы -> отдельный блок { "<category>": [ record ] }.
// Поля — только из главной таблицы, включая новые: Fare, Taxes, VAT.

function toNumberOrEmpty(v){
    if (v === null || v === undefined || v === '') return '';
    const n = Number(String(v).replace(/\s+/g,'').replace(',', '.'));
    return Number.isFinite(n) ? n : '';
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

    // НОВОЕ: тариф/таксы/VAT
    fareValue:              'Fare',
    taxesValue:             'Taxes',
    vat:                    'VAT',

    sborPostavshchika:      'Supplier Fee',
    komissiyaPostavshchika: 'Supplier Commission',
    valyuta:                'Currency',
    spisokTaks:             'Taxes List',    // текстовый список такс, если нужен
    dataVyleta:             'Departure Date',
    emd:                    'EMD',
    kategoriyaEmd:          'EMD Category',
    shtrafZaVozvrat:        'Refund Penalty',
    kodPerevozchika:        'Carrier Code',
    issueDate:              'Issue Date',
    realizationDate:        'Realization Date'
};

// Сборка одной записи экспорта
function buildExportRecord(row){
    const out = {};
    for (const [srcKey, dstKey] of Object.entries(FIELD_MAP)) {
        out[dstKey] = row[srcKey] ?? '';
    }
    // приведение числовых для Fare/Taxes/VAT
    out['Fare'] = toNumberOrEmpty(out['Fare']);
    out['Taxes'] = toNumberOrEmpty(out['Taxes']);
    out['VAT'] = toNumberOrEmpty(out['VAT']);
    return out;
}

export const Exporter = {
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
