// public/modules/exporter.js
// --------------------------------------------------------------
// ЭКСПОРТ ДАННЫХ ТАБЛИЦЫ В JSON
// --------------------------------------------------------------
// Теперь внутренние ключи уже на английском, поэтому экспорт —
// это просто аккуратное переименование под нужные "человеческие"
// заголовки (с пробелами), без лишних преобразований.
// --------------------------------------------------------------

function val(x){
    return (x === undefined || x === null) ? '' : x;
}

function mapRowToExport(r){
    return {
        "Product Number":      val(r.productNumber),
        "Date Created":        val(r.dateCreated),
        "Product Type":        val(r.productType),
        "Operation":           val(r.operation),
        "Order Number":        val(r.orderNumber),

        "Last Name":           val(r.lastName),
        "First Name":          val(r.firstName),
        "PNR":                 val(r.pnr),
        "Origin":              val(r.origin),
        "Destination":         val(r.destination),

        "Hotel":               val(r.hotel),        // название отеля (если есть)
        "Rail Service":        val(r.railService),  // сервисная часть для ЖД

        "Fare":                val(r.fare),
        "Taxes":               val(r.taxes),
        "VAT":                 val(r.vat),
        "Total Price":         val(r.totalPrice),
        "Supplier Fee":        val(r.supplierFee),
        "Supplier Commission": val(r.supplierCommission),
        "Currency":            val(r.currency),

        "Departure Date":      val(r.departureDate),
        "EMD":                 val(r.emd),
        "EMD Category":        val(r.emdCategory),
        "Refund Penalty":      val(r.refundPenalty),
        "Carrier Code":        val(r.carrierCode),
        "Issue Date":          val(r.issueDate),
        "Realization Date":    val(r.realizationDate)
    };
}

export const Exporter = {
    // Возвращаем массив объектов — по одному на каждую строку таблицы
    toUnifiedJson({ rows }){
        const safeRows = Array.isArray(rows) ? rows : [];
        return safeRows.map(mapRowToExport);
    }
};
