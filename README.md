# ProxySwitcher License Bot

Telegram бот для продажи лицензий ProxySwitcher.

## Быстрый старт (локально)

1. Установите зависимости:
\`\`\`bash
npm install node-telegram-bot-api
\`\`\`

2. Настройте переменные в `telegram-bot.js`:
   - `BOT_TOKEN` - токен от @BotFather
   - `ADMIN_ID` - ваш Telegram ID (узнать: @userinfobot)

3. Запустите:
\`\`\`bash
node telegram-bot.js
\`\`\`

## Деплой на сервер (VPS)

### 1. Арендуйте VPS
- Timeweb Cloud (~200 руб/мес)
- Aéza (~150 руб/мес)
- DigitalOcean ($6/мес)

### 2. Подключитесь к серверу
\`\`\`bash
ssh root@ваш_ip
\`\`\`

### 3. Установите Node.js
\`\`\`bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs
\`\`\`

### 4. Загрузите бота
\`\`\`bash
mkdir /opt/proxyswither-bot
cd /opt/proxyswither-bot
# Скопируйте файлы telegram-bot.js и package.json
\`\`\`

### 5. Установите зависимости
\`\`\`bash
npm install node-telegram-bot-api
\`\`\`

### 6. Создайте systemd сервис
\`\`\`bash
nano /etc/systemd/system/proxyswither-bot.service
\`\`\`

Содержимое:
\`\`\`ini
[Unit]
Description=ProxySwitcher License Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/proxyswither-bot
Environment=BOT_TOKEN=ваш_токен_бота
Environment=ADMIN_ID=ваш_telegram_id
Environment=API_PORT=3847
ExecStart=/usr/bin/node telegram-bot.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
\`\`\`

### 7. Запустите сервис
\`\`\`bash
systemctl daemon-reload
systemctl enable proxyswither-bot
systemctl start proxyswither-bot
\`\`\`

### 8. Откройте порт в файрволе
\`\`\`bash
ufw allow 3847
\`\`\`

### 9. Обновите URL в приложении

В файле `src/renderer.js` замените:
\`\`\`javascript
const LICENSE_API_URL = "http://ВАШ_IP:3847";
\`\`\`

## Проверка работы

\`\`\`bash
# Статус бота
systemctl status proxyswither-bot

# Логи
journalctl -u proxyswither-bot -f

# Тест API
curl http://ВАШ_IP:3847/check?key=TEST
\`\`\`

## Команды бота

**Для пользователей:**
- `/start` - Главное меню
- `/buy` - Купить подписку
- `/check КЛЮЧ` - Проверить ключ
- `/help` - Помощь

**Для админа:**
- `/admin_generate` - Создать ключ вручную
- `/admin_stats` - Статистика
