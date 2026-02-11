

# README.md

```markdown
# Universal Supplier Parser v3

Универсальный парсер данных от поставщиков туристических услуг.
Работает с XML-файлами (авиа, ж/д, отели) и API-подключениями.

---

## Что делает

- **Парсит XML** от разных поставщиков (МОМ / Gridnine, МойАгент и др.)
- **Автоматически определяет** формат и поставщика по содержимому файла
- **Приводит данные к единой таблице** — 28 полей (билеты, пассажиры, суммы, даты)
- **Экспортирует** результат в JSON
- **Управляет API-подключениями** — добавление / удаление провайдеров через интерфейс

---

## Поддерживаемые поставщики

| Поставщик              | Код парсера     | Типы продуктов          |
|------------------------|-----------------|-------------------------|
| МОМ (Gridnine)         | `mom`           | Авиа, Ж/Д, Отели       |
| МойАгент               | `myagent_air`   | Авиа                    |

Новые парсеры добавляются в папку `client/parsers/xml/` — система подхватит их автоматически.

---

## Структура проекта

```
parser_v3/
├── server.mjs                     # Локальный сервер (Node.js)
├── package.json
├── README.md
│
├── public/                        # Фронтенд (HTML + JS)
│   ├── index.html                 # Главная — загрузка файлов и таблица
│   ├── api.html                   # Управление API-провайдерами
│   ├── styles.css                 # Стили интерфейса
│   ├── app.js                     # Главный скрипт приложения
│   └── modules/                   # JS-модули
│       ├── schema.js              # Единая схема данных (28 колонок)
│       ├── parser-registry.js     # Определение поставщика + загрузка парсера
│       ├── loader.js              # Загрузка файлов через <input>
│       ├── table.js               # Отрисовка таблицы
│       ├── exporter.js            # Экспорт в JSON
│       ├── api-providers.js       # REST-клиент для провайдеров
│       ├── api-runner.js          # Опрос всех API-провайдеров
│       ├── api-loader.js          # Заготовка: прямой API-запрос
│       └── auto-import.js         # Заготовка: автозагрузка с FTP
│
└── client/parsers/
├── xml/                       # XML-парсеры поставщиков
│   ├── mom.js                 # МОМ (Gridnine) — авиа / ж-д / отели
│   └── myagent_air.js         # МойАгент — авиа
└── api/                       # JSON-файлы подключённых провайдеров
├── p_2dlsvk0s.json        # Пример: MyAgentAPI
└── p_wvyb3seo.json        # Пример: MyAgentAPI2
```

---

## Как запустить локально

### Требования

- **Node.js** версии 16 или выше (проверить: `node -v`)
- **IDE** — рекомендуется PhpStorm (или любой редактор)

### Шаг 1. Клонировать / скопировать проект

Откройте папку проекта в PhpStorm:

```
File → Open → выбрать папку parser_v3
```

### Шаг 2. Создать файл сервера

В корне проекта должен быть файл `server.mjs`.
Он раздаёт статику из `public/` и `client/`, а также реализует REST API
для управления провайдерами (`/api/providers`).

> Если файла `server.mjs` нет — его нужно создать (см. раздел ниже).

### Шаг 3. Запустить сервер

Откройте **Terminal** в PhpStorm (внизу окна) и выполните:

```bash
node server.mjs
```

В терминале появится:

```
Server running at http://localhost:3000
```

### Шаг 4. Открыть в браузере

Перейдите по адресу:

```
http://localhost:3000
```

Готово. Можно загружать XML-файлы и работать.

---

## Как пользоваться

### Загрузка XML

1. На главной странице нажмите **«Загрузить XML»**
2. Выберите один или несколько XML-файлов
3. Парсер автоматически определит поставщика и заполнит таблицу
4. Статус каждого файла отображается в панели (зелёный — ОК, красный — ошибка)

### Экспорт данных

1. После загрузки нажмите **«Экспорт в JSON»**
2. Скачается файл `export.json` со всеми строками таблицы

### Управление API-провайдерами

1. Перейдите на страницу **«API»** (ссылка в шапке)
2. Нажмите **«Добавить»** — заполните название, URL, тип авторизации
3. Провайдер сохранится как JSON-файл в `client/parsers/api/`
4. На главной странице нажмите **«Загрузить через API»** — система опросит все подключения

---

## Как добавить нового поставщика (XML)

1. Создайте файл в `client/parsers/xml/`, например `new_supplier.js`
2. Экспортируйте объект с полями:

```javascript
export default {
    supplierCode: 'new_supplier',       // уникальный код
    displayName: 'Новый поставщик',     // имя для интерфейса

    async parse(xmlText) {
        // Разбираете XML, возвращаете:
        return {
            category: 'air',            // air / rail / hotel / mixed
            rows: [
                {
                    productNumber: '...',
                    dateCreated: '...',
                    productType: 'Авиабилет',
                    operation: 'Продажа',
                    orderNumber: '...',
                    lastName: '...',
                    firstName: '...',
                    pnr: '...',
                    origin: 'SVO',
                    destination: 'LED',
                    hotel: '',
                    totalPrice: 12500,
                    fare: 10000,
                    taxes: 2500,
                    vat: '',
                    railService: '',
                    supplierFee: '',
                    supplierCommission: '',
                    currency: 'RUB',
                    taxesList: '',
                    departureDate: '2025-01-15 10:00:00',
                    emd: false,
                    emdCategory: '',
                    refundPenalty: false,
                    carrierCode: 'SU',
                    issueDate: '2025-01-10 00:00:00',
                    category: 'air'
                }
            ]
        };
    }
};
```

3. Добавьте определение формата в `parser-registry.js` → метод `detectFromXml()`
4. Перезагрузите страницу — новый парсер готов к работе

---

## Полный список полей таблицы

| Ключ                 | Заголовок             | Тип     |
|----------------------|-----------------------|---------|
| productNumber        | Номер продукта        | string  |
| dateCreated          | Дата создания         | date    |
| productType          | Тип продукта          | string  |
| operation            | Операция              | string  |
| orderNumber          | Номер заказа          | string  |
| lastName             | Пассажир Фамилия      | string  |
| firstName            | Пассажир Имя          | string  |
| pnr                  | PNR                   | string  |
| origin               | Пункт отправления     | string  |
| destination          | Пункт прибытия        | string  |
| hotel                | Отель                 | string  |
| totalPrice           | Стоимость             | number  |
| fare                 | Тариф                 | number  |
| taxes                | Таксы                 | number  |
| vat                  | VAT                   | number  |
| railService          | Сервис ЖД             | number  |
| supplierFee          | Сбор поставщика       | number  |
| supplierCommission   | Комиссия поставщика   | number  |
| currency             | Валюта                | string  |
| taxesList            | Список такс           | string  |
| departureDate        | Дата вылета           | date    |
| emd                  | EMD?                  | boolean |
| emdCategory          | Категория EMD         | string  |
| refundPenalty        | Штраф за возврат?     | boolean |
| carrierCode          | Код перевозчика       | string  |
| issueDate            | Дата выписки          | date    |
| realizationDate      | Дата реализации       | date    |
| apiLink              | API                   | string  |

---

## Технологии

- **Фронтенд:** Vanilla JS (ES Modules), HTML, CSS
- **Сервер:** Node.js (встроенный `node:http`, без фреймворков)
- **Хранение провайдеров:** JSON-файлы на диске
- **Зависимости:** нет (zero dependencies)

---

## Планы

- [ ] Реальные HTTP-запросы к API поставщиков (вместо MOCK)
- [ ] Автозагрузка XML с FTP-папки
- [ ] Портирование серверной части на PHP (Битрикс24)
- [ ] Фильтрация и сортировка таблицы
- [ ] Экспорт в CSV / Excel
```

---

Также обновлю `package.json`, чтобы сервер запускался одной командой:

# package.json

```json
{
  "name": "parser_v3",
  "version": "1.0.0",
  "description": "Универсальный парсер данных от поставщиков туристических услуг",
  "main": "server.mjs",
  "type": "module",
  "scripts": {
    "start": "node server.mjs",
    "dev": "node --watch server.mjs"
  },
  "keywords": ["parser", "xml", "travel", "supplier"],
  "author": "",
  "license": "ISC"
}
```

Теперь запускать можно двумя способами:

```bash
# Обычный запуск
npm start

# Режим разработки (авторестарт при изменении файлов, Node 18+)
npm run dev
```