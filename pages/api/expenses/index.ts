import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../db'
import { generateId } from '../../../utils/id'
import { sendSuccess, sendError } from '../../../utils/api'
import { parseExpenseBody, validateExpenseReferences } from '../../../utils/apiValidation'
import { eq } from 'drizzle-orm'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'POST':
      return createExpense(req, res)
    default:
      return sendError(res, 'Method not allowed', 405)
  }
}

async function createExpense(req: NextApiRequest, res: NextApiResponse) {
  try {
    const input = parseExpenseBody(req.body, { requireProjectId: true })
    const projectId = input.projectId!

    await validateExpenseReferences(input, projectId)

    const expenseId = generateId()

    db.transaction((tx) => {
      tx.insert(schema.expenses).values({
        id: expenseId,
        projectId,
        description: input.description,
        amount: input.amount,
        date: input.date,
        splitType: input.splitType,
        categoryId: input.categoryId,
        paymentMethodId: input.paymentMethodId,
        notes: input.notes,
        createdAt: new Date(),
      }).run()

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

    return sendSuccess(res, { ...expense, payments: expensePayments, splits: expenseSplits }, 201)
  } catch (error) {
    console.error('Error creating expense:', error)
    return sendError(res, error instanceof Error ? error.message : 'Failed to create expense', 400)
  }
}
