// client/parsers/xml/myagent_air.js
// Парсер XML формата МойАгент (авиа). Продажи и возвраты.
// Тариф, Таксы и Стоимость определяем по атрибутам air_ticket_prod (fare, taxes, service_fee).
// Стоимость = total/amount_total, иначе fare + taxes.

export default {
    supplierCode: 'myagent_air',
    displayName: 'МойАгент (авиа)',

    async parse(xmlText){
        const doc = new DOMParser().parseFromString(xmlText, 'text/xml');

        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            throw new Error('Некорректный XML.');
        }

        const root = doc.querySelector('order_snapshot');
        if(!root){
            // важно: бросаем ошибку, чтобы UI пометил файл красным и показал подсказку
            throw new Error('Файл не похож на формат МойАгент (нет <order_snapshot>).');
        }

        // Заголовок заказа
        const header = root.querySelector('header');
        const orderId   = header?.getAttribute('ord_id') || '';
        const currency  = header?.getAttribute('currency') || '';
        const createdAt = header?.getAttribute('time') || '';

        // PNR (берём первый rloc)
        const pnr = root.querySelector('reservations > reservation')?.getAttribute('rloc') || '';

        // Пассажиры (мап по psgr_id)
        const paxMap = new Map();
        root.querySelectorAll('passengers > passenger').forEach(p=>{
            const id = p.getAttribute('psgr_id');
            paxMap.set(id, {
                firstName: p.getAttribute('first_name') || '',
                lastName:  p.getAttribute('name') || ''
            });
        });

        // Документы (для сопоставления по prod_id)
        const airDocs = [];
        const emdDocs = [];
        root.querySelectorAll('travel_docs > travel_doc').forEach(tdoc=>{
            const air = tdoc.querySelector('air_ticket_doc');
            const emd = tdoc.querySelector('emd_ticket_doc');
            if (air) airDocs.push(air);
            if (emd) emdDocs.push(emd);
        });

        function getTicketNumbersByProdId(prodId){
            const res = [];
            airDocs.forEach(d=>{
                if (d.getAttribute('prod_id') === String(prodId)) {
                    const num  = d.getAttribute('tkt_number') || '';
                    const oper = (d.getAttribute('tkt_oper') || '').toUpperCase(); // TKT/CANX/REF/...
                    const date = d.getAttribute('tkt_date') || '';
                    res.push({ number: num, oper, date });
                }
            });
            return res;
        }
        function hasEmdForProd(prodId){
            return emdDocs.some(d=>{
                const main = d.getAttribute('main_prod_id') || d.getAttribute('prod_id') || '';
                return main === String(prodId);
            });
        }

        const toNum = (v)=>{
            if (v === null || v === undefined || v === '') return '';
            const n = Number(String(v).replace(',', '.'));
            return Number.isFinite(n) ? n : '';
        };

        const rows = [];
        root.querySelectorAll('products > product > air_ticket_prod').forEach(prod=>{
            const prodId = prod.getAttribute('prod_id') || '';

            // Сегменты
            const segs = Array.from(prod.querySelectorAll('air_seg'));
            const firstSeg = segs[0] || null;
            const lastSeg  = segs[segs.length-1] || null;

            const origin = prod.getAttribute('origin') || firstSeg?.getAttribute('departure_airport') || '';
            const dest   = prod.getAttribute('destination') || lastSeg?.getAttribute('arrival_airport') || '';

            // Перевозчик
            const validating = prod.getAttribute('validating_carrier') || '';
            const firstCarrier = firstSeg?.getAttribute('carrier') || '';
            const carrierCode = validating || firstCarrier || '';

            // **** Тариф/Таксы/Стоимость ****
            const fareAttr   = prod.getAttribute('fare')   || ''; // тариф
            const taxesAttr  = prod.getAttribute('taxes')  || ''; // таксы (сумма)
            const serviceFee = prod.getAttribute('service_fee') || '';

            const fareValue  = toNum(fareAttr);
            let taxesValue   = toNum(taxesAttr);

            // Список такс + VAT; fallback для суммы такс, если @taxes отсутствует
            const taxes = [];
            let taxesSumFallback = 0;
            let vatValue = '';
            prod.querySelectorAll('air_tax').forEach(t=>{
                const code = (t.getAttribute('code') || '').trim();
                const amountRaw = t.getAttribute('amount') || '';
                const amount = toNum(amountRaw);
                if (code) taxes.push(`${code} = ${amountRaw}`);
                if (amount !== '') {
                    taxesSumFallback += Number(amount);
                    if ((code.toUpperCase() === 'VAT' || code.toUpperCase() === 'НДС') && vatValue === '') {
                        vatValue = Number(amount);
                    }
                }
            });
            if (taxesValue === '') {
                taxesValue = (taxes.length ? taxesSumFallback : '');
            }
            const taxesList = taxes.join('\n');

            // Стоимость
            const totalAttr  = prod.getAttribute('total') || prod.getAttribute('amount_total') || '';
            let stoimost = toNum(totalAttr);
            if (stoimost === '') {
                const f = fareValue !== '' ? Number(fareValue) : 0;
                const t = taxesValue !== '' ? Number(taxesValue) : 0;
                if (fareValue !== '' || taxesValue !== '') stoimost = f + t;
                else stoimost = '';
            }

            // Дата вылета
            const firstDepDate = firstSeg?.getAttribute('departure_datetime') || '';

            // Документы по prod_id (продажа/возврат/дата/номер)
            const docs = getTicketNumbersByProdId(prodId);
            const hasRefundOper = docs.some(d=> d.oper === 'CANX' || d.oper === 'REF');
            const operatsiya = hasRefundOper ? 'Возврат' : 'Продажа';

            // Номер билета
            let ticketNumber = '';
            const saleDoc = docs.find(d=> d.oper === 'TKT');
            if (saleDoc && saleDoc.number) ticketNumber = saleDoc.number;
            if (!ticketNumber) {
                ticketNumber = firstSeg?.getAttribute('tkt_number') || '';
            }

            // Issue date
            const issueDate = saleDoc?.date || createdAt;

            // EMD
            let emd = hasEmdForProd(prodId);
            if (!emd) {
                emd = segs.some(s => !!s.getAttribute('rfisc') || !!s.getAttribute('RFISC'));
            }

            // Штраф за возврат
            const hasPenaltyTax = prod.querySelector('air_tax[code="PEN"]') != null;
            const shtrafZaVozvrat = hasPenaltyTax || hasRefundOper;

            // Пассажир
            let paxId = null;
            const taxWithPax = prod.querySelector('air_tax[passenger_id]');
            if (taxWithPax) paxId = taxWithPax.getAttribute('passenger_id');
            if (!paxId) {
                const svc = root.querySelector(`products > product > service_prod[main_ticket_prod_id="${prodId}"]`);
                paxId = svc?.getAttribute('psgr_id') || null;
            }
            const pax = paxId && paxMap.get(paxId) ? paxMap.get(paxId) : (paxMap.values().next().value || {firstName:'', lastName:''});

            rows.push({
                nomerProdukta: ticketNumber,
                dataSozdaniya: createdAt,
                tipProdukta: 'Авиабилет',
                operatsiya,
                nomerZakaza: orderId,

                passazhirFamiliya: pax?.lastName || '',
                passazhirImya: pax?.firstName || '',
                pnr,
                punktOtpravleniya: origin,
                punktPribytiya: dest,

                stoimost,
                fareValue,
                taxesValue,
                vat: vatValue === '' ? '' : vatValue,
                sborPostavshchika: serviceFee,
                komissiyaPostavshchika: (()=>{            // пересчёт, если будет нужно
                    let commission = 0;
                    prod.querySelectorAll('fees > fee[type="commission"]').forEach(f=>{
                        const a = Number(String(f.getAttribute('amount') || '0').replace(',', '.'));
                        if (!Number.isNaN(a)) commission += a;
                    });
                    return commission || '';
                })(),
                valyuta: currency,

                spisokTaks: taxesList,
                dataVyleta: firstDepDate,
                emd,
                shtrafZaVozvrat,
                kodPerevozchika: carrierCode,
                issueDate,

                category: 'air'
            });
        });

        if (!rows.length) {
            throw new Error('Парсер МойАгент отработал, но данных не найдено.');
        }

        return { category: 'air', rows };
    }
};
