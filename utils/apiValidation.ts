import { db, schema } from '../db'
import { eq } from 'drizzle-orm'

export const MAX_NAME_LENGTH = 120
export const MAX_DESCRIPTION_LENGTH = 240
export const MAX_NOTES_LENGTH = 2_000
export const MAX_IMPORT_EXPENSES = 5_000
export const MONEY_EPSILON = 0.01

export type SplitType = 'even' | 'amount' | 'shares' | 'percent'

export interface PaymentInput {
  memberId: string
  amount: number
}

export interface SplitInput {
  memberId: string
  amount?: number | null
  shares?: number | null
  percent?: number | null
  owedAmount: number
}

export interface ExpenseInput {
  projectId?: string
  description: string
  amount: number
  date: Date
  splitType: SplitType
  categoryId: string | null
  paymentMethodId: string | null
  notes: string | null
  payments: PaymentInput[]
  splits: SplitInput[]
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asTrimmedString(value: unknown, field: string, maxLength = MAX_NAME_LENGTH): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${field} is required`)
  if (trimmed.length > maxLength) throw new Error(`${field} must be ${maxLength} characters or fewer`)
  return trimmed
}

export function asOptionalTrimmedString(
  value: unknown,
  field: string,
  maxLength = MAX_NAME_LENGTH
): string | null {
  if (value === undefined || value === null || value === '') return null
  return asTrimmedString(value, field, maxLength)
}

export function asFiniteNumber(value: unknown, field: string): number {
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue)) throw new Error(`${field} must be a finite number`)
  return numberValue
}

export function asPositiveAmount(value: unknown, field = 'Amount'): number {
  const amount = roundToCent(asFiniteNumber(value, field))
  if (amount <= 0) throw new Error(`${field} must be greater than 0`)
  return amount
}

export function asDate(value: unknown, field = 'Date'): Date {
  const date = value ? new Date(String(value)) : new Date()
  if (Number.isNaN(date.getTime())) throw new Error(`${field} is invalid`)
  return date
}

export function asOptionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null
  return asTrimmedString(value, field, 128)
}

export function asColor(value: unknown): string {
  if (value === undefined || value === null || value === '') return '#3b82f6'
  const color = asTrimmedString(value, 'Color', 32)
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Color must be a hex value like #3b82f6')
  return color
}

export function asEmoji(value: unknown): string {
  if (value === undefined || value === null || value === '') return '📊'
  return asTrimmedString(value, 'Emoji', 16)
}

export function asCurrency(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'USD'
  const currency = asTrimmedString(value, 'Currency', 8).toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a 3-letter ISO code')
  return currency
}

export function roundToCent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function assertAmountsMatch(actual: number, expected: number, message: string): void {
  if (Math.abs(roundToCent(actual) - roundToCent(expected)) > MONEY_EPSILON) {
    throw new Error(message)
  }
}

export function parseExpenseBody(body: unknown, options: { requireProjectId: boolean }): ExpenseInput {
  if (!isPlainObject(body)) throw new Error('Request body must be an object')

  const projectId = options.requireProjectId ? asTrimmedString(body.projectId, 'Project ID', 128) : undefined
  const description = asTrimmedString(body.description, 'Description', MAX_DESCRIPTION_LENGTH)
  const amount = asPositiveAmount(body.amount)
  const date = asDate(body.date)
  const splitType = asTrimmedString(body.splitType, 'Split type', 16) as SplitType

  if (!['even', 'amount', 'shares', 'percent'].includes(splitType)) {
    throw new Error('Split type is invalid')
  }

  const categoryId = asOptionalId(body.categoryId, 'Category ID')
  const paymentMethodId = asOptionalId(body.paymentMethodId, 'Payment method ID')
  const notes = asOptionalTrimmedString(body.notes, 'Notes', MAX_NOTES_LENGTH)

  if (!Array.isArray(body.payments) || body.payments.length === 0) {
    throw new Error('At least one payment is required')
  }

  if (!Array.isArray(body.splits) || body.splits.length === 0) {
    throw new Error('At least one split is required')
  }

  const payments = body.payments.map((payment, index): PaymentInput => {
    if (!isPlainObject(payment)) throw new Error(`Payment ${index + 1} is invalid`)
    return {
      memberId: asTrimmedString(payment.memberId, `Payment ${index + 1} member ID`, 128),
      amount: asPositiveAmount(payment.amount, `Payment ${index + 1} amount`),
    }
  })

  const splits = body.splits.map((split, index): SplitInput => {
    if (!isPlainObject(split)) throw new Error(`Split ${index + 1} is invalid`)
    const owedAmount = roundToCent(asFiniteNumber(split.owedAmount, `Split ${index + 1} owed amount`))
    if (owedAmount < 0) throw new Error(`Split ${index + 1} owed amount cannot be negative`)

    return {
      memberId: asTrimmedString(split.memberId, `Split ${index + 1} member ID`, 128),
      amount: split.amount === undefined || split.amount === null ? null : roundToCent(asFiniteNumber(split.amount, `Split ${index + 1} amount`)),
      shares: split.shares === undefined || split.shares === null ? null : Math.trunc(asFiniteNumber(split.shares, `Split ${index + 1} shares`)),
      percent: split.percent === undefined || split.percent === null ? null : asFiniteNumber(split.percent, `Split ${index + 1} percent`),
      owedAmount,
    }
  })

  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0)
  assertAmountsMatch(totalPaid, amount, 'Total payment amount must equal expense amount')

  const totalOwed = splits.reduce((sum, split) => sum + split.owedAmount, 0)
  assertAmountsMatch(totalOwed, amount, 'Total split amount must equal expense amount')

  return {
    projectId,
    description,
    amount,
    date,
    splitType,
    categoryId,
    paymentMethodId,
    notes,
    payments,
    splits,
  }
}

export function assertUniqueMembers(items: Array<{ memberId: string }>, label: string): void {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.memberId)) throw new Error(`${label} contains duplicate member ${item.memberId}`)
    seen.add(item.memberId)
  }
}

export async function validateExpenseReferences(input: ExpenseInput, projectId: string): Promise<void> {
  assertUniqueMembers(input.payments, 'Payments')
  assertUniqueMembers(input.splits, 'Splits')

  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
  if (!project) throw new Error('Project not found')

  const members = await db.select().from(schema.members).where(eq(schema.members.projectId, projectId))
  const memberIds = new Set(members.map((member) => member.id))

  for (const payment of input.payments) {
    if (!memberIds.has(payment.memberId)) throw new Error('Payment member does not belong to this project')
  }

  for (const split of input.splits) {
    if (!memberIds.has(split.memberId)) throw new Error('Split member does not belong to this project')
  }

  if (input.categoryId) {
    const [category] = await db.select().from(schema.categories).where(eq(schema.categories.id, input.categoryId))
    if (!category || category.projectId !== projectId) throw new Error('Category does not belong to this project')
  }

  if (input.paymentMethodId) {
    const [paymentMethod] = await db
      .select()
      .from(schema.paymentMethods)
      .where(eq(schema.paymentMethods.id, input.paymentMethodId))
    if (!paymentMethod || paymentMethod.projectId !== projectId) {
      throw new Error('Payment method does not belong to this project')
    }
  }
}
