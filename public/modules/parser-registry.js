// public/modules/parser-registry.js
// Реестр парсеров + автоопределение поставщика из XML.
// ВАЖНО: поддержка корня <order_snapshot> для "МойАгент" (авиа).

export const ParserRegistry = {
    /**
     * Анализирует текст XML и пытается вытащить:
     * - code поставщика (для старого формата: <Supplier code="...">)
     * - category (если доступна)
     * Поддержка "МойАгент": корневой тег <order_snapshot> → supplierCode = 'myagent_air', category = 'air'
     */
    detectFromXml(xmlText){
        try{
            const doc = new DOMParser().parseFromString(xmlText, 'text/xml');

            // 1) Классический случай: <Supplier code="...">
            const supplier = doc.querySelector('Supplier');
            if (supplier) {
                const supplierCode = supplier.getAttribute('code') || null;
                const category = supplier.getAttribute('category') || null;
                return { supplierCode, category };
            }

            // 2) МойАгент: корень <order_snapshot>
            const root = doc.documentElement;
            if (root && root.tagName === 'order_snapshot') {
                // Для авиа "МойАгент" — фиксируем категорию air
                return { supplierCode: 'myagent_air', category: 'air' };
            }

            // 3) Не распознали
            return { supplierCode: null, category: null };
        }catch{
            return { supplierCode: null, category: null };
        }
    },

    /**
     * Динамически загружает парсер XML по коду поставщика.
     * ВАЖНО: используем относительный путь от текущего модуля, а не абсолютный /client/...
     * Структура проекта:
     *   /public/modules/parser-registry.js   (этот файл)
     *   /client/parsers/xml/<supplierCode>.js
     * Значит путь: ../../client/parsers/xml/<code>.js
     */
    async loadXmlParser(supplierCode){
        // Соберём URL относительно расположения этого модуля
        const url = new URL(`../../client/parsers/xml/${supplierCode}.js`, import.meta.url);
        const mod = await import(url.href);
        return mod.default;
    }
};
