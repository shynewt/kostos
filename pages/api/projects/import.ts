import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../db'
import { generateId } from '../../../utils/id'
import { sendSuccess, sendError } from '../../../utils/api'
import { CURRENCY_OPTIONS } from '../../../utils/currency'

// Import interfaces from export (or define similarly)
// Assuming interfaces like Category, PaymentMethod, Member, ExpenseExportFormat, SplitExportFormat
// are defined or imported. For brevity, we'll assume they match the structure.

// Define the expected structure of the Kostos import data
interface KostosImportData {
  id: string // Original project ID (ignored, new one generated)
  name: string
  currency: string
  participants: {
    id: string // Original member ID
    projectId: string // Original project ID
    name: string
  }[]
  categories: {
    id: string // Original category ID
    projectId: string // Original project ID
    name: string
    color: string | null
  }[]
  paymentMethods: {
    id: string // Original payment method ID
    projectId: string // Original project ID
    name: string
    icon: string | null
  }[]
  expenses: {
    id: string // Original expense ID
    expenseDate: string
    title: string
    categoryId: string | null // Original category ID
    paymentMethodId: string | null // Original payment method ID
    amount: number
    paidById: string | null // Original member ID
    splitType: string
    paidFor: {
      memberId: string // Original member ID
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
    // Parse import data
    const importData = req.body as KostosImportData

    // Basic validation
    if (
      !importData ||
      !importData.name ||
      !importData.currency ||
      !Array.isArray(importData.participants) ||
      !Array.isArray(importData.categories) ||
      !Array.isArray(importData.paymentMethods) ||
      !Array.isArray(importData.expenses)
    ) {
      return sendError(res, 'Invalid import data format', 400)
    }

    // --- Project Creation ---
    let currencyCode = importData.currency
    const matchingCurrency = CURRENCY_OPTIONS.find(
      (c) => c.symbol === currencyCode || c.code === currencyCode
    )
    if (matchingCurrency) {
      currencyCode = matchingCurrency.code
    } else {
      // Fallback or default if currency is unrecognized
      console.warn(`Unrecognized currency '${importData.currency}', defaulting to USD.`)
      currencyCode = 'USD'
    }

    const projectId = generateId()
    await db.insert(schema.projects).values({
      id: projectId,
      name: importData.name,
      currency: currencyCode,
    })

    // --- ID Mappings ---
    // Maps original IDs from the import file to newly generated DB IDs
    const memberIdMapping: Record<string, string> = {}
    const categoryIdMapping: Record<string, string> = {}
    const paymentMethodIdMapping: Record<string, string> = {}

    // --- Create Members ---
    await Promise.all(
      importData.participants.map(async (participant) => {
        const newMemberId = generateId()
        await db.insert(schema.members).values({
          id: newMemberId,
          projectId,
          name: participant.name,
        })
        memberIdMapping[participant.id] = newMemberId // Map original ID to new ID
      })
    )

    // --- Create Categories ---
    await Promise.all(
      importData.categories.map(async (category) => {
        const newCategoryId = generateId()
        await db.insert(schema.categories).values({
          id: newCategoryId,
          projectId,
          name: category.name,
          color: category.color ?? '#808080', // Provide default color if null
        })
        categoryIdMapping[category.id] = newCategoryId // Map original ID to new ID
      })
    )

    // --- Create Payment Methods ---
    await Promise.all(
      importData.paymentMethods.map(async (method) => {
        const newMethodId = generateId()
        await db.insert(schema.paymentMethods).values({
          id: newMethodId,
          projectId,
          name: method.name,
          icon: method.icon ?? '', // Provide default icon if null
        })
        paymentMethodIdMapping[method.id] = newMethodId // Map original ID to new ID
      })
    )

    // --- Create Expenses, Payments, and Splits ---
    await Promise.all(
      importData.expenses.map(async (expense) => {
        const newExpenseId = generateId()
        const originalCategoryId = expense.categoryId
        const originalPaymentMethodId = expense.paymentMethodId
        const originalPayerId = expense.paidById

        // Get new IDs using the mappings
        const newCategoryId = originalCategoryId ? categoryIdMapping[originalCategoryId] : null
        const newPaymentMethodId = originalPaymentMethodId
          ? paymentMethodIdMapping[originalPaymentMethodId]
          : null
        const newPayerMemberId = originalPayerId ? memberIdMapping[originalPayerId] : null

        // Convert date from ISO string to Date object
        const expenseDate = expense.expenseDate ? new Date(expense.expenseDate) : new Date()

        // Insert Expense
        await db.insert(schema.expenses).values({
          id: newExpenseId,
          projectId,
          description: expense.title,
          amount: expense.amount, // Use imported amount directly
          date: expenseDate,
          splitType: expense.splitType, // Use imported split type
          categoryId: newCategoryId, // Use mapped category ID
          paymentMethodId: newPaymentMethodId, // Use mapped payment method ID
        })

        // Create Payment record
        if (newPayerMemberId) {
          await db.insert(schema.payments).values({
            id: generateId(),
            expenseId: newExpenseId,
            memberId: newPayerMemberId, // Use mapped member ID
            amount: expense.amount, // Assume payer paid the full amount
          })
        }

        // Create Splits
        await Promise.all(
          expense.paidFor.map(async (split) => {
            const originalSplitMemberId = split.memberId
            const newSplitMemberId = originalSplitMemberId ? memberIdMapping[originalSplitMemberId] : null

            if (!newSplitMemberId) {
              console.warn(
                `Skipping split for expense '${expense.title}' - could not find mapping for original member ID ${originalSplitMemberId}`
              )
              return // Skip if member mapping is missing
            }

            await db.insert(schema.splits).values({
              id: generateId(),
              expenseId: newExpenseId,
              memberId: newSplitMemberId, // Use mapped member ID
              amount: split.amount, // Use imported split amount
              shares: split.shares, // Use imported split shares
              percent: split.percent, // Use imported split percent
              // Recalculate owedAmount based on imported values to ensure consistency
              // This assumes the import file *might* have incorrect owedAmount,
              // recalculating is safer. If you trust the import file's owedAmount, use: split.owedAmount
              owedAmount: calculateOwedAmount(expense.amount, expense.splitType, split, expense.paidFor),
            })
          })
        )
      })
    )

    return sendSuccess(res, { projectId }, 201)
  } catch (error) {
    console.error('Error importing project:', error)
    // Provide more specific error if possible
    const errorMessage = error instanceof Error ? error.message : 'Failed to import project'
    return sendError(res, `Import failed: ${errorMessage}`)
  }
}

/**
 * Helper function to recalculate owed amount based on split type and values.
 * This adds robustness in case the imported owedAmount is inconsistent.
 */
function calculateOwedAmount(
  totalAmount: number,
  splitType: string,
  currentSplit: KostosImportData['expenses'][0]['paidFor'][0],
  allSplits: KostosImportData['expenses'][0]['paidFor']
): number {
  try {
    switch (splitType) {
      case 'even':
        return totalAmount / allSplits.length
      case 'amount':
        return currentSplit.amount ?? 0
      case 'shares':
        const totalShares = allSplits.reduce((sum, s) => sum + (s.shares ?? 0), 0)
        return totalShares > 0 ? totalAmount * ((currentSplit.shares ?? 0) / totalShares) : 0
      case 'percent':
        // Assuming percent is stored as 0-1 (e.g., 0.5 for 50%)
        // If percent is stored as 0-100 (e.g., 50 for 50%), divide by 100 here
        return totalAmount * (currentSplit.percent ?? 0)
      default:
        console.warn(`Unknown split type '${splitType}' during owed amount calculation.`)
        return 0
    }
  } catch (e) {
    console.error('Error calculating owed amount:', e)
    return 0 // Fallback on error
  }
}
