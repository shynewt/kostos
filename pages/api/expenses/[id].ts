import { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '../../../db';
import { sendSuccess, sendError } from '../../../utils/api';
import { eq } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return sendError(res, 'Invalid expense ID', 400);
  }
  
  switch (req.method) {
    case 'PUT':
      return updateExpense(req, res, id);
    case 'DELETE':
      return deleteExpense(req, res, id);
    default:
      return sendError(res, 'Method not allowed', 405);
  }
}

// Update an existing expense
async function updateExpense(req: NextApiRequest, res: NextApiResponse, expenseId: string) {
  try {
    const {
      description,
      amount,
      date,
      splitType,
      categoryId,
      paymentMethodId,
      notes,
      payments,
      splits,
    } = req.body;

    // Validate required fields
    if (!description) {
      return sendError(res, 'Description is required');
    }

    if (!amount || amount <= 0) {
      return sendError(res, 'Amount must be greater than 0');
    }

    if (!splitType) {
      return sendError(res, 'Split type is required');
    }

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return sendError(res, 'At least one payment is required');
    }

    if (!splits || !Array.isArray(splits) || splits.length === 0) {
      return sendError(res, 'At least one split is required');
    }

    // Update the expense
    await db
      .update(schema.expenses)
      .set({
        description,
        amount,
        date: date ? new Date(date) : new Date(),
        splitType,
        categoryId: categoryId || null,
        paymentMethodId: paymentMethodId || null,
        notes: notes || null,
      })
      .where(eq(schema.expenses.id, expenseId));

    // Delete existing payments and splits
    await db
      .delete(schema.payments)
      .where(eq(schema.payments.expenseId, expenseId));

    await db
      .delete(schema.splits)
      .where(eq(schema.splits.expenseId, expenseId));

    // Create new payments
    await Promise.all(
      payments.map((payment) =>
        db.insert(schema.payments).values({
          id: generateId(),
          expenseId,
          memberId: payment.memberId,
          amount: payment.amount,
        })
      )
    );

    // Create new splits
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
    );

    // Fetch the updated expense with payments and splits
    const [expense] = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.id, expenseId));

    const expensePayments = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.expenseId, expenseId));

    const expenseSplits = await db
      .select()
      .from(schema.splits)
      .where(eq(schema.splits.expenseId, expenseId));

    return sendSuccess(res, {
      ...expense,
      payments: expensePayments,
      splits: expenseSplits,
    });
  } catch (error) {
    console.error('Error updating expense:', error);
    return sendError(res, 'Failed to update expense');
  }
}

// Delete an expense
async function deleteExpense(req: NextApiRequest, res: NextApiResponse, expenseId: string) {
  try {
    // Check if expense exists
    const [existingExpense] = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.id, expenseId));
    
    if (!existingExpense) {
      return sendError(res, 'Expense not found', 404);
    }
    
    // Delete payments and splits first (foreign key constraints)
    await db.delete(schema.payments).where(eq(schema.payments.expenseId, expenseId));
    await db.delete(schema.splits).where(eq(schema.splits.expenseId, expenseId));
    
    // Delete the expense
    await db.delete(schema.expenses).where(eq(schema.expenses.id, expenseId));
    
    return sendSuccess(res, { id: expenseId });
  } catch (error) {
    console.error('Error deleting expense:', error);
    return sendError(res, 'Failed to delete expense');
  }
}

// Helper function to generate ID (copied from utils/id.ts to avoid circular imports)
function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
