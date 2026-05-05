import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../db'
import { generateId } from '../../../utils/id'
import { sendSuccess, sendError } from '../../../utils/api'
import { parseExpenseBody, validateExpenseReferences } from '../../../utils/apiValidation'
import { eq } from 'drizzle-orm'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return sendError(res, 'Invalid expense ID', 400)
  }

  switch (req.method) {
    case 'PUT':
      return updateExpense(req, res, id)
    case 'DELETE':
      return deleteExpense(req, res, id)
    default:
      return sendError(res, 'Method not allowed', 405)
  }
}

async function updateExpense(req: NextApiRequest, res: NextApiResponse, expenseId: string) {
  try {
    const [existingExpense] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, expenseId))

    if (!existingExpense) {
      return sendError(res, 'Expense not found', 404)
    }

    const input = parseExpenseBody(req.body, { requireProjectId: false })
    await validateExpenseReferences(input, existingExpense.projectId)

    db.transaction((tx) => {
      tx.update(schema.expenses)
        .set({
          description: input.description,
          amount: input.amount,
          date: input.date,
          splitType: input.splitType,
          categoryId: input.categoryId,
          paymentMethodId: input.paymentMethodId,
          notes: input.notes,
        })
        .where(eq(schema.expenses.id, expenseId))
        .run()

      tx.delete(schema.payments).where(eq(schema.payments.expenseId, expenseId)).run()
      tx.delete(schema.splits).where(eq(schema.splits.expenseId, expenseId)).run()

      for (const payment of input.payments) {
        tx.insert(schema.payments)
          .values({
            id: generateId(),
            expenseId,
            memberId: payment.memberId,
            amount: payment.amount,
          })
          .run()
      }

      for (const split of input.splits) {
        tx.insert(schema.splits)
          .values({
            id: generateId(),
            expenseId,
            memberId: split.memberId,
            amount: split.amount,
            shares: split.shares,
            percent: split.percent,
            owedAmount: split.owedAmount,
          })
          .run()
      }
    })

    const [expense] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, expenseId))
    const expensePayments = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.expenseId, expenseId))
    const expenseSplits = await db.select().from(schema.splits).where(eq(schema.splits.expenseId, expenseId))

    return sendSuccess(res, { ...expense, payments: expensePayments, splits: expenseSplits })
  } catch (error) {
    console.error('Error updating expense:', error)
    return sendError(res, error instanceof Error ? error.message : 'Failed to update expense', 400)
  }
}

async function deleteExpense(req: NextApiRequest, res: NextApiResponse, expenseId: string) {
  try {
    const [existingExpense] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, expenseId))

    if (!existingExpense) {
      return sendError(res, 'Expense not found', 404)
    }

    db.transaction((tx) => {
      tx.delete(schema.payments).where(eq(schema.payments.expenseId, expenseId)).run()
      tx.delete(schema.splits).where(eq(schema.splits.expenseId, expenseId)).run()
      tx.delete(schema.expenses).where(eq(schema.expenses.id, expenseId)).run()
    })

    return sendSuccess(res, { id: expenseId })
  } catch (error) {
    console.error('Error deleting expense:', error)
    return sendError(res, 'Failed to delete expense')
  }
}
