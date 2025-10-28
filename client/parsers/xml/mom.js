// client/parsers/xml/mom.js
// Поставщик: МОМ (Gridnine XML). Поддерживаются авиапродукты (билеты/EMD/VOID/REFUND/EXCHANGE).
// Возвращает { category:'air', rows:[ ... ] } в единой схеме полей приложения.

export default {
    supplierCode: 'mom',
    displayName: 'МОМ (авиа)',

    async parse(xmlText){
        const NS = "http://www.gridnine.com/export/xml";
        const doc = new DOMParser().parseFromString(xmlText, "application/xml");
        const parsererror = doc.querySelector("parsererror");
        if (parsererror) throw new Error("Некорректный XML: " + parsererror.textContent.trim());

        const booking = doc.getElementsByTagNameNS(NS, "booking")[0];
        if (!booking) return { category:'air', rows: [] };

        const products = booking.getElementsByTagNameNS(NS, "products")[0];
        if (!products) return { category:'air', rows: [] };

        // ---- Утилиты (объявлены ДО использования) ----
        const getAttr = (el, name, def="") => el?.getAttribute?.(name) ?? def;
        const toISO = (s) => s || '';
        const toNumberOrEmpty = (v) => {
            if (v===null || v===undefined || v==='') return '';
            const n = Number(String(v).replace(',','.'));
            return Number.isFinite(n) ? n : '';
        };
        const findFirst = (el, name) => el?.getElementsByTagNameNS(NS, name)?.[0] || null;

        const segFirstLast = (productEl) => {
            const segsEl = findFirst(productEl, "segments");
            if (!segsEl) return { firstSeg: null, lastSeg: null };
            const segs = Array.from(segsEl.getElementsByTagNameNS(NS, "segment"));
            if (!segs.length) return { firstSeg: null, lastSeg: null };
            return { firstSeg: segs[0], lastSeg: segs[segs.length - 1] };
        };

        const buildRoute = (productEl)=>{
            const segsEl = findFirst(productEl, "segments");
            if (!segsEl) return '';
            const segs = Array.from(segsEl.getElementsByTagNameNS(NS, "segment"));
            if (!segs.length) return '';
            const legs = segs.map(s=>{
                const from = getAttr(s, "departureLocationCode") || '';
                const to   = getAttr(s, "arriveLocationCode") || '';
                return `${from}—${to}`;
            });
            return legs.join(' / ');
        };

        const getPassenger = (productEl)=>{
            const trav = findFirst(productEl, "traveller");
            if (!trav) return { last:'', first:'' , full:''};
            const cyr = getAttr(trav, "nameInCyrillic")?.trim();
            const gds = (getAttr(trav, "nameInGds") || getAttr(trav, "name") || '').trim();
            const full = (cyr || gds || '').trim();
            let last = '', first = '';
            if (full.includes(' ')) {
                const parts = full.split(/\s+/);
                last = parts[0] || '';
                first = parts.slice(1).join(' ') || '';
            } else { last = full; first = ''; }
            return { last, first, full };
        };

        const sumTaxes = (productEl)=>{
            const taxesNode = findFirst(productEl, "taxes");
            if (!taxesNode) return '';
            let sum = 0;
            for(const t of Array.from(taxesNode.getElementsByTagNameNS(NS, "tax"))){
                const eq = findFirst(t, "equivalentAmount");
                if (eq) { sum += Number(getAttr(eq,'amount','0').replace(',','.')) || 0; continue; }
                const raw = getAttr(t,'amount','0');
                sum += Number(String(raw).replace(',','.')) || 0;
            }
            return sum || '';
        };

        const listTaxes = (productEl)=>{
            const taxesNode = findFirst(productEl, "taxes");
            if (!taxesNode) return '';
            const items = [];
            for(const t of Array.from(taxesNode.getElementsByTagNameNS(NS, "tax"))){
                const code = getAttr(t, 'code','');
                const eq = findFirst(t, "equivalentAmount");
                const amount = eq ? getAttr(eq,'amount','') : (getAttr(t,'amount','') || '');
                if (code) items.push(`${code} = ${amount}`);
            }
            return items.join('\n');
        };

        const sumServiceFeesFactory = (containerName)=>{
            return (productEl)=>{
                const cont = findFirst(productEl, containerName);
                if (!cont) return '';
                let sum = 0;
                for(const sf of Array.from(cont.getElementsByTagNameNS(NS, "serviceFee"))){
                    const eq = findFirst(sf, "equivalentAmount");
                    if (eq) { sum += Number(getAttr(eq,'amount','0').replace(',','.')) || 0; continue; }
                    const rate = findFirst(sf, 'rate');
                    if (rate) { sum += Number(getAttr(rate,'amount','0').replace(',','.')) || 0; continue; }
                    const own = getAttr(sf,'amount','0');
                    sum += Number(String(own).replace(',','.')) || 0;
                }
                return sum || '';
            };
        };

        const vendorFeeSum = sumServiceFeesFactory("vendorServiceFee");
        const clientFeeSum = sumServiceFeesFactory("clientServiceFee");

        const mapOperation = (statusCode)=>{
            const v = String(statusCode||'').toUpperCase();
            if (v==='SELL') return 'Продажа';
            if (v==='REFUND') return 'Возврат';
            if (v==='EXCHANGE') return 'Обмен';
            if (v==='VOID') return 'Войд';
            return v || '';
        };

        // ---- Парсинг ----
        const airProducts = Array.from(products.getElementsByTagNameNS(NS, "air-product"));
        const voidings    = Array.from(products.getElementsByTagNameNS(NS, "product-voiding"));

        // Общие для всех строк (из booking):
        // ⚠️ Изменения по требованию:
        const orderNum   = getAttr(booking, 'bookingNumber','') || getAttr(booking,'number','') || getAttr(booking,'uid','');
        const createdAt  = getAttr(booking, 'time','') || getAttr(booking,'createDateTime','');

        const rows = [];

        for(const ap of airProducts){
            const catEl = findFirst(ap, "category");
            const catCode = (catEl ? getAttr(catEl, 'code','') : '').toUpperCase(); // AIR/MCO/EMD/...
            const catCaption = catEl ? getAttr(catEl, 'caption','') : '';

            const statusEl = findFirst(ap, "status");
            const statusCode = getAttr(statusEl, 'code','');
            const oper = mapOperation(statusCode);

            const issueDate = toISO(getAttr(ap,'issueDate','')); // Дата выписки
            const validationCarrier = getAttr(ap,'validatingCarrierCode','') || '';

            const pnr = getAttr(ap,'pnr','') || '';
            const ticket = getAttr(ap,'ticketNumber','') || '';

            const pax = getPassenger(ap);
            const route = buildRoute(ap);

            const { firstSeg, lastSeg } = segFirstLast(ap);
            const depAirport = firstSeg ? (getAttr(firstSeg, "departureLocationCode") || '') : '';
            const arrAirport = lastSeg  ? (getAttr(lastSeg,  "arriveLocationCode")    || '') : '';

            // ⚠️ Дата вылета = segment@departureDate (fallback на departureDateTime)
            const dataVyleta = firstSeg
                ? (getAttr(firstSeg, "departureDate") || getAttr(firstSeg, "departureDateTime") || '')
                : '';

            const fareNode = findFirst(ap, 'equivalentFare') || findFirst(ap,'fare');
            const fare = fareNode ? getAttr(fareNode,'amount','') : '';

            const taxesSum = sumTaxes(ap);
            const taxesList = listTaxes(ap);

            const totalNode = findFirst(ap,'total');
            const total = totalNode ? getAttr(totalNode,'amount','') : '';
            const currency = totalNode ? getAttr(totalNode,'currency','') : (getAttr(ap,'gdsCurrency','') || '');

            const vendorFee = vendorFeeSum(ap);

            // ⚠️ Комиссия Поставщика = totalVendorCommissions@amount
            const totalVendorCommissions = findFirst(ap, 'totalVendorCommissions');
            const komissiyaPostavshchika = totalVendorCommissions ? getAttr(totalVendorCommissions,'amount','') : '';

            const clientFee = clientFeeSum(ap);

            const penaltyNode = findFirst(ap,'penalty');
            let penalty = '';
            if (penaltyNode) {
                const eq = findFirst(penaltyNode,'equivalentAmount');
                penalty = eq ? getAttr(eq,'amount','') : (getAttr(penaltyNode,'amount','')||'');
            }

            // Категория EMD — если продукт EMD/MCO
            let kategoriyaEmd = '';
            if (catCode === 'MCO' || catCode === 'EMD') {
                const nom = findFirst(ap, 'nomenclature');
                if (nom) {
                    kategoriyaEmd = getAttr(nom,'caption','') || getAttr(nom,'code','');
                }
                if (!kategoriyaEmd) kategoriyaEmd = catCaption || 'EMD';
            }

            const emd = (catCode === 'MCO' || catCode === 'EMD') ? true : '';

            const shtrafZaVozvrat = (oper === 'Возврат') || (penalty && Number(String(penalty).replace(',','.'))>0);

            rows.push({
                // ЕДИНАЯ СХЕМА
                nomerProdukta: ticket,
                dataSozdaniya: createdAt,              // ⚠️ booking@time
                tipProdukta: (catCode==='MCO'||catCode==='EMD') ? 'EMD' : 'Авиабилет',
                operatsiya: oper,
                nomerZakaza: orderNum,                 // ⚠️ booking@bookingNumber

                passazhirFamiliya: pax.last,
                passazhirImya: pax.first,
                pnr,
                punktOtpravleniya: depAirport,
                punktPribytiya: arrAirport,

                stoimost: toNumberOrEmpty(fare),
                sborPostavshchika: toNumberOrEmpty(vendorFee),
                komissiyaPostavshchika: toNumberOrEmpty(komissiyaPostavshchika), // ⚠️ totalVendorCommissions@amount
                valyuta: currency,
                spisokTaks: taxesList,
                dataVyleta: toISO(dataVyleta),         // ⚠️ segment@departureDate
                emd,
                kategoriyaEmd,
                shtrafZaVozvrat,
                kodPerevozchika: validationCarrier,
                issueDate: toISO(issueDate),

                category: 'air'
            });
        }

        // Аннуляции/void — product-voiding
        for(const vd of Array.from(products.getElementsByTagNameNS(NS, "product-voiding"))){
            const relatedUid = getAttr(vd, 'relatedProductUid','');
            const rel = relatedUid
                ? airProducts.find(p=> (getAttr(p,'uid','') === relatedUid))
                : null;

            const pnr = rel ? getAttr(rel,'pnr','') : '';
            const validationCarrier = rel ? getAttr(rel,'validatingCarrierCode','') : '';
            const pax = rel ? getPassenger(rel) : {last:'', first:''};

            rows.push({
                nomerProdukta: '',
                dataSozdaniya: getAttr(booking, 'time','') || getAttr(booking,'createDateTime',''),
                tipProdukta: 'Аннулирование',
                operatsiya: 'Войд',
                nomerZakaza: getAttr(booking, 'bookingNumber','') || getAttr(booking,'number','') || getAttr(booking,'uid',''),

                passazhirFamiliya: pax.last,
                passazhirImya: pax.first,
                pnr,
                punktOtpravleniya: '',
                punktPribytiya: '',

                stoimost: '',
                sborPostavshchika: '',
                komissiyaPostavshchika: '',
                valyuta: 'RUB',
                spisokTaks: '',
                dataVyleta: '',
                emd: '',
                kategoriyaEmd: '',
                shtrafZaVozvrat: '',
                kodPerevozchika: validationCarrier,
                issueDate: '',

                category: 'air'
            });
        }

        return { category:'air', rows };
    }
};
