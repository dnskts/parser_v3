// client/parsers/xml/example_rail.js
// Аналогично авиапарсеру, но category = 'rail'

export default {
    supplierCode: 'example_rail',

    /**
     * Ожидаемый XML:
     * <Supplier code="example_rail" category="rail">
     *   <Order id="R-2002">
     *     <Ticket pnr="ZX987" number="R-001122" issueDate="2025-09-14" amount="4200" currency="RUB">
     *       <Passenger>Петров Пётр</Passenger>
     *       <Route>Leningradsky->Moskovsky</Route>
     *     </Ticket>
     *   </Order>
     * </Supplier>
     */
    async parse(xmlText){
        const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
        const supplierEl = doc.querySelector('Supplier');
        const supplierName = supplierEl?.getAttribute('name') || 'Example Rail Supplier';

        const rows = [];
        doc.querySelectorAll('Order').forEach(orderEl=>{
            const orderId = orderEl.getAttribute('id') || '';
            orderEl.querySelectorAll('Ticket').forEach(t=>{
                const row = {
                    orderId,
                    supplier: supplierName,
                    category: 'rail',
                    issueDate: t.getAttribute('issueDate') || '',
                    checkOutDate: '', // для железной дороги не используется
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

        return { category: 'rail', rows };
    }
};
