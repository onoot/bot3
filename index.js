const puppeteer = require('puppeteer');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const fs = require('fs');
const {join} = require("path");
const path = require('path');
const deepEqual = require('deep-equal');

const groupChatsFilePath = 'DATE/groupChats.json';
const ignore = 'ignore.json';
const statsFilePath = 'Data/Stat/user_stats.json';
const noNotif = 'Pool/noNotif.json'

const testGroup = '-1002000308842';
const testLC = '-1002120207356';

const token = process.env.TOKEN_BOT;
// админ
const adminChatId = process.env.ADMIN_ID;
const mainChatId = process.env.MAIN_ID;
const ANOTHER_CHAT_ID = process.env.GROUP_CHAT;
const PERSONAL_CHAT = process.env.PERSONAL_CHAT;

const bot = new TelegramBot(token, { polling: true });

// Запускайте парсинг каждый час
setInterval(() => parserPhoto(), 14_400_000); // 14_400_000 миллисекунд = 4 часа
setInterval(() => upDateRas(), 3_600_000); // 3_600_000 миллисекунд = 1 час

//Получение даты
function date(dayOf) {
    const today = new Date();

    // Проверка, передан ли параметр dayOf
    if (dayOf !== undefined) {
        today.setDate(today.getDate() + dayOf);
    } else if (dayOf === 0) {
        today.setDate(today.getDate() + dayOf);
    }

    today.setHours(today.getHours() + 4); //  4 часа

    const day = today.getDate();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    return `${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`;
}

function formatDateReversed(dateString) {
    const date = new Date(dateString);
    date.setHours(date.getHours() + 4); //  4 часа

    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    const formattedDate = `${day < 10 ? '0' + day : day}.${month < 10 ? '0' + month : month}.${year}`;

    return formattedDate;
}

function getDayOfWeek(dateString) {
    const daysOfWeek = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

    const date = new Date(dateString);
    date.setHours(date.getHours() + 4); //  4 часа

    const dayOfWeek = date.getDay();

    return daysOfWeek[dayOfWeek];
}

async function isBeforeTargetTime(targetHour) {
    // Get the current date and time
    const now = new Date();

    // Adjust the time by adding 4 hours
    now.setHours(now.getHours() + 4);

    // Check if the adjusted hour is before the target hour
    return now.getHours() < targetHour;
}


const commands = [
    {
        command: "todaytext",
        description: "Получить расписания текстом"
    },
    {
        command: "tomorrowtext",
        description: "Получить расписания текстом на завтра"
    },
    {
        command: "todayras",
        description: "Получить скрин расписания"
    },

    {
        command: "tomorrowras",
        description: "Получить скрин расписания на завтра"
    },
    {
        command: "notifications",
        description: "Управление уведомлениями"
    },
];
const commandsroot = [
    {
        command: "ignGroup",
        description: "Добавить группу в список исключений (спам)"
    },
    {
        command: "rmGroup",
        description: "Удалить из списка исключений группу"
    },
    {
        command: "ignChat",
        description: "Добавить пользователя в список черный список"
    },
    {
        command: "rmChat",
        description: "Удалить пользователя из черного списка"
    },
    {
        command: "allPhoto",
        description: "Получить все фото"
    },
    {
        command: "allFiles",
        description: "Получить все файлы"
    },
];

bot.setMyCommands(commands);

// Обработчик команд
bot.onText(/\/start/, (msg) => {
    try{
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, 'Привет! Введите /help для получения списка команд.');
    }catch (e) {
        console.error(e)
        bot.sendMessage(adminChatId, "Ошибка при выполнении команды '/start' "+e)
    }
});

bot.onText(/\/todaytext/, async (msg) => {
    try {
        const chatId = msg.chat.id;
        console.log('Received /todaytext command. Chat ID:', chatId);
        await textRas(chatId);
    } catch (e) {
        console.error(e);
        bot.sendMessage(adminChatId, "Error executing command '/todaytext': " + e);
    }
});

bot.onText(/\/todayras/, async (msg) => {
    try{
        const chatId = msg.chat.id;
        await readPhoto(chatId, 0)
    }catch (e) {
        console.error(e)
        bot.sendMessage(adminChatId, "Ошибка при выполнении команды '/ras' "+e)
    }
});

bot.onText(/\/tomorrowtext/, async (msg) => {
    try{
        const chatId = msg.chat.id;
        await tomTextRas(chatId)
    }catch (e) {
        console.error(e)
        bot.sendMessage(adminChatId, "Ошибка при выполнении команды '/tomorrowtext' "+e)
    }
});

bot.onText(/\/tomorrowras/, async (msg) => {
    try{
        const chatId = msg.chat.id;
        await readPhoto(chatId, 1)
    }catch (e) {
        console.error(e)
        bot.sendMessage(adminChatId, "Ошибка при выполнении команды '/tomorrowras' "+e)
    }
});

bot.onText(/\/help/, (msg) => {
    try{
        const chatId = msg.chat.id;
        let helpMessage = 'Доступные команды:\n';
        commands.forEach((cmd) => {
            helpMessage += `/${cmd.command} - ${cmd.description}\n`;
        });
        bot.sendMessage(chatId, helpMessage);
    }catch (e) {
        console.error(e)
        bot.sendMessage(adminChatId, "Ошибка при выполнении команды `/help` "+e)
    }
});
bot.onText(/\/notifications/, async (msg) => {
    try {
        const chatId = msg.chat.id;

        // Проверка, является ли сообщение личным сообщением
        if (msg.chat.type === 'private') {
            // Получение статуса уведомлений
            const notificationsEnabled = await getNotificationStatus(chatId);

            // Отправка сообщения с текущим статусом и опциями для изменения
            const sentMessage = await bot.sendMessage(chatId, `Настройка уведомлений\n\nУведомления включены: ${notificationsEnabled ? '✅' : '❌'}`, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: 'Включить ✅',
                                callback_data: 'on'
                            },
                            {
                                text: 'Выключить ❌',
                                callback_data: 'off'
                            }
                        ]
                    ]
                }
            });
        } else {
            // Отправка сообщения с инструкцией использовать команду только в личных сообщениях
            await bot.sendMessage(chatId, 'Используйте это только в личных сообщениях');
        }
    } catch (e) {
        console.error('Ошибка в команде /notifications:', e);
        await bot.sendMessage(adminChatId, `Ошибка при выполнении команды /notifications: ${e}`);
    }
});



async function getNotificationStatus(chatId) {
    try {
        const filePath = `Pool/poolData.json`;

        // Read data from the file
        const fileContent = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
        const jsonData = JSON.parse(fileContent);

        // Check if the chatId exists in the array
        const chatIdExists = jsonData.includes(chatId);
        return chatIdExists;
    } catch (error) {
        // Log the error
        console.error('Error reading JSON file or parsing content:', error);

        // Return false to indicate that notifications are not enabled (default behavior)
        return false;
    }
}


bot.onText(/\/root/, (msg) => {
    try{
        const chatId = msg.chat.id;

        if(chatId==adminChatId||chatId==mainChatId) {
            let helpMessage = 'Доступные команды:\n';
            commandsroot.forEach((cmd) => {
                helpMessage += `/${cmd.command} - ${cmd.description}\n`;
            });
            bot.sendMessage(chatId, helpMessage);
        }else{
            bot.sendMessage(chatId, 'Отказано в доступе');
            bot.sendMessage(adminChatId, 'Попытка получить список команд администратора');
        }
    }catch (e) {
        console.error(e)
        bot.sendMessage(adminChatId, "Ошибка при выполнении команды `/help` "+e)
    }
});

// Обработка команды /ignored
bot.onText(/\/ignGroup (.+)/, async (msg, match) => {
    try {
        const chatId = msg.chat.id;

        if(chatId==adminChatId||chatId==mainChatId) {

            const addedDate = new Date().toISOString();

            // Извлекаем текст после команды /ignored
            const textAfterCommand = match[1];

            // Добавляем данные в JSON-файл
            await addToJsonFile({
                chatId: chatId,
                addedDate: addedDate,
            }, 0);

            // Отправляем сообщение об успешном добавлении
            const successMessage = `Данные успешно добавлены:\nGroup ID: ${chatId}\nAdded Date: ${addedDate}\nText After Command: ${textAfterCommand}`;
            await bot.sendMessage(chatId, successMessage);
        }else{
            await bot.sendMessage(adminChatId, `Попытка использовать команду администратора. (ОПАСНО: получить список групп) Вызвал: ` + chatId)
        }
    } catch (e) {
        console.error(e);
        await bot.sendMessage(adminChatId, "Ошибка при выполнении команды `/ignored` " + e);
    }
});

// Обработка команды /ignored
bot.onText(/\/ignChat (.+)/, async (msg, match) => {
    try {
        const chatId = msg.chat.id;

        if(chatId==adminChatId||chatId==mainChatId) {
            const addedDate = new Date().toISOString();

            // Извлекаем текст после команды /ignored
            const textAfterCommand = match[1];

            // Добавляем данные в JSON-файл
            await addToJsonFile({
                chatId: chatId,
                addedDate: addedDate,
            }, 0);

            // Отправляем сообщение об успешном добавлении
            const successMessage = `Данные успешно добавлены:\nChat ID: ${chatId}\nAdded Date: ${addedDate}\nText After Command: ${textAfterCommand}`;
            await bot.sendMessage(chatId, successMessage);
        }else{
            await bot.sendMessage(adminChatId, `Попытка использовать команду администратора. (ОПАСНО: получить список чатов) Вызвал: ` + chatId)
        }
    } catch (e) {
        console.error(e);
        await bot.sendMessage(adminChatId, "Ошибка при выполнении команды `/ignChat` " + e);
    }
});

bot.onText(/\/rmGroup (.+)/, async (msg, match) => {
    try {
        const chatId = msg.chat.id;

        if(chatId==adminChatId||chatId==mainChatId) {
            const addedDate = new Date().toISOString();

            // Извлекаем текст после команды /ignored
            const textAfterCommand = match[1];

            // Добавляем данные в JSON-файл
            await rmToJsonFile(chatId, 1);

            // Отправляем сообщение об успешном добавлении
            const successMessage = `Данные успешно удалены:\nChat ID: ${chatId}\nText After Command: ${textAfterCommand}`;
            await bot.sendMessage(chatId, successMessage);
        }else{
            await bot.sendMessage(adminChatId, `Попытка использовать команду администратора. (ОПАСНО: удалить группу из списка исключений) Вызвал: ` + chatId)
        }
    } catch (e) {
        console.error(e);
        await bot.sendMessage(adminChatId, "Ошибка при выполнении команды `/ignChat` " + e);
    }
});

bot.onText(/\/rmChat (.+)/, async (msg, match) => {
    try {
        const chatId = msg.chat.id;

        if(chatId==adminChatId||chatId==mainChatId) {
            const addedDate = new Date().toISOString();

            // Извлекаем текст после команды /ignored
            const textAfterCommand = match[1];

            // Добавляем данные в JSON-файл
            await rmToJsonFile(chatId, 0);

            // Отправляем сообщение об успешном добавлении
            const successMessage = `Данные о пользователе успешно удалены:\nChat ID: ${chatId}\nAdded Date: ${addedDate}\nText After Command: ${textAfterCommand}`;
            await bot.sendMessage(chatId, successMessage);
        }else{
            await bot.sendMessage(adminChatId, `Попытка использовать команду администратора. (ОПАСНО: удалить из черного списка пользователей) Вызвал: ` + chatId)
        }
    } catch (e) {
        console.error(e);
        await bot.sendMessage(adminChatId, "Ошибка при выполнении команды `/ignChat` " + e);
    }
});

bot.onText(/\/allPhoto/, async (msg) => {
    try{
        const chatId = msg.chat.id;
        upDateRas()

        const photoFolder = './photo'; // Укажите путь к вашей папке с фотографиями

        if(chatId==adminChatId||chatId==mainChatId){
            try {
                // Читаем содержимое папки
                const files = fs.readdirSync(photoFolder);

                // Перебираем все файлы и отправляем их по очереди
                for (const file of files) {
                    const photoPath = join(photoFolder, file);

                    await bot.sendPhoto(chatId, photoPath, {
                        caption: `Расписание (${file})`,
                    });

                    // Можно добавить задержку между отправкой фото, чтобы не перегружать бота
                    // Например, можно использовать setTimeout:
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                console.log('Все фото отправлены успешно.');
                await bot.sendMessage(chatId, 'Завершено')

            } catch (error) {
                console.error('Произошла ошибка:', error);
                await bot.sendMessage(chatId, 'Произошла ошибка при отправке фото.');
            }
        }else{
            await bot.sendMessage(chatId, "Отказано в доступе")
            await bot.sendMessage(adminChatId, `Использована команда администратора (НЕ ОПАСНО)`)
        }
    }catch (e) {
        console.error(e)
        await bot.sendMessage(adminChatId, "Ошибка при выполнении команды '/allPhoto' "+e)
    }

});

bot.onText(/\/allFiles/, async (msg) => {
    try {
        const chatId = msg.chat.id;

        const dataFolder = './Data/user';

        const parsedData = 'parsedData.json';
        const parsedDataTom = 'parsedDataTom.json';
        const dataFile = './DATE/groupChats.json';
        const statFile = './Data/Stat/user_stats.json';
        const poolFile = './Pool/poolData.json';
        const ignoreGroup = 'ignoreGroup.json';
        const ignoreChat = 'ignore.json';

        const files = [dataFile, parsedData, parsedDataTom, statFile, poolFile, ignoreGroup, ignoreChat];

        if (chatId == adminChatId || chatId == mainChatId) {
            try {
                // Рекурсивная функция для обхода дерева файлов в папке Data
                const sendFilesInData = async (folder) => {
                    const files = fs.readdirSync(folder);

                    for (const file of files) {
                        const filePath = join(folder, file);

                        if (fs.statSync(filePath).isDirectory()) {
                            // Если это директория, вызываем функцию рекурсивно только для папки Data
                            if (folder === dataFolder) {
                                await sendFilesInData(filePath);
                            }
                        } else {
                            // Если это файл, отправляем его
                            await bot.sendDocument(adminChatId, filePath);
                            // Можно добавить задержку между отправкой файлов
                            // Например, можно использовать setTimeout:
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                };

                // Вызываем функцию для обхода только папки Data
                await sendFilesInData(dataFolder);

                // Отправляем указанные файлы вне зависимости от папки
                for (const file of files) {
                    await bot.sendDocument(adminChatId, file);
                    // Можно добавить задержку между отправкой файлов
                    // Например, можно использовать setTimeout:
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                console.log('Все файлы отправлены успешно.');
                bot.sendMessage(adminChatId, 'Завершено');
            } catch (error) {
                console.error('Произошла ошибка:', error);
                await bot.sendMessage(adminChatId, 'Произошла ошибка при отправке файлов.');
            }
        } else {
            await bot.sendMessage(chatId, 'Отказано в доступе');
            await bot.sendMessage(adminChatId, 'Использована команда администратора (ОПАСНО: попытка получения файлов кэша!) Вызвал: ' + chatId);
        }
    } catch (e) {
        console.error(e);
        await bot.sendMessage(adminChatId, "Ошибка при выполнении команды '/allFiles' " + e);
    }
});

bot.on('text', (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text.toLowerCase(); // Приводим текст к нижнему регистру для удобства сравнения

    // Список ключевых слов
    const keywordsPhoto = [
        'фоткойй',
        'вы где',
        'киньште расписание',
        'киньше расписание',
        'киньте расписание',
        'киньте расписание',
        'друзья какой кабинет',
        'друзья, какой кабинет',
        'кабинет',
        'аудитория',
        'фоткойй',
        'фотой',
        'фоткой',
        'фокой',
        'фкой',
        'фотко',
        'фотк',
        'фот',
        'фо',
        'че унас',
        'чеу нас',
        'чеу на с',
        'че ун ас',
        'чеунас',
        'че у нас',
        'какая аудитория',
        'у нас где',
        'че следующим',
        'расписание',
        'какие пары',
        'препод',
        'аудитор',
        'время пары',
        'какие предметы',
        'когда пара',
        'где учеба',
        'распечатать расписание',
        'во сколько пары',
        'сегодня занятия',
        'завтра расписание',
        'какие группы сегодня',
        'какие группы завтра',
        'время занятий',
        'фото расписания',
        'расписание на фото',
        'фотографии расписания',
        'расписание в картинках',
        'картинка расписания',
        'фотография с расписанием',
        'расписание визуально',
        'картинка с занятиями',
        'фото учебного плана',
        'фото графика учебы',
        'фотографии с расписанием',
        'расписание на фотографии',
        'где фото расписания',
        'как выглядит расписание',
        'картинка с парой',
        'расписание в виде фото',
        'фотографии сегодняшнего дня',
        'расписание на снимке',
        'фото школьного дня'
    ];
    const keywordsPhotowTwo = [
        'завтра фоткойй',
        'завтра фотой',
        'завтра че',
        'завтра что',
        'че завтра',
        'чезавтра',
        'че у нас завтра',
        'че у завтра',
        'че нас завтра',
        'завтра фоткой',
        'завтра фокой',
        'завтра фкой',
        'завтра фотко',
        'завтра фотк',
        'завтра фот',
        'завтра фо',
        'че унасзавтра ',
        'че унас завтра ',
        'завтра че унас',
        'чеу нас завтра ',
        'завтра чеу нас',
        'чеу на с завтра ',
        'завтра  чеу на с ',
        'че ун ас',
        'чеунас завтра ',
        'завтра чеунас ',
        'завтра  че у нас',
        'завтра че у нас',
        'че у нас завтра ',
        'че завтра ',
        'чё завтра ',
        'что завтра ',
    ];
    const keywordsText = [
        'текстом',
        'текст',
        'тек',
        'тет',
        'тем',
        'тес',
        'тетщм',
        'тетом',
        'расписание текстом',
        'расписание текст',
        'текст расписания',
        'расписание по тексту',
        'покажи текст расписания',
        'текстовое расписание',
        'что в тексте расписания',
        'расписание где текст',
        'график в тексте',
        'текст на сегодня',
        'что в тексте на сегодня',
        'сегодня в тексте расписания',
        'текстовый график',
        'текстовая информация о расписании',
        'показать расписание текст',
        'где текст по расписанию',
        'текст расписания занятий',
        'расписание через текст',
        'текстовый вид расписания',
        'текст где расписание',
        'расписание в текстовой форме',
        'текстовый план',
        'подскажи текст расписания',
        'текст с расписанием',
        'расписание в виде текста',
        'что в расписании текста',
        'текстовый график занятий',
        'расписание словами',
        'расписание в текстовой версии',
        'текст расписания на сегодня',
        'где найти текст расписания',
        'расписание в текстовом виде',
        'текст с расписанием занятий',
        'показать график текстом',
        'текстовый график занятий',
        'расписание в текстовом формате',
        'расписание словами на сегодня',
        'где найти текстовое расписание',
        'текст с расписанием на сегодня',
        'расписание в текстовой интерпретации',
        'что в расписании на сегодня текстом',
        'текстовый план занятий',
        'расписание словами на сегодняшний день',
        'текст расписания на сегодняшний день',
        'где найти текстовое расписание на сегодня',
        'расписание в текстовой интерпретации на сегодня',
    ];
    const keywordsTextTwo = [
        'тектом завтра',
        'что завтра',
        'занятия завтра тектом',
        'че завтра текст',
        'что завтра текст',
        'че завтра текстом',
        'что завтра текстом',
        'че завтра у нас текстом',
        'что завтра у нас текстом',
        'ребят что завтра у нас текстом',
        'девки что завтра у нас текстом',
        'дефки что завтра у нас текстом',
        'мужыки что завтра у нас текстом',
        'мужики что завтра у нас текстом',
        'ребят, что завтра у нас текстом',
        'девки, что завтра у нас текстом',
        'мужики, что завтра у нас текстом',
        'мужыки, что завтра у нас текстом',
        'дефки, что завтра у нас текстом',
        'ребят, что завтра у нас',
        'мужыки, что завтра у нас',
        'мужики, что завтра у нас',
        'девки, что завтра у нас',
        'дефки, что завтра у нас',
        'сообщением завтра',
        'занятия завтра сообщением',
        'че завтра сообщением',
        'что завтра сообщением',
        'че завтра сообщением',
        'что завтра сообщением',
        'че завтра у нас сообщением',
        'что завтра у нас сообщением',
        'ребят что завтра у нас сообщением',
        'девки что завтра у нас сообщением',
        'дефки что завтра у нас сообщением',
        'мужыки что завтра у нас сообщением',
        'мужики что завтра у нас сообщением',
        'ребят, что завтра у нас сообщением',
        'девки, что завтра у нас сообщением',
        'мужики, что завтра у нас сообщением',
        'мужыки, что завтра у нас сообщением',
        'дефки, что завтра у нас сообщением',
    ]


    // Функция для проверки введенного текста на наличие ключевых слов
    function checkKeywords(text, keywords) {
        const lowerText = text.toLowerCase(); // Приводим весь текст к нижнему регистру

        for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
                return true; // Если хотя бы одно ключевое слово найдено, возвращаем true
            }
        }
        return false; // Если ни одно ключевое слово не найдено, возвращаем false
    }

    if (checkKeywords(messageText, keywordsText)) {
        return textRas(chatId)
    }else if(checkKeywords(messageText, keywordsTextTwo)){
        return tomTextRas(chatId)
    } else if(checkKeywords(messageText, keywordsPhoto)) {
        return readPhoto(chatId, 0)
    }else if(checkKeywords(messageText, keywordsPhotowTwo)){
        return readPhoto(chatId, 1)
    } else{
    }
});

/**Отладка и обратная связь**/
bot.on('message', async (msg) => {

    try {
        const chatId = msg.chat.id;

        //Отключившие
        const nofileContent = await fs.promises.readFile(noNotif, { encoding: 'utf-8' });
        let notifData = JSON.parse(nofileContent);
        const indexToDesable = notifData.indexOf(chatId);

        // Проверяем, является ли сообщение личным сообщением
        if (msg.chat.type === 'private') {

            // Данные о сообщении
            const messageData = {
                messageId: msg.message_id,
                from: {
                    id: msg.from.id,
                    username: msg.from.username,
                    first_name: msg.from.first_name,
                    last_name: msg.from.last_name,
                },
                date: msg.date,
                text: msg.text,
            };

            if(indexToDesable === -1){
                //Сохраняем в массив чатов, если его нет в списке исключений
                await addToMessagePool(chatId)
            }
            await saveUsersStatistic(chatId, messageData)

            // Читаем текущую статистику из файла
            const stats = await readStatsFile();

            // Инициализируем статистику для текущего пользователя, если её ещё нет
            if (!stats[chatId]) {
                stats[chatId] = {
                    username: msg.from.username,
                    requestCount: 0,
                };
            }

            // Увеличиваем количество запросов для текущего пользователя
            stats[chatId].requestCount++;

            // Сохраняем обновленную статистику в файл
            await writeStatsFile(stats);

            const chatIdExists = await isChatIdInJsonFile(chatId, 0);
            if (chatIdExists) {
                return
            } else {
                await bot.forwardMessage(PERSONAL_CHAT, chatId, msg.message_id);
            }
        }


        if ((msg.chat.type === 'supergroup' || msg.chat.type === 'group')){
            await sleep(500);

            const jsonFilePath = 1;

            // Получаем информацию о чате
            const chatInfo = await bot.getChat(chatId);

            const chatIdExists = await isChatIdInJsonFile(chatId, jsonFilePath);

            const forwardedMessage = msg.reply_to_message; // Получаем пересланное сообщение

            if (forwardedMessage && msg.from.id==adminChatId) {
                const admin = msg.from.id;
                const userChatId = forwardedMessage.forward_from.id; // Получаем chatId пользователя
                // Отправляем соответствующий тип сообщения
                if (msg.text) {
                    // Отправляем текстовое сообщение
                    await bot.sendMessage(userChatId, msg.text);
                } else if (msg.voice) {
                    // Отправляем голосовое сообщение
                    await bot.sendVoice(userChatId, msg.voice.file_id);
                } else if (msg.video) {
                    // Отправляем видео
                    const caption = msg.caption ? msg.caption : '';
                    await bot.sendVideo(userChatId, msg.video.file_id, {caption});
                } else if (msg.document) {
                    // Отправляем документ
                    const caption = msg.caption ? msg.caption : '';
                    await bot.sendDocument(userChatId, msg.document.file_id, {caption});
                } else if (msg.photo) {
                    // Получаем фото с наилучшим качеством
                    const photo = msg.photo.reduce((prev, current) => (current.width > prev.width) ? current : prev);

                    // Проверяем наличие текста в сообщении
                    const caption = msg.caption ? msg.caption : '';

                    // Отправляем фото с возможным текстом в caption
                    await bot.sendPhoto(userChatId, photo.file_id, { caption });
                }else if (msg.sticker) {
                    // Отправляем стикер
                    await bot.sendSticker(userChatId, msg.sticker.file_id);
                }
            }



            if(indexToDesable === -1){
                //Сохраняем в массив чатов, если его нет в списке исключений
                await addToMessagePool(chatId)
            }

            // Получаем имя группы
            const groupName = chatInfo.title;

            if (chatIdExists) {
                console.log('Пропускаем группу. Группа в черном списке...');
            } else {
                // Пересылаем сообщение в другой чат
                await bot.sendMessage(ANOTHER_CHAT_ID, `Переслано из группы ${groupName}:\n\n\n`);
                await bot.forwardMessage(ANOTHER_CHAT_ID, chatId, msg.message_id);
            }
        }
    } catch (e) {
        console.error(e);
        await bot.sendMessage(adminChatId, 'Ошибка в "TEXT": ' + e)
    }
});

async function isChatIdInJsonFile(chatId, jsonFilePath) {
    try {
        const filePath = jsonFilePath === 0 ? 'ignore.json' : 'ignoreGroup.json';

        // Читаем данные из файла
        const fileContent = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
        const jsonData = JSON.parse(fileContent);


        // Проверяем, существует ли chatId в массиве
        const isChatIdExists = jsonData.some(entry => entry.chatId === chatId);

        return isChatIdExists;
    } catch (error) {
        console.error('Ошибка при проверке chatId в JSON файле:', error);
        return false;
    }
}

/**Очистка списков**/
async function notifiSett(chatId, type) {
    try {
        const filePath = `Pool/poolData.json`;

        // Читаем данные из файла
        const fileContent = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
        let jsonData = JSON.parse(fileContent);

        //Отключившие
        const nofileContent = await fs.promises.readFile(noNotif, { encoding: 'utf-8' });
        let notifData = JSON.parse(nofileContent);

        // Ищем индекс элемента с заданным chatId
        const indexToRemove = jsonData.indexOf(chatId);

        //Отключившие
        const indexToDesable = notifData.indexOf(chatId);

        if (type === 0) {
            if (indexToRemove !== -1) {
                // Удаляем элемент из массива
                jsonData.splice(indexToRemove, 1);

                // Перезаписываем файл с обновленными данными
                await fs.promises.writeFile(filePath, JSON.stringify(jsonData, null, 2), { encoding: 'utf-8' });

                await bot.sendMessage(adminChatId, `Пользователь ${chatId} отключил уведомления.`);

                const isChatIdExist = notifData.includes(chatId);
                if (!isChatIdExist) {
                    // Если нет, добавляем chatId в массив
                    notifData.push(chatId);

                    // Перезаписываем файл
                    await fs.promises.writeFile(noNotif, JSON.stringify(notifData), { encoding: 'utf-8' });
                }
                return true;
            } else {
                console.log(`Запись с chatId ${chatId} не найдена в файле. Ничего не удалили.`);
                await bot.sendMessage(adminChatId, `Запись с chatId ${chatId} не найдена в файле.`);
                return false;
            }
        } else if (type === 1) {
            // Удаляем элемент из массива
            jsonData.splice(indexToDesable, 1);

            // Перезаписываем файл с обновленными данными
            await fs.promises.writeFile(noNotif, JSON.stringify(notifData, null, 2), { encoding: 'utf-8' });

            // Проверяем, есть ли уже такой chatId в пуле
            const isChatIdExist = jsonData.includes(chatId);
            if (!isChatIdExist) {
                // Если нет, добавляем chatId в массив
                jsonData.push(chatId);

                // Перезаписываем файл
                await fs.promises.writeFile(filePath, JSON.stringify(jsonData), { encoding: 'utf-8' });

                // Отправляем сообщение в чат
                await bot.sendMessage(adminChatId, `Пользователь ${chatId} включил уведомления.`);
            }
        }
    } catch (error) {
        console.error('Ошибка при изменении записи в JSON файле:', error);
        await bot.sendMessage(adminChatId, 'Ошибка при изменении записи в JSON файле: ' + error);
        return false;
    }
}

async function rmToJsonFile(chatIdToRemove, type) {
    try {
        const fPath = type === 0 ? 'ignore.json' : 'ignoreGroup.json';

        // Читаем данные из файла
        const fileContent = await fs.promises.readFile(fPath, { encoding: 'utf-8' });
        let jsonData = JSON.parse(fileContent);

        // Фильтруем массив, оставляя только те объекты, у которых chatId не совпадает с chatIdToRemove
        jsonData = jsonData.filter(entry => entry.chatId !== chatIdToRemove);

        if (jsonData.length < fileContent.length) {
            // Перезаписываем файл с обновленными данными
            await fs.promises.writeFile(fPath, JSON.stringify(jsonData, null, 2), { encoding: 'utf-8' });

            await bot.sendMessage(adminChatId, `Запись с chatId успешно удалена из файла.`+chatIdToRemove);
            return true;
        } else {
            console.log(`Запись с chatId не найдена в файле.`);
            await bot.sendMessage(adminChatId, `Запись с chatId не найдена в файле.`);
            return false;
        }
    } catch (error) {
        console.error('Ошибка при удалении записи из JSON файла:', error);
        await bot.sendMessage(adminChatId, 'Ошибка при удалении записи из JSON файла: ' + error);
        return false;
    }
}

/**Игнор**/
//Группы
async function addToJsonFile(data, type) {
    const filePath = type === 0 ? 'ignore.json' : 'ignoreGroup.json';

    try {
        // Пытаемся прочитать данные из файла
        const fileContent = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
        const jsonData = JSON.parse(fileContent);

        // Добавляем новые данные в массив
        jsonData.push(data);

        // Перезаписываем файл с обновленными данными
        await fs.promises.writeFile(filePath, JSON.stringify(jsonData, null, 2), { encoding: 'utf-8' });
    } catch (error) {
        // Если файл не существует, создаем новый с переданными данными
        if (error.code === 'ENOENT') {
            await fs.promises.writeFile(filePath, JSON.stringify([data], null, 2), { encoding: 'utf-8' });
        } else {
            console.error('Ошибка при обновлении JSON-файла:', error);
            await bot.sendMessage(adminChatId, 'Ошибка при обновлении JSON-файла: ' + error);
        }
    }
}

/**Техт**/
async function tomTextRas(chatId, days) {
    try {

        // Отправляем сообщение "Подождите..." и получаем его message_id
        const waitMessage = await bot.sendMessage(chatId, 'Подождите...', { disable_notification: false });
        const waitingMessageId = waitMessage.message_id;

        //Если days =3, то сделать day равным 3, иначе 1
        const day = days === 3 ?3 : 1;
        const currentDate = date(day);
        const filePath = 'parsedDataTom.json';
        const noCurrentDate = '1970-01-01';

        // Вызываем функцию getDayOfWeek
        const currentDayOfWeek = getDayOfWeek(currentDate);

        if (currentDayOfWeek === 'Суббота') {
            await bot.sendMessage(chatId, 'Сегодня cуббота. Давайте посмотрим расписание на понедельник...')
            return await tomTextRas(chatId, 3)
        } else{
            let storedData;
            await bot.deleteMessage(chatId, waitingMessageId);

            // Пытаемся прочитать данные из файла
            try {
                const fileContent = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
                storedData = JSON.parse(fileContent);

                // Проверяем, устарели ли данные
                if (storedData && storedData.date === currentDate) {
                    // Если данные актуальны, используем их для генерации сообщения
                    const messageText = generateMessage(storedData.data, day);

                    // Отправляем сообщение в чат
                    await bot.sendMessage(chatId, messageText, {
                        parse_mode: 'HTML', // Указываем режим разметки Markdown
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: 'Обновить',
                                        callback_data: 'textoday'
                                    }
                                ]
                            ]
                        }
                    });
                    return;
                }
            } catch (readError) {
                if (readError.code === 'ENOENT') {
                    // Если ошибка связана с отсутствием файла, создаем новый файл
                    console.log('Файл не найден, создаем новый файл.');
                    bot.sendMessage(adminChatId, 'Файл не найден, создаем новый файл.');
                    await fs.promises.writeFile(filePath, JSON.stringify({ date: noCurrentDate, data: [] }), { encoding: 'utf-8' });
                } else {
                    // Если возникает ошибка чтения файла, это может быть связано с тем, что файл не существует
                    console.error('Ошибка чтения файла:', readError);
                    bot.sendMessage(adminChatId, 'Ошибка чтения файла: ' + readError);
                }
            }


            // Если данные устарели или файла нет, вызываем parser()
            const messageData = await parser(currentDate);

            if (messageData && messageData.length > 0) {
                // Создаем файл, если его нет
                await fs.promises.writeFile(filePath, JSON.stringify({ date: currentDate, data: messageData }), { encoding: 'utf-8' })
                    .then(() => bot.sendMessage(adminChatId, 'Файл перезаписан'))
                    .catch(createError => bot.sendMessage(adminChatId, 'Ошибка на сервере при создании файла: ' + createError));

                // Генерация сообщения
                const messageText = generateMessage(messageData, 1);

                // Отправляем сообщение в чат
                await bot.sendMessage(chatId, messageText, {
                    parse_mode: 'HTML', // Указываем режим разметки Markdown
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: 'Обновить',
                                    callback_data: 'textoday'
                                }
                            ]
                        ]
                    }
                });

            } else {
                // Если данные не найдены, отправляем сообщение об этом
                await bot.sendMessage(chatId, 'Ничего не найдено');
            }
        }
    } catch (e) {
        console.error(e);
        await bot.sendMessage(chatId, "Ошибка при выполнении команды '/tomorrowtext' " + `\n`);
        await bot.sendMessage(adminChatId, "Ошибка при выполнении команды '/tomorrowtext' " + `\n` + e);
    }
}

async function textRas(chatId) {
    try {
        const currentDate = date();
        const noCurrentDate = '1970-01-01';
        const filePath = 'parsedData.json';

        // Вызываем функцию getDayOfWeek
        const currentDayOfWeek = getDayOfWeek(currentDate);

        // Если сегодня воскресенье
        if (currentDayOfWeek === 'Воскресенье') {
            await bot.sendMessage(chatId, 'Сегодня воскресенье. Давайте посмотрим расписание на завтра...')
            return  await tomTextRas(chatId)
        }else{
            let storedData;
            // Пытаемся прочитать данные из файла
            try {
                const fileContent = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
                storedData = JSON.parse(fileContent);

                // Проверяем, устарели ли данные
                if (storedData && storedData.date === currentDate) {
                    // Если данные актуальны, используем их для генерации сообщения
                    const messageText = generateMessage(storedData.data, 0);

                    // Отправляем сообщение в чат
                    await bot.sendMessage(chatId, messageText, {
                        parse_mode: 'HTML', // Указываем режим разметки Markdown
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: 'Обновить',
                                        callback_data: 'textrow'
                                    }
                                ]
                            ]
                        }
                    });
                    return;
                }

            } catch (readError) {
                if (readError.code === 'ENOENT') {
                    // Если ошибка связана с отсутствием файла, создаем новый файл
                    console.log('Файл не найден, создаем новый файл.');
                    bot.sendMessage(adminChatId, 'Файл не найден, создаем новый файл.');
                    await fs.promises.writeFile(filePath, JSON.stringify({ date: noCurrentDate, data: [] }), { encoding: 'utf-8' });
                } else {
                    // Если возникает ошибка чтения файла, это может быть связано с тем, что файл не существует
                    console.error('Ошибка чтения файла:', readError);
                    await bot.sendMessage(adminChatId, 'Ошибка чтения файла: ' + readError);
                    await bot.sendMessage(adminChatId, 'Ошибка на сервере. Попробуйте позже');
                }
            }
            const messageData = await parser(currentDate);

            if (messageData && messageData.length > 0) {
                // Создаем файл, если его нет
                await fs.promises.writeFile(filePath, JSON.stringify({ date: currentDate, data: messageData }), { encoding: 'utf-8' })
                    .then(() => bot.sendMessage(adminChatId, 'Файл перезаписан'))
                    .catch(createError => bot.sendMessage(adminChatId, 'Ошибка на сервере при создании файла: ' + createError));

                // Генерация сообщения
                const messageText = generateMessage(messageData, 0);

                // Отправляем сообщение в чат
                await bot.sendMessage(chatId, messageText, {
                    parse_mode: 'HTML', // Указываем режим разметки Markdown
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: 'Обновить',
                                    callback_data: 'textrow'
                                }
                            ]
                        ]
                    }
                });

            } else {
                // Если данные не найдены, отправляем сообщение об этом
                await bot.sendMessage(chatId, 'Ничего не найдено');
            }
        }
    } catch (e) {
        console.error(e);
        await bot.sendMessage(chatId, "Ошибка при выполнении команды '/text' " + `\n` + e);
        await bot.sendMessage(adminChatId, "Ошибка при выполнении команды '/text' " + `\n` + e);
    }
}

function generateMessage(data, day) {
    try {
        const dayT = ['Сегодня', 'Завтра', 'Послезавтра'];
        const selectedDay = dayT[day] || '';

        let message = `<b>${selectedDay}</b>\n<b>${getDayOfWeek(date(day))}</b>        <b>${formatDateReversed(date(day))}</b>`;

        // Проходимся по каждому элементу в данных
        data.forEach(rowData => {
            const auditor = ((rowData.auditorium || '').split('/')[1] || 'Нет').trim();
            const room = (rowData.auditorium || '').split('/')[0] || 'Нет';
            message += `\n\n<b>${rowData.teacher}</b>\n${rowData.discipline}\n<b>${rowData.para}</b>\n<b>${auditor}</b>\n${room}\n`;
        });

        return message;
    } catch (e) {
        bot.sendMessage(adminChatId, 'Ошибка формирования таблицы: ' + e)
        console.error(e)
    }
}

/**Статистика пользователей**/
// Функция для чтения данных из файла
async function readStatsFile() {
    try {
        const fileContent = await fs.promises.readFile(statsFilePath, { encoding: 'utf-8' });
        return JSON.parse(fileContent);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await bot.sendMessage(adminChatId, 'Ошибка чтения файла. Создаем файл...');
            await writeStatsFile([]);  // Дожидаемся записи файла перед возвратом
            return {};
        } else {
            // Другая ошибка чтения файла
            console.error(error);
            await bot.sendMessage(adminChatId, 'Ошибка чтения файла. \n' + error);
            return {};
        }
    }
}

// Функция для записи данных в файл
async function writeStatsFile(data) {
    try {
        await fs.promises.writeFile(statsFilePath, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
    } catch (e) {
        await bot.sendMessage(adminChatId, 'Ошибка при записи в "writeStatsFile" \n' + e);
        console.error(e);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function saveUsersStatistic(chatId, data) {
    const chatFilePath = `Data/user/${chatId}.json`;

    try {
        // Читаем существующие данные, если они есть
        let existingData = [];
        if (fs.existsSync(chatFilePath)) {
            const fileContent = fs.readFileSync(chatFilePath, 'utf-8');
            existingData = fileContent ? JSON.parse(fileContent) : [];
        }

        // Добавляем новые данные
        existingData.push(data);

        // Сохраняем обновленные данные в файл с задержкой
        await fs.promises.writeFile(chatFilePath, JSON.stringify(existingData, null, 2));
    } catch (error) {
        console.error(error);
    }
}

/**небольшой хакатон**/
bot.on('new_chat_members', async (msg) => {
    try {
        const chatId = msg.chat.id;
        const botInfo = await bot.getMe();
        const botId = botInfo.id;
        const newMembers = msg.new_chat_members;

        // Проверяем, есть ли бот среди новых участников
        const botInstances = newMembers.filter(member => member.id === botId);
        await bot.sendMessage(chatId, `Привет! Я добавлен в вашу группу. Давайте начнем!\n\n`
            +`В данный момент бот не имеет возможности принимать сообщения в группе. Для того чтобы он мог реагировать на ключевые слова, необходимо предоставить соответствующее разрешение.`
            +`\n\n`
            +`@Crazy_santa`
        );

        //Сохраняем в массив чатов
        await addToMessagePool(chatId)

        if (botInstances.length > 0) {
            addToGroupChats(chatId);
            // Данные о чате (замените на реальные данные)
            const chatData = {
                chatId: msg.chat.id,
                title: msg.chat.title,
                username: msg.chat.username,
                type: msg.chat.type,
                description: msg.chat.description,
                inviteLink: msg.chat.invite_link,
                stickerSetName: msg.chat.sticker_set_name,
                canSetStickerSet: msg.chat.can_set_sticker_set,
                allMembersAreAdministrators: msg.chat.all_members_are_administrators,
                photo: msg.chat.photo,
                pinnedMessage: msg.chat.pinned_message,
                permissions: msg.chat.permissions,
                slowModeDelay: msg.chat.slow_mode_delay,
                messageAutoDeleteTime: msg.chat.message_auto_delete_time,
                linkedChatId: msg.chat.linked_chat_id,
                location: msg.chat.location,
                isVoiceChatScheduled: msg.chat.is_voice_chat_scheduled,
                voiceChat: msg.chat.voice_chat,
            };

            // Сохраняем данные о чате
            saveChatData(chatId, chatData);

            // Добавляем чат в список групповых чатов
        }
    } catch (e) {
        console.error(e);
        await bot.sendMessage(adminChatId, 'Ошибка в "Группа": ' + e)
    }
});

// Функция для сохранения данных о чате в отдельный файл
function saveChatData(chatId, data) {
    try{
        const chatFilePath = `DATE/${chatId}.json`;

        fs.writeFileSync(chatFilePath, JSON.stringify(data, null, 2));

        console.log(`Данные о группе сохранены в файл: ${chatFilePath}`);
    }catch (e) {
        console.error(e)
        bot.sendMessage(adminChatId, `Ошибка на сервере при сохранении "DATE" `+e)
    }
}

// Функция для добавления чата в список групповых чатов
function addToGroupChats(chatId) {
    try{
        const currentDate = new Date();
        const groupChats = [];

        // Проверяем, существует ли файл со списком групповых чатов
        if (fs.existsSync(groupChatsFilePath)) {
            const existingGroupChats = fs.readFileSync(groupChatsFilePath, 'utf-8');
            groupChats.push(...JSON.parse(existingGroupChats));
        }

        // Добавляем новый чат в список
        groupChats.push({
            chatId,
            addedDate: currentDate.toISOString(),
        });

        fs.writeFileSync(groupChatsFilePath, JSON.stringify(groupChats, null, 2));

        console.log(`Чат добавлен в список групповых чатов: ${chatId}`);
        bot.sendMessage(adminChatId, `Бот был добавлен. ${chatId}`)

    }catch (e) {
        console.error(e)
        bot.sendMessage(adminChatId, 'Ошибка на сервере "Group": '+e)
    }
}

/**Для расписания в Фото**/
async function readPhoto(chatId, day) {
    try{
        const waitMessage = await bot.sendMessage(chatId, 'Подождите...', { disable_notification: false });
        const waitingMessageId = waitMessage.message_id;

        try {
            const currentDate = date(day);
            // Вызываем функцию getDayOfWeek
            const currentDayOfWeek = getDayOfWeek(currentDate);

            //const filePath = currentDayOfWeek === 'Воскресенье' ? `photo/${currentDate}.png` : `photo/${date(1)}.png`
            //const filePath =  `photo/${date(1)}.png`
            const filePath = currentDayOfWeek === 'Воскресенье' ? `photo/${date(1)}.png` : `photo/${currentDate}.png`;

            if (fs.existsSync(filePath)) {
                // Если сегодня воскресенье
                if (currentDayOfWeek === 'Воскресенье' && day===0) {
                    await bot.sendMessage(chatId, 'Сегодня воскресенье. Давайте посмотрим расписание на завтра...')

                    const filePath = `photo/${date(1)}.png`;
                    const photoMessage = await bot.sendPhoto(chatId, filePath, {
                        caption: 'Расписание',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: 'Обновить',
                                        callback_data: 'tworef'
                                    }
                                ]
                            ]
                        }
                    });
                    return
                }else if(currentDayOfWeek === 'Суббота' && day===1){
                    await bot.sendMessage(chatId, 'Сегодня суббота. Давайте посмотрим расписание на понедельник...')

                    const filePath = `photo/${date(2)}.png`;

                    const photoMessage = await bot.sendPhoto(chatId, filePath, {
                        caption: 'Расписание',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: 'Обновить',
                                        callback_data: 'refresh'
                                    }
                                ]
                            ]
                        }
                    });
                    return
                }else if(currentDayOfWeek !== 'Воскресенье' && day===0){
                    const photoMessage = await bot.sendPhoto(chatId, filePath, {
                        caption: 'Расписание',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: 'Обновить',
                                        callback_data: 'refresh'
                                    }
                                ]
                            ]
                        }
                    });
                    return
                }else if(currentDayOfWeek !== 'Суббота' && day===1){
                    const photoMessage = await bot.sendPhoto(chatId, filePath, {
                        caption: 'Расписание',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: 'Обновить',
                                        callback_data: 'tworef'
                                    }
                                ]
                            ]
                        }
                    });
                }
                return
            } else {
                await parserPhoto(chatId, (success) => {
                    readPhoto(chatId, day);
                }).catch((error) => {
                    bot.sendMessage(chatId, 'Ошибка на сервере! Уже разбираемся...');
                    bot.sendMessage(adminChatId, 'Ошибка на сервере! ' + error);
                });
            }
            await bot.deleteMessage(chatId, waitingMessageId);

        } catch (error) {
            console.error(error);
            await bot.deleteMessage(chatId, waitingMessageId);
            await bot.sendMessage(chatId, 'Ошибка на сервере!');
            await bot.sendMessage(adminChatId, 'Ошибка получения фото из файлов: ' + error);
            await parserPhoto(chatId);
        }
    }catch (e) {
        console.error(e)
        await bot.sendMessage(adminChatId, `Произошла ошибка! Пользователь закрыл чат или бот удален: `+e)
    }

}

const parserMutex = { locked: false };

async function parserPhoto(chatId) {
    if (parserMutex.locked) {
        console.log('Another instance of parserPhoto is already running. Skipping.');
        return false;
    }

    parserMutex.locked = true;
    let success = false;
    try {
        for (let date_name = 0; date_name <= 7; date_name++) {
            await (async (date_name) => {
                const browser = await puppeteer.launch({headless: "new", ignoreHTTPSErrors: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
                const page = await browser.newPage();
                await page.emulate({
                    viewport: { width: 375, height: 667 },
                    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML, like Gecko) Mobile/14E8301',
                });

                try {
                    await page.goto('https://www.asiec.ru/ras/', { timeout: 60000 });

                    await page.evaluate((date_name) => {
                        const select = document.querySelector('#gruppa');
                        const option = Array.from(select.options).find(option => option.text === '11ОИБ232');
                        const calendarElement = document.getElementById('calendar');
                        const calendar2Element = document.getElementById('calendar2');

                        function dateTime(dayOf) {
                            const today = new Date();

                            // Проверка, передан ли параметр dayOf
                            if (dayOf !== undefined) {
                                today.setDate(today.getDate() + dayOf);
                            }else if(dayOf === 0){
                                today.setDate(today.getDate() + dayOf);
                            }

                            const day = today.getDate();
                            const month = today.getMonth() + 1;
                            const year = today.getFullYear();
                            return `${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`;
                        }

                        if (option) {
                            option.selected = true;
                            const event = new Event('change', { bubbles: true });
                            select.dispatchEvent(event);
                        }

                        if (calendarElement) {
                            calendarElement.value = dateTime(date_name);
                        }

                        if (calendar2Element) {
                            calendar2Element.value = dateTime(date_name);
                        }
                    }, date_name);

                    await page.click('input[type="submit"]');

                    await page.waitForSelector('#content .para_b', { timeout: 60000 });  // Ждем появления любого элемента внутри #content

                    const boundingBox = await page.$eval('#content', (content) => {
                        const rect = content.getBoundingClientRect();
                        return {
                            x: rect.x,
                            y: rect.y,
                            width: rect.width,
                            height: rect.height,
                        };
                    });

                    await page.setViewport({
                        width: boundingBox.width,
                        height: boundingBox.height,
                    });

                    await page.evaluate(boundingBox => {
                        window.scrollTo(boundingBox.x, boundingBox.y);
                    }, boundingBox);

                    await page.waitForTimeout(500);
                    await page.screenshot({ path: `./photo/${date(date_name)}.png` });
                    console.log(`Скриншот сохранен как ${date(date_name)}`);
                    await bot.sendMessage(adminChatId, `Скриншот сохранен как ${date(date_name)}`);
                    success = true;
                } catch (error) {
                    console.error('Произошла ошибка:', error);
                    await bot.sendMessage(adminChatId, `Ошибка на сервере! ` + error)
                    await bot.sendMessage(chatId||adminChatId, `Ошибка на сервере. Попробуйте ещё раз. \nВ случае повторной ошибки дождитесь решения проблемы. \n(Не нужно каждый раз реагировать на это сообщение как-будто это у Вас в первый раз)`)
                } finally {
                    await browser.close();
                    parserMutex.locked = false;
                }
            })(date_name);
        }

    } catch (error) {
        console.error('Произошла ошибка:', error);
        await bot.sendMessage(chatId||adminChatId, 'Ошибка на сервере!')
        await bot.sendMessage(adminChatId, 'Ошибка при парсинге! Не удалось сделать скриншот: ' + error)
    }
    return true
}

/**Для расписания в Текстовом Виде**/
const parserRasMutex = { locked: false };

async function parser(date) {
    if (parserRasMutex.locked) {
        console.log('Skipping...');
        return false;
    }
    parserRasMutex.locked = true;

    const browser = await puppeteer.launch({ headless: 'new', ignoreHTTPSErrors: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    try {
        const page = await browser.newPage();

        await page.goto('https://www.asiec.ru/ras/', { timeout: 60000 });

        await page.evaluate((date) => {
            const select = document.querySelector('#gruppa');
            const option = Array.from(select.options).find(option => option.text === '11ОИБ232');
            const calendarElement = document.getElementById('calendar');
            const calendar2Element = document.getElementById('calendar2');

            if (option) {
                option.selected = true;
                const event = new Event('change', {bubbles: true});
                select.dispatchEvent(event);
            }

            if (calendarElement) {
                calendarElement.value = date;
            }

            if (calendar2Element) {
                calendar2Element.value = date;
            }
        }, date);

        await page.click('input[type="submit"]');
        await page.waitForSelector('#content .table-3');

        const tableData = await page.evaluate(() => {
            const rows = document.querySelectorAll('#content .table-3 tr');
            const data = [];
            rows.forEach(row => {
                const teacherElement = row.querySelector('td[data-label="Преподаватель"]');
                const disciplineElement = row.querySelector('td[data-label="Дисциплина"]');
                const auditoriumElement = row.querySelector('td[class="ter_aud_mob"]');
                const paraElement = row.querySelector('td[class="para_b"]');

                if (teacherElement && auditoriumElement && paraElement && disciplineElement) {
                    data.push({
                        teacher: teacherElement.textContent,
                        auditorium: auditoriumElement.textContent,
                        para: paraElement.textContent,
                        discipline: disciplineElement.textContent
                    });
                }
            });
            return data;
        });

        if (tableData && tableData.length > 0) {
            return tableData
        } else {
            await bot.sendMessage(adminChatId,'Данные о преподавателях, аудиториях и времени пары не найдены');
            return null;
        }
    } catch (error) {
        console.error(error);
        try {
            await bot.sendMessage(adminChatId, 'Ошибка на сервере(Parser). ' + error);
        } catch (sendMessageError) {
            console.error('Ошибка при отправке сообщения:', sendMessageError);
        }
        return null;
    } finally {
        await browser.close();
        parserRasMutex.locked = false;
    }
}

//Сравнивает старые и новые данные, в случае обновления вызывает функцию parserPhoto()
const upDateRasMutex = { locked: false };

async function upDateRas() {
    if (upDateRasMutex.locked) {
        console.log('Skipping...');
        return false;
    }
    upDateRasMutex.locked = true;

    // Объявляем массив дней
    const days = [0, 1];
    try {
        for (const day of days) {
            const currentDate = `${date(day)}`;
            const filePath = day === 0 ? 'parsedData.json' : 'parsedDataTom.json';

            let storedData;

            // Пытаемся прочитать данные из файла
            try {
                const fileContent = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
                storedData = JSON.parse(fileContent);
            } catch (readError) {
                if (readError.code === 'ENOENT') {
                    // Если ошибка связана с отсутствием файла, создаем новый файл
                    console.log('Файл не найден, создаем новый файл.');
                    await bot.sendMessage(adminChatId, 'Файл не найден, создаем новый файл.');
                    await fs.promises.writeFile(filePath, '', { encoding: 'utf-8' });
                } else {
                    // Если возникает ошибка чтения файла, это может быть связано с тем, что файл не существует
                    console.error('Ошибка чтения файла:', readError);
                    await bot.sendMessage(adminChatId, 'Ошибка чтения файла: ' + readError);

                    // Сохраняем ошибку в файл
                    const errorFilePath = 'readError.json';
                    await fs.promises.writeFile(errorFilePath, JSON.stringify({ date: currentDate, error: readError }), { encoding: 'utf-8' });

                    // Проблема при чтении файла JSON, отправляем сообщение с ошибкой
                    console.log('Ошибка чтения файла JSON, сохраняем ошибку в файл.');
                    await bot.sendMessage(adminChatId, 'Ошибка чтения файла JSON. Смотрите файл ' + errorFilePath);
                }
            }

            // Получаем новые данные от parser
            const newData = await parser(currentDate);

            // Если есть старые данные и они отличаются от новых
            if (!deepEqual(storedData?.data, newData)) {
                // Перезаписываем файл
                await fs.promises.writeFile(filePath, JSON.stringify({ date: currentDate, data: newData }), { encoding: 'utf-8' });

                // Вызываем функцию parserPhoto
                if(day!==1) {
                    await parserPhoto();
                }

                //Вызываем функцию Уведомлений
                await processMessagePool(day)
                // Отправляем сообщение в чат
                await bot.sendMessage(adminChatId, `Файл для ${currentDate} обновлен, данные обновлены, вызвана функция parserPhoto.`);
            } else {
                // Если данные не найдены или не изменились, отправляем сообщение об этом
            }
        }
    } catch (e) {
        console.error(e);
        await bot.sendMessage(adminChatId, "Ошибка при выполнении команды '/text':\n" + e);
    } finally {
        upDateRasMutex.locked = false;
    }
}

async function addToMessagePool(chatId) {

    try {
        const currentDate = date();
        const filePath = './Pool/poolData.json';

        let storedData;

        // Пытаемся прочитать данные из файла
        try {
            const fileContent = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
            storedData = JSON.parse(fileContent);
        } catch (readError) {
            if (readError.code === 'ENOENT') {
                // Если ошибка связана с отсутствием файла, создаем новый файл
                console.log('Файл не найден, создаем новый файл.');
                await bot.sendMessage(adminChatId, 'Файл не найден, создаем новый файл.');
                await fs.promises.writeFile(filePath, '', { encoding: 'utf-8' });
                storedData = [];
            } else {
                // Если возникает ошибка чтения файла, это может быть связано с тем, что файл не существует
                console.error('Ошибка чтения файла:', readError);
                await bot.sendMessage(adminChatId, 'Ошибка чтения файла: ' + readError);

                // Сохраняем ошибку в файл
                const errorFilePath = 'readError.json';
                await fs.promises.writeFile(errorFilePath, JSON.stringify({ date: currentDate, error: readError }), { encoding: 'utf-8' });

                // Проблема при чтении файла JSON, отправляем сообщение с ошибкой
                console.log('Ошибка чтения файла JSON, сохраняем ошибку в файл.');
                await bot.sendMessage(adminChatId, 'Ошибка чтения файла JSON. Смотрите файл ' + errorFilePath);
                return;
            }
        }

        // Проверяем, есть ли уже такой chatId в пуле
        const isChatIdExist = storedData.includes(chatId);
        if (!isChatIdExist) {
            // Если нет, добавляем chatId в массив
            storedData.push(chatId);

            // Перезаписываем файл
            await fs.promises.writeFile(filePath, JSON.stringify(storedData), { encoding: 'utf-8' });

            // Отправляем сообщение в чат
            await bot.sendMessage(adminChatId, `Чат ${chatId} добавлен в пул.`);
        } else {
            // Если chatId уже существует в пуле
        }
    } catch (e) {
        console.error(e);
        await bot.sendMessage(adminChatId, "Ошибка при выполнении команды '/text':\n" + e);
    }
}

//Уведомления я об обновлении
async function processMessagePool(day) {
    try {
        const currentDate = date(day);
        const filePath = './Pool/poolData.json';

        let storedData;

        // Пытаемся прочитать данные из файла
        try {
            const fileContent = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
            storedData = JSON.parse(fileContent);

        } catch (readError) {
            if (readError.code === 'ENOENT') {
                // Если ошибка связана с отсутствием файла, создаем новый файл
                console.log('Файл не найден, создаем новый файл.');
                await bot.sendMessage(adminChatId, 'Файл не найден, создаем новый файл.');
                await fs.promises.writeFile(filePath, '', { encoding: 'utf-8' });
                storedData = [];
            } else {
                // Если возникает ошибка чтения файла, это может быть связано с тем, что файл не существует
                console.error('Ошибка чтения файла:', readError);
                await bot.sendMessage(adminChatId, 'Ошибка чтения файла: ' + readError);

                // Сохраняем ошибку в файл
                const errorFilePath = 'readError.json';
                await fs.promises.writeFile(errorFilePath, JSON.stringify({ date: currentDate, error: readError }), { encoding: 'utf-8' });

                // Проблема при чтении файла JSON, отправляем сообщение с ошибкой
                console.log('Ошибка чтения файла JSON, сохраняем ошибку в файл.');
                await bot.sendMessage(adminChatId, 'Ошибка чтения файла JSON. Смотрите файл ' + errorFilePath);
                return;
            }
        }
        // Проходим по каждому ключу (chatId) в пуле и вызываем функцию readPhoto
        for (const chatId of storedData) {
            if (day === 0 && await isBeforeTargetTime(20)){
                await bot.sendMessage(chatId, 'Кажется, расписание на сегодня изменилось...')
                await textRas(chatId)
                //await readPhoto(chatId, day);
            } else if (day === 1) {
                await bot.sendMessage(chatId, 'Кажется, расписание на завтра изменилось...')
                //await readPhoto(chatId, day);
                await tomTextRas(chatId)
            }
        }

    } catch (e) {
        console.error(e);
        await bot.sendMessage(adminChatId, `Ошибка при выполнении "Уведомления":\n` + e);
    }
}

/**Обработчик обратного вызова**/
bot.on('callback_query', async (callbackQuery) => {
    try {
        const data = callbackQuery.data;
        const chatId = callbackQuery.message.chat.id; // Получаем id чата

        if (data === 'refresh') {
            await bot.answerCallbackQuery(callbackQuery.id, 'Дождитесь обновления...');
            await parserPhoto(chatId => {
                readPhoto(chatId, 0)
            });
            await upDateRas()
            return;
        }

        if (data === 'tworef') {
            await bot.answerCallbackQuery(callbackQuery.id, 'Дождитесь обновления...');
            await parserPhoto(chatId => {
                readPhoto(chatId, 1)
            });
            await upDateRas();
        } else if (data === 'on') {
            await notifiSett(chatId, 1);
            await bot.answerCallbackQuery(callbackQuery.id, 'Активация уведомлений...');
            await bot.sendMessage(chatId, 'Уведомления включены')
        } else if (data === 'off') {
            await notifiSett(chatId, 0);
            await bot.answerCallbackQuery(callbackQuery.id, 'Деактивация уведомлений...');
            await bot.sendMessage(chatId, 'Уведомления отключены')
        }else if (data === 'textrow') {
            await upDateRas();
            await bot.answerCallbackQuery(callbackQuery.id, 'Дождитесь обновления расписания на завтра...');
        } else if (data === 'textoday') {
            await upDateRas();
            await bot.answerCallbackQuery(callbackQuery.id, 'Деактивация уведомлений расписания на сегодня...');
        }
    } catch (e) {
        console.error(e);
        await bot.sendMessage(adminChatId, "Ошибка при обработке callback_query: " + e);
    }
});
