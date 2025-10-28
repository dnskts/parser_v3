// client/parsers/xml/mom.js
// Поставщик: МОМ (Gridnine), корень <x:booking ...>
// Поддержка: air-product, hotel-product, railway-product (продажа/возврат).
//
// Обновления:
//  - HOTEL: город записываем в "Пункт прибытия", "Пункт отправления" пустой.
//  - HOTEL: добавлена колонка "Отель" — берём название отеля из доступных узлов/атрибутов.

export default {
    supplierCode: 'mom',
    displayName: 'МОМ',

    async parse(xmlText){
        const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
        const perr = doc.querySelector('parsererror');
        if (perr) throw new Error('Некорректный XML (parsererror).');

        const qn = (nsTag) => {
            const [, tag] = nsTag.split(':');
            return doc.getElementsByTagNameNS('*', tag);
        };
        const booking = qn('x:booking')[0];
        if (!booking) throw new Error('Не найден корневой элемент <x:booking>.');

        const attr = (el, name, d='') => el?.getAttribute?.(name) ?? d;
        const toNum = (v)=> {
            if (v===null || v===undefined || v==='') return '';
            const n = Number(String(v).replace(',', '.'));
            return Number.isFinite(n) ? n : '';
        };
        const first = (list)=> list && list.length ? list[0] : null;

        // helpers
        const getTextish = (el, names=[])=>{
            // ищем caption/name/title внутри разных вариантов тэгов
            for (const n of names){
                const found = el.getElementsByTagNameNS('*', n);
                if (found && found.length) {
                    const v = attr(found[0],'caption','') || attr(found[0],'name','') || (found[0].textContent||'').trim();
                    if (v) return v;
                }
            }
            return '';
        };
        const getHotelName = (hp)=>{
            // эвристики: hotelName, hotel, accommodation, property, hotelInfo
            const direct = attr(hp,'hotelName','') || attr(hp,'hotel','') || attr(hp,'accommodation','') || '';
            if (direct) return direct;
            // попробуем по вложенным узлам
            const variants = ['hotelName','hotel','accommodation','property','hotelInfo','hotelLocation'];
            for (const v of variants){
                const node = first(hp.getElementsByTagNameNS('*', v));
                if (node){
                    const name = attr(node,'name','') || attr(node,'caption','') || attr(node,'title','') || (node.textContent||'').trim();
                    if (name) return name;
                }
            }
            return '';
        };

        // Глобальные
        const createdAt   = attr(booking, 'time', '');
        const orderNumber = attr(booking, 'bookingNumber', '');

        // PNR (первый)
        let pnr = '';
        {
            const reservations = booking.getElementsByTagNameNS('*','reservation');
            pnr = attr(first(reservations), 'pnr', '');
        }

        // Комиссия поставщика (общая)
        let supplierCommission = '';
        {
            const tvcs = booking.getElementsByTagNameNS('*','totalVendorCommissions');
            supplierCommission = toNum(attr(first(tvcs), 'amount', ''));
        }

        const rows = [];

        // ====== AIR ======
        const airProducts = booking.getElementsByTagNameNS('*','air-product');
        for (const ap of airProducts){
            const statusCode = attr(first(ap.getElementsByTagNameNS('*','status')), 'code', 'SELL');
            const operatsiya = statusCode === 'REFUND' ? 'Возврат' :
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
            const depAirport = attr(seg,'departureLocationCode','') || '';
            const arrAirport = attr(seg,'arriveLocationCode','') || '';
            const departureDate = attr(seg,'departureDate','') || attr(seg,'departureDateTime','') || '';

            // Суммы
            const eqFare = first(ap.getElementsByTagNameNS('*','equivalentFare'));
            const fare   = first(ap.getElementsByTagNameNS('*','fare'));
            const total  = first(ap.getElementsByTagNameNS('*','total'));

            const fareValue = toNum(attr(eqFare || fare, 'amount', ''));
            // таксы: суммируем все <tax>
            let taxesValue = '';
            let vat = '';
            const taxes = ap.getElementsByTagNameNS('*','tax');
            if (taxes.length){
                let sum = 0; let seen=false;
                for (const t of taxes){
                    const eq = first(t.getElementsByTagNameNS('*','equivalentAmount'));
                    const amountStr = attr(eq || t, 'amount', '');
                    const n = Number(String(amountStr).replace(',','.'));
                    if (Number.isFinite(n)){ sum += n; seen=true; }
                    const code = (attr(t,'code','') || '').toUpperCase();
                    if ((code === 'VAT' || code === 'НДС') && vat==='') vat = n;
                }
                taxesValue = seen ? sum : '';
            }

            // stoimost
            let stoimost = toNum(attr(total,'amount',''));
            if (stoimost === '') {
                const f = fareValue !== '' ? Number(fareValue) : 0;
                const t = taxesValue !== '' ? Number(taxesValue) : 0;
                if (fareValue !== '' || taxesValue !== '') stoimost = f + t;
                else stoimost = '';
            }

            // Валюта
            const currency = attr(ap,'gdsCurrency','') ||
                attr(total,'currency','') ||
                attr(eqFare || fare, 'currency','');

            // Сборы
            let vendorFee = '';
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
                vendorFee = seen ? sum : '';
            }

            // Номер продукта / выпуск
            const ticketNumber = attr(ap,'ticketNumber','') || '';
            const issueDate = attr(ap, 'issueDate','') || '';

            // Перевозчик
            const carrierCode = attr(ap, 'validatingCarrierCode','') || '';

            rows.push({
                nomerProdukta: ticketNumber,
                dataSozdaniya: createdAt,
                tipProdukta: 'Авиабилет',
                operatsiya,
                nomerZakaza: orderNumber,

                passazhirFamiliya: lastName,
                passazhirImya: firstName,
                pnr,
                punktOtpravleniya: depAirport,
                punktPribytiya: arrAirport,
                hotelName: '',

                stoimost,
                fareValue,
                taxesValue,
                vat: vat === '' ? '' : Number(vat),
                railService: '',

                sborPostavshchika: vendorFee,
                komissiyaPostavshchika: supplierCommission,
                valyuta: currency,

                spisokTaks: '',
                dataVyleta: departureDate,
                emd: '',
                kategoriyaEmd: '',
                shtrafZaVozvrat: operatsiya === 'Возврат',
                kodPerevozchika: carrierCode,
                issueDate,

                category: 'air'
            });
        }

        // ====== HOTEL ======
        const hotelProducts = booking.getElementsByTagNameNS('*','hotel-product');
        for (const hp of hotelProducts){
            const statusCode = attr(first(hp.getElementsByTagNameNS('*','status')), 'code', 'SELL');
            const operatsiya = statusCode === 'REFUND' ? 'Возврат' : 'Продажа';

            const fareNode  = first(hp.getElementsByTagNameNS('*','fare'));
            const taxNode   = first(hp.getElementsByTagNameNS('*','tax'));
            const totalNode = first(hp.getElementsByTagNameNS('*','total'));

            const fareValue  = toNum(attr(fareNode,  'amount', ''));
            const taxesValue = toNum(attr(taxNode,   'amount', ''));
            let stoimost     = toNum(attr(totalNode, 'amount', ''));

            if (stoimost === '') {
                const f = fareValue !== '' ? Number(fareValue) : 0;
                const t = taxesValue !== '' ? Number(taxesValue) : 0;
                stoimost = (fareValue !== '' || taxesValue !== '') ? (f + t) : '';
            }

            const vendorFeeNode = first(hp.getElementsByTagNameNS('*','totalVendorServiceFee'));
            const sborPostavshchika = toNum(attr(vendorFeeNode,'amount',''));

            const currency = attr(hp, 'gdsCurrency', '') ||
                attr(totalNode, 'currency', '') ||
                attr(fareNode, 'currency', '') ||
                attr(taxNode, 'currency', '');

            // Город — пункт прибытия; отправление пусто
            const hotelLoc = first(hp.getElementsByTagNameNS('*','hotelLocation'));
            const cityCaption = attr(hotelLoc,'caption','');

            // Название отеля
            const hotelName = getHotelName(hp);

            const issueDate = attr(hp, 'issueDate', '');
            const productNumber = attr(hp, 'systemNumber', '');

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

            rows.push({
                nomerProdukta: productNumber,
                dataSozdaniya: createdAt,
                tipProdukta: 'Отель',
                operatsiya,
                nomerZakaza: orderNumber,

                passazhirFamiliya: lastName,
                passazhirImya: firstName,
                pnr,
                punktOtpravleniya: '',       // <- пусто
                punktPribytiya: cityCaption, // <- город сюда
                hotelName,                   // <- название отеля

                stoimost,
                fareValue,
                taxesValue,
                vat: '',
                railService: '',

                sborPostavshchika,
                komissiyaPostavshchika: supplierCommission,
                valyuta: currency,

                spisokTaks: '',
                dataVyleta: '',
                emd: '',
                kategoriyaEmd: '',
                shtrafZaVozvrat: operatsiya === 'Возврат',
                kodPerevozchika: '',
                issueDate,

                category: 'hotel'
            });
        }

        // ====== RAIL ======
        const railProducts = booking.getElementsByTagNameNS('*','railway-product');
        for (const rp of railProducts){
            const statusCode = attr(first(rp.getElementsByTagNameNS('*','status')), 'code', 'SELL');
            const operatsiya = statusCode === 'REFUND' ? 'Возврат' : 'Продажа';

            const seg = first(first(rp.getElementsByTagNameNS('*','segments'))?.getElementsByTagNameNS('*','segment') || []);
            const depCity = first(seg?.getElementsByTagNameNS('*','departureCity') || []);
            const arrCity = first(seg?.getElementsByTagNameNS('*','arriveCity') || []);
            const depCityCap = attr(depCity, 'caption', '') || '';
            const arrCityCap = attr(arrCity, 'caption', '') || '';
            const departureDate = attr(seg, 'departureDate', '') || '';

            let currency = attr(rp, 'gdsCurrency', '') || '';

            const totalEqFare = toNum(attr(rp, 'totalEquivalentFare', ''));
            const serviceFare = toNum(attr(rp, 'serviceFare', ''));
            const totalEqVAT  = toNum(attr(rp, 'totalEquivalentVAT', ''));

            const fareValue  = (totalEqFare !== '' && serviceFare !== '') ? (Number(totalEqFare) - Number(serviceFare)) : '';
            const railService = serviceFare;
            const vat = totalEqVAT === '' ? '' : Number(totalEqVAT);

            let stoimost = '';
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
                            stoimost = amt;
                            if (!currency) currency = cur;
                            break;
                        }
                    }
                }
                if (stoimost === '' && totalEqFare !== '') {
                    stoimost = (operatsiya === 'Возврат') ? -Number(totalEqFare) : Number(totalEqFare);
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

            // Перевозчик
            const carrierNode = first(seg?.getElementsByTagNameNS('*','carrier') || []);
            const carrierCode = attr(carrierNode,'code','');

            const issueDate = attr(rp, 'issueDate', '');
            const productNumber = attr(rp, 'systemNumber', '');

            rows.push({
                nomerProdukta: productNumber,
                dataSozdaniya: createdAt,
                tipProdukta: 'Ж/Д билет',
                operatsiya,
                nomerZakaza: orderNumber,

                passazhirFamiliya: lastName,
                passazhirImya: firstName,
                pnr,
                punktOtpravleniya: depCityCap,
                punktPribytiya: arrCityCap,
                hotelName: '',

                stoimost: stoimost === '' ? '' : Number(stoimost),
                fareValue: fareValue === '' ? '' : Number(fareValue),
                taxesValue: '',          // ЖД — не используем
                vat,
                railService: railService === '' ? '' : Number(railService),

                sborPostavshchika: toNum(attr(first(rp.getElementsByTagNameNS('*','totalVendorServiceFee')),'amount','')),
                komissiyaPostavshchika: supplierCommission,
                valyuta: currency,

                spisokTaks: '',
                dataVyleta: departureDate,
                emd: '',
                kategoriyaEmd: '',
                shtrafZaVozvrat: operatsiya === 'Возврат',
                kodPerevozchika: carrierCode,
                issueDate,

                category: 'rail'
            });
        }

        if (!rows.length){
            throw new Error('Парсер МОМ отработал, но данных не найдено.');
        }
        return { category: null, rows };
    }
};
