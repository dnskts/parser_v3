// public/modules/api-runner.js
// Опрос всех API-поставщиков и приведение к единой схеме.
// Сейчас — MOCK-стратегии (имитация). При реальной интеграции сюда добавим fetch к внешним API.

import { ApiProviders } from './api-providers.js';

function normalizeToSchemaRows(items = [], type = 'air'){
    return items.map((it)=>({
        productNumber: it.productNumber || it.id || '',
        dateCreated: it.dateCreated || it.createdAt || '',
        productType: it.productType || (
            type === 'hotel' ? 'Отель' : type === 'rail' ? 'Ж/Д билет' : 'Авиабилет'
        ),
        operation: it.operation || 'Продажа',
        orderNumber: it.orderNumber || '',
        lastName: it.lastName || '',
        firstName: it.firstName || '',
        pnr: it.pnr || '',
        origin: it.origin || '',
        destination: it.destination || '',
        hotel: it.hotel || '',
        totalPrice: it.totalPrice ?? '',
        fare: it.fare ?? '',
        taxes: it.taxes ?? '',
        vat: it.vat ?? '',
        railService: it.railService ?? '',
        supplierFee: it.supplierFee ?? '',
        supplierCommission: it.supplierCommission ?? '',
        currency: it.currency || 'RUB',
        taxesList: it.taxesList || '',
        departureDate: it.departureDate || '',
        emd: it.emd ?? '',
        emdCategory: it.emdCategory || '',
        refundPenalty: it.refundPenalty ?? '',
        carrierCode: it.carrierCode || '',
        issueDate: it.issueDate || '',
        category: type
    }));
}

// MOCK: имитация ответа
async function strategyMock(provider){
    await new Promise(r => setTimeout(r, 200));
    const now = new Date().toISOString().slice(0,19).replace('T',' ');
    const demo = [
        {
            id: provider.name + '-001',
            dateCreated: now,
            productType: provider.type === 'hotel' ? 'Отель' : (provider.type === 'rail' ? 'Ж/Д билет' : 'Авиабилет'),
            operation: 'Продажа',
            orderNumber: 'API-' + Math.floor(Math.random()*100000),
            lastName: 'IVANOV', firstName: 'IVAN',
            origin: provider.type === 'hotel' ? '' : 'SVO',
            destination: provider.type === 'hotel' ? 'Moscow' : 'JFK',
            hotel: provider.type === 'hotel' ? 'Demo Hotel' : '',
            fare: 10000, taxes: provider.type === 'rail' ? '' : 2500, vat: provider.type === 'rail' ? 200 : '',
            railService: provider.type === 'rail' ? 500 : '',
            totalPrice: provider.type === 'rail' ? 10700 : 12500,
            currency: 'RUB',
            departureDate: provider.type === 'hotel' ? '' : now.slice(0,10) + ' 10:00:00',
            issueDate: now
        }
    ];
    return normalizeToSchemaRows(demo, provider.type);
}

const STRATEGIES = {
    air: strategyMock,
    rail: strategyMock,
    hotel: strategyMock,
    transfer: strategyMock,
    mixed: strategyMock
};

export const ApiRunner = {
    /** Опрос всех провайдеров. onEvent — колбэк событий (start/provider_ok/provider_error/done). */
    async runAll(onEvent){
        onEvent?.({ type:'start' });
        let totalAdded = 0;

        const providers = await ApiProviders.getAll(); // <-- теперь асинхронно, с бэкендом
        for (const p of providers){
            const strat = STRATEGIES[p.type] || strategyMock;
            try{
                const rows = await strat(p);
                totalAdded += rows.length;
                onEvent?.({ type:'provider_ok', provider: p, rows, totalAdded });
            }catch(err){
                onEvent?.({ type:'provider_error', provider: p, error: err?.message || 'Ошибка при запросе.' , totalAdded });
            }
        }
        onEvent?.({ type:'done', totalAdded });
    }
};
