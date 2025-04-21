import { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '../../../db';
import { sendSuccess, sendError } from '../../../utils/api';
import { eq } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return sendError(res, 'Invalid payment method ID', 400);
  }

  if (req.method === 'DELETE') {
    try {
      // Check if the payment method exists
      const [paymentMethod] = await db
        .select()
        .from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.id, id));

      if (!paymentMethod) {
        return sendError(res, 'Payment method not found', 404);
      }

      // Delete the payment method
      await db
        .delete(schema.paymentMethods)
        .where(eq(schema.paymentMethods.id, id));

      return sendSuccess(res, { id });
    } catch (error) {
      console.error('Error deleting payment method:', error);
      return sendError(res, 'Failed to delete payment method');
    }
  }

  return sendError(res, 'Method not allowed', 405);
} 