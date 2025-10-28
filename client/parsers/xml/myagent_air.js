// client/parsers/xml/myagent_air.js
// Парсер XML формата МойАгент (авиа). Работает для продаж и возвратов.
// На выход отдаёт:
//   { category: 'air', rows: [ { ...поля из единой схемы (Schema.getColumns()) } ] }
//
// Покрывает примеры:
// - Продажа: корень <order_snapshot>, в travel_docs есть air_ticket_doc с tkt_oper="TKT" (номер билета 13 цифр)
// - Возврат: в travel_docs есть air_ticket_doc с tkt_oper="CANX" или "REF", встречается такса PEN (штраф)
//
// Поля схемы, которые мы заполняем:
//   nomerProdukta       — номер билета (из travel_docs/air_ticket_doc@tkt_number || air_seg@tkt_number)
//   dataSozdaniya       — дата создания из header@time
//   tipProdukta         — "Авиабилет"
//   operatsiya          — "Продажа" | "Возврат" (по travel_docs)
//   nomerZakaza         — header@ord_id
//   passazhirFamiliya   — passengers/passenger@name (фамилия)
//   passazhirImya       — passengers/passenger@first_name (имя)
//   pnr                 — reservations/reservation@rloc
//   punktOtpravleniya   — air_ticket_prod@origin (или первый air_seg@departure_airport)
//   punktPribytiya      — air_ticket_prod@destination (или последний air_seg@arrival_airport)
//   stoimost            — air_ticket_prod@fare
//   sborPostavshchika   — air_ticket_prod@service_fee
//   komissiyaPostavshchika — сумма <fee type="commission" amount="...">
//   valyuta             — header@currency
//   spisokTaks          — список такс (код = сумма), собранный из air_tax
//   dataVyleta          — первый сегмент departure_datetime
//   emd                 — true, если в travel_docs есть <emd_ticket_doc> (или air_seg имеет RFISC/EMD)
//   shtrafZaVozvrat     — true, если есть такса PEN или операция возврат
//   kodPerevozchika     — air_ticket_prod@validating_carrier (или carrier первого сегмента)
//   issueDate           — дата выписки (первый TKT по этому prod_id, иначе header@time)
//   realizationDate     — не заполняем вручную — вычислит Schema (для air = issueDate)
//
// Важно: если в одном заказе несколько билетов (несколько air_ticket_prod), вернём по строке на каждый билет.

export default {
    supplierCode: 'myagent_air',
    displayName: 'МойАгент (авиа)',
    async parse(xmlText){
        const doc = new DOMParser().parseFromString(xmlText, 'text/xml');

        // Мини-детектор формата "МойАгент": корень order_snapshot
        const root = doc.querySelector('order_snapshot');
        if(!root){
            return { category: 'air', rows: [] }; // не наш формат
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

        // Хелперы по документам
        function getTicketNumbersByProdId(prodId){
            const res = [];
            airDocs.forEach(d=>{
                if (d.getAttribute('prod_id') === String(prodId)) {
                    const num = d.getAttribute('tkt_number') || '';
                    const oper = d.getAttribute('tkt_oper') || '';
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

        // Формируем строки по каждому air_ticket_prod
        const rows = [];
        root.querySelectorAll('products > product > air_ticket_prod').forEach(prod=>{
            const prodId = prod.getAttribute('prod_id') || '';

            // Аэропорты/сегменты
            const segs = Array.from(prod.querySelectorAll('air_seg'));
            const firstSeg = segs[0] || null;
            const lastSeg  = segs[segs.length-1] || null;

            const origin = prod.getAttribute('origin') || firstSeg?.getAttribute('departure_airport') || '';
            const dest   = prod.getAttribute('destination') || lastSeg?.getAttribute('arrival_airport') || '';

            // Перевозчик
            const validating = prod.getAttribute('validating_carrier') || '';
            const firstCarrier = firstSeg?.getAttribute('carrier') || '';
            const carrierCode = validating || firstCarrier || '';

            // Суммы
            const fare        = prod.getAttribute('fare') || '';
            const serviceFee  = prod.getAttribute('service_fee') || '';
            // Комиссии: сумма всех fee[type="commission"]
            let commission = 0;
            prod.querySelectorAll('fees > fee[type="commission"]').forEach(f=>{
                const a = parseFloat(String(f.getAttribute('amount') || '0').replace(',', '.'));
                if (!isNaN(a)) commission += a;
            });

            // Таксы (по всем сегментам внутри данного prod)
            const taxes = [];
            prod.querySelectorAll('air_tax').forEach(t=>{
                const code = t.getAttribute('code') || '';
                const amount = t.getAttribute('amount') || '';
                if (code) taxes.push(`${code} = ${amount}`);
            });
            const taxesList = taxes.join('\n');

            // Дата вылета — дата первого сегмента
            const firstDepDate = firstSeg?.getAttribute('departure_datetime') || '';

            // Документы по prod_id (продажа/возврат/дата/номер)
            const docs = getTicketNumbersByProdId(prodId);
            // Определяем операцию
            const hasRefundOper = docs.some(d=> (d.oper || '').toUpperCase() === 'CANX' || (d.oper || '').toUpperCase() === 'REF');
            const operatsiya = hasRefundOper ? 'Возврат' : 'Продажа';

            // Номер продукта (билета) — берём TKT, иначе любой номер из сегмента (в некоторых XML бывает в seg)
            let ticketNumber = '';
            const saleDoc = docs.find(d=> (d.oper || '').toUpperCase() === 'TKT');
            if (saleDoc && saleDoc.number) ticketNumber = saleDoc.number;
            if (!ticketNumber) {
                // fallback: вдруг номер билета лежит на сегменте
                ticketNumber = firstSeg?.getAttribute('tkt_number') || '';
            }

            // Issue date: дата первого TKT по prod_id, иначе header@time
            const issueDate = saleDoc?.date || createdAt;

            // EMD — если есть emd_ticket_doc на этот prod, или явный RFISC на сегменте
            let emd = hasEmdForProd(prodId);
            if (!emd) {
                emd = segs.some(s => !!s.getAttribute('rfisc') || !!s.getAttribute('RFISC'));
            }

            // Штраф за возврат — если есть такса PEN или операция возврат
            const hasPenaltyTax = prod.querySelector('air_tax[code="PEN"]') != null;
            const shtrafZaVozvrat = hasPenaltyTax || hasRefundOper;

            // Пассажир — пытаемся взять по ссылкам passenger_id из такс/сегментов, иначе любого
            let paxId = null;
            const taxWithPax = prod.querySelector('air_tax[passenger_id]');
            if (taxWithPax) paxId = taxWithPax.getAttribute('passenger_id');
            // fallback: из сервисного продукта
            if (!paxId) {
                const svc = root.querySelector(`products > product > service_prod[main_ticket_prod_id="${prodId}"]`);
                paxId = svc?.getAttribute('psgr_id') || null;
            }
            // последний шанс: возьмём первого пассажира в заказе
            const pax = paxId && paxMap.get(paxId) ? paxMap.get(paxId) : (paxMap.values().next().value || {firstName:'', lastName:''});

            // Готовим строку в единую таблицу (ключи см. Schema)
            rows.push({
                // Идентификаторы/контекст
                nomerProdukta: ticketNumber,               // 13-значный билет, если есть
                dataSozdaniya: createdAt,                  // дата создания заказа (header@time)
                tipProdukta: 'Авиабилет',
                operatsiya,                                // Продажа | Возврат
                nomerZakaza: orderId,

                // Пассажир / бронь / маршрут
                passazhirFamiliya: pax?.lastName || '',
                passazhirImya: pax?.firstName || '',
                pnr,
                punktOtpravleniya: origin,
                punktPribytiya: dest,

                // Суммы/валюта
                stoimost: fare,
                sborPostavshchika: serviceFee,
                komissiyaPostavshchika: commission,
                valyuta: currency,

                // Таксы/даты/флаги
                spisokTaks: taxesList,
                dataVyleta: firstDepDate,
                emd,
                shtrafZaVozvrat,
                kodPerevozchika: carrierCode,
                issueDate,

                // Поля, которые рассчитает Schema (не заполняем вручную):
                // realizationDate: (для air = issueDate)

                // Категория нужна приложению для ветки JSON
                category: 'air'
            });
        });

        return { category: 'air', rows };
    }
};
