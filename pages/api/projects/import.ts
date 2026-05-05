import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../db'
import { generateId } from '../../../utils/id'
import { sendSuccess, sendError } from '../../../utils/api'
import { CURRENCY_OPTIONS } from '../../../utils/currency'
import {
  MAX_IMPORT_EXPENSES,
  asFiniteNumber,
  asTrimmedString,
  isPlainObject,
  roundToCent,
} from '../../../utils/apiValidation'

interface KostosImportData {
  id: string
  name: string
  currency: string
  participants: { id: string; projectId: string; name: string }[]
  categories: { id: string; projectId: string; name: string; color: string | null }[]
  paymentMethods: { id: string; projectId: string; name: string; icon: string | null }[]
  expenses: {
    id: string
    expenseDate: string
    title: string
    categoryId: string | null
    paymentMethodId: string | null
    amount: number
    paidById: string | null
    splitType: string
    paidFor: {
      memberId: string
      amount: number | null
      shares: number | null
      percent: number | null
      owedAmount: number
    }[]
  }[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', 405)
  }

  try {
    const importData = parseImportData(req.body)
    const currencyCode = normalizeCurrency(importData.currency)
    const projectId = generateId()

    db.transaction((tx) => {
      tx.insert(schema.projects)
        .values({ id: projectId, name: importData.name, currency: currencyCode })
        .run()

      const memberIdMapping: Record<string, string> = {}
      const categoryIdMapping: Record<string, string> = {}
      const paymentMethodIdMapping: Record<string, string> = {}

      for (const participant of importData.participants) {
        const newMemberId = generateId()
        tx.insert(schema.members)
          .values({ id: newMemberId, projectId, name: participant.name })
          .run()
        memberIdMapping[participant.id] = newMemberId
      }

      for (const category of importData.categories) {
        const newCategoryId = generateId()
        tx.insert(schema.categories)
          .values({
            id: newCategoryId,
            projectId,
            name: category.name,
            color: category.color ?? '#808080',
          })
          .run()
        categoryIdMapping[category.id] = newCategoryId
      }

      for (const method of importData.paymentMethods) {
        const newMethodId = generateId()
        tx.insert(schema.paymentMethods)
          .values({ id: newMethodId, projectId, name: method.name, icon: method.icon ?? '💳' })
          .run()
        paymentMethodIdMapping[method.id] = newMethodId
      }

      for (const expense of importData.expenses) {
        const newExpenseId = generateId()
        const newCategoryId = expense.categoryId ? categoryIdMapping[expense.categoryId] || null : null
        const newPaymentMethodId = expense.paymentMethodId
          ? paymentMethodIdMapping[expense.paymentMethodId] || null
          : null
        const newPayerMemberId = expense.paidById ? memberIdMapping[expense.paidById] || null : null
        const expenseDate = expense.expenseDate ? new Date(expense.expenseDate) : new Date()

        tx.insert(schema.expenses)
          .values({
            id: newExpenseId,
            projectId,
            description: expense.title,
            amount: expense.amount,
            date: Number.isNaN(expenseDate.getTime()) ? new Date() : expenseDate,
            splitType: expense.splitType,
            categoryId: newCategoryId,
            paymentMethodId: newPaymentMethodId,
          })
          .run()

        if (newPayerMemberId) {
          tx.insert(schema.payments)
            .values({
              id: generateId(),
              expenseId: newExpenseId,
              memberId: newPayerMemberId,
              amount: expense.amount,
            })
            .run()
        }

        for (const split of expense.paidFor) {
          const newSplitMemberId = memberIdMapping[split.memberId]
          if (!newSplitMemberId) continue

          tx.insert(schema.splits)
            .values({
              id: generateId(),
              expenseId: newExpenseId,
              memberId: newSplitMemberId,
              amount: split.amount,
              shares: split.shares,
              percent: split.percent,
              owedAmount: calculateOwedAmount(expense.amount, expense.splitType, split, expense.paidFor),
            })
            .run()
        }
      }
    })

    return sendSuccess(res, { projectId }, 201)
  } catch (error) {
    console.error('Error importing project:', error)
    return sendError(res, error instanceof Error ? `Import failed: ${error.message}` : 'Failed to import project', 400)
  }
}

function parseImportData(body: unknown): KostosImportData {
  if (!isPlainObject(body)) throw new Error('Import data must be an object')

  const data = body as Partial<KostosImportData>
  const name = asTrimmedString(data.name, 'Project name')
  const currency = asTrimmedString(data.currency, 'Currency', 8)

  if (!Array.isArray(data.participants) || data.participants.length === 0) {
    throw new Error('Import must include at least one participant')
  }
  if (!Array.isArray(data.categories)) throw new Error('Import categories must be an array')
  if (!Array.isArray(data.paymentMethods)) throw new Error('Import payment methods must be an array')
  if (!Array.isArray(data.expenses)) throw new Error('Import expenses must be an array')
  if (data.expenses.length > MAX_IMPORT_EXPENSES) {
    throw new Error(`Import cannot contain more than ${MAX_IMPORT_EXPENSES} expenses`)
  }

  const participants = data.participants.map((participant, index) => {
    if (!isPlainObject(participant)) throw new Error(`Participant ${index + 1} is invalid`)
    return {
      id: asTrimmedString(participant.id, `Participant ${index + 1} ID`, 128),
      projectId: String(participant.projectId ?? ''),
      name: asTrimmedString(participant.name, `Participant ${index + 1} name`),
    }
  })

  const categories = data.categories.map((category, index) => {
    if (!isPlainObject(category)) throw new Error(`Category ${index + 1} is invalid`)
    const color = typeof category.color === 'string' && /^#[0-9a-f]{6}$/i.test(category.color) ? category.color : null
    return {
      id: asTrimmedString(category.id, `Category ${index + 1} ID`, 128),
      projectId: String(category.projectId ?? ''),
      name: asTrimmedString(category.name, `Category ${index + 1} name`),
      color,
    }
  })

  const paymentMethods = data.paymentMethods.map((method, index) => {
    if (!isPlainObject(method)) throw new Error(`Payment method ${index + 1} is invalid`)
    return {
      id: asTrimmedString(method.id, `Payment method ${index + 1} ID`, 128),
      projectId: String(method.projectId ?? ''),
      name: asTrimmedString(method.name, `Payment method ${index + 1} name`),
      icon: typeof method.icon === 'string' && method.icon.trim() ? method.icon.trim().slice(0, 16) : null,
    }
  })

  const participantIds = new Set(participants.map((participant) => participant.id))
  const expenses = data.expenses.map((expense, index) => {
    if (!isPlainObject(expense)) throw new Error(`Expense ${index + 1} is invalid`)
    if (!Array.isArray(expense.paidFor) || expense.paidFor.length === 0) {
      throw new Error(`Expense ${index + 1} must include paidFor splits`)
    }

    const amount = roundToCent(asFiniteNumber(expense.amount, `Expense ${index + 1} amount`))
    if (amount <= 0) throw new Error(`Expense ${index + 1} amount must be greater than 0`)

    const paidFor = expense.paidFor.map((split, splitIndex) => {
      if (!isPlainObject(split)) throw new Error(`Expense ${index + 1} split ${splitIndex + 1} is invalid`)
      const memberId = asTrimmedString(split.memberId, `Expense ${index + 1} split member ID`, 128)
      if (!participantIds.has(memberId)) throw new Error(`Expense ${index + 1} references an unknown member`)
      return {
        memberId,
        amount: split.amount === null || split.amount === undefined ? null : roundToCent(asFiniteNumber(split.amount, 'Split amount')),
        shares: split.shares === null || split.shares === undefined ? null : Math.trunc(asFiniteNumber(split.shares, 'Split shares')),
        percent: split.percent === null || split.percent === undefined ? null : asFiniteNumber(split.percent, 'Split percent'),
        owedAmount: roundToCent(asFiniteNumber(split.owedAmount ?? 0, 'Split owed amount')),
      }
    })

    return {
      id: String(expense.id ?? ''),
      expenseDate: String(expense.expenseDate ?? ''),
      title: asTrimmedString(expense.title, `Expense ${index + 1} title`, 240),
      categoryId: typeof expense.categoryId === 'string' ? expense.categoryId : null,
      paymentMethodId: typeof expense.paymentMethodId === 'string' ? expense.paymentMethodId : null,
      amount,
      paidById: typeof expense.paidById === 'string' ? expense.paidById : null,
      splitType: ['even', 'amount', 'shares', 'percent'].includes(String(expense.splitType))
        ? String(expense.splitType)
        : 'even',
      paidFor,
    }
  })

  return { id: String(data.id ?? ''), name, currency, participants, categories, paymentMethods, expenses }
}

function normalizeCurrency(currency: string): string {
  const matchingCurrency = CURRENCY_OPTIONS.find((c) => c.symbol === currency || c.code === currency)
  return matchingCurrency?.code ?? 'USD'
}

function calculateOwedAmount(
  totalAmount: number,
  splitType: string,
  currentSplit: KostosImportData['expenses'][0]['paidFor'][0],
  allSplits: KostosImportData['expenses'][0]['paidFor']
): number {
  switch (splitType) {
    case 'even':
      return roundToCent(totalAmount / allSplits.length)
    case 'amount':
      return roundToCent(currentSplit.amount ?? currentSplit.owedAmount ?? 0)
    case 'shares': {
      const totalShares = allSplits.reduce((sum, split) => sum + (split.shares ?? 0), 0)
      return totalShares > 0 ? roundToCent(totalAmount * ((currentSplit.shares ?? 0) / totalShares)) : 0
    }
    case 'percent': {
      const rawPercent = currentSplit.percent ?? 0
      const normalizedPercent = rawPercent > 1 ? rawPercent / 100 : rawPercent
      return roundToCent(totalAmount * normalizedPercent)
    }
    default:
      return 0
  }
}
