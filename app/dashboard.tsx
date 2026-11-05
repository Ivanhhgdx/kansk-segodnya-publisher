"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, Cloud, RefreshCw, Globe, Radio, FileText, Pencil, CircleAlert, Send } from "lucide-react";

const CLOUD = "https://edit-kansk-publisher.ivanfomin2003.chatgpt.site";
function endpoint(path: string) { return (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname) ? "" : CLOUD) + path; }
function time(value: string) { return new Date(value).toLocaleString("ru-RU", { timeZone: "Asia/Krasnoyarsk", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); }
const labels: Record<string, string> = { sendMessage: "Текстовая публикация", sendPhoto: "Публикация фото", sendVideo: "Публикация видео", editMessageText: "Изменение текста", editMessageCaption: "Изменение подписи", editMessageMedia: "Замена вложения" };
const statuses: Record<string, string> = { done: "Выполнено", pending: "Ожидает ответа", uncertain: "Нужна проверка", rejected: "Отклонено" };
type Operation = { operation_key: string; method: string; status: string; created_at: string; result: { url?: string } | null };
type Status = { connection?: { connected: boolean; checked_at: string } | null; operations?: Operation[]; error?: string };
type Result = { operation_key?: string; message_id?: number; url?: string; status?: string; repeated?: boolean; result?: { url?: string } | null; error?: string };
function newKey() { return `web-${crypto.randomUUID()}`; }
export default function Dashboard() {
  const [data, setData] = useState<Status | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [action, setAction] = useState("telegram_publish_text"), [text, setText] = useState(""), [key, setKey] = useState("");
  const [messageId, setMessageId] = useState(""), [kind, setKind] = useState("photo"), [media, setMedia] = useState("");
  const [html, setHtml] = useState(false), [silent, setSilent] = useState(false), [sending, setSending] = useState(false), [result, setResult] = useState<Result | null>(null);
  const editing = action.startsWith("telegram_edit_"), withMedia = action.endsWith("media"), withText = action !== "telegram_get_operation", caption = action.endsWith("caption") || withMedia;
  async function load() { const r = await fetch(endpoint("/api/status")); const body = await r.json() as Status; if (body.error) setError(body.error); else setData(body); }
  useEffect(() => { setKey(newKey()); load().catch(() => setError("Не удалось загрузить состояние подключения.")); }, []);
  async function check() {
    setBusy(true); setError("");
    try { const r = await fetch(endpoint("/api/check"), { method: "POST" }); const body = await r.json() as Status; if (body.error) setError(body.error); else await load(); }
    catch { setError("Ответ не получен. Проверку связи можно повторить."); } finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSending(true); setResult(null);
    const args: Record<string, unknown> = { operation_key: key };
    if (editing) args.message_id = Number(messageId);
    if (withText) { args[caption ? "caption" : "text"] = text; if (html) args.parse_mode = "HTML"; }
    if (withMedia) { args.kind = kind; args.media_ref = media; }
    if (action.startsWith("telegram_publish_")) args.silent = silent;
    try {
      const response = await fetch(endpoint("/api/command"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, arguments: args }) });
      const body = await response.json() as { ok: boolean; result?: Result; error?: string };
      setResult(body.ok ? body.result ?? {} : { error: body.error ?? "Операция не подтверждена." });
    } catch { setResult({ error: "Ответ не получен. Проверьте результат с этим же ключом операции, прежде чем отправлять снова." }); }
    finally { setSending(false); load().catch(() => {}); }
  }
  const connected = data?.connection?.connected === true;
  const resultUrl = result?.url || result?.result?.url;
  return <main className="edit-shell">
    <header className="edit-header"><a href="#" className="edit-wordmark"><span className="edit-symbol">e<span>·</span></span><span>Edit<span className="wordmark-note">КАНСК СЕГОДНЯ</span></span></a><div className="private-note"><Globe size={15} /> Общий доступ · без входа</div></header>
    <section className="edit-intro"><div><div className="eyebrow"><span /> ОБЛАЧНЫЙ РЕДАКТОР</div><h1>Открыли.<br /><span>Опубликовали.</span></h1><p className="intro-copy">Команды для канала «Канск Сегодня».<br />Без входа, плагина и включённого Mac.</p></div><div className="edit-orbit" aria-hidden="true"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-core">e<span>·</span></div><div className="orbit-dot" /></div></section>
    <section className="edit-grid"><article className="connection-card"><div className="card-label">ВАШ КАНАЛ <Radio size={17} /></div><h2>Канск Сегодня<span>Новости</span></h2><a className="channel-link" href="https://t.me/kansk_segodnya" target="_blank" rel="noreferrer">@kansk_segodnya <ArrowUpRight size={16} /></a><div className="connection-divider" /><div className="connection-status"><span className={connected ? "status-dot connected" : "status-dot"} /><strong>{connected ? "Связь подтверждена" : "Связь ещё не проверена"}</strong></div><p className="connection-detail">{connected ? `Проверено ${time(data?.connection?.checked_at ?? "")}` : "Проверьте сохранённый доступ к Telegram."}</p><button className="check-button" onClick={check} disabled={busy}><RefreshCw size={16} className={busy ? "spinning" : ""} />{busy ? "Проверяем связь…" : "Проверить связь"}</button>{error && <div className="error-note" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}<p className="quiet-note">Проверка ничего не публикует.</p></article>
      <article className="details-card"><div className="card-label">КАК ЭТО РАБОТАЕТ <Cloud size={17} /></div><div className="feature-row"><div className="feature-icon"><Cloud size={20} /></div><div><h3>Исполняется в облаке</h3><p>Сервер отправляет команды в Telegram.<br className="desktop-br" /> Mac можно выключить.</p></div></div><div className="feature-row"><div className="feature-icon"><Globe size={20} /></div><div><h3>Доступно всем</h3><p>Публикации и правки без регистрации,<br className="desktop-br" /> паролей и подключения плагина.</p></div></div><div className="feature-row"><div className="feature-icon"><Check size={20} /></div><div><h3>Результат сохраняется</h3><p>Пост получает номер и ссылку.<br className="desktop-br" /> Повтор с тем же ключом не создаёт дубль.</p></div></div></article></section>
    <section className="command-card"><div className="activity-heading"><h2>Команда для канала</h2><span>Публикация и редактирование</span></div>
      <form onSubmit={submit} className="command-form">
        <label>Действие<select value={action} disabled={sending} onChange={e => { setAction(e.target.value); setResult(null); }}><option value="telegram_publish_text">Опубликовать текст</option><option value="telegram_publish_media">Опубликовать фото или видео</option><option value="telegram_edit_text">Изменить текст поста</option><option value="telegram_edit_caption">Изменить подпись</option><option value="telegram_edit_media">Заменить фото или видео</option><option value="telegram_get_operation">Проверить результат по ключу</option></select></label>
        <div className="form-columns"><label>Ключ операции<input value={key} onChange={e => setKey(e.target.value)} required maxLength={120} /></label>{editing && <label>Номер поста<input type="number" min="1" step="1" value={messageId} onChange={e => setMessageId(e.target.value)} required /></label>}</div>
        {withMedia && <div className="form-columns"><label>Вложение<select value={kind} onChange={e => setKind(e.target.value)}><option value="photo">Фото</option><option value="video">Видео</option></select></label><label>Прямая HTTPS-ссылка или file_id<input value={media} onChange={e => setMedia(e.target.value)} required maxLength={4096} /></label></div>}
        {withText && <label>{caption ? "Полная подпись" : "Текст поста"}<textarea value={text} onChange={e => setText(e.target.value)} required={!caption} maxLength={caption ? 1024 : 4096} rows={6} placeholder={caption ? "Пустая строка — без подписи" : "Введите текст публикации"} /></label>}
        {withText && <div className="form-options"><label><input type="checkbox" checked={html} onChange={e => setHtml(e.target.checked)} />Разметка HTML</label>{!editing && <label><input type="checkbox" checked={silent} onChange={e => setSilent(e.target.checked)} />Без уведомления</label>}</div>}
        <div className="form-actions"><button type="submit" className="publish-button" disabled={sending || !key}><Send size={16} />{sending ? "Выполняем…" : action === "telegram_get_operation" ? "Проверить результат" : editing ? "Сохранить правку" : "Опубликовать"}</button><button type="button" className="new-operation" disabled={sending} onClick={() => { setKey(newKey()); setResult(null); }}>Новая операция</button></div>
        <p className="form-hint">Сохраняйте ключ до получения результата. При обрыве связи сначала проверьте операцию с тем же ключом.</p>
        {result && <div className={result.error ? "command-result failed" : "command-result"} role="status">{result.error ? result.error : <><strong>{result.status === "done" ? result.repeated ? "Уже выполнено — повторной отправки нет" : "Готово" : `Состояние: ${result.status || "получено"}`}</strong>{result.message_id && <span>Пост №{result.message_id}</span>}{resultUrl && <a href={resultUrl} target="_blank" rel="noreferrer">Открыть пост <ArrowUpRight size={14} /></a>}</>}</div>}
      </form>
    </section>
    <details className="agent-instructions"><summary>Команды для Edit</summary><p>Передайте Edit ссылку на эту страницу. Она может работать через форму либо отправлять JSON на открытый адрес ниже. Токен и плагин не нужны.</p><a href={`${CLOUD}/api/command`} target="_blank" rel="noreferrer">Инструкция и полный список команд <ArrowUpRight size={14} /></a><pre>{`POST ${CLOUD}/api/command\nContent-Type: application/json\n\n{"action":"telegram_check_connection","arguments":{}}`}</pre><p>Если среда Edit не разрешает этот домен, потребуется штатное разрешение платформы на доступ к нему. Сам сайт сетевые ограничения Edit не меняет.</p></details>
    <section className="activity"><div className="activity-heading"><h2>Последние действия</h2><span>Общий облачный журнал</span></div>{data?.operations?.length ? <div className="activity-list">{data.operations.map(op => <div className="activity-row" key={op.operation_key}><div className="activity-icon">{op.method.startsWith("edit") ? <Pencil size={18} /> : <FileText size={18} />}</div><div className="activity-title"><strong>{labels[op.method] || op.method}</strong><span>{time(op.created_at)} · {op.operation_key}</span></div><span className={`operation-status ${op.status}`}>{statuses[op.status] || op.status}</span>{op.result?.url && <a href={op.result.url} target="_blank" rel="noreferrer" aria-label="Открыть пост"><ArrowUpRight size={18} /></a>}</div>)}</div> : <div className="empty-activity"><FileText size={26} /><h3>Здесь появятся публикации</h3><p>В журнале сохранятся ссылка на пост<br />и результат каждой операции.</p></div>}</section>
    <footer className="edit-footer"><span>Edit / Канск Сегодня</span><a href="https://github.com/Ivanhhgdx/kansk-segodnya-publisher" target="_blank" rel="noreferrer">Проект на GitHub ↗</a><span>Официальный Telegram Bot API</span></footer>
  </main>;
}
