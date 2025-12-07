/**
 * Обновленный Telegram Bot с поддержкой разделения лицензий для ПК и Mobile
 *
 * Изменения:
 * - Добавлены кнопки выбора платформы (ПК / Mobile)
 * - Лицензии для Mobile создаются в таблице licence_mobail
 * - Лицензии для ПК создаются в таблице licenses
 */

const TelegramBot = require("node-telegram-bot-api")
const crypto = require("crypto")
const fs = require("fs")
const http = require("http")
const https = require("https")

// Конфигурация
const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN || "8530886952:AAELDw3vMrljicbyl2Nyzwh1zDQMsCi8Jk0",
  ADMIN_ID: process.env.ADMIN_ID || "1830230896",
  PRICE_PREMIUM: 250,
  PRICE_PROXY: 150,
  LICENSE_FILE: "./licenses.json",
  API_PORT: process.env.API_PORT || 80,
  API_HOST: process.env.API_HOST || "0.0.0.0",
  SUPABASE_URL: process.env.SUPABASE_URL || "https://fbasfoutfoqqriinghht.supabase.co",
  SUPABASE_SERVICE_KEY:
    process.env.SUPABASE_SERVICE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiYXNmb3V0Zm9xcXJpaW5naGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4OTA1MDksImV4cCI6MjA4MDQ2NjUwOX0._EUg9Poiy616Tc-6JEkrKdXH7KO1xbA3iNymK5TKfFE",
}

const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true })

let licenses = {}
const revokedKeys = new Set()
const waitingPayment = {}
const supportTickets = {}
let expirationNotified = new Set()
const pendingOrders = {}

bot.setMyCommands([
  { command: "start", description: "Главное меню" },
  { command: "buy", description: "Купить Premium подписку" },
  { command: "proxy", description: "Купить индивидуальный прокси" },
  { command: "check", description: "Проверить лицензионный ключ" },
  { command: "support", description: "Связаться с поддержкой" },
  { command: "help", description: "Помощь" },
])

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

function saveLicenses() {
  try {
    fs.writeFileSync(CONFIG.LICENSE_FILE, JSON.stringify(licenses, null, 2))
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

async function syncLicenseToSupabase(license, platform = "pc") {
  try {
    const tableName = platform === "mobile" ? "licence_mobail" : "licenses"

    const body = JSON.stringify({
      [platform === "mobile" ? "license_key" : "key"]: license.key,
      user_id: license.userId.toString(),
      [platform === "mobile" ? "telegram_username" : "username"]: license.username || null,
      created_at: license.createdAt,
      expires_at: license.expiresAt,
      [platform === "mobile" ? "is_active" : "status"]: platform === "mobile" ? true : "active",
    })

    console.log(`[Supabase] Отправка в таблицу ${tableName}:`, body)

    const options = {
      hostname: "fbasfoutfoqqriinghht.supabase.co",
      path: `/rest/v1/${tableName}`,
      method: "POST",
      headers: {
        apikey: CONFIG.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
        "Content-Length": Buffer.byteLength(body),
      },
    }

    const response = await httpsRequest(options, body)

    console.log("[Supabase] Ответ:", response.status, response.text())

    if (response.ok || response.status === 201) {
      console.log(`[Supabase] Лицензия ${license.key} синхронизирована в ${tableName}`)
      return true
    } else {
      console.error("[Supabase] Ошибка:", response.status, response.text())
      return false
    }
  } catch (error) {
    console.error("[Supabase] Ошибка синхронизации:", error.message)
    return false
  }
}

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

function createLicense(userId, username, platform = "pc") {
  const key = generateLicenseKey()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const license = {
    key,
    userId,
    username,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: "active",
    platform, // Добавляем платформу
  }

  licenses[key] = license
  saveLicenses()
  syncLicenseToSupabase(license, platform)

  return license
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id

  const welcomeMessage = `
🎯 Добро пожаловать в ProxySwitcher Bot!

Здесь вы можете приобрести:

1️⃣ Premium подписка - ${CONFIG.PRICE_PREMIUM} руб./мес
   • Безлимитное количество прокси
   • Приоритетная поддержка  
   • Ранний доступ к новым функциям
   • Срок действия: 30 дней
   • Доступно для ПК и Mobile приложений

2️⃣ Индивидуальный прокси - ${CONFIG.PRICE_PROXY} руб.
   • Персональный прокси только для вас
   • Высокая скорость и стабильность
   • Полная анонимность

📱 Команды:
/buy - Купить Premium подписку
/proxy - Купить индивидуальный прокси
/check - Проверить лицензионный ключ
/support - Связаться с поддержкой
/help - Помощь

💾 Скачать приложение: @proxyswither
  `

  bot.sendMessage(chatId, welcomeMessage, {
    disable_web_page_preview: true,
  })
})

bot.onText(/\/buy/, (msg) => {
  const chatId = msg.chat.id

  const buyMessage = `
💎 Покупка Premium подписки

Стоимость: ${CONFIG.PRICE_PREMIUM} руб./месяц
Срок действия: 30 дней

Что вы получите:
✅ Безлимитное количество прокси
✅ Приоритетная поддержка
✅ Ранний доступ к новым функциям

Выберите платформу:
  `

  const keyboard = {
    inline_keyboard: [
      [
        { text: "🖥 ПК приложение", callback_data: "platform_pc" },
        { text: "📱 Mobile приложение", callback_data: "platform_mobile" },
      ],
      [{ text: "Связаться с поддержкой", url: "https://t.me/noname22444" }],
    ],
  }

  bot.sendMessage(chatId, buyMessage, {
    reply_markup: keyboard,
  })
})

bot.on("callback_query", (query) => {
  console.log("[v0] callback_query received:", query.data)

  if (query.data === "platform_pc" || query.data === "platform_mobile") {
    const platform = query.data === "platform_pc" ? "pc" : "mobile"
    const platformName = platform === "pc" ? "ПК" : "Mobile"

    pendingOrders[query.from.id] = {
      type: "premium",
      platform: platform,
      chatId: query.message.chat.id,
    }

    const paymentMessage = `
💳 Оплата Premium для ${platformName}

Стоимость: ${CONFIG.PRICE_PREMIUM} руб.

Способы оплаты:

1️⃣ Перевод на карту:
2204320688487737 (OzonBank)

2️⃣ ЮMoney:
4100119424240925

⚠️ Важно: В комментарии к переводу укажите:
"Premium ${platformName} @${query.from.username || "ваш_username"}"

После оплаты нажмите "Я оплатил"
    `

    const keyboard = {
      inline_keyboard: [
        [{ text: "✅ Я оплатил", callback_data: `paid_premium_${platform}` }],
        [{ text: "Связаться с поддержкой", url: "https://t.me/noname22444" }],
      ],
    }

    bot.sendMessage(query.message.chat.id, paymentMessage, {
      reply_markup: keyboard,
    })

    bot.answerCallbackQuery(query.id)
    return
  }

  if (query.data.startsWith("paid_premium_")) {
    const platform = query.data.split("_")[2] // pc или mobile
    const platformName = platform === "pc" ? "ПК" : "Mobile"

    console.log(`[v0] paid_premium_${platform} button clicked by user:`, query.from.id)

    waitingPayment[query.from.id] = {
      type: "premium",
      platform: platform,
      chatId: query.message.chat.id,
      username: query.from.username,
      firstName: query.from.first_name,
      timestamp: Date.now(),
    }

    bot.answerCallbackQuery(query.id, { text: "Отправьте скриншот чека" })
    bot.sendMessage(
      query.message.chat.id,
      `📸 Подтверждение оплаты Premium (${platformName})

Пожалуйста, отправьте скриншот или фото чека об оплате.

После проверки администратором вы получите лицензионный ключ для ${platformName} приложения.

⏱ Обычно проверка занимает до 30 минут.`,
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
      `📸 Подтверждение оплаты индивидуального прокси

Пожалуйста, отправьте скриншот или фото чека об оплате.

После проверки администратором вы получите данные прокси.

⏱ Обычно проверка занимает до 30 минут.`,
    )
    return
  }

  if (query.data.startsWith("approve_")) {
    const parts = query.data.split("_")
    const type = parts[1]
    const userId = parts[2]
    const chatId = parts[3]
    const platform = parts[4] || "pc" // По умолчанию ПК
    handleApproval(query, userId, chatId, true, type, platform)
    bot.answerCallbackQuery(query.id)
    return
  }

  if (query.data.startsWith("reject_")) {
    const parts = query.data.split("_")
    const type = parts[1]
    const userId = parts[2]
    const chatId = parts[3]
    const platform = parts[4] || "pc"
    handleApproval(query, userId, chatId, false, type, platform)
    bot.answerCallbackQuery(query.id)
    return
  }
})

function handleApproval(query, userId, chatId, approved, type = "premium", platform = "pc") {
  if (query.from.id.toString() !== CONFIG.ADMIN_ID.toString()) {
    bot.answerCallbackQuery(query.id, { text: "У вас нет прав" })
    return
  }

  const isMediaMessage = query.message.photo || query.message.document
  const platformName = platform === "pc" ? "ПК" : "Mobile"
  const platformEmoji = platform === "pc" ? "🖥" : "📱"

  if (approved) {
    if (type === "proxy") {
      bot.sendMessage(
        CONFIG.ADMIN_ID,
        `Введите данные прокси для пользователя ${userId} в формате:\n/sendproxy ${userId} IP:PORT:LOGIN:PASSWORD\n\nПример:\n/sendproxy ${userId} 88.218.50.217:8000:login:password`,
      )

      const waitText = `✅ Заявка одобрена!\nОжидается отправка данных прокси пользователю ${userId}`

      if (isMediaMessage) {
        bot
          .editMessageCaption(waitText, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
          })
          .catch(() => bot.sendMessage(query.message.chat.id, waitText))
      } else {
        bot
          .editMessageText(waitText, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
          })
          .catch(() => bot.sendMessage(query.message.chat.id, waitText))
      }
    } else {
      // Создаем лицензию с указанием платформы
      const license = createLicense(userId, query.from.username, platform)
      const expiresDate = new Date(license.expiresAt).toLocaleDateString("ru-RU")

      const userMessage = `
${platformEmoji} Поздравляем с покупкой Premium для ${platformName}!

🔑 Ваш лицензионный ключ:
${license.key}

📅 Срок действия до: ${expiresDate}

Как активировать:
1. Откройте приложение ProxySwitcher (${platformName})
2. Нажмите кнопку "Premium"
3. Введите ключ и нажмите "Активировать"

⏰ За 3 дня до окончания подписки вы получите напоминание о продлении.

Спасибо за покупку! 💚
      `

      bot.sendMessage(chatId, userMessage)

      const successText = `✅ Лицензия выдана!\n\n${platformEmoji} Платформа: ${platformName}\n🔑 Ключ: ${license.key}\n👤 Пользователь: ${userId}\n📅 Действует до: ${expiresDate}`

      if (isMediaMessage) {
        bot
          .editMessageCaption(successText, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
          })
          .catch(() => bot.sendMessage(query.message.chat.id, successText))
      } else {
        bot
          .editMessageText(successText, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
          })
          .catch(() => bot.sendMessage(query.message.chat.id, successText))
      }
    }
  } else {
    bot.sendMessage(chatId, "❌ К сожалению, ваш платеж не подтвержден. Свяжитесь с поддержкой /support")

    const rejectText = "❌ Заявка отклонена"

    if (isMediaMessage) {
      bot
        .editMessageCaption(rejectText, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
        })
        .catch(() => bot.sendMessage(query.message.chat.id, rejectText))
    } else {
      bot
        .editMessageText(rejectText, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
        })
        .catch(() => bot.sendMessage(query.message.chat.id, rejectText))
    }
  }

  bot.answerCallbackQuery(query.id)
}

bot.on("photo", (msg) => {
  const userId = msg.from.id
  const chatId = msg.chat.id

  const pending = waitingPayment[userId]

  if (pending) {
    const type = pending.type
    const platform = pending.platform || "pc"
    const platformName = platform === "pc" ? "ПК" : "Mobile"
    const platformEmoji = platform === "pc" ? "🖥" : "📱"
    const price = type === "proxy" ? CONFIG.PRICE_PROXY : CONFIG.PRICE_PREMIUM
    const productName = type === "proxy" ? "Индивидуальный прокси" : `Premium подписка (${platformName})`

    let caption = `📸 Новый чек об оплате!\n\n`
    caption += `${platformEmoji} Тип: ${productName}\n`
    caption += `💰 Сумма: ${price} руб.\n`
    caption += `👤 Пользователь: @${pending.username || "неизвестен"} (${pending.firstName})\n`
    caption += `🆔 ID: ${userId}\n`
    caption += `📅 Дата: ${new Date().toLocaleString("ru-RU")}`

    const adminKeyboard = {
      inline_keyboard: [
        [
          { text: "✅ Подтвердить", callback_data: `approve_${type}_${userId}_${chatId}_${platform}` },
          { text: "❌ Отклонить", callback_data: `reject_${type}_${userId}_${chatId}_${platform}` },
        ],
      ],
    }

    const photoId = msg.photo[msg.photo.length - 1].file_id
    bot.sendPhoto(CONFIG.ADMIN_ID, photoId, {
      caption: caption,
      reply_markup: adminKeyboard,
    })

    bot.sendMessage(chatId, "✅ Чек получен! Ожидайте подтверждения от администратора.")

    delete waitingPayment[userId]
  }
})

// ... rest of the bot code ...

loadLicenses()
console.log("✅ Бот запущен с поддержкой разделения лицензий для ПК и Mobile!")
