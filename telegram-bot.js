/**
 * Telegram Bot для продажи подписок ProxySwitcher
 *
 * Запуск:
 * 1. Создайте бота через @BotFather в Telegram
 * 2. Получите токен бота
 * 3. Установите зависимости: npm install node-telegram-bot-api
 * 4. Настройте переменные окружения или отредактируйте конфиг ниже
 * 5. Запустите: node telegram-bot.js
 */

const TelegramBot = require("node-telegram-bot-api")
const crypto = require("crypto")
const fs = require("fs")
const http = require("http")

// Конфигурация
const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN || "8530886952:AAELDw3vMrljicbyl2Nyzwh1zDQMsCi8Jk0",
  ADMIN_ID: process.env.ADMIN_ID || "1830230896",
  PRICE_PREMIUM: 150, // Цена Premium подписки
  PRICE_PROXY: 250, // Цена индивидуального прокси
  LICENSE_FILE: "./licenses.json",
  API_PORT: process.env.API_PORT || 3847,
  API_HOST: process.env.API_HOST || "0.0.0.0",
}

// Инициализация бота
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true })

// Хранилище лицензий
let licenses = {}

const pendingOrders = {}

const supportTickets = {}

bot.setMyCommands([
  { command: "start", description: "Главное меню" },
  { command: "buy", description: "Купить Premium подписку" },
  { command: "proxy", description: "Купить индивидуальный прокси" },
  { command: "check", description: "Проверить лицензионный ключ" },
  { command: "support", description: "Связаться с поддержкой" }, // Добавлена команда support
  { command: "help", description: "Помощь" },
])

// Загрузка лицензий из файла
function loadLicenses() {
  try {
    if (fs.existsSync(CONFIG.LICENSE_FILE)) {
      licenses = JSON.parse(fs.readFileSync(CONFIG.LICENSE_FILE, "utf8"))
    }
  } catch (error) {
    console.error("Ошибка загрузки лицензий:", error)
    licenses = {}
  }
}

// Сохранение лицензий в файл
function saveLicenses() {
  try {
    fs.writeFileSync(CONFIG.LICENSE_FILE, JSON.stringify(licenses, null, 2))
  } catch (error) {
    console.error("Ошибка сохранения лицензий:", error)
  }
}

// Генерация лицензионного ключа
function generateLicenseKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  const generatePart = () => {
    let part = ""
    for (let i = 0; i < 5; i++) {
      part += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return part
  }

  return `PS-${generatePart()}-${generatePart()}-${generatePart()}`
}

// Создание новой лицензии
function createLicense(userId, username) {
  const key = generateLicenseKey()
  const license = {
    key,
    userId,
    username,
    createdAt: new Date().toISOString(),
    status: "active",
  }

  licenses[key] = license
  saveLicenses()

  return license
}

// Проверка лицензии
function checkLicense(key) {
  const license = licenses[key]
  if (!license) return { valid: false, message: "Ключ не найден" }
  if (license.status !== "active") return { valid: false, message: "Лицензия деактивирована" }
  return { valid: true, license }
}

function checkUserPremium(userId) {
  for (const key in licenses) {
    if (licenses[key].userId.toString() === userId.toString() && licenses[key].status === "active") {
      return { hasPremium: true, license: licenses[key] }
    }
  }
  return { hasPremium: false }
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id
  const username = msg.from.username || msg.from.first_name

  const welcomeMessage = `
Добро пожаловать в ProxySwitcher Bot!

Здесь вы можете приобрести:

1. Premium подписка - ${CONFIG.PRICE_PREMIUM} руб.
   - Безлимитное количество прокси
   - Приоритетная поддержка
   - Ранний доступ к новым функциям

2. Индивидуальный прокси - ${CONFIG.PRICE_PROXY} руб.
   - Персональный прокси только для вас
   - Высокая скорость и стабильность
   - Полная анонимность

Команды:
/buy - Купить Premium подписку
/proxy - Купить индивидуальный прокси
/check - Проверить лицензионный ключ
/support - Связаться с поддержкой
/help - Помощь

Скачать приложение: @proxyswither
  `

  bot.sendMessage(chatId, welcomeMessage, {
    disable_web_page_preview: true,
  })
})

bot.onText(/\/buy/, (msg) => {
  const chatId = msg.chat.id

  pendingOrders[msg.from.id] = { type: "premium", chatId }

  const buyMessage = `
Покупка Premium подписки

Стоимость: ${CONFIG.PRICE_PREMIUM} руб.

Способы оплаты:

1. Перевод на карту:
2204320688487737 (Т-Банк)

2. ЮMoney:
4100119424240925

После оплаты отправьте скриншот чека или нажмите "Я оплатил"

Важно: В комментарии к переводу укажите ваш Telegram: @${msg.from.username || "ваш_username"}
  `

  const keyboard = {
    inline_keyboard: [
      [{ text: "Я оплатил", callback_data: "paid_premium" }],
      [{ text: "Связаться с поддержкой", url: "https://t.me/noname22444" }],
    ],
  }

  bot.sendMessage(chatId, buyMessage, {
    reply_markup: keyboard,
  })
})

bot.onText(/\/proxy/, (msg) => {
  const chatId = msg.chat.id

  pendingOrders[msg.from.id] = { type: "proxy", chatId }

  const proxyMessage = `
Покупка индивидуального прокси

Стоимость: ${CONFIG.PRICE_PROXY} руб.

Что вы получите:
- Персональный SOCKS5/HTTP прокси
- Только для вас (не shared)
- Высокая скорость
- Поддержка 24/7

Способы оплаты:

1. Перевод на карту:
2204320688487737 (Т-Банк)

2. ЮMoney:
4100119424240925

После оплаты отправьте скриншот чека или нажмите "Я оплатил"

Важно: В комментарии укажите ваш Telegram: @${msg.from.username || "ваш_username"}
  `

  const keyboard = {
    inline_keyboard: [
      [{ text: "Я оплатил", callback_data: "paid_proxy" }],
      [{ text: "Связаться с поддержкой", url: "https://t.me/noname22444" }],
    ],
  }

  bot.sendMessage(chatId, proxyMessage, {
    reply_markup: keyboard,
  })
})

// Команда /paid или кнопка "Я оплатил"
bot.onText(/\/paid/, (msg) => {
  handlePaymentConfirmation(msg.chat.id, msg.from)
})

bot.on("callback_query", (query) => {
  if (query.data === "cancel_support") {
    delete supportTickets[query.from.id]
    bot.sendMessage(query.message.chat.id, "Обращение отменено. Если понадобится помощь - напишите /support")
    bot.answerCallbackQuery(query.id)
    return
  }

  if (query.data === "paid" || query.data === "paid_premium") {
    pendingOrders[query.from.id] = { type: "premium", chatId: query.message.chat.id }
    handlePaymentConfirmation(query.message.chat.id, query.from, "premium")
    bot.answerCallbackQuery(query.id)
  } else if (query.data === "paid_proxy") {
    pendingOrders[query.from.id] = { type: "proxy", chatId: query.message.chat.id }
    handlePaymentConfirmation(query.message.chat.id, query.from, "proxy")
    bot.answerCallbackQuery(query.id)
  } else if (query.data.startsWith("approve_")) {
    const parts = query.data.split("_")
    const type = parts[1]
    const userId = parts[2]
    const chatId = parts[3]
    handleApproval(query, userId, chatId, true, type)
  } else if (query.data.startsWith("reject_")) {
    const parts = query.data.split("_")
    const type = parts[1]
    const userId = parts[2]
    const chatId = parts[3]
    handleApproval(query, userId, chatId, false, type)
  } else if (query.data.startsWith("reply_support_")) {
    const parts = query.data.split("_")
    const targetUserId = parts[2]
    const targetChatId = parts[3]

    supportTickets[`admin_reply_${query.from.id}`] = {
      targetUserId,
      targetChatId,
    }

    bot.sendMessage(query.message.chat.id, `Введите ответ пользователю ${targetUserId}:`)
    bot.answerCallbackQuery(query.id)
  } else if (query.data.startsWith("close_ticket_")) {
    const parts = query.data.split("_")
    const targetUserId = parts[2]
    const targetChatId = parts[3]

    delete supportTickets[targetUserId]

    bot.sendMessage(targetChatId, "Ваше обращение закрыто. Если у вас остались вопросы - напишите /support")
    bot.editMessageText("Тикет закрыт", {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
    })
    bot.answerCallbackQuery(query.id)
  }
})

function handlePaymentConfirmation(chatId, user, type = "premium") {
  const productName = type === "proxy" ? "индивидуального прокси" : "Premium подписки"

  const confirmMessage = `
Подтверждение оплаты ${productName}

Пожалуйста, отправьте скриншот чека об оплате.

После проверки администратором вы получите ${type === "proxy" ? "данные прокси" : "лицензионный ключ"}.

Обычно проверка занимает до 30 минут.
  `

  bot.sendMessage(chatId, confirmMessage)

  const price = type === "proxy" ? CONFIG.PRICE_PROXY : CONFIG.PRICE_PREMIUM

  // Уведомление админа
  const adminMessage = `
Новая заявка на оплату!

Тип: ${type === "proxy" ? "Индивидуальный прокси" : "Premium подписка"}
Сумма: ${price} руб.
Пользователь: @${user.username || "неизвестен"} (${user.first_name})
ID: ${user.id}
Дата: ${new Date().toLocaleString("ru-RU")}
  `

  const adminKeyboard = {
    inline_keyboard: [
      [
        { text: "Подтвердить", callback_data: `approve_${type}_${user.id}_${chatId}` },
        { text: "Отклонить", callback_data: `reject_${type}_${user.id}_${chatId}` },
      ],
    ],
  }

  bot.sendMessage(CONFIG.ADMIN_ID, adminMessage, {
    reply_markup: adminKeyboard,
  })
}

function handleApproval(query, userId, chatId, approved, type = "premium") {
  if (query.from.id.toString() !== CONFIG.ADMIN_ID.toString()) {
    bot.answerCallbackQuery(query.id, { text: "У вас нет прав" })
    return
  }

  const isMediaMessage = query.message.photo || query.message.document

  if (approved) {
    if (type === "proxy") {
      // Для прокси отправляем запрос админу ввести данные прокси
      bot.sendMessage(
        CONFIG.ADMIN_ID,
        `Введите данные прокси для пользователя ${userId} в формате:\n/sendproxy ${userId} ${chatId} IP:PORT:LOGIN:PASSWORD`,
      )

      const waitText = `Заявка одобрена!\nОжидается отправка данных прокси пользователю ${userId}`

      if (isMediaMessage) {
        bot
          .editMessageCaption(waitText, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
          })
          .catch(() => {
            bot.sendMessage(query.message.chat.id, waitText)
          })
      } else {
        bot.editMessageText(waitText, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
        })
      }
    } else {
      // Для Premium создаем лицензию
      const license = createLicense(userId, query.from.username)

      const userMessage = `
Поздравляем с покупкой Premium!

Ваш лицензионный ключ:
${license.key}

Как активировать:
1. Откройте приложение ProxySwitcher
2. Нажмите кнопку "Premium"
3. Введите ключ и нажмите "Активировать"

Спасибо за покупку!
      `

      bot.sendMessage(chatId, userMessage)

      const successText = `Лицензия выдана!\n\nКлюч: ${license.key}\nПользователь: ${userId}`

      if (isMediaMessage) {
        bot
          .editMessageCaption(successText, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
          })
          .catch(() => {
            bot.sendMessage(query.message.chat.id, successText)
          })
      } else {
        bot.editMessageText(successText, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
        })
      }
    }
  } else {
    bot.sendMessage(chatId, "К сожалению, ваш платеж не подтвержден. Пожалуйста, свяжитесь с поддержкой @noname22444")

    const rejectText = "Заявка отклонена"

    if (isMediaMessage) {
      bot
        .editMessageCaption(rejectText, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
        })
        .catch(() => {
          bot.sendMessage(query.message.chat.id, rejectText)
        })
    } else {
      bot.editMessageText(rejectText, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      })
    }
  }

  bot.answerCallbackQuery(query.id)
}

bot.onText(/\/sendproxy (\d+) (\d+) (.+)/, (msg, match) => {
  if (msg.from.id.toString() !== CONFIG.ADMIN_ID.toString()) return

  const userId = match[1]
  const chatId = match[2]
  const proxyData = match[3] // IP:PORT:LOGIN:PASSWORD

  const parts = proxyData.split(":")
  if (parts.length < 2) {
    bot.sendMessage(msg.chat.id, "Неверный формат. Используйте: /sendproxy USER_ID CHAT_ID IP:PORT:LOGIN:PASSWORD")
    return
  }

  const proxyMessage = `
Ваш индивидуальный прокси готов!

Данные для подключения:
IP: ${parts[0]}
Порт: ${parts[1]}
${parts[2] ? `Логин: ${parts[2]}` : ""}
${parts[3] ? `Пароль: ${parts[3]}` : ""}

Как подключить:
1. Откройте ProxySwitcher
2. Нажмите "Добавить"
3. Введите данные прокси
4. Нажмите "Подключить"

Спасибо за покупку!
По вопросам: @noname22444
  `

  bot.sendMessage(chatId, proxyMessage)
  bot.sendMessage(msg.chat.id, `Прокси отправлен пользователю ${userId}`)
})

bot.onText(/\/check (.+)/, (msg, match) => {
  const chatId = msg.chat.id
  const key = match[1].trim().toUpperCase()

  const result = checkLicense(key)

  if (result.valid) {
    bot.sendMessage(chatId, `Лицензия действительна!\n\nСтатус: Активна\nСоздана: ${result.license.createdAt}`)
  } else {
    bot.sendMessage(chatId, `Лицензия недействительна\n\n${result.message}`)
  }
})

bot.onText(/^\/check$/, (msg) => {
  const chatId = msg.chat.id
  bot.sendMessage(chatId, "Для проверки ключа введите:\n/check ВАШ-КЛЮЧ\n\nНапример:\n/check PS-XXXXX-XXXXX-XXXXX")
})

bot.onText(/\/support/, (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id

  // Активируем режим поддержки для пользователя
  supportTickets[userId] = {
    chatId: chatId,
    username: msg.from.username || msg.from.first_name,
    startedAt: new Date().toISOString(),
    messages: [],
  }

  const premiumStatus = checkUserPremium(userId)

  let supportMessage = `
Поддержка ProxySwitcher

Опишите вашу проблему или вопрос в следующем сообщении.

Администратор ответит вам в ближайшее время.
`

  if (premiumStatus.hasPremium) {
    supportMessage = `
Поддержка ProxySwitcher

Вы Premium пользователь! Ваше обращение будет рассмотрено в приоритетном порядке.

Опишите вашу проблему или вопрос в следующем сообщении.
`
  }

  const keyboard = {
    inline_keyboard: [[{ text: "Отменить обращение", callback_data: "cancel_support" }]],
  }

  bot.sendMessage(chatId, supportMessage, { reply_markup: keyboard })
})

bot.on("text", (msg) => {
  // Пропускаем команды
  if (msg.text.startsWith("/")) return

  const userId = msg.from.id
  const chatId = msg.chat.id

  // Проверяем, есть ли у админа активный ответ
  const adminReply = supportTickets[`admin_reply_${userId}`]
  if (adminReply && userId.toString() === CONFIG.ADMIN_ID.toString()) {
    // Отправляем ответ пользователю
    bot.sendMessage(adminReply.targetChatId, `Ответ от поддержки:\n\n${msg.text}`)
    bot.sendMessage(chatId, "Ответ отправлен пользователю!")
    delete supportTickets[`admin_reply_${userId}`]
    return
  }

  // Проверяем, есть ли активный тикет поддержки
  if (supportTickets[userId]) {
    const ticket = supportTickets[userId]
    const premiumStatus = checkUserPremium(userId)

    // Формируем сообщение для админа
    let adminMessage = `
Новое обращение в поддержку!

`

    if (premiumStatus.hasPremium) {
      adminMessage += `ПРИОРИТЕТ: Premium пользователь\n\n`
    }

    adminMessage += `От: @${ticket.username} (ID: ${userId})
Дата: ${new Date().toLocaleString("ru-RU")}

Сообщение:
${msg.text}`

    const adminKeyboard = {
      inline_keyboard: [
        [
          { text: "Ответить", callback_data: `reply_support_${userId}_${chatId}` },
          { text: "Закрыть тикет", callback_data: `close_ticket_${userId}_${chatId}` },
        ],
      ],
    }

    bot.sendMessage(CONFIG.ADMIN_ID, adminMessage, { reply_markup: adminKeyboard })
    bot.sendMessage(chatId, "Ваше сообщение отправлено в поддержку! Ожидайте ответа.")

    // Очищаем тикет после отправки
    delete supportTickets[userId]
    return
  }
})

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id

  const helpMessage = `
Помощь по ProxySwitcher Bot

Товары:
- Premium подписка (${CONFIG.PRICE_PREMIUM} руб.) - безлимит прокси в приложении
- Индивидуальный прокси (${CONFIG.PRICE_PROXY} руб.) - персональный прокси только для вас

Команды:
/start - Главное меню
/buy - Купить Premium подписку
/proxy - Купить индивидуальный прокси
/check <ключ> - Проверить лицензионный ключ
/support - Связаться с поддержкой
/help - Эта справка

Возникли проблемы?
Напишите в поддержку: @noname22444

Telegram канал: @proxyswither
  `

  bot.sendMessage(chatId, helpMessage)
})

// Обработка фото с определением типа заказа
bot.on("photo", (msg) => {
  const chatId = msg.chat.id
  const user = msg.from
  const photo = msg.photo[msg.photo.length - 1]

  // Определяем тип заказа
  const order = pendingOrders[user.id] || { type: "premium" }
  const productName = order.type === "proxy" ? "индивидуального прокси" : "Premium подписки"
  const price = order.type === "proxy" ? CONFIG.PRICE_PROXY : CONFIG.PRICE_PREMIUM

  bot.sendMessage(chatId, `Скриншот получен! Ожидайте проверки администратором. Обычно это занимает до 30 минут.`)

  const adminCaption = `
Новый скриншот чека!

Тип: ${order.type === "proxy" ? "Индивидуальный прокси" : "Premium подписка"}
Сумма: ${price} руб.
Пользователь: @${user.username || "неизвестен"} (${user.first_name})
ID: ${user.id}
Дата: ${new Date().toLocaleString("ru-RU")}
  `

  const adminKeyboard = {
    inline_keyboard: [
      [
        { text: "Подтвердить оплату", callback_data: `approve_${order.type}_${user.id}_${chatId}` },
        { text: "Отклонить", callback_data: `reject_${order.type}_${user.id}_${chatId}` },
      ],
    ],
  }

  bot.sendPhoto(CONFIG.ADMIN_ID, photo.file_id, {
    caption: adminCaption,
    reply_markup: adminKeyboard,
  })
})

// Обработка документов с определением типа заказа
bot.on("document", (msg) => {
  const chatId = msg.chat.id
  const user = msg.from
  const doc = msg.document

  if (doc.mime_type && doc.mime_type.startsWith("image/")) {
    const order = pendingOrders[user.id] || { type: "premium" }
    const price = order.type === "proxy" ? CONFIG.PRICE_PROXY : CONFIG.PRICE_PREMIUM

    bot.sendMessage(chatId, "Файл получен! Ожидайте проверки администратором.")

    const adminCaption = `
Новый файл чека!

Тип: ${order.type === "proxy" ? "Индивидуальный прокси" : "Premium подписка"}
Сумма: ${price} руб.
Пользователь: @${user.username || "неизвестен"} (${user.first_name})
ID: ${user.id}
Файл: ${doc.file_name}
Дата: ${new Date().toLocaleString("ru-RU")}
    `

    const adminKeyboard = {
      inline_keyboard: [
        [
          { text: "Подтвердить оплату", callback_data: `approve_${order.type}_${user.id}_${chatId}` },
          { text: "Отклонить", callback_data: `reject_${order.type}_${user.id}_${chatId}` },
        ],
      ],
    }

    bot.sendDocument(CONFIG.ADMIN_ID, doc.file_id, {
      caption: adminCaption,
      reply_markup: adminKeyboard,
    })
  }
})

bot.onText(/\/admin_generate/, (msg) => {
  if (msg.from.id.toString() !== CONFIG.ADMIN_ID.toString()) return

  const license = createLicense(msg.from.id, msg.from.username)
  bot.sendMessage(msg.chat.id, `Новый ключ сгенерирован:\n${license.key}`)
})

bot.onText(/\/admin_stats/, (msg) => {
  if (msg.from.id.toString() !== CONFIG.ADMIN_ID.toString()) return

  const totalLicenses = Object.keys(licenses).length
  const activeLicenses = Object.values(licenses).filter((l) => l.status === "active").length

  bot.sendMessage(msg.chat.id, `Статистика:\nВсего лицензий: ${totalLicenses}\nАктивных: ${activeLicenses}`)
})

// Загружаем лицензии при запуске
loadLicenses()

const apiServer = http.createServer((req, res) => {
  // CORS заголовки
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.writeHead(200)
    res.end()
    return
  }

  // API: Проверка лицензии GET /check?key=PS-XXXXX-XXXXX-XXXXX
  if (req.method === "GET" && req.url.startsWith("/check")) {
    const url = new URL(req.url, `http://localhost:${CONFIG.API_PORT}`)
    const key = url.searchParams.get("key")

    if (!key) {
      res.writeHead(400, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ valid: false, error: "Ключ не указан" }))
      return
    }

    const result = checkLicense(key.toUpperCase())
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(result))
    return
  }

  // API: Активация лицензии POST /activate
  if (req.method === "POST" && req.url === "/activate") {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk
    })
    req.on("end", () => {
      try {
        const { key } = JSON.parse(body)
        const result = checkLicense(key.toUpperCase())
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(result))
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ valid: false, error: "Неверный запрос" }))
      }
    })
    return
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ error: "Не найдено" }))
})

apiServer.listen(CONFIG.API_PORT, CONFIG.API_HOST, () => {
  console.log(`API лицензий запущен на http://${CONFIG.API_HOST}:${CONFIG.API_PORT}`)
})

console.log("ProxySwitcher Bot запущен!")
console.log("Команды бота установлены в меню Telegram")
