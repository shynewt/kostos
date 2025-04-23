import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey().notNull(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  emoji: text("emoji").default("📊"),
  currency: text("currency").notNull().default("USD"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const members = sqliteTable("members", {
  id: text("id").primaryKey().notNull(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const paymentMethods = sqliteTable("payment_methods", {
  id: text("id").primaryKey().notNull(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("💳"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const expenses = sqliteTable("expenses", {
  id: text("id").primaryKey().notNull(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  date: integer("date", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
  splitType: text("split_type").notNull(),
  categoryId: text("category_id").references(() => categories.id),
  paymentMethodId: text("payment_method_id").references(() => paymentMethods.id),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey().notNull(),
  expenseId: text("expense_id")
    .notNull()
    .references(() => expenses.id, { onDelete: "cascade" }),
  memberId: text("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
});

export const splits = sqliteTable("splits", {
  id: text("id").primaryKey().notNull(),
  expenseId: text("expense_id")
    .notNull()
    .references(() => expenses.id, { onDelete: "cascade" }),
  memberId: text("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  amount: real("amount"),
  shares: integer("shares"),
  percent: real("percent"),
  owedAmount: real("owed_amount").notNull(),
});
