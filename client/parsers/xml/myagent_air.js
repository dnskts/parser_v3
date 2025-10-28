// client/parsers/xml/myagent_air.js
// --------------------------------------------------------------
// ПАРСЕР: «МойАгент» (авиа). Работает для продаж и возвратов.
// --------------------------------------------------------------
// Что делает:
//   • Разбирает XML формата <order_snapshot>.
//   • Находит авиапродукты <air_ticket_prod> и выписывает по ним
//     строки для таблицы с ВНУТРЕННИМИ английскими ключами.
// Важно:
//   • Стоимость (totalPrice) = total/amount_total, иначе fare + taxes.
//   • Fare/Taxes берём из атрибутов <air_ticket_prod fare="..." taxes="...">.
//   • VAT ищем в <air_tax code="VAT|НДС" amount="...">.
//   • Список такс (taxesList) — просто для UI; в экспорт не идёт.
// --------------------------------------------------------------

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
            throw new Error('Файл не похож на формат МойАгент (нет <order_snapshot>).');
        }

        // Заголовок заказа
        const header = root.querySelector('header');
        const orderNumber   = header?.getAttribute('ord_id') || '';
        const currency      = header?.getAttribute('currency') || '';
        const dateCreated   = header?.getAttribute('time') || '';

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

            const origin  = prod.getAttribute('origin') || firstSeg?.getAttribute('departure_airport') || '';
            const destination = prod.getAttribute('destination') || lastSeg?.getAttribute('arrival_airport') || '';
            const departureDate = firstSeg?.getAttribute('departure_datetime') || '';

            // Перевозчик
            const validating = prod.getAttribute('validating_carrier') || '';
            const firstCarrier = firstSeg?.getAttribute('carrier') || '';
            const carrierCode = validating || firstCarrier || '';

            // Тариф/Таксы/Итог/Валюта/Сбор
            const fareAttr     = prod.getAttribute('fare') || '';
            const taxesAttr    = prod.getAttribute('taxes') || '';
            const totalAttr    = prod.getAttribute('total') || prod.getAttribute('amount_total') || '';
            const serviceFee   = prod.getAttribute('service_fee') || '';

            const fare = toNum(fareAttr);
            let taxes  = toNum(taxesAttr);

            // Список такс + VAT; fallback сумма такс, если @taxes отсутствует
            const taxesPairs = [];
            let taxesSumFallback = 0;
            let vat = '';
            prod.querySelectorAll('air_tax').forEach(t=>{
                const code = (t.getAttribute('code') || '').trim();
                const amountRaw = t.getAttribute('amount') || '';
                const amount = toNum(amountRaw);
                if (code) taxesPairs.push(`${code} = ${amountRaw}`);
                if (amount !== '') {
                    taxesSumFallback += Number(amount);
                    if ((code.toUpperCase() === 'VAT' || code.toUpperCase() === 'НДС') && vat === '') {
                        vat = Number(amount);
                    }
                }
            });
            if (taxes === '') {
                taxes = (taxesPairs.length ? taxesSumFallback : '');
            }
            const taxesList = taxesPairs.join('\n');

            // Итоговая стоимость: total или fare+taxes
            let totalPrice = toNum(totalAttr);
            if (totalPrice === '') {
                const f = fare !== '' ? Number(fare) : 0;
                const t = taxes !== '' ? Number(taxes) : 0;
                if (fare !== '' || taxes !== '') totalPrice = f + t;
                else totalPrice = '';
            }

            // Документы по prod_id (продажа/возврат/дата/номер)
            const docs = getTicketNumbersByProdId(prodId);
            const hasRefundOper = docs.some(d=> d.oper === 'CANX' || d.oper === 'REF');
            const operation = hasRefundOper ? 'Возврат' : 'Продажа';

            // Номер билета
            let productNumber = '';
            const saleDoc = docs.find(d=> d.oper === 'TKT');
            if (saleDoc && saleDoc.number) productNumber = saleDoc.number;
            if (!productNumber) {
                productNumber = firstSeg?.getAttribute('tkt_number') || '';
            }

            // Дата выписки
            const issueDate = saleDoc?.date || dateCreated;

            // EMD
            let emd = hasEmdForProd(prodId);
            if (!emd) {
                emd = segs.some(s => !!s.getAttribute('rfisc') || !!s.getAttribute('RFISC'));
            }

            // Штраф за возврат
            const refundPenalty = (prod.querySelector('air_tax[code="PEN"]') != null) || hasRefundOper;

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
                // Контекст
                productNumber,
                dateCreated,
                productType: 'Авиабилет',
                operation,
                orderNumber,

                // Пассажир / маршрут
                lastName: pax?.lastName || '',
                firstName: pax?.firstName || '',
                pnr,
                origin,
                destination,
                hotel: '',

                // Деньги
                totalPrice,
                fare,
                taxes,
                vat: vat === '' ? '' : vat,
                railService: '',

                supplierFee: serviceFee,
                supplierCommission: (()=>{            // сумма fee[type="commission"]
                    let commission = 0;
                    prod.querySelectorAll('fees > fee[type="commission"]').forEach(f=>{
                        const a = Number(String(f.getAttribute('amount') || '0').replace(',', '.'));
                        if (!Number.isNaN(a)) commission += a;
                    });
                    return commission || '';
                })(),
                currency,

                // Прочее
                taxesList,
                departureDate,
                emd,
                emdCategory: '',
                refundPenalty,
                carrierCode,
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
