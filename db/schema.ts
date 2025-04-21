import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Categories table
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey().notNull(),
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#3b82f6'), // Default blue color
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

// Projects table
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  description: text('description'),
  emoji: text('emoji').default('📊'), // Default emoji - chart/analytics
  currency: text('currency').notNull().default('USD'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

// Members table
export const members = sqliteTable('members', {
  id: text('id').primaryKey().notNull(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

// Payment Methods table
export const paymentMethods = sqliteTable('payment_methods', {
  id: text('id').primaryKey().notNull(),
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('💳'), // Default card icon
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

// Expenses table
export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey().notNull(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  amount: real('amount').notNull(),
  date: integer('date', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  splitType: text('split_type').notNull(), // 'amount', 'shares', 'percent', 'even'
  categoryId: text('category_id').references(() => categories.id),
  paymentMethodId: text('payment_method_id').references(() => paymentMethods.id),
  notes: text('notes'), // Optional notes field for expense memos
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

// Payments table (who paid for the expense)
export const payments = sqliteTable('payments', {
  id: text('id').primaryKey().notNull(),
  expenseId: text('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
  memberId: text('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
});

// Splits table (who owes what)
export const splits = sqliteTable('splits', {
  id: text('id').primaryKey().notNull(),
  expenseId: text('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
  memberId: text('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  // For different split types:
  amount: real('amount'), // For 'amount' split type
  shares: integer('shares'), // For 'shares' split type
  percent: real('percent'), // For 'percent' split type
  // The calculated amount the member owes
  owedAmount: real('owed_amount').notNull(),
});
