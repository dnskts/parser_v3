// public/modules/exporter.js
// Экспорт данных из единой таблицы в JSON.
// ВАЖНО: Экспортируем только согласованный набор полей (по вашим требованиям).
// Добавлено: "Hotel" (название отеля) и "Rail Service" (сервис ЖД).

function mapRowToExport(r){
    // Безопасная нормализация: undefined/null -> пустая строка
    const val = (x) => (x === undefined || x === null ? '' : x);

    return {
        // Идентификаторы / контекст
        "Product Number":      val(r.nomerProdukta),
        "Date Created":        val(r.dataSozdaniya),
        "Product Type":        val(r.tipProdukta),
        "Operation":           val(r.operatsiya),
        "Order Number":        val(r.nomerZakaza),

        // Пассажир / бронирование / маршрут
        "Last Name":           val(r.passazhirFamiliya),
        "First Name":          val(r.passazhirImya),
        "PNR":                 val(r.pnr),
        "Origin":              val(r.punktOtpravleniya),
        "Destination":         val(r.punktPribytiya),

        // Новые поля
        "Hotel":               val(r.hotelName),     // название отеля (для hotel-product)
        "Rail Service":        val(r.railService),   // сервисная часть ЖД

        // Деньги
        "Fare":                val(r.fareValue),     // Тариф
        "Taxes":               val(r.taxesValue),    // Таксы (число; для ЖД — пусто)
        "VAT":                 val(r.vat),           // НДС
        "Total Price":         val(r.stoimost),      // Итоговая стоимость
        "Supplier Fee":        val(r.sborPostavshchika),
        "Supplier Commission": val(r.komissiyaPostavshchika),
        "Currency":            val(r.valyuta),

        // Прочее
        "Departure Date":      val(r.dataVyleta),
        "EMD":                 val(r.emd),
        "EMD Category":        val(r.kategoriyaEmd),
        "Refund Penalty":      val(r.shtrafZaVozvrat),
        "Carrier Code":        val(r.kodPerevozchika),
        "Issue Date":          val(r.issueDate),
        "Realization Date":    val(r.realizationDate)
    };
}

export const Exporter = {
    /**
     * Преобразует массив нормализованных строк таблицы в массив JSON-объектов
     * (по одному объекту на строку).
     */
    toUnifiedJson({ rows }){
        const safeRows = Array.isArray(rows) ? rows : [];
        const blocks = safeRows.map(mapRowToExport);
        // Возвращаем именно массив блоков — "каждая строка таблицы отдельным блоком"
        return blocks;
    }
};
