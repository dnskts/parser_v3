// public/modules/exporter.js
// Формирует объект JSON с ветками air/rail/hotel/transfer и полем raw.payloadRef.
// raw.payloadRef — это просто сохранение исходного XML (или, при желании, ссылка/хэш).

export const Exporter = {
    toUnifiedJson({ category, rows, rawPayload }){
        const root = {
            air: [],
            rail: [],
            hotel: [],
            transfer: [],
            raw: {
                payloadRef: null // сюда положим сырой XML
            }
        };

        // Нормализуем категорию
        const cat = String(category || '').toLowerCase();
        if(!['air','rail','hotel','transfer'].includes(cat)){
            throw new Error('Неизвестная категория для экспорта');
        }

        // Кладём записи в соответствующую ветку
        root[cat] = rows;

        // Кладём исходный payload (в простом виде — как строка)
        root.raw.payloadRef = rawPayload || null;

        return root;
    }
};
