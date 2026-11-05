# Канск Сегодня — команды агента

Канал: @kansk_segodnya. Бот: @kansk_segodnya_editor_bot. Работайте с файлами на своём компьютере обычными путями — клиент сам прикрепит их к команде.

## Начало

```sh
curl -fsS https://edit-kansk-publisher.ivanfomin2003.chatgpt.site/edit.py -o edit.py
python3 edit.py check
python3 edit.py help
```

## Публикации

```sh
python3 edit.py text "Текст поста"
python3 edit.py text --text-file post.txt --html
python3 edit.py photo image.jpg -c "Подпись"
python3 edit.py video clip.mp4 -c "Подпись"
python3 edit.py album first.jpg second.jpg clip.mp4 -c "Подпись альбома"
python3 edit.py document report.pdf -c "Документ"
python3 edit.py audio music.mp3 -c "Подпись"
python3 edit.py voice speech.ogg
python3 edit.py animation motion.gif
```

## Правки и удаление

```sh
python3 edit.py edit 123 "Новый текст"
python3 edit.py caption 123 "Новая подпись"
python3 edit.py replace 123 new.jpg -c "Полная подпись"
python3 edit.py delete 123
python3 edit.py delete 123 124 125
python3 edit.py pin 123
python3 edit.py unpin 123
python3 edit.py history --limit 100
```

## Все методы бота и канала

```sh
python3 edit.py help getMyCommands
python3 edit.py call getMyCommands --params '{}'
python3 edit.py call setMyCommands --params '{"commands":[{"command":"news","description":"Новости"}]}'
python3 edit.py call setMyDescription --params '{"description":"Новости Канска"}'
python3 edit.py call sendPoll --params '{"question":"Ваш вариант?","options":[{"text":"Первый"},{"text":"Второй"}]}'
python3 edit.py call editMessageReplyMarkup --params '{"message_id":123,"reply_markup":{"inline_keyboard":[[{"text":"Подробнее","url":"https://example.org"}]]}}'
python3 edit.py call setChatPhoto --params '{"photo":"@/path/channel.jpg"}'
```

В `call` доступны все методы из каталога `GET https://edit-kansk-publisher.ivanfomin2003.chatgpt.site/api/command`. `chat_id` сервер подставляет сам. JSON параметров можно передать файлом: `--params @params.json`. Значение `"@/path/file"` внутри JSON означает прикрепить локальный файл. Команды покрывают публикации и медиа, правки, удаление, опросы, кнопки, реакции, закрепления, настройки и профиль бота, сведения/настройки канала, приглашения, участников, webhook и updates.

## HTTP без клиента

Endpoint: `https://edit-kansk-publisher.ivanfomin2003.chatgpt.site`.

```sh
EDIT_SERVER=https://edit-kansk-publisher.ivanfomin2003.chatgpt.site
curl -fsS "$EDIT_SERVER/api/command" -H 'Content-Type: application/json' --data '{"command":"check"}'
curl -fsS "$EDIT_SERVER/api/command" -H 'Content-Type: application/json' --data '{"command":"text","text":"Текст поста","key":"news-001"}'
curl -fsS "$EDIT_SERVER/api/upload" -F command=photo -F key=photo-001 -F 'file=@image.jpg' -F 'caption=Подпись'
curl -fsS "$EDIT_SERVER/api/upload" -F command=video -F key=video-001 -F 'file=@clip.mp4' -F 'caption=Подпись'
```

В примерах `$EDIT_SERVER` — указанный endpoint. Для альбома можно повторить поле `file`. Для больших альбомов клиент `edit.py` загружает файлы по отдельности и отправляет их одной командой. Фото — до 10 МБ, остальные файлы — до 50 МБ каждый; альбом — 2–10 файлов.

`POST /api/files` принимает байты файла. Заголовки `X-File-Name` (имя в URL-кодировке), `X-File-Size` и `Content-Type` описывают файл. Ответ содержит `file`, который используется в следующей команде. Это внутренний номер загрузки; внешний файловый хостинг не нужен. `GET /api/files?id=...` возвращает сведения, `/api/download?upload_id=...` скачивает загруженный файл, `/api/download?file_id=...` — файл Telegram через сервер.

## Результаты и повторы

Клиент выводит ключ перед командой и возвращает номер, ссылку, полный ответ Telegram и сведения о медиа. Сохраняйте результат для последующих правок.

```sh
python3 edit.py operation edit-KEY
python3 edit.py photo image.jpg -c "Подпись" --key edit-KEY
```

Повтор той же команды с тем же ключом возвращает прежний результат, не создавая дубль. При `pending` или `uncertain` сначала выясните результат в канале; новый ключ для повторной отправки не используйте. Загрузка файла сама по себе ничего не публикует.

`history` показывает команды этой системы. Полную старую историю канала Bot API читать не умеет. Telegram ограничивает удаление возрастом сообщения (обычно до 48 часов) и правами бота. Отсутствующие права сервер покажет в ответе Telegram; автоматически они не расширяются. Для обновлений `getUpdates` и webhook взаимоисключающие, `offset` подтверждает обработку обновлений.

При технической проверке не создавать постов и не менять существующие сообщения без отдельного поручения пользователя.

Документация Telegram: https://core.telegram.org/bots/api
