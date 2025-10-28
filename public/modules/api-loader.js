// public/modules/api-loader.js
// Заготовка: в будущем здесь будет обращение к API поставщиков и заполнение таблицы.
// Интерфейс оставлен, чтобы не ломать архитектуру, когда начнём добавлять API.

export const ApiLoader = {
    // Пример вызова: const data = await ApiLoader.fetchOrder({ supplierCode: 'some_api', orderId: '123' })
    async fetchOrder({ supplierCode, orderId, token }){
        // TODO: реализовать при подключении конкретного API.
        // Примерно:
        // const resp = await fetch(`https://api.supplier.com/orders/${orderId}`, { headers: { Authorization: `Bearer ${token}` }});
        // const json = await resp.json();
        // return json;
        throw new Error('API-загрузка ещё не реализована. Этот файл — заготовка на будущее.');
    }
};
