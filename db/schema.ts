import { sqliteTable, text } from "drizzle-orm/sqlite-core";
export const operations = sqliteTable("operations", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  operationKey: text("operation_key").notNull(), method: text("method").notNull(),
  fingerprint: text("fingerprint").notNull(), status: text("status").notNull(),
  resultJson: text("result_json"), createdAt: text("created_at").notNull(), finishedAt: text("finished_at"),
});
export const connectionState = sqliteTable("connection_state", {
  id: text("id").primaryKey(), valueJson: text("value_json").notNull(), updatedAt: text("updated_at").notNull(),
});
