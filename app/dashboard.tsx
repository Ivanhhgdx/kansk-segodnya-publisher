"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, ChevronRight, Copy, Download, FilePlus2, RefreshCw, Send, Terminal, Paperclip, Trash2, X } from "lucide-react";
const CLOUD = "https://edit-kansk-publisher.ivanfomin2003.chatgpt.site";
function endpoint(path: string) { return (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname) ? "" : CLOUD) + path; }
const modes: Record<string, string> = { text: "Текст", photo: "Фото", video: "Видео", album: "Альбом", document: "Документ", audio: "Аудио", voice: "Голосовое", animation: "Анимация", edit: "Правка текста", caption: "Правка подписи", replace: "Замена вложения", delete: "Удаление", pin: "Закрепление", unpin: "Открепление" };
type Parameter = { name: string; type: string; required: boolean; description: string };
type Method = { method: string; readOnly: boolean; scope: string; description: string; parameters: Parameter[]; source: string };
type Operation = { operation_key: string; method: string; status: string; created_at: string; result: { url?: string; message_id?: number } | null };
type Connection = { connected: boolean; checked_at: string; rights?: Record<string, unknown> };
function date(value: string) { return new Date(value).toLocaleString("ru-RU", { timeZone: "Asia/Krasnoyarsk", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
function kind(file: File) { return file.type.startsWith("video/") || /\.(mp4|mov)$/i.test(file.name) ? "video" : file.type.startsWith("audio/") ? "audio" : file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name) ? "photo" : "document"; }
const quickStart = `curl -fsS https://ivanhhgdx.github.io/kansk-segodnya-publisher/edit.py -o edit.py\npython3 edit.py check\npython3 edit.py photo image.jpg -c "Подпись"\npython3 edit.py video clip.mp4 -c "Подпись"\npython3 edit.py text "Текст поста"`;
export default function Dashboard() {
  const [tab, setTab] = useState("compose"), [mode, setMode] = useState("text"), [text, setText] = useState(""), [post, setPost] = useState("");
  const [files, setFiles] = useState<File[]>([]), [html, setHtml] = useState(false), [silent, setSilent] = useState(false);
  const [key, setKey] = useState(""), [result, setResult] = useState<any>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(""), [checking, setChecking] = useState(false), [connection, setConnection] = useState<Connection | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]), [methods, setMethods] = useState<Method[]>([]), [search, setSearch] = useState(""), [expanded, setExpanded] = useState("");
  const [raw, setRaw] = useState('{\n  "command": "call",\n  "method": "getMyCommands",\n  "params": {}\n}'), [copied, setCopied] = useState(false);
  function reset() { setKey(`edit-${crypto.randomUUID()}`); setResult(null); setError(""); }
  async function load() {
    const response = await fetch(endpoint("/api/status")); const value = await response.json() as any;
    if (value.error) throw new Error(value.error);
    setConnection(value.connection); setOperations(value.operations || []);
  }
  useEffect(() => {
    reset(); load().catch(() => {});
    fetch(endpoint("/api/command")).then(r => r.json()).then((value: any) => setMethods(value.methods || [])).catch(() => {});
  }, []);
  async function check() {
    setChecking(true); setError("");
    try { const r = await fetch(endpoint("/api/command"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: "check" }) }); const v = await r.json() as any; if (!v.ok) throw new Error(v.error); setConnection(v.result); }
    catch (e) { setError((e as Error).message); } finally { setChecking(false); }
  }
  async function upload(file: File, index: number) {
    if (file.size > 50_000_000) throw new Error(`«${file.name}» превышает 50 МБ.`);
    setProgress(`Загружаем файл ${index + 1} из ${files.length}: ${file.name}`);
    const r = await fetch(endpoint("/api/files"), { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name), "X-File-Size": String(file.size) }, body: file });
    const v = await r.json() as any; if (!v.ok) throw new Error(v.error); return v.result.file as string;
  }
  async function execute(body: any) {
    setProgress("Выполняем команду…");
    if (!body.key && !body.operation_key && !["check", "history", "operation", "bot", "channel", "commands"].includes(body.command)) body.key = key;
    const r = await fetch(endpoint("/api/command"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const v = await r.json() as any; if (!v.ok) throw new Error(v.error); setResult(v.result); await load();
  }
  const media = ["photo", "video", "album", "document", "audio", "voice", "animation", "replace"].includes(mode);
  const hasId = ["edit", "caption", "replace", "delete", "pin", "unpin"].includes(mode);
  const hasText = !["delete", "pin", "unpin"].includes(mode);
  const caption = !["text", "edit"].includes(mode);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const body: any = { command: mode, key };
      if (hasId) {
        const ids = post.split(/[,\s]+/).filter(Boolean).map(Number);
        if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0) || mode !== "delete" && ids.length !== 1) throw new Error("Укажите корректный номер поста.");
        if (mode === "delete" && ids.length > 1) body.ids = ids; else body.id = ids[0];
      }
      if (hasText) body[caption ? "caption" : "text"] = text;
      if (media) {
        if (!files.length || mode !== "album" && files.length !== 1 || mode === "album" && (files.length < 2 || files.length > 10)) throw new Error(mode === "album" ? "Прикрепите от 2 до 10 файлов." : "Прикрепите один файл.");
        const uploaded = []; for (let i = 0; i < files.length; i++) uploaded.push({ type: kind(files[i]), file: await upload(files[i], i) });
        if (mode === "album") body.files = uploaded; else { body.file = uploaded[0].file; if (mode === "replace") body.kind = uploaded[0].type; }
      }
      if (html && hasText) body.parse_mode = "HTML";
      if (silent && !hasId) body.silent = true;
      await execute(body);
    } catch (e) { setError((e as Error).message || "Ответ не получен. Проверьте операцию по сохранённому ключу перед повтором."); }
    finally { setBusy(false); setProgress(""); }
  }
  async function submitRaw(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try { await execute(JSON.parse(raw)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); setProgress(""); }
  }
  async function copy() { await navigator.clipboard.writeText(quickStart); setCopied(true); setTimeout(() => setCopied(false), 1800); }
  function selectMethod(method: Method) {
    const params: Record<string, unknown> = {};
    for (const p of method.parameters.filter(p => p.required && !["chat_id", "user_id"].includes(p.name))) params[p.name] = p.type.includes("Array") ? [] : p.type.includes("Integer") ? 123 : p.type.includes("Boolean") ? true : "";
    setRaw(JSON.stringify({ command: "call", method: method.method, params }, null, 2)); setTab("terminal"); reset();
  }
  const matching = methods.filter(m => `${m.method} ${m.description}`.toLowerCase().includes(search.toLowerCase()));
  const resultLink = result?.url || result?.result?.url;
  return <main className="workspace">
    <header className="topbar"><a className="brand" href="#"><span className="brand-icon"><Terminal size={21}/></span><span>Канск Сегодня<small>РЕДАКТОР КАНАЛА</small></span></a><a className="channel" href="https://t.me/kansk_segodnya" target="_blank" rel="noreferrer">@kansk_segodnya <ArrowUpRight size={14}/></a></header>
    <section className="title-row"><div><div className="overline">УПРАВЛЕНИЕ ПУБЛИКАЦИЯМИ</div><h1>Одна команда.<br/><span>Текст, фото или видео.</span></h1></div><div className="connection"><span className={connection?.connected ? "dot ready" : "dot"}/><div><strong>{connection?.connected ? "Telegram подключён" : "Проверить Telegram"}</strong><small>{connection?.checked_at ? date(connection.checked_at) : "Бот редактора канала"}</small></div><button onClick={check} disabled={checking} title="Проверить соединение" aria-label="Проверить соединение"><RefreshCw size={16} className={checking ? "spin" : ""}/></button></div></section>
    <section className="start-card"><div className="start-heading"><div><Terminal size={17}/><strong>Начало работы для агента</strong></div><button onClick={copy}><Copy size={14}/>{copied ? "Скопировано" : "Скопировать"}</button></div><pre>{quickStart}</pre><div className="start-links"><a href="./edit.py" download><Download size={14}/>Клиент edit.py</a><a href="./agent.md" target="_blank" rel="noreferrer">Инструкция <ArrowUpRight size={14}/></a><a href={`${CLOUD}/api/command`} target="_blank" rel="noreferrer">Каталог API <ArrowUpRight size={14}/></a></div></section>
    <nav className="tabs" aria-label="Разделы редактора">{[["compose","Создать или изменить"],["methods","Все команды"],["terminal","JSON-команда"],["history","Журнал"]].map(([id,label]) => <button key={id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>{label}{id === "methods" && methods.length > 0 && <span>{methods.length}</span>}</button>)}</nav>
    {tab === "compose" && <section className="panel"><form onSubmit={submit}>
      <div className="form-top"><label>Действие<select value={mode} disabled={busy} onChange={e => { setMode(e.target.value); setFiles([]); reset(); }}>{Object.entries(modes).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>{hasId && <label>{mode === "delete" ? "Номера постов через запятую" : "Номер поста"}<input value={post} onChange={e => setPost(e.target.value)} placeholder="123" required/></label>}</div>
      {media && <div className="attachment"><label className="file-picker"><input type="file" multiple={mode === "album"} accept={mode === "photo" ? "image/*" : mode === "video" ? "video/*" : mode === "album" || mode === "replace" ? "image/*,video/*" : undefined} onChange={e => setFiles(Array.from(e.target.files || []))} disabled={busy}/><span className="upload-icon"><FilePlus2 size={25}/></span><strong>{mode === "album" ? "Прикрепить файлы альбома" : "Прикрепить файл"}</strong><small>Выберите файл на своём компьютере</small></label>{files.length > 0 && <ul className="file-list">{files.map((file,i) => <li key={`${file.name}-${i}`}><Paperclip size={15}/><span>{file.name}<small>{(file.size / 1_000_000).toFixed(2)} МБ</small></span><button type="button" onClick={() => setFiles(files.filter((_,n) => n !== i))} disabled={busy} aria-label={`Убрать ${file.name}`}><X size={15}/></button></li>)}</ul>}</div>}
      {hasText && <label>{caption ? "Подпись" : "Текст"}<textarea value={text} onChange={e => setText(e.target.value)} rows={6} required={!caption} maxLength={caption ? 1024 : 4096} placeholder={caption ? "Подпись к публикации" : "Текст публикации"}/></label>}
      <div className="options">{hasText && <label><input type="checkbox" checked={html} onChange={e => setHtml(e.target.checked)}/>HTML</label>}{!hasId && <label><input type="checkbox" checked={silent} onChange={e => setSilent(e.target.checked)}/>Без уведомления</label>}</div>
      <div className="actions"><button className={mode === "delete" ? "primary danger" : "primary"} disabled={busy || !key}>{mode === "delete" ? <Trash2 size={16}/> : <Send size={16}/>} {busy ? progress || "Выполняем…" : mode === "delete" ? "Удалить" : hasId ? "Выполнить" : "Опубликовать"}</button><button type="button" className="secondary" onClick={reset} disabled={busy}>Новая команда</button></div>
    </form></section>}
    {tab === "methods" && <section className="panel"><div className="catalog-top"><h2>Методы канала и бота</h2><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Найти: удалить, опрос, getMyCommands…" aria-label="Найти команду"/></div><div className="catalog">{matching.map(method => <article key={method.method} className="method"><button className="method-heading" onClick={() => setExpanded(expanded === method.method ? "" : method.method)}><span><code>{method.method}</code><small>{method.description}</small></span><ChevronRight size={17} className={expanded === method.method ? "rotated" : ""}/></button>{expanded === method.method && <div className="method-body"><div className="parameter-list">{method.parameters.filter(p => p.name !== "chat_id").map(p => <div key={p.name}><code>{p.name}{p.required && " *"}</code><span>{p.type.replace(/\[([^\]]+)\]\([^)]+\)/g,"$1")}</span><p>{p.description}</p></div>)}</div><div className="method-actions"><button className="secondary" onClick={() => selectMethod(method)}>Подготовить команду</button><a href={method.source} target="_blank" rel="noreferrer">Документация <ArrowUpRight size={14}/></a></div></div>}</article>)}</div>{!matching.length && <p className="muted">Команды не найдены.</p>}</section>}
    {tab === "terminal" && <section className="panel"><h2>JSON-команда</h2><form onSubmit={submitRaw}><textarea className="json-editor" value={raw} onChange={e => setRaw(e.target.value)} rows={12} spellCheck={false} aria-label="JSON-команда"/><div className="actions"><button className="primary" disabled={busy || !key}><Send size={16}/>{busy ? "Выполняем…" : "Выполнить команду"}</button><button type="button" className="secondary" onClick={reset} disabled={busy}>Новый ключ</button></div></form></section>}
    {tab === "history" && <section className="panel"><div className="section-heading"><h2>Последние команды</h2><button className="secondary" onClick={() => load().catch(e => setError(e.message))}><RefreshCw size={14}/>Обновить</button></div>{operations.length ? <div className="operation-list">{operations.map(op => <article className="operation" key={op.operation_key}><div><code>{op.method}</code><small>{date(op.created_at)} · {op.operation_key}</small></div><span className={`state ${op.status}`}>{{done:"Выполнено",pending:"Ожидает ответа",uncertain:"Проверьте результат",rejected:"Отклонено"}[op.status] || op.status}</span>{op.result?.url && <a href={op.result.url} target="_blank" rel="noreferrer"><ArrowUpRight size={17}/></a>}</article>)}</div> : <div className="empty"><Terminal size={25}/><h3>Команд пока нет</h3><p>Здесь сохраняются результаты отправленных команд.</p></div>}</section>}
    {error && <div className="notice error" role="alert">{error}<small>Ключ: {key}</small></div>}
    {result && <section className="notice success" role="status"><div className="result-title"><Check size={18}/><strong>{result.status === "done" ? result.repeated ? "Команда уже выполнена" : "Команда выполнена" : "Ответ получен"}</strong>{resultLink && <a href={resultLink} target="_blank" rel="noreferrer">Открыть пост <ArrowUpRight size={14}/></a>}</div>{result.messages?.length > 1 && <div className="album-links">{result.messages.map((m:any) => <a key={m.message_id} href={m.url} target="_blank" rel="noreferrer">Пост №{m.message_id}</a>)}</div>}<details><summary>Результат команды</summary><pre>{JSON.stringify(result,null,2)}</pre></details></section>}
    <footer><span>Канск Сегодня · Редактор</span><div><a href="https://github.com/Ivanhhgdx/kansk-segodnya-publisher" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={12}/></a><a href="./agent.md" target="_blank" rel="noreferrer">Инструкция <ArrowUpRight size={12}/></a></div></footer>
  </main>;
}
