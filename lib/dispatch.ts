import { Publisher, PublisherError, PUBLIC_CALLER, type PublisherEnv } from "./telegram";
import { TOOLS } from "./tools";
export async function dispatchTool(settings: PublisherEnv, name: unknown, args: unknown = {}) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) throw new PublisherError("Неизвестная команда.");
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new PublisherError("Параметры должны быть объектом.");
  const values = args as Record<string, unknown>;
  if (Object.keys(values).some(k => !Object.hasOwn(tool.inputSchema.properties, k))) throw new PublisherError("Недопустимые параметры команды.");
  for (const key of tool.inputSchema.required) if (!Object.hasOwn(values, key)) throw new PublisherError(`Не заполнено поле «${key}».`);
  const publisher = new Publisher(settings);
  if (name === "telegram_check_connection") return publisher.check();
  if (name === "telegram_list_operations") return { operations: await publisher.recent(PUBLIC_CALLER) };
  if (name === "telegram_get_operation") {
    if (typeof values.operation_key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(values.operation_key)) throw new PublisherError("Неверный ключ операции.");
    return publisher.operation(PUBLIC_CALLER, values.operation_key);
  }
  return publisher.execute(PUBLIC_CALLER, String(name), values);
}
