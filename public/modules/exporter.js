// public/modules/exporter.js
// Экспорт в единый JSON. Поддерживает:
// 1) Старый режим: { category, rows } — всё в одну ветку
// 2) Новый режим:  { rows } — строки могут иметь разные row.category; разложим по веткам автоматически.

export const Exporter = {
    toUnifiedJson({ category, rows, rawPayload }){
        const root = {
            air: [],
            rail: [],
            hotel: [],
            transfer: [],
            raw: {
                payloadRef: null
            }
        };

        const pushRows = (cat, list) => {
            if (!Array.isArray(list)) return;
            const key = ['air','rail','hotel','transfer'].includes(cat) ? cat : null;
            if (key) root[key].push(...list);
        };

        if (category && Array.isArray(rows)) {
            // Старый режим (совместимость)
            pushRows(String(category).toLowerCase(), rows);
        } else if (Array.isArray(rows)) {
            // Новый режим: группируем по row.category
            const groups = { air: [], rail: [], hotel: [], transfer: [] };
            for (const r of rows) {
                const cat = String(r?.category || '').toLowerCase();
                if (['air','rail','hotel','transfer'].includes(cat)) {
                    groups[cat].push(r);
                } else {
                    // если категория не указана — можно по умолчанию относить к air или игнорировать
                    // оставим игнор, чтобы не загрязнять данные:
                    // (при желании — раскомментить строку, чтобы класть в air)
                    // groups.air.push(r);
                }
            }
            root.air = groups.air;
            root.rail = groups.rail;
            root.hotel = groups.hotel;
            root.transfer = groups.transfer;
        }

        // Исходный payload: пока сохраняем последний как строку
        root.raw.payloadRef = rawPayload || null;

        return root;
    }
};
