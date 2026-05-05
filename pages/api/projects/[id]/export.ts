import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../../db'
import { sendSuccess, sendError } from '../../../../utils/api'
import { eq, inArray } from 'drizzle-orm'

// Define interfaces for clarity (optional but good practice)
interface Category {
  id: string
  projectId: string
  name: string
  color: string | null
}

interface PaymentMethod {
  id: string
  projectId: string
  name: string
  icon: string | null
}

interface Member {
  id: string
  projectId: string
  name: string
}

interface Payment {
  id: string
  expenseId: string
  memberId: string
  amount: number
}

interface Split {
  id: string
  expenseId: string
  memberId: string
  amount: number | null
  shares: number | null
  percent: number | null
  owedAmount: number
}

interface Expense {
  id: string
  projectId: string
  description: string
  amount: number
  date: Date | null
  splitType: string
  categoryId: string | null
  paymentMethodId: string | null
}

interface ExpenseWithDetails extends Expense {
  payments: Payment[]
  splits: Split[]
  category: Category | null // Keep original category object
}

// Define the structure of the export data
interface KostosExportData {
  id: string
  name: string
  currency: string
  participants: Member[]
  categories: Category[]
  paymentMethods: PaymentMethod[]
  expenses: ExpenseExportFormat[]
}

interface ExpenseExportFormat {
  id: string // Add expense ID
  expenseDate: string
  title: string
  categoryId: string | null // Export original category ID
  paymentMethodId: string | null // Export original payment method ID
  amount: number // Keep amount as number (e.g., 12.34)
  paidById: string | null // Export original member ID
  splitType: string // Export original split type
  paidFor: SplitExportFormat[]
}

interface SplitExportFormat {
  memberId: string // Use our member ID directly
  amount: number | null
  shares: number | null
  percent: number | null
  owedAmount: number // Include owed amount for reference/validation
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', 405)
  }

  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return sendError(res, 'Invalid project ID', 400)
  }

  try {
    // 1. Get project details
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, id))

    if (!project) {
      return sendError(res, 'Project not found', 404)
    }

    // 2. Get project members
    const members: Member[] = await db.select().from(schema.members).where(eq(schema.members.projectId, id))

    // 3. Get project categories
    const categories: Category[] = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.projectId, id))

    // 4. Get project payment methods
    const paymentMethods: PaymentMethod[] = await db
      .select()
      .from(schema.paymentMethods)
      .where(eq(schema.paymentMethods.projectId, id))

    // 5. Get project expenses
    const expenses: Expense[] = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.projectId, id))

    const expenseIds = expenses.map((expense) => expense.id)
    const allPayments: Payment[] = expenseIds.length
      ? await db.select().from(schema.payments).where(inArray(schema.payments.expenseId, expenseIds))
      : []
    const allSplits: Split[] = expenseIds.length
      ? await db.select().from(schema.splits).where(inArray(schema.splits.expenseId, expenseIds))
      : []

    const paymentsByExpense = new Map<string, Payment[]>()
    for (const payment of allPayments) {
      paymentsByExpense.set(payment.expenseId, [...(paymentsByExpense.get(payment.expenseId) ?? []), payment])
    }

    const splitsByExpense = new Map<string, Split[]>()
    for (const split of allSplits) {
      splitsByExpense.set(split.expenseId, [...(splitsByExpense.get(split.expenseId) ?? []), split])
    }

    const expensesWithDetails: ExpenseWithDetails[] = expenses.map((expense) => ({
      ...expense,
      payments: paymentsByExpense.get(expense.id) ?? [],
      splits: splitsByExpense.get(expense.id) ?? [],
      category: categories.find((cat) => cat.id === expense.categoryId) || null,
    }))

    // 7. Convert to Kostos Export format
    const kostosExportData: KostosExportData = {
      id: project.id,
      name: project.name,
      currency: project.currency,
      participants: members, // Use original member structure
      categories: categories, // Add full categories array
      paymentMethods: paymentMethods, // Add full payment methods array
      expenses: expensesWithDetails.map((expense) => {
        // Get the memberId of the person who paid (assuming single payer for now)
        const payerId = expense.payments.length > 0 ? expense.payments[0].memberId : null

        // Create ISO date string from Date object, fallback to current date if null
        const expenseDate = expense.date ? expense.date.toISOString() : new Date().toISOString()

        return {
          id: expense.id, // Include expense ID
          expenseDate,
          title: expense.description,
          categoryId: expense.categoryId, // Use original category ID
          paymentMethodId: expense.paymentMethodId, // Use original payment method ID
          amount: expense.amount, // Keep original amount
          paidById: payerId, // Use original member ID
          splitType: expense.splitType, // Use original split type
          paidFor: expense.splits.map((split) => ({
            memberId: split.memberId, // Use original member ID
            amount: split.amount,
            shares: split.shares,
            percent: split.percent,
            owedAmount: split.owedAmount, // Include owed amount
          })),
        }
      }),
    }

    // Set headers for file download
    const safeFileName = project.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'kostos'
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}-KostosExport.json"`)
    res.setHeader('Content-Type', 'application/json')

    // Return the JSON data
    // Use JSON.stringify with indentation for readability
    res.status(200).json(kostosExportData)
  } catch (error) {
    console.error('Error exporting project:', error)
    return sendError(res, 'Failed to export project')
  }
}
