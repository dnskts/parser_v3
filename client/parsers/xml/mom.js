// client/parsers/xml/mom.js
// МОМ (Gridnine XML). Поддержка билетов/EMD/VOID/REFUND/EXCHANGE.

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

        const getAttr = (el, name, def="") => el?.getAttribute?.(name) ?? def;
        const findFirst = (el, name) => el?.getElementsByTagNameNS(NS, name)?.[0] || null;
        const toISO = (s) => s || '';
        const toNum = (v)=>{ if(v===''||v==null) return ''; const n=Number(String(v).replace(',','.')); return Number.isFinite(n)?n:''; };

        const orderNum   = getAttr(booking, 'bookingNumber','') || getAttr(booking,'number','') || getAttr(booking,'uid','');
        const createdAt  = getAttr(booking, 'time','') || getAttr(booking,'createDateTime','');

        const airProducts = Array.from(products.getElementsByTagNameNS(NS, "air-product"));
        const voidings    = Array.from(products.getElementsByTagNameNS(NS, "product-voiding"));

        const segFirst = (productEl)=>{
            const segsEl = findFirst(productEl, "segments");
            if (!segsEl) return null;
            const segs = Array.from(segsEl.getElementsByTagNameNS(NS, "segment"));
            return segs[0] || null;
        };

        // helpers for taxes
        const listTaxes = (productEl)=>{
            const taxesNode = findFirst(productEl, "taxes");
            if (!taxesNode) return '';
            const parts = [];
            for(const t of Array.from(taxesNode.getElementsByTagNameNS(NS, "tax"))){
                const code = getAttr(t,'code','');
                const eq = findFirst(t,'equivalentAmount');
                const amount = eq ? getAttr(eq,'amount','') : (getAttr(t,'amount','') || '');
                if (code || amount) parts.push(`${code || 'TAX'} = ${amount}`);
            }
            return parts.join('\n');
        };
        const sumAllTaxes = (productEl)=>{
            const taxesNode = findFirst(productEl, "taxes");
            if (!taxesNode) return '';
            let sum = 0, seen=false;
            for(const t of Array.from(taxesNode.getElementsByTagNameNS(NS, "tax"))){
                const eq = findFirst(t,'equivalentAmount');
                const amountStr = eq ? getAttr(eq,'amount','') : (getAttr(t,'amount','') || '');
                const n = Number(String(amountStr).replace(',','.'));
                if (Number.isFinite(n)) { sum += n; seen = true; }
            }
            return seen ? sum : '';
        };
        const findVat = (productEl)=>{
            const taxesNode = findFirst(productEl, "taxes");
            if (!taxesNode) return '';
            for(const t of Array.from(taxesNode.getElementsByTagNameNS(NS, "tax"))){
                const code = String(getAttr(t,'code','')).toUpperCase();
                if (code === 'VAT' || code === 'НДС') {
                    const eq = findFirst(t,'equivalentAmount');
                    const amountStr = eq ? getAttr(eq,'amount','') : (getAttr(t,'amount','') || '');
                    const n = Number(String(amountStr).replace(',','.'));
                    if (Number.isFinite(n)) return n;
                }
            }
            return '';
        };

        const rows = [];

        for(const ap of airProducts){
            // основные
            const statusEl = findFirst(ap, "status");
            const operCode = String(statusEl ? getAttr(statusEl,'code','') : '').toUpperCase();
            const oper = operCode==='SELL'?'Продажа':operCode==='REFUND'?'Возврат':operCode==='EXCHANGE'?'Обмен':operCode==='VOID'?'Войд':operCode||'';

            const issueDate = toISO(getAttr(ap,'issueDate',''));
            const validationCarrier = getAttr(ap,'validatingCarrierCode','') || '';
            const pnr = getAttr(ap,'pnr','') || '';
            const ticket = getAttr(ap,'ticketNumber','') || '';

            // пассажир
            const trav = findFirst(ap, "traveller");
            let last='', first='';
            if (trav){
                const cyr = getAttr(trav, "nameInCyrillic")?.trim();
                const full = (cyr || getAttr(trav,"nameInGds") || getAttr(trav,"name") || '').trim();
                if (full.includes(' ')){ const parts=full.split(/\s+/); last = parts[0]||''; first = parts.slice(1).join(' ')||''; }
                else { last = full; first=''; }
            }

            // аэропорты/дата вылета
            const s0 = segFirst(ap);
            const depAirport = s0 ? (getAttr(s0, "departureLocationCode") || '') : '';
            const arrAirport = s0 ? (getAttr(s0, "arriveLocationCode")    || '') : '';
            const dataVyleta = s0 ? (getAttr(s0, "departureDate") || getAttr(s0, "departureDateTime") || '') : '';

            // деньги
            const fareNode  = findFirst(ap, 'equivalentFare') || findFirst(ap,'fare');
            const fareValue = toNum(fareNode ? getAttr(fareNode,'amount','') : '');
            const taxesValue = toNum(sumAllTaxes(ap));     // сумма всех такс (включая НДС)
            const vat = toNum(findVat(ap));

            const totalNode = findFirst(ap,'total');
            const stoimost  = toNum(totalNode ? getAttr(totalNode,'amount','') : '');
            const currency  = totalNode ? getAttr(totalNode,'currency','') : (getAttr(ap,'gdsCurrency','') || '');

            const vendorFee = (()=>{
                const cont = findFirst(ap,'vendorServiceFee'); if (!cont) return '';
                let sum = 0, seen=false;
                for(const sf of Array.from(cont.getElementsByTagNameNS(NS,'serviceFee'))){
                    const eq = findFirst(sf,'equivalentAmount'); const rate = findFirst(sf,'rate');
                    const a = eq ? getAttr(eq,'amount','') : (rate ? getAttr(rate,'amount','') : getAttr(sf,'amount',''));
                    const n = Number(String(a||'').replace(',','.')); if (Number.isFinite(n)){ sum+=n; seen=true; }
                }
                return seen ? sum : '';
            })();
            const totalVendorCommissions = findFirst(ap, 'totalVendorCommissions');
            const komissiyaPostavshchika = toNum(totalVendorCommissions ? getAttr(totalVendorCommissions,'amount','') : '');

            // список такс (текст)
            const spisokTaks = listTaxes(ap);

            // EMD
            const catEl = findFirst(ap, "category");
            const catCode = String(catEl ? getAttr(catEl,'code','') : '').toUpperCase();
            const catCaption = catEl ? getAttr(catEl,'caption','') : '';
            let kategoriyaEmd = '';
            const emd = (catCode === 'MCO' || catCode === 'EMD') ? true : '';
            if (emd){
                const nom = findFirst(ap,'nomenclature');
                if (nom) kategoriyaEmd = getAttr(nom,'caption','') || getAttr(nom,'code','') || 'EMD';
                else kategoriyaEmd = catCaption || 'EMD';
            }

            rows.push({
                nomerProdukta: ticket,
                dataSozdaniya: createdAt,
                tipProdukta: emd ? 'EMD' : 'Авиабилет',
                operatsiya: oper,
                nomerZakaza: orderNum,

                passazhirFamiliya: last,
                passazhirImya: first,
                pnr,
                punktOtpravleniya: depAirport,
                punktPribytiya: arrAirport,

                stoimost,                 // ИТОГО (total)
                fareValue,                // Тариф
                taxesValue,               // Таксы (все, включая НДС)
                vat,                      // НДС

                sborPostavshchika: vendorFee,
                komissiyaPostavshchika,
                valyuta: currency,
                spisokTaks,               // текстовый список такс (как было)

                dataVyleta: toISO(dataVyleta),
                emd,
                kategoriyaEmd,
                shtrafZaVozvrat: (oper === 'Возврат'),
                kodPerevozchika: validationCarrier,
                issueDate: toISO(issueDate),

                category: 'air'
            });
        }

        // VOID как отдельные строки (денежные пустые)
        for(const vd of voidings){
            const relatedUid = getAttr(vd, 'relatedProductUid','');
            const rel = relatedUid ? airProducts.find(p=> (getAttr(p,'uid','') === relatedUid)) : null;
            const pnr = rel ? getAttr(rel,'pnr','') : '';
            const validationCarrier = rel ? getAttr(rel,'validatingCarrierCode','') : '';
            let last='', first='';
            if (rel){
                const t = findFirst(rel,'traveller');
                if (t){
                    const cyr = getAttr(t,'nameInCyrillic')||'';
                    const full = (cyr || getAttr(t,'nameInGds') || getAttr(t,'name') || '').trim();
                    const parts = full.split(/\s+/); last = parts[0]||''; first = parts.slice(1).join(' ')||'';
                }
            }
            rows.push({
                nomerProdukta: '',
                dataSozdaniya: createdAt,
                tipProdukta: 'Аннулирование',
                operatsiya: 'Войд',
                nomerZakaza: orderNum,
                passazhirFamiliya: last,
                passazhirImya: first,
                pnr,
                punktOtpravleniya: '',
                punktPribytiya: '',
                stoimost: '',
                fareValue: '',
                taxesValue: '',
                vat: '',
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
