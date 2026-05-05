import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../db'
import { sendSuccess, sendError } from '../../../utils/api'
import { eq } from 'drizzle-orm'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return sendError(res, 'Invalid payment method ID', 400)
  }

  switch (req.method) {
    case 'DELETE':
      return deletePaymentMethod(req, res, id)
    default:
      return sendError(res, 'Method not allowed', 405)
  }
}

async function deletePaymentMethod(req: NextApiRequest, res: NextApiResponse, id: string) {
  try {
    const [paymentMethod] = await db
      .select()
      .from(schema.paymentMethods)
      .where(eq(schema.paymentMethods.id, id))

    if (!paymentMethod) return sendError(res, 'Payment method not found', 404)

    const usedByExpenses = await db
      .select({ id: schema.expenses.id })
      .from(schema.expenses)
      .where(eq(schema.expenses.paymentMethodId, id))
      .limit(1)

    if (usedByExpenses.length > 0) {
      await db.update(schema.expenses).set({ paymentMethodId: null }).where(eq(schema.expenses.paymentMethodId, id))
    }

    await db.delete(schema.paymentMethods).where(eq(schema.paymentMethods.id, id))

    return sendSuccess(res, { id })
  } catch (error) {
    console.error('Error deleting payment method:', error)
    return sendError(res, 'Failed to delete payment method')
  }
}
