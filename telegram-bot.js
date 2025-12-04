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
const https = require("https") // Заменил node-fetch на встроенный https

// Конфигурация
const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN || "8530886952:AAELDw3vMrljicbyl2Nyzwh1zDQMsCi8Jk0",
  ADMIN_ID: process.env.ADMIN_ID || "1830230896",
  PRICE_PREMIUM: 250, // Цена Premium подписки
  PRICE_PROXY: 150, // Цена индивидуального прокси
  LICENSE_FILE: "./licenses.json",
  API_PORT: process.env.API_PORT || 80, // изменил порт с 3847 на 80
  API_HOST: process.env.API_HOST || "0.0.0.0",
}

// Инициализация бота
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true })

// Хранилище лицензий
let licenses = {}
const revokedKeys = new Set()
const waitingPayment = {}
const supportTickets = {}
let expirationNotified = new Set()

const pendingOrders = {} // Declaration of pendingOrders variable

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
    if (fs.existsSync("./expiration_notified.json")) {
      expirationNotified = new Set(JSON.parse(fs.readFileSync("./expiration_notified.json", "utf8")))
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
    syncLicensesToGitHub()
  } catch (error) {
    console.error("Ошибка сохранения лицензий:", error)
  }
}

function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => {
        try {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: () => JSON.parse(data),
            text: () => data,
          })
        } catch (e) {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: () => ({}),
            text: () => data,
          })
        }
      })
    })
    req.on("error", reject)
    if (postData) req.write(postData)
    req.end()
  })
}

async function syncLicensesToGitHub() {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN
  if (!GITHUB_TOKEN) {
    console.log("GITHUB_TOKEN не настроен, синхронизация пропущена")
    return
  }

  const GITHUB_USER = "Nikita2888"
  const GITHUB_REPO = "v0app"
  const FILE_PATH = "licenses.json"

  try {
    // Получаем текущий файл для получения SHA
    const getOptions = {
      hostname: "api.github.com",
      path: `/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${FILE_PATH}`,
      method: "GET",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "ProxySwitcher-Bot",
      },
    }

    const getResponse = await httpsRequest(getOptions)

    let sha = null
    if (getResponse.ok) {
      const fileData = getResponse.json()
      sha = fileData.sha
    }

    // Обновляем файл
    const content = Buffer.from(JSON.stringify(licenses, null, 2)).toString("base64")
    const body = JSON.stringify({
      message: "Update licenses",
      content: content,
      sha: sha,
    })

    const updateOptions = {
      hostname: "api.github.com",
      path: `/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${FILE_PATH}`,
      method: "PUT",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "ProxySwitcher-Bot",
      },
    }

    const updateResponse = await httpsRequest(updateOptions, body)

    if (updateResponse.ok) {
      console.log("Лицензии синхронизированы с GitHub")
    } else {
      console.error("Ошибка синхронизации с GitHub:", updateResponse.text())
    }
  } catch (error) {
    console.error("Ошибка синхронизации с GitHub:", error.message)
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
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // +30 дней

  const license = {
    key,
    userId,
    username,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
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

  // Проверка срока действия
  if (license.expiresAt) {
    const expiresDate = new Date(license.expiresAt)
    if (new Date() > expiresDate) {
      license.status = "expired"
      saveLicenses()
      return { valid: false, message: "Срок действия лицензии истёк", expired: true }
    }
  }

  return { valid: true, license }
}

function checkUserPremium(userId) {
  for (const key in licenses) {
    const license = licenses[key]
    if (license.userId.toString() === userId.toString() && license.status === "active") {
      // Проверяем срок действия
      if (license.expiresAt) {
        const expiresDate = new Date(license.expiresAt)
        if (new Date() > expiresDate) {
          license.status = "expired"
          saveLicenses()
          continue
        }
      }
      return { hasPremium: true, license }
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

1. Premium подписка - ${CONFIG.PRICE_PREMIUM} руб./мес
   - Безлимитное количество прокси
   - Приоритетная поддержка
   - Ранний доступ к новым функциям
   - Срок действия: 30 дней

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

Стоимость: ${CONFIG.PRICE_PREMIUM} руб./месяц
Срок действия: 30 дней

Что вы получите:
- Безлимитное количество прокси
- Приоритетная поддержка
- Ранний доступ к новым функциям

Способы оплаты:

1. Перевод на карту:
2204320688487737 (**OzonBank**)

2. ЮMoney:
4100119424240925

После оплаты отправьте скриншот чека или нажмите "Я оплатил"

**Важно: В комментарии к переводу укажите ваш Telegram:** @${msg.from.username || "ваш_username"}
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
2204320688487737 (**OzonBank**)

2. ЮMoney:
4100119424240925

После оплаты отправьте скриншот чека или нажмите "Я оплатил"

**Важно: В комментарии укажите ваш Telegram:** @${msg.from.username || "ваш_username"}
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
  console.log("[v0] callback_query received:", query.data)

  if (query.data === "cancel_support") {
    delete supportTickets[query.from.id]
    bot.sendMessage(query.message.chat.id, "Обращение отменено. Если понадобится помощь - напишите /support")
    bot.answerCallbackQuery(query.id)
    return
  }

  if (query.data === "paid" || query.data === "paid_premium") {
    console.log("[v0] paid_premium button clicked by user:", query.from.id)
    waitingPayment[query.from.id] = {
      type: "premium",
      chatId: query.message.chat.id,
      username: query.from.username,
      firstName: query.from.first_name,
      timestamp: Date.now(),
    }
    bot.answerCallbackQuery(query.id, { text: "Отправьте скриншот чека" })
    bot.sendMessage(
      query.message.chat.id,
      `Подтверждение оплаты Premium подписки

Пожалуйста, отправьте скриншот или фото чека об оплате.

После проверки администратором вы получите лицензионный ключ.

Обычно проверка занимает до 30 минут.`,
    )
    return
  }

  if (query.data === "paid_proxy") {
    console.log("[v0] paid_proxy button clicked by user:", query.from.id)
    waitingPayment[query.from.id] = {
      type: "proxy",
      chatId: query.message.chat.id,
      username: query.from.username,
      firstName: query.from.first_name,
      timestamp: Date.now(),
    }
    bot.answerCallbackQuery(query.id, { text: "Отправьте скриншот чека" })
    bot.sendMessage(
      query.message.chat.id,
      `Подтверждение оплаты индивидуального прокси

Пожалуйста, отправьте скриншот или фото чека об оплате.

После проверки администратором вы получите данные прокси.

Обычно проверка занимает до 30 минут.`,
    )
    return
  }

  if (query.data.startsWith("approve_")) {
    const parts = query.data.split("_")
    const type = parts[1]
    const userId = parts[2]
    const chatId = parts[3]
    handleApproval(query, userId, chatId, true, type)
    bot.answerCallbackQuery(query.id)
    return
  }

  if (query.data.startsWith("reject_")) {
    const parts = query.data.split("_")
    const type = parts[1]
    const userId = parts[2]
    const chatId = parts[3]
    handleApproval(query, userId, chatId, false, type)
    bot.answerCallbackQuery(query.id)
    return
  }

  if (query.data.startsWith("reply_support_")) {
    const parts = query.data.split("_")
    const targetUserId = parts[2]
    const targetChatId = parts[3]

    supportTickets[`admin_reply_${query.from.id}`] = {
      targetUserId,
      targetChatId,
    }

    bot.sendMessage(query.message.chat.id, `Введите ответ пользователю ${targetUserId}:`)
    bot.answerCallbackQuery(query.id)
    return
  }

  if (query.data.startsWith("close_ticket_")) {
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
    return
  }
})

function handlePaymentConfirmation(chatId, user, type = "premium") {
  const productName = type === "proxy" ? "индивидуального прокси" : "Premium подписки"

  waitingPayment[user.id] = {
    type,
    chatId,
    username: user.username,
    firstName: user.first_name,
    timestamp: Date.now(),
  }

  const confirmMessage = `
Подтверждение оплаты ${productName}

Пожалуйста, отправьте скриншот или фото чека об оплате.

После проверки администратором вы получите ${type === "proxy" ? "данные прокси" : "лицензионный ключ"}.

Обычно проверка занимает до 30 минут.
  `

  bot.sendMessage(chatId, confirmMessage)
}

function handleApproval(query, userId, chatId, approved, type = "premium") {
  if (query.from.id.toString() !== CONFIG.ADMIN_ID.toString()) {
    bot.answerCallbackQuery(query.id, { text: "У вас нет прав" })
    return
  }

  const isMediaMessage = query.message.photo || query.message.document

  if (approved) {
    if (type === "proxy") {
      bot.sendMessage(
        CONFIG.ADMIN_ID,
        `Введите данные прокси для пользователя ${userId} в формате:\n/sendproxy ${userId} IP:PORT:LOGIN:PASSWORD\n\nПример:\n/sendproxy ${userId} 88.218.50.217:8000:login:password`,
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
        bot
          .editMessageText(waitText, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
          })
          .catch(() => {
            bot.sendMessage(query.message.chat.id, waitText)
          })
      }
    } else {
      const license = createLicense(userId, query.from.username)
      const expiresDate = new Date(license.expiresAt).toLocaleDateString("ru-RU")

      const userMessage = `
Поздравляем с покупкой Premium!

Ваш лицензионный ключ:
${license.key}

Срок действия до: ${expiresDate}

Как активировать:
1. Откройте приложение ProxySwitcher
2. Нажмите кнопку "Premium"
3. Введите ключ и нажмите "Активировать"

За 3 дня до окончания подписки вы получите напоминание о продлении.

Спасибо за покупку!
      `

      bot.sendMessage(chatId, userMessage)

      const successText = `Лицензия выдана!\n\nКлюч: ${license.key}\nПользователь: ${userId}\nДействует до: ${expiresDate}`

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
        bot
          .editMessageText(successText, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
          })
          .catch(() => {
            bot.sendMessage(query.message.chat.id, successText)
          })
      }
    }
  } else {
    bot.sendMessage(chatId, "К сожалению, ваш платеж не подтвержден. Свяжитесь с поддержкой /support")

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
      bot
        .editMessageText(rejectText, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
        })
        .catch(() => {
          bot.sendMessage(query.message.chat.id, rejectText)
        })
    }
  }

  bot.answerCallbackQuery(query.id)
}

bot.on("photo", (msg) => {
  const userId = msg.from.id
  const chatId = msg.chat.id

  // Проверяем ожидает ли пользователь подтверждение оплаты
  const pending = waitingPayment[userId]

  if (pending) {
    const type = pending.type
    const price = type === "proxy" ? CONFIG.PRICE_PROXY : CONFIG.PRICE_PREMIUM
    const productName = type === "proxy" ? "Индивидуальный прокси" : "Premium подписка"
    const premiumStatus = checkUserPremium(userId)

    let caption = `Новый чек об оплате!\n\n`
    caption += `Тип: ${productName}\n`
    caption += `Сумма: ${price} руб.\n`
    caption += `Пользователь: @${pending.username || "неизвестен"} (${pending.firstName})\n`
    caption += `ID: ${userId}\n`
    caption += `Дата: ${new Date().toLocaleString("ru-RU")}`

    if (premiumStatus.hasPremium) {
      caption += `\n\nПРИОРИТЕТ: Premium пользователь`
    }

    const adminKeyboard = {
      inline_keyboard: [
        [
          { text: "Подтвердить", callback_data: `approve_${type}_${userId}_${chatId}` },
          { text: "Отклонить", callback_data: `reject_${type}_${userId}_${chatId}` },
        ],
      ],
    }

    // Пересылаем фото админу с кнопками
    const photoId = msg.photo[msg.photo.length - 1].file_id
    bot.sendPhoto(CONFIG.ADMIN_ID, photoId, {
      caption: caption,
      reply_markup: adminKeyboard,
    })

    bot.sendMessage(chatId, "Чек получен! Ожидайте подтверждения от администратора.")

    // Удаляем из ожидающих
    delete waitingPayment[userId]
  } else {
    // Если нет ожидающей оплаты - может это для поддержки
    if (supportTickets[userId]) {
      const ticket = supportTickets[userId]
      const premiumStatus = checkUserPremium(userId)

      let caption = `Фото от пользователя в поддержку\n\n`
      if (premiumStatus.hasPremium) {
        caption += `ПРИОРИТЕТ: Premium пользователь\n\n`
      }
      caption += `От: @${ticket.username} (ID: ${userId})\n`
      caption += `Дата: ${new Date().toLocaleString("ru-RU")}`

      const adminKeyboard = {
        inline_keyboard: [
          [
            { text: "Ответить", callback_data: `reply_support_${userId}_${chatId}` },
            { text: "Закрыть тикет", callback_data: `close_ticket_${userId}_${chatId}` },
          ],
        ],
      }

      const photoId = msg.photo[msg.photo.length - 1].file_id
      bot.sendPhoto(CONFIG.ADMIN_ID, photoId, {
        caption: caption,
        reply_markup: adminKeyboard,
      })

      bot.sendMessage(chatId, "Фото отправлено в поддержку!")
      delete supportTickets[userId]
    } else {
      bot.sendMessage(chatId, "Если вы хотите оплатить Premium или прокси, сначала используйте команду /buy или /proxy")
    }
  }
})

bot.on("document", (msg) => {
  const userId = msg.from.id
  const chatId = msg.chat.id

  const pending = waitingPayment[userId]

  if (pending) {
    const type = pending.type
    const price = type === "proxy" ? CONFIG.PRICE_PROXY : CONFIG.PRICE_PREMIUM
    const productName = type === "proxy" ? "Индивидуальный прокси" : "Premium подписка"
    const premiumStatus = checkUserPremium(userId)

    let caption = `Новый чек об оплате (документ)!\n\n`
    caption += `Тип: ${productName}\n`
    caption += `Сумма: ${price} руб.\n`
    caption += `Пользователь: @${pending.username || "неизвестен"} (${pending.firstName})\n`
    caption += `ID: ${userId}\n`
    caption += `Дата: ${new Date().toLocaleString("ru-RU")}`

    if (premiumStatus.hasPremium) {
      caption += `\n\nПРИОРИТЕТ: Premium пользователь`
    }

    const adminKeyboard = {
      inline_keyboard: [
        [
          { text: "Подтвердить", callback_data: `approve_${type}_${userId}_${chatId}` },
          { text: "Отклонить", callback_data: `reject_${type}_${userId}_${chatId}` },
        ],
      ],
    }

    bot.sendDocument(CONFIG.ADMIN_ID, msg.document.file_id, {
      caption: caption,
      reply_markup: adminKeyboard,
    })

    bot.sendMessage(chatId, "Документ получен! Ожидайте подтверждения от администратора.")
    delete waitingPayment[userId]
  } else {
    bot.sendMessage(chatId, "Если вы хотите оплатить Premium или прокси, сначала используйте команду /buy или /proxy")
  }
})

bot.onText(/\/sendproxy (\d+) (.+)/, (msg, match) => {
  if (msg.from.id.toString() !== CONFIG.ADMIN_ID.toString()) {
    bot.sendMessage(msg.chat.id, "У вас нет прав для этой команды")
    return
  }

  const userId = match[1]
  const proxyData = match[2] // IP:PORT:LOGIN:PASSWORD

  const parts = proxyData.split(":")
  if (parts.length < 2) {
    bot.sendMessage(msg.chat.id, "Неверный формат. Используйте: /sendproxy USER_ID IP:PORT:LOGIN:PASSWORD")
    return
  }

  const proxyMessage = `
Ваш индивидуальный прокси готов!

Данные для подключения:
IP: ${parts[0]}
Порт: ${parts[1]}
${parts[2] ? `Логин: ${parts[2]}` : ""}
${parts[3] ? `Пароль: ${parts[3]}` : ""}

Добавьте эти данные в приложение ProxySwitcher.
Прокси закреплен только за вами.

Спасибо за покупку!
  `

  bot
    .sendMessage(userId, proxyMessage)
    .then(() => {
      bot.sendMessage(msg.chat.id, `Данные прокси успешно отправлены пользователю ${userId}`)
    })
    .catch((err) => {
      bot.sendMessage(msg.chat.id, `Ошибка отправки: ${err.message}`)
    })
})

bot.onText(/\/check (.+)/, (msg, match) => {
  const chatId = msg.chat.id
  const key = match[1].trim().toUpperCase()

  const result = checkLicense(key)

  if (result.valid) {
    const expiresDate = new Date(result.license.expiresAt).toLocaleDateString("ru-RU")
    const daysLeft = Math.ceil((new Date(result.license.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))

    bot.sendMessage(
      chatId,
      `Лицензия действительна!\n\nСтатус: Активна\nСоздана: ${result.license.createdAt}\nДействует до: ${expiresDate}\nОсталось дней: ${daysLeft}`,
    )
  } else {
    let message = `Лицензия недействительна\n\n${result.message}`
    if (result.expired) {
      message += `\n\nДля продления подписки используйте команду /buy`
    }
    bot.sendMessage(chatId, message)
  }
})

bot.onText(/^\/check$/, (msg) => {
  const chatId = msg.chat.id
  bot.sendMessage(chatId, "Для проверки ключа введите:\n/check ВАШ-КЛЮЧ\n\nНапример:\n/check PS-XXXXX-XXXXX-XXXXX")
})

bot.onText(/\/support/, (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id

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
  if (msg.text.startsWith("/")) return

  const userId = msg.from.id
  const chatId = msg.chat.id

  const adminReply = supportTickets[`admin_reply_${userId}`]
  if (adminReply && userId.toString() === CONFIG.ADMIN_ID.toString()) {
    bot.sendMessage(adminReply.targetChatId, `Ответ от поддержки:\n\n${msg.text}`)
    bot.sendMessage(chatId, "Ответ отправлен пользователю!")
    delete supportTickets[`admin_reply_${userId}`]
    return
  }

  if (supportTickets[userId]) {
    const ticket = supportTickets[userId]
    const premiumStatus = checkUserPremium(userId)

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

    delete supportTickets[userId]
    return
  }
})

bot.onText(/\/revoke (.+)/, (msg, match) => {
  // Проверка что команду отправил админ
  if (msg.from.id.toString() !== CONFIG.ADMIN_ID.toString()) {
    bot.sendMessage(msg.chat.id, "У вас нет прав для выполнения этой команды.")
    return
  }

  const key = match[1].trim().toUpperCase()

  if (!licenses[key]) {
    bot.sendMessage(msg.chat.id, `Лицензия ${key} не найдена.`)
    return
  }

  const license = licenses[key]
  const userId = license.userId
  const username = license.username

  // Деактивируем лицензию
  license.status = "revoked"
  license.revokedAt = new Date().toISOString()
  license.revokedBy = msg.from.id
  saveLicenses()

  bot.sendMessage(
    msg.chat.id,
    `Лицензия успешно отозвана!\n\nКлюч: ${key}\nПользователь: @${username || "неизвестен"} (ID: ${userId})\nСтатус: Отозвана`,
  )

  // Уведомляем пользователя
  if (userId) {
    bot
      .sendMessage(
        userId,
        `Ваша Premium подписка была отозвана.\n\nКлюч: ${key}\n\nЕсли вы считаете что это ошибка, свяжитесь с поддержкой /support`,
      )
      .catch(() => {
        // Пользователь мог заблокировать бота
      })
  }
})

bot.onText(/\/licenses/, (msg) => {
  if (msg.from.id.toString() !== CONFIG.ADMIN_ID.toString()) {
    bot.sendMessage(msg.chat.id, "У вас нет прав для выполнения этой команды.")
    return
  }

  const activeLicenses = Object.values(licenses).filter((l) => l.status === "active")

  if (activeLicenses.length === 0) {
    bot.sendMessage(msg.chat.id, "Нет активных лицензий.")
    return
  }

  let message = `Активные лицензии (${activeLicenses.length}):\n\n`

  activeLicenses.forEach((license, index) => {
    const expiresDate = new Date(license.expiresAt).toLocaleDateString("ru-RU")
    const daysLeft = Math.ceil((new Date(license.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))
    message += `${index + 1}. ${license.key}\n`
    message += `   Пользователь: @${license.username || "неизвестен"} (ID: ${license.userId})\n`
    message += `   Истекает: ${expiresDate} (${daysLeft} дн.)\n\n`
  })

  message += `\nДля отзыва лицензии: /revoke КЛЮЧ`

  // Разбиваем на части если сообщение слишком длинное
  if (message.length > 4000) {
    const chunks = message.match(/.{1,4000}/gs)
    chunks.forEach((chunk) => bot.sendMessage(msg.chat.id, chunk))
  } else {
    bot.sendMessage(msg.chat.id, message)
  }
})

bot.onText(/\/finduser (\d+)/, (msg, match) => {
  if (msg.from.id.toString() !== CONFIG.ADMIN_ID.toString()) {
    bot.sendMessage(msg.chat.id, "У вас нет прав для выполнения этой команды.")
    return
  }

  const userId = match[1]
  const userLicenses = Object.values(licenses).filter((l) => l.userId.toString() === userId)

  if (userLicenses.length === 0) {
    bot.sendMessage(msg.chat.id, `Лицензии для пользователя ${userId} не найдены.`)
    return
  }

  let message = `Лицензии пользователя ${userId}:\n\n`

  userLicenses.forEach((license, index) => {
    const expiresDate = license.expiresAt ? new Date(license.expiresAt).toLocaleDateString("ru-RU") : "Бессрочно"
    message += `${index + 1}. ${license.key}\n`
    message += `   Статус: ${license.status === "active" ? "Активна" : license.status === "revoked" ? "Отозвана" : "Истекла"}\n`
    message += `   Истекает: ${expiresDate}\n\n`
  })

  message += `\nДля отзыва: /revoke КЛЮЧ`

  bot.sendMessage(msg.chat.id, message)
})

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id
  const isAdmin = msg.from.id.toString() === CONFIG.ADMIN_ID.toString()

  let helpMessage = `
Помощь по ProxySwitcher Bot

Товары:
- Premium подписка (${CONFIG.PRICE_PREMIUM} руб./мес) - безлимит прокси на 30 дней
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

  if (isAdmin) {
    helpMessage += `

--- Админ команды ---
/licenses - Список всех активных лицензий
/finduser <ID> - Найти лицензии пользователя
/revoke <ключ> - Отозвать лицензию
/sendproxy <userID> <данные> - Отправить прокси
/admin_generate - Сгенерировать тестовый ключ
`
  }

  bot.sendMessage(chatId, helpMessage)
})

loadLicenses()

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Content-Type", "application/json; charset=utf-8")

  if (req.method === "OPTIONS") {
    res.writeHead(200)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)

  if (url.pathname === "/check" && req.method === "GET") {
    const key = url.searchParams.get("key")

    if (!key) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: "Key required" }))
      return
    }

    const result = checkLicense(key.toUpperCase())
    res.writeHead(200)
    res.end(JSON.stringify(result))
    return
  }

  if (url.pathname === "/status" && req.method === "GET") {
    const key = url.searchParams.get("key")

    if (!key) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: "Key required" }))
      return
    }

    const license = licenses[key.toUpperCase()]

    if (!license) {
      res.writeHead(200)
      res.end(JSON.stringify({ exists: false }))
      return
    }

    res.writeHead(200)
    res.end(
      JSON.stringify({
        exists: true,
        status: license.status,
        expiresAt: license.expiresAt,
        revoked: license.status === "revoked",
        revokedAt: license.revokedAt || null,
      }),
    )
    return
  }

  res.writeHead(404)
  res.end(JSON.stringify({ error: "Not found" }))
})

server.listen(CONFIG.API_PORT, CONFIG.API_HOST, () => {
  console.log(`API лицензий запущен на http://${CONFIG.API_HOST}:${CONFIG.API_PORT}`)
})

console.log("ProxySwitcher Bot запущен!")
console.log("Команды бота установлены в меню Telegram")

function checkExpiringLicenses() {
  const now = new Date()
  const oneDayMs = 24 * 60 * 60 * 1000

  for (const key in licenses) {
    const license = licenses[key]

    if (license.status !== "active" || !license.expiresAt) continue

    const expiresDate = new Date(license.expiresAt)
    const timeLeft = expiresDate.getTime() - now.getTime()

    // Если осталось меньше 1 дня и уведомление еще не отправлено
    if (timeLeft > 0 && timeLeft <= oneDayMs && !expirationNotified.has(key)) {
      const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000))

      // Уведомление админу
      bot.sendMessage(
        CONFIG.ADMIN_ID,
        `⚠️ *Истекает подписка!*\n\n` +
          `Пользователь: ${license.username ? "@" + license.username : "ID: " + license.userId}\n` +
          `ID: \`${license.userId}\`\n` +
          `Ключ: \`${key}\`\n` +
          `Истекает через: ${hoursLeft} ч.\n` +
          `Дата: ${expiresDate.toLocaleDateString("ru-RU")}`,
        { parse_mode: "Markdown" },
      )

      // Уведомление пользователю
      bot
        .sendMessage(
          license.userId,
          `⚠️ *Ваша Premium подписка истекает!*\n\n` +
            `Осталось менее 24 часов.\n` +
            `Дата окончания: ${expiresDate.toLocaleDateString("ru-RU")}\n\n` +
            `Для продления используйте /buy`,
          { parse_mode: "Markdown" },
        )
        .catch(() => {})

      // Отмечаем что уведомление отправлено
      expirationNotified.add(key)
      fs.writeFileSync("./expiration_notified.json", JSON.stringify([...expirationNotified]))
    }
  }
}

setInterval(checkExpiringLicenses, 60 * 60 * 1000)

// Проверка при запуске
setTimeout(checkExpiringLicenses, 5000)
