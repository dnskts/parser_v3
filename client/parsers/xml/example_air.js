// client/parsers/xml/example_air.js
// ВАЖНО: файл должен экспортировать по умолчанию объект с методом parse(xmlText)
// Формат результата: { category: 'air', rows: [ { ...UnifiedFields } ] }
// UnifiedFields см. в schema.js (orderId, supplier, category, issueDate, checkOutDate, realizationDate*, pnr, passenger, route, ticketNumber, amount, currency)

export default {
    supplierCode: 'example_air',

    /**
     * Парсим простой XML вида:
     * <Supplier code="example_air" category="air">
     *   <Order id="A-1001">
     *     <Ticket pnr="AB1234" number="555-1234567890" issueDate="2025-10-10" amount="12000" currency="RUB">
     *       <Passenger>Иванов Иван</Passenger>
     *       <Route>SVO->LED</Route>
     *     </Ticket>
     *   </Order>
     *   ...
     * </Supplier>
     */
    async parse(xmlText){
        const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
        const supplierEl = doc.querySelector('Supplier');
        const supplierName = supplierEl?.getAttribute('name') || 'Example Air Supplier';

        const rows = [];
        doc.querySelectorAll('Order').forEach(orderEl=>{
            const orderId = orderEl.getAttribute('id') || '';
            orderEl.querySelectorAll('Ticket').forEach(t=>{
                const row = {
                    orderId,
                    supplier: supplierName,
                    category: 'air',
                    issueDate: t.getAttribute('issueDate') || '',
                    checkOutDate: '', // не актуально для авиабилетов
                    // realizationDate будет выставлена автоматически в Schema
                    pnr: t.getAttribute('pnr') || '',
                    passenger: (t.querySelector('Passenger')?.textContent || '').trim(),
                    route: (t.querySelector('Route')?.textContent || '').trim(),
                    ticketNumber: t.getAttribute('number') || '',
                    amount: t.getAttribute('amount') || '',
                    currency: t.getAttribute('currency') || ''
                };
                rows.push(row);
            });
        });

        return { category: 'air', rows };
    }
};
