# Канск Сегодня — команды агента

Система публикации и управления каналом `@kansk_segodnya` через официальный Telegram Bot API.

- [Сайт](https://ivanhhgdx.github.io/kansk-segodnya-publisher/)
- [Инструкция для агента](https://ivanhhgdx.github.io/kansk-segodnya-publisher/agent.md)
- [Клиент edit.py](https://ivanhhgdx.github.io/kansk-segodnya-publisher/edit.py)
- [Каталог команд и методов](https://edit-kansk-publisher.ivanfomin2003.chatgpt.site/api/command)

## Команды

```sh
curl -fsS https://ivanhhgdx.github.io/kansk-segodnya-publisher/edit.py -o edit.py
python3 edit.py check
python3 edit.py text "Текст поста"
python3 edit.py photo image.jpg -c "Подпись"
python3 edit.py video clip.mp4 -c "Подпись"
python3 edit.py album first.jpg second.jpg clip.mp4 -c "Подпись"
python3 edit.py document report.pdf
python3 edit.py edit 123 "Новый текст"
python3 edit.py caption 123 "Новая подпись"
python3 edit.py replace 123 new.jpg -c "Полная подпись"
python3 edit.py delete 123 124
python3 edit.py pin 123
python3 edit.py history
python3 edit.py help setMyCommands
python3 edit.py call getMyCommands --params '{}'
```

Клиент прикрепляет обычные локальные файлы самостоятельно. Внешний файловый хостинг не требуется. Для остальных методов используется `call METHOD --params JSON`; внутри JSON строка `"@/path/file"` прикрепляет файл. `chat_id` подставляется сервером.

`GET /api/command` возвращает короткие команды и полный каталог методов с обязательными/допустимыми параметрами и ссылками на документацию Telegram. Команды охватывают тексты, фото, видео, альбомы, документы, аудио, голосовые, анимации, правки, удаление, закрепления, опросы, кнопки, реакции, настройки/профиль/команды бота, настройки/участников/приглашения канала и получение обновлений.

## HTTP

Сервер: `https://edit-kansk-publisher.ivanfomin2003.chatgpt.site`.

```http
POST /api/command
Content-Type: application/json

{"command":"check"}
```

Для непосредственной загрузки и отправки: `POST /api/upload`, multipart/form-data, поля `command=photo` (или video/album/document…), `key`, `caption`, `file`. Поле `file` можно повторить для альбома.

`POST /api/files` принимает байты отдельного файла. Заголовки: `Content-Type`, `X-File-Name` (имя в URL-кодировке), `X-File-Size`. Полученный `file` используется в команде; клиент выполняет эти шаги сам. Файлы сохраняются в R2, метаданные — в D1. Доступно скачивание через `/api/download?upload_id=...` или `?file_id=...`, без раскрытия служебной ссылки Telegram.

## Результаты

Система возвращает номер/ссылку поста, полный результат Telegram и сведения о вложениях; для альбомов возвращает все номера. У каждой изменяющей команды свой `operation_key`. Клиент генерирует его и выводит перед отправкой. Повтор одинаковой команды с тем же ключом возвращает прежний результат. SHA-256 файла позволяет узнавать одинаковый файл при повторной загрузке.

После потери ответа сначала проверяется `operation KEY`. Состояния `pending` и `uncertain` нельзя обходить новым ключом до выяснения результата в канале. Автоматического повтора изменяющих запросов нет. Журнал хранится в D1 и не зависит от запуска клиента.

Ограничения Telegram сохраняются: фото до 10 МБ, остальные файлы до 50 МБ каждый, альбом 2–10 вложений. Удаление обычно возможно до 48 часов и зависит от прав бота. История этой системы содержит её команды; полной старой истории канала Bot API не предоставляет. `getUpdates` и webhook взаимоисключающие; `offset` подтверждает обработку обновлений. Права бота автоматически не расширяются.

## Разработка

```sh
npm ci
npx tsc --noEmit
node --test tests/*.test.mjs
npm run build:pages
npm run dev
```

Интерфейс — `app/dashboard.tsx`, сборка GitHub Pages — `github-pages/main.tsx` → `docs/` (main:/docs). Worker размещается через Sites с имеющимся `.openai/hosting.json`; сохранять project_id, D1-журнал и R2-файлы. Изменения схемы — новыми миграциями Drizzle. Серверный `TELEGRAM_BOT_TOKEN` задаётся в окружении размещения и не включается в исходники, ответы или клиентскую сборку.

Проверки подключения не должны создавать тестовых постов или менять существующие сообщения без отдельного поручения.

[Документация Telegram](https://core.telegram.org/bots/api)
