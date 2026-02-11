// public/modules/parser-registry.js
// Реестр: автоопределение поставщика по XML + динамическая загрузка нужного парсера.

export const ParserRegistry = {
    /**
     * Анализирует текст XML и возвращает { supplierCode, category }.
     * Поддерживает:
     *  - Классический <Supplier code="...">
     *  - МойАгент: <order_snapshot> → supplierCode: 'myagent_air', category: 'air'
     *  - МОМ (Gridnine): корень x:booking (ns=http://www.gridnine.com/export/xml) → supplierCode: 'mom', category: 'air'
     */
    detectFromXml(xmlText){
        try{
            const doc = new DOMParser().parseFromString(xmlText, 'text/xml');

            // 1) Классический формат: <Supplier code="...">
            const supplier = doc.querySelector('Supplier');
            if (supplier) {
                const supplierCode = supplier.getAttribute('code') || null;
                const category = (supplier.getAttribute('category') || '').toLowerCase() || null;
                return { supplierCode, category };
            }

            // 2) МойАгент: <order_snapshot>
            const root = doc.documentElement;
            if (root && root.tagName === 'order_snapshot') {
                return { supplierCode: 'myagent_air', category: 'air' };
            }

            // 3) МОМ (Gridnine): x:booking с namespace http://www.gridnine.com/export/xml
            const ns = 'http://www.gridnine.com/export/xml';
            const bookings = doc.getElementsByTagNameNS(ns, 'booking');
            if (bookings && bookings.length) {
                return { supplierCode: 'mom', category: 'air' };
            }

            // Не распознали
            return { supplierCode: null, category: null };
        }catch{
            return { supplierCode: null, category: null };
        }
    },

    /**
     * Динамическая подгрузка парсера по коду поставщика.
     * Путь строим относительно текущего модуля, чтобы работало из любой папки:
     *   public/modules/parser-registry.js
     * -> ../../client/parsers/xml/<supplierCode>.js
     */
    async loadXmlParser(supplierCode){
        const url = new URL(`../../client/parsers/xml/${supplierCode}.js`, import.meta.url);
        const mod = await import(url.href);
        return mod.default;
    }
};