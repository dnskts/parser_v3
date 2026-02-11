// client/parsers/xml/myagent_air.js
// Парсер XML формата МойАгент (авиа). Продажи/возвраты.
// Возвращает { category:'air', rows:[...] } в единой схеме (английские ключи).

function at(node, name, def='') {
    return (node?.getAttribute(name) || '').trim() || def;
}
function numstr(s) {
    if (s == null || s === '') return '';
    const v = parseFloat(String(s).replace(',', '.'));
    return isNaN(v) ? '' : v;
}

export default {
    supplierCode: 'myagent_air',
    displayName: 'МойАгент (авиа)',
    async parse(xmlText){
        const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
        const root = doc.querySelector('order_snapshot');
        if (!root) return { category:'air', rows: [] };

        const header = root.querySelector('header');
        const orderNumber = at(header, 'ord_id', '');
        const currency    = at(header, 'currency', '') || 'RUB';
        const dateCreated = at(header, 'time', '');

        const pnr = doc.querySelector('reservations > reservation')?.getAttribute('rloc') || '';

        // Карта пассажиров по psgr_id
        const paxById = new Map();
        root.querySelectorAll('passengers > passenger').forEach(p=>{
            paxById.set(at(p,'psgr_id'), {
                first: at(p,'first_name'),
                last:  at(p,'name')
            });
        });

        // Собираем документы
        const airDocs = [];
        const emdDocs = [];
        root.querySelectorAll('travel_docs > travel_doc').forEach(tdoc=>{
            const air = tdoc.querySelector('air_ticket_doc');
            const emd = tdoc.querySelector('emd_ticket_doc');
            if (air) airDocs.push(air);
            if (emd) emdDocs.push(emd);
        });

        function docsByProdId(prodId){
            return airDocs
                .filter(d => at(d,'prod_id') === String(prodId))
                .map(d => ({ num: at(d,'tkt_number'), oper: (at(d,'tkt_oper')||'').toUpperCase(), date: at(d,'tkt_date') }));
        }
        function hasEmd(prodId){
            return emdDocs.some(d => (at(d,'main_prod_id') || at(d,'prod_id')) === String(prodId));
        }

        const rows = [];
        root.querySelectorAll('products > product > air_ticket_prod').forEach(prod=>{
            const prodId = at(prod,'prod_id');
            const segs = Array.from(prod.querySelectorAll('air_seg'));
            const firstSeg = segs[0] || null;
            const lastSeg  = segs[segs.length-1] || null;

            // Маршрут
            const origin = at(prod,'origin') || at(firstSeg,'departure_airport');
            const destination = at(prod,'destination') || at(lastSeg,'arrival_airport');

            // Перевозчик
            const carrierCode = at(prod,'validating_carrier') || at(firstSeg,'carrier');

            // Суммы
            const fareAttr   = at(prod,'fare');
            const taxesAttr  = at(prod,'taxes'); // МойАгент дает сумму такс напрямую
            const serviceFee = numstr(at(prod,'service_fee'));
            const fare  = numstr(fareAttr);
            let taxes  = taxesAttr !== '' ? numstr(taxesAttr) : '';
            // если нет общей суммы такс — суммируем <air_tax>
            if (taxes === '') {
                let acc = 0;
                prod.querySelectorAll('air_tax').forEach(t=>{
                    const a = parseFloat(String(at(t,'amount')||'0').replace(',', '.'));
                    if (!isNaN(a)) acc += a;
                });
                taxes = acc === 0 ? '' : acc;
            }

            // Комиссия поставщика — сумма fee[type="commission"]
            let supplierCommission = 0;
            prod.querySelectorAll('fees > fee[type="commission"]').forEach(f=>{
                const a = parseFloat(String(at(f,'amount')||'0').replace(',', '.'));
                if (!isNaN(a)) supplierCommission += a;
            });
            if (supplierCommission === 0) supplierCommission = '';

            // Список такс (визуально)
            const taxesList = Array.from(prod.querySelectorAll('air_tax'))
                .map(t => `${at(t,'code')} = ${at(t,'amount')}`).join('\n');

            // Документы и операция
            const docs = docsByProdId(prodId);
            const isRefund = docs.some(d => d.oper === 'CANX' || d.oper === 'REF');
            const operation = isRefund ? 'Возврат' : 'Продажа';

            // Номер продукта/билета
            let productNumber = docs.find(d => d.oper === 'TKT')?.num
                || at(firstSeg,'tkt_number') || '';

            // Пассажир: пробуем связаться по service_prod → psgr_id → passengers
            let pax = null;
            const svc = root.querySelector(`products > product > service_prod[main_ticket_prod_id="${prodId}"]`);
            const paxId = svc?.getAttribute('psgr_id') || prod.querySelector('air_tax[passenger_id]')?.getAttribute('passenger_id');
            if (paxId && paxById.has(paxId)) pax = paxById.get(paxId);
            if (!pax) {
                // fallback: первый пассажир в заказе
                const v = paxById.values().next().value;
                pax = v || { first:'', last:'' };
            }

            // Даты/EMD
            const departureDate = at(firstSeg,'departure_datetime');
            const issueDate = (docs.find(d => d.oper === 'TKT')?.date) || dateCreated;
            const emd = hasEmd(prodId) || segs.some(s=> !!at(s,'rfisc') || !!at(s,'RFISC'));
            const emdCategory = segs.map(s => at(s,'rfisc') || at(s,'RFISC')).filter(Boolean)[0] || '';

            // Итог: если нет явного total — считаем fare+taxes
            const totalPrice = (fare !== '' || taxes !== '') ? (Number(fare || 0) + Number(taxes || 0)) : '';

            rows.push({
                productNumber,
                dateCreated,
                productType: 'Авиабилет',
                operation,
                orderNumber,

                lastName: pax?.last || '',
                firstName: pax?.first || '',
                pnr,
                origin,
                destination,
                hotel: '',

                totalPrice,
                fare,
                taxes,
                vat: '',               // НДС у МойАгент часто отдельной таксой VAT/НДС — можно при необходимости выделить
                railService: '',

                supplierFee: serviceFee,
                supplierCommission,
                currency,

                taxesList,
                departureDate,
                emd: !!emd,
                emdCategory,
                refundPenalty: isRefund,
                carrierCode,
                issueDate,
                
                apiLink: '', // Ссылка на API (если доступна)

                category: 'air'
            });
        });

        return { category:'air', rows };
    }
};
