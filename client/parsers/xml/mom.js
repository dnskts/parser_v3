// client/parsers/xml/mom.js
// --------------------------------------------------------------
// ПАРСЕР: «МОМ» (Gridnine). Поддержка air-product, hotel-product, railway-product.
// --------------------------------------------------------------
// Общие правила по полям (внутренние ключи на английском):
//   • productNumber, dateCreated, productType, operation, orderNumber
//   • lastName/firstName, pnr, origin, destination, hotel
//   • totalPrice, fare, taxes, vat, railService
//   • supplierFee, supplierCommission, currency
//   • taxesList (только для UI)
//   • departureDate, emd, emdCategory, refundPenalty, carrierCode, issueDate, realizationDate
//
// Отдельно по типам:
//   • AIR: fare = equivalentFare@amount || fare@amount
//          taxes = Σ tax(equivalentAmount/amount), vat — из tax[code=VAT|НДС]
//          totalPrice = total@amount, иначе fare + taxes
//   • HOTEL: город пишем в destination; origin пустой; hotel — название отеля.
//   • RAIL:  "Такс" как понятия нет:
//          fare = totalEquivalentFare - serviceFare (плацкарта)
//          railService = serviceFare
//          taxes = '' (пусто)
//          vat = totalEquivalentVAT
// --------------------------------------------------------------

export default {
    supplierCode: 'mom',
    displayName: 'МОМ',

    async parse(xmlText){
        const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
        const perr = doc.querySelector('parsererror');
        if (perr) throw new Error('Некорректный XML (parsererror).');

        const getNs = (tag) => doc.getElementsByTagNameNS('*', tag);
        const booking = getNs('booking')[0];
        if (!booking) throw new Error('Не найден корневой элемент <x:booking>.');

        const attr = (el, name, d='') => el?.getAttribute?.(name) ?? d;
        const toNum = (v)=> {
            if (v===null || v===undefined || v==='') return '';
            const n = Number(String(v).replace(',', '.'));
            return Number.isFinite(n) ? n : '';
        };
        const first = (list)=> list && list.length ? list[0] : null;

        // Глобальные реквизиты
        const dateCreated   = attr(booking, 'time', '');
        const orderNumber   = attr(booking, 'bookingNumber', '');

        // PNR (первый)
        let pnr = '';
        {
            const reservation = first(booking.getElementsByTagNameNS('*','reservation'));
            pnr = attr(reservation, 'pnr', '');
        }

        // Общая комиссия поставщика
        let supplierCommission = '';
        {
            const tvc = first(booking.getElementsByTagNameNS('*','totalVendorCommissions'));
            supplierCommission = toNum(attr(tvc, 'amount', ''));
        }

        const rows = [];

        // ========== AIR ==========
        const airProducts = booking.getElementsByTagNameNS('*','air-product');
        for (const ap of airProducts){
            const statusCode = attr(first(ap.getElementsByTagNameNS('*','status')), 'code', 'SELL');
            const operation = statusCode === 'REFUND' ? 'Возврат' :
                statusCode === 'EXCHANGE' ? 'Обмен' :
                    statusCode === 'VOID' ? 'Войд' : 'Продажа';

            // Пассажир
            let lastName='', firstName='';
            const trav = first(ap.getElementsByTagNameNS('*','traveller'));
            if (trav){
                const full = (attr(trav,'nameInCyrillic','') || attr(trav,'name','') || '').trim();
                if (full){
                    const parts = full.split(/\s+/);
                    lastName = parts[0] || '';
                    firstName = parts.slice(1).join(' ') || '';
                }
            }

            // Сегменты
            const seg = first(first(ap.getElementsByTagNameNS('*','segments'))?.getElementsByTagNameNS('*','segment') || []);
            const origin = attr(seg,'departureLocationCode','') || '';
            const destination = attr(seg,'arriveLocationCode','') || '';
            const departureDate = attr(seg,'departureDate','') || attr(seg,'departureDateTime','') || '';

            // Суммы
            const eqFare = first(ap.getElementsByTagNameNS('*','equivalentFare'));
            const fareNode   = first(ap.getElementsByTagNameNS('*','fare'));
            const totalNode  = first(ap.getElementsByTagNameNS('*','total'));

            const fare = toNum(attr(eqFare || fareNode, 'amount', ''));
            // таксы: суммируем все <tax>
            let taxes = '';
            let vat = '';
            const taxesEls = ap.getElementsByTagNameNS('*','tax');
            if (taxesEls.length){
                let sum = 0; let seen=false;
                for (const t of taxesEls){
                    const eq = first(t.getElementsByTagNameNS('*','equivalentAmount'));
                    const amountStr = attr(eq || t, 'amount', '');
                    const n = Number(String(amountStr).replace(',','.'));
                    if (Number.isFinite(n)){ sum += n; seen=true; }
                    const code = (attr(t,'code','') || '').toUpperCase();
                    if ((code === 'VAT' || code === 'НДС') && vat==='') vat = n;
                }
                taxes = seen ? sum : '';
            }

            // Итоговая стоимость
            let totalPrice = toNum(attr(totalNode,'amount',''));
            if (totalPrice === '') {
                const f = fare !== '' ? Number(fare) : 0;
                const t = taxes !== '' ? Number(taxes) : 0;
                if (fare !== '' || taxes !== '') totalPrice = f + t;
                else totalPrice = '';
            }

            // Валюта
            const currency = attr(ap,'gdsCurrency','') ||
                attr(totalNode,'currency','') ||
                attr(eqFare || fareNode, 'currency','');

            // Сборы
            let supplierFee = '';
            const vsf = first(ap.getElementsByTagNameNS('*','vendorServiceFee'));
            if (vsf){
                let sum = 0, seen=false;
                const serviceFees = vsf.getElementsByTagNameNS('*','serviceFee');
                for (const sf of serviceFees){
                    const eq = first(sf.getElementsByTagNameNS('*','equivalentAmount'));
                    const rate = first(sf.getElementsByTagNameNS('*','rate'));
                    const a = attr(eq,'amount','') || attr(rate,'amount','') || attr(sf,'amount','');
                    const n = Number(String(a||'').replace(',','.'));
                    if (Number.isFinite(n)){ sum+=n; seen=true; }
                }
                supplierFee = seen ? sum : '';
            }

            // Номер продукта / выпуск / перевозчик / EMD
            const productNumber = attr(ap,'ticketNumber','') || '';
            const issueDate = attr(ap, 'issueDate','') || '';
            const carrierCode = attr(ap, 'validatingCarrierCode','') || '';

            let emd = false, emdCategory = '';
            const catEl = first(ap.getElementsByTagNameNS('*','category'));
            const catCode = (attr(catEl,'code','') || '').toUpperCase();
            if (catCode === 'MCO' || catCode === 'EMD') {
                emd = true;
                const nom = first(ap.getElementsByTagNameNS('*','nomenclature'));
                emdCategory = attr(nom,'caption','') || attr(nom,'code','') || 'EMD';
            }

            rows.push({
                productNumber,
                dateCreated,
                productType: emd ? 'EMD' : 'Авиабилет',
                operation,
                orderNumber,

                lastName,
                firstName,
                pnr,
                origin,
                destination,
                hotel: '',

                totalPrice,
                fare,
                taxes,
                vat: vat === '' ? '' : Number(vat),
                railService: '',

                supplierFee,
                supplierCommission,
                currency,

                taxesList: '',
                departureDate,
                emd,
                emdCategory,
                refundPenalty: operation === 'Возврат',
                carrierCode,
                issueDate,

                category: 'air'
            });
        }

        // ========== HOTEL ==========
        const hotelProducts = booking.getElementsByTagNameNS('*','hotel-product');
        for (const hp of hotelProducts){
            const statusCode = attr(first(hp.getElementsByTagNameNS('*','status')), 'code', 'SELL');
            const operation = statusCode === 'REFUND' ? 'Возврат' : 'Продажа';

            const fareNode  = first(hp.getElementsByTagNameNS('*','fare'));
            const taxNode   = first(hp.getElementsByTagNameNS('*','tax'));
            const totalNode = first(hp.getElementsByTagNameNS('*','total'));

            const fare = toNum(attr(fareNode,  'amount', ''));
            const taxes = toNum(attr(taxNode,   'amount', ''));
            let totalPrice = toNum(attr(totalNode, 'amount', ''));

            if (totalPrice === '') {
                const f = fare !== '' ? Number(fare) : 0;
                const t = taxes !== '' ? Number(taxes) : 0;
                totalPrice = (fare !== '' || taxes !== '') ? (f + t) : '';
            }

            const supplierFee = toNum(attr(first(hp.getElementsByTagNameNS('*','totalVendorServiceFee')),'amount',''));

            const currency = attr(hp, 'gdsCurrency', '') ||
                attr(totalNode, 'currency', '') ||
                attr(fareNode, 'currency', '') ||
                attr(taxNode, 'currency', '');

            // Город — в destination, origin пустой
            const hotelLoc = first(hp.getElementsByTagNameNS('*','hotelLocation'));
            const destination = attr(hotelLoc,'caption','');
            const origin = '';

            // Название отеля — пробуем разные места (hotelName, hotel, property, hotelInfo...)
            let hotel = attr(hp,'hotelName','') || attr(hp,'hotel','') || attr(hp,'accommodation','') || '';
            if (!hotel) {
                const tryNodes = ['hotelName','hotel','accommodation','property','hotelInfo','hotelLocation'];
                for (const n of tryNodes){
                    const node = first(hp.getElementsByTagNameNS('*', n));
                    if (node){
                        hotel = attr(node,'name','') || attr(node,'caption','') || attr(node,'title','') || (node.textContent||'').trim() || '';
                        if (hotel) break;
                    }
                }
            }

            // Пассажир (если есть)
            let lastName = '', firstName = '';
            const travs = hp.getElementsByTagNameNS('*','traveller');
            if (travs && travs.length){
                const full = attr(travs[0], 'name', '').trim() || attr(travs[0], 'nameInCyrillic', '').trim();
                if (full){
                    const parts = full.split(/\s+/);
                    lastName = parts[0] || '';
                    firstName = parts.slice(1).join(' ') || '';
                }
            }

            const issueDate = attr(hp, 'issueDate', '');
            const productNumber = attr(hp, 'systemNumber', '');

            rows.push({
                productNumber,
                dateCreated,
                productType: 'Отель',
                operation,
                orderNumber,

                lastName,
                firstName,
                pnr,
                origin,
                destination,
                hotel,

                totalPrice,
                fare,
                taxes,
                vat: '',
                railService: '',

                supplierFee,
                supplierCommission,
                currency,

                taxesList: '',
                departureDate: '',
                emd: '',
                emdCategory: '',
                refundPenalty: operation === 'Возврат',
                carrierCode: '',
                issueDate,

                category: 'hotel'
            });
        }

        // ========== RAIL ==========
        const railProducts = booking.getElementsByTagNameNS('*','railway-product');
        for (const rp of railProducts){
            const statusCode = attr(first(rp.getElementsByTagNameNS('*','status')), 'code', 'SELL');
            const operation = statusCode === 'REFUND' ? 'Возврат' : 'Продажа';

            const seg = first(first(rp.getElementsByTagNameNS('*','segments'))?.getElementsByTagNameNS('*','segment') || []);
            const depCity = first(seg?.getElementsByTagNameNS('*','departureCity') || []);
            const arrCity = first(seg?.getElementsByTagNameNS('*','arriveCity') || []);
            const origin = attr(depCity, 'caption', '') || '';
            const destination = attr(arrCity, 'caption', '') || '';
            const departureDate = attr(seg, 'departureDate', '') || '';

            let currency = attr(rp, 'gdsCurrency', '') || '';

            const totalEqFare = toNum(attr(rp, 'totalEquivalentFare', ''));
            const serviceFare = toNum(attr(rp, 'serviceFare', ''));
            const totalEqVAT  = toNum(attr(rp, 'totalEquivalentVAT', ''));

            const fare = (totalEqFare !== '' && serviceFare !== '') ? (Number(totalEqFare) - Number(serviceFare)) : ''; // плацкарта
            const railService = serviceFare;  // сервис ЖД
            const vat = totalEqVAT === '' ? '' : Number(totalEqVAT);

            // Итоговая стоимость (с учётом знака при возврате)
            let totalPrice = '';
            {
                const fopsRoot = first(rp.getElementsByTagNameNS('*','fops'));
                const fops = fopsRoot ? fopsRoot.getElementsByTagNameNS('*','fop') : [];
                for (const f of fops){
                    const cat = first(f.getElementsByTagNameNS('*','category'));
                    if (attr(cat,'code','') === 'PRODUCT'){
                        const amountNode = first(f.getElementsByTagNameNS('*','amount'));
                        const amt = toNum(attr(amountNode,'amount',''));
                        const cur = attr(amountNode,'currency','');
                        if (amt !== '') {
                            totalPrice = amt;
                            if (!currency) currency = cur;
                            break;
                        }
                    }
                }
                if (totalPrice === '' && totalEqFare !== '') {
                    totalPrice = (operation === 'Возврат') ? -Number(totalEqFare) : Number(totalEqFare);
                }
            }

            // Пассажир
            let lastName = '', firstName = '';
            const travs = rp.getElementsByTagNameNS('*','traveller');
            if (travs && travs.length){
                const full = attr(travs[0], 'name', '').trim() || attr(travs[0], 'nameInCyrillic', '').trim();
                if (full){
                    const parts = full.split(/\s+/);
                    lastName = parts[0] || '';
                    firstName = parts.slice(1).join(' ') || '';
                }
            }

            const carrierCode = attr(first(seg?.getElementsByTagNameNS('*','carrier') || []),'code','');
            const issueDate = attr(rp, 'issueDate', '');
            const productNumber = attr(rp, 'systemNumber', '');

            rows.push({
                productNumber,
                dateCreated,
                productType: 'Ж/Д билет',
                operation,
                orderNumber,

                lastName,
                firstName,
                pnr,
                origin,
                destination,
                hotel: '',

                totalPrice: totalPrice === '' ? '' : Number(totalPrice),
                fare: fare === '' ? '' : Number(fare),
                taxes: '', // для ЖД — пусто по договорённости
                vat,
                railService: railService === '' ? '' : Number(railService),

                supplierFee: toNum(attr(first(rp.getElementsByTagNameNS('*','totalVendorServiceFee')),'amount','')),
                supplierCommission,
                currency,

                taxesList: '',
                departureDate,
                emd: '',
                emdCategory: '',
                refundPenalty: operation === 'Возврат',
                carrierCode,
                issueDate,

                category: 'rail'
            });
        }

        if (!rows.length){
            throw new Error('Парсер МОМ отработал, но данных не найдено.');
        }
        
        // Определяем общую категорию на основе первых записей
        const categories = [...new Set(rows.map(r => r.category))];
        const commonCategory = categories.length === 1 ? categories[0] : 'mixed';
        
        return { category: commonCategory, rows };
    }
};