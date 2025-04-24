import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../db'
import { generateId } from '../../../utils/id'
import { sendSuccess, sendError } from '../../../utils/api'
import { eq } from 'drizzle-orm'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'POST':
      return createExpense(req, res)
    default:
      return sendError(res, 'Method not allowed', 405)
  }
}

// Create a new expense
async function createExpense(req: NextApiRequest, res: NextApiResponse) {
  try {
    const {
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
    } = req.body

    // Validate required fields
    if (!projectId) {
      return sendError(res, 'Project ID is required')
    }

    if (!description) {
      return sendError(res, 'Description is required')
    }

    if (!amount || amount <= 0) {
      return sendError(res, 'Amount must be greater than 0')
    }

    if (!splitType) {
      return sendError(res, 'Split type is required')
    }

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return sendError(res, 'At least one payment is required')
    }

    if (!splits || !Array.isArray(splits) || splits.length === 0) {
      return sendError(res, 'At least one split is required')
    }

    // Generate a unique ID for the expense
    const expenseId = generateId()

    // Create the expense
    await db.insert(schema.expenses).values({
      id: expenseId,
      projectId,
      description,
      amount,
      date: date ? new Date(date) : new Date(),
      splitType,
      categoryId: categoryId || null,
      paymentMethodId: paymentMethodId || null,
      notes: notes || null,
      createdAt: new Date(),
    })

    // Create payments
    await Promise.all(
      payments.map((payment) =>
        db.insert(schema.payments).values({
          id: generateId(),
          expenseId,
          memberId: payment.memberId,
          amount: payment.amount,
        })
      )
    )

    // Create splits
    await Promise.all(
      splits.map((split) =>
        db.insert(schema.splits).values({
          id: generateId(),
          expenseId,
          memberId: split.memberId,
          amount: split.amount || null,
          shares: split.shares || null,
          percent: split.percent || null,
          owedAmount: split.owedAmount,
        })
      )
    )

    // Fetch the created expense with payments and splits
    const [expense] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, expenseId))

    const expensePayments = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.expenseId, expenseId))

    const expenseSplits = await db.select().from(schema.splits).where(eq(schema.splits.expenseId, expenseId))

    return sendSuccess(
      res,
      {
        ...expense,
        payments: expensePayments,
        splits: expenseSplits,
      },
      201
    )
  } catch (error) {
    console.error('Error creating expense:', error)
    return sendError(res, 'Failed to create expense')
  }
}
