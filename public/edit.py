#!/usr/bin/env python3
"""Команды для канала Канск Сегодня. Требуются Python 3 и curl."""
import argparse
import json
import mimetypes
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import quote
import uuid

SERVER = os.environ.get('EDIT_API', 'https://edit-kansk-publisher.ivanfomin2003.chatgpt.site').rstrip('/')

def request(path, body=None, file=None, output=None):
    command = ['curl', '--silent', '--show-error', '--fail-with-body', '--max-time', '240', SERVER + path]
    data = None
    if file:
        command += ['--header', 'Content-Type: ' + (mimetypes.guess_type(str(file))[0] or 'application/octet-stream'), '--header', 'X-File-Name: ' + quote(file.name), '--header', 'X-File-Size: ' + str(file.stat().st_size), '--data-binary', '@' + str(file)]
    elif body is not None:
        command += ['--header', 'Content-Type: application/json', '--data-binary', '@-']
        data = json.dumps(body, ensure_ascii=False).encode()
    if output: command += ['--output', str(output)]
    result = subprocess.run(command, input=data, capture_output=True)
    if output:
        if result.returncode: raise RuntimeError(result.stderr.decode(errors='replace').strip() or 'Не удалось скачать файл')
        return {'saved': str(output)}
    try: value = json.loads(result.stdout)
    except (ValueError, UnicodeDecodeError): raise RuntimeError(result.stderr.decode(errors='replace').strip() or 'Сервер вернул не JSON. Проверьте доступ к его домену.')
    if result.returncode or value.get('ok') is False: raise RuntimeError(value.get('error') or result.stderr.decode(errors='replace').strip() or 'Команда не выполнена')
    return value.get('result', value)

def upload(path):
    path = Path(path).expanduser().resolve()
    if not path.is_file(): raise RuntimeError('Файл не найден: ' + str(path))
    if not 0 < path.stat().st_size <= 50_000_000: raise RuntimeError('Размер файла должен быть от 1 байта до 50 МБ')
    return request('/api/files', file=path)['file']

def attachment(value):
    if value.startswith(('upload:', 'https://')): return value
    return upload(value)

def parse_json(value):
    return json.loads(Path(value[1:]).read_text() if value.startswith('@') else value)

def attach_params(value):
    if isinstance(value, str) and value.startswith('@'): return upload(value[1:])
    if isinstance(value, list): return [attach_params(v) for v in value]
    if isinstance(value, dict): return {k: attach_params(v) for k,v in value.items()}
    return value

def main():
    parser = argparse.ArgumentParser(description='Публикация и управление каналом Канск Сегодня', epilog='Примеры: photo file.jpg -c "Подпись"; video clip.mp4; album 1.jpg 2.jpg; edit 123 "Текст"; delete 123; call getMyDescription --params "{}"')
    parser.add_argument('command', help='check, text, photo, video, album, document, audio, voice, animation, video_note, sticker, edit, caption, replace, delete, pin, unpin, unpin_all, history, operation, bot, channel, commands, call, upload, download, help')
    parser.add_argument('items', nargs='*')
    parser.add_argument('-c', '--caption', default='')
    parser.add_argument('--key', help='Сохранить тот же ключ при повторной отправке команды')
    parser.add_argument('--html', action='store_true')
    parser.add_argument('--silent', action='store_true')
    parser.add_argument('--params', default='{}', help='JSON параметров или @params.json. Внутри JSON: "@/path/file" прикрепляет файл.')
    parser.add_argument('--text-file', help='Прочитать текст из UTF-8 файла')
    parser.add_argument('--out', help='Куда сохранить скачанный файл')
    parser.add_argument('--limit', type=int, default=20)
    args = parser.parse_args()
    c, items = args.command, args.items
    if c == 'help':
        if not items: parser.print_help(); return
        catalog = request('/api/command')
        found = [m for m in catalog['methods'] if m['method'].lower() == items[0].lower()]
        print(json.dumps(found or catalog, ensure_ascii=False, indent=2)); return
    if c == 'upload':
        if len(items) != 1: parser.error('upload: нужен путь файла')
        print(json.dumps({'file': upload(items[0])}, ensure_ascii=False)); return
    if c == 'download':
        if len(items) != 1 or not args.out: parser.error('download: нужен file_id или upload:ID и --out путь')
        out = Path(args.out).expanduser()
        if out.exists(): raise RuntimeError('Файл назначения уже существует: ' + str(out))
        field = 'upload_id' if items[0].startswith('upload:') else 'file_id'
        print(json.dumps(request('/api/download?' + field + '=' + quote(items[0]), output=out), ensure_ascii=False)); return
    body = {'command': c}
    params = parse_json(args.params)
    if params: body['params'] = attach_params(params)
    if c in ['text', 'edit', 'caption']:
        if c in ['edit', 'caption']:
            if not items: parser.error(c + ': нужен номер поста')
            body['id'] = int(items.pop(0))
        text = Path(args.text_file).read_text() if args.text_file else ' '.join(items)
        if text == '-': text = sys.stdin.read()
        body['text' if c != 'caption' else 'caption'] = text
    elif c in ['photo', 'video', 'document', 'audio', 'voice', 'animation', 'video_note', 'sticker', 'replace']:
        if c == 'replace':
            if not items: parser.error('replace: нужен номер поста и файл')
            body['id'] = int(items.pop(0))
        if len(items) != 1: parser.error(c + ': нужен один файл')
        body['file'] = attachment(items[0]); body['caption'] = args.caption
        if c == 'replace': body['kind'] = 'video' if (mimetypes.guess_type(items[0])[0] or '').startswith('video/') else 'photo'
    elif c == 'album':
        if not 2 <= len(items) <= 10: parser.error('album: от 2 до 10 файлов')
        body['files'] = [{'type': 'video' if (mimetypes.guess_type(p)[0] or '').startswith('video/') else 'audio' if (mimetypes.guess_type(p)[0] or '').startswith('audio/') else 'photo' if (mimetypes.guess_type(p)[0] or '').startswith('image/') else 'document', 'file': attachment(p)} for p in items]
        body['caption'] = args.caption
    elif c == 'delete':
        if not items: parser.error('delete: нужен хотя бы один номер поста')
        if len(items) == 1: body['id'] = int(items[0])
        else: body['ids'] = [int(i) for i in items]
    elif c in ['pin', 'unpin', 'copy', 'forward', 'stop_poll']:
        if items: body['id'] = int(items[0])
        elif c != 'unpin': parser.error(c + ': нужен номер поста')
    elif c == 'operation':
        if len(items) != 1: parser.error('operation: нужен ключ команды')
        body['key'] = items[0]
    elif c == 'history': body['limit'] = args.limit
    elif c == 'call':
        if len(items) != 1: parser.error('call: нужен метод, например getMyDescription')
        body['method'] = items[0]
    elif items: parser.error('Неожиданные аргументы. Для полного Bot API используйте call METHOD --params JSON')
    if args.html: body['parse_mode'] = 'HTML'
    if args.silent: body['silent'] = True
    if c not in ['check', 'history', 'operation', 'bot', 'channel', 'commands']:
        body['key'] = args.key or 'edit-' + uuid.uuid4().hex
        print(json.dumps({'operation_key': body['key']}, ensure_ascii=False), file=sys.stderr, flush=True)
    print(json.dumps(request('/api/command', body), ensure_ascii=False, indent=2))

if __name__ == '__main__':
    try: main()
    except (RuntimeError, ValueError, OSError) as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
