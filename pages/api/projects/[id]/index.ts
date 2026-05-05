import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../../db'
import { sendSuccess, sendError } from '../../../../utils/api'
import { asCurrency, asEmoji, asOptionalTrimmedString, asTrimmedString, isPlainObject } from '../../../../utils/apiValidation'
import { eq, inArray, sql } from 'drizzle-orm'

// Get project details
async function getProject(req: NextApiRequest, res: NextApiResponse, projectId: string) {
  try {
    // Get project details
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))

    if (!project) {
      return sendError(res, 'Project not found', 404)
    }

    // Get project members
    const members = await db.select().from(schema.members).where(eq(schema.members.projectId, projectId))

    // Get project categories
    const categories = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.projectId, projectId))

    // Get project payment methods
    const paymentMethods = await db
      .select()
      .from(schema.paymentMethods)
      .where(eq(schema.paymentMethods.projectId, projectId))

    // Get project expenses with payments and splits
    const expenses = await db.select().from(schema.expenses).where(eq(schema.expenses.projectId, projectId))

    const expenseIds = expenses.map((expense) => expense.id)
    const allPayments = expenseIds.length
      ? await db.select().from(schema.payments).where(inArray(schema.payments.expenseId, expenseIds))
      : []
    const allSplits = expenseIds.length
      ? await db.select().from(schema.splits).where(inArray(schema.splits.expenseId, expenseIds))
      : []

    const paymentsByExpense = new Map<string, typeof allPayments>()
    for (const payment of allPayments) {
      paymentsByExpense.set(payment.expenseId, [...(paymentsByExpense.get(payment.expenseId) ?? []), payment])
    }

    const splitsByExpense = new Map<string, typeof allSplits>()
    for (const split of allSplits) {
      splitsByExpense.set(split.expenseId, [...(splitsByExpense.get(split.expenseId) ?? []), split])
    }

    const expensesWithDetails = expenses.map((expense) => ({
      ...expense,
      payments: paymentsByExpense.get(expense.id) ?? [],
      splits: splitsByExpense.get(expense.id) ?? [],
    }))

    return sendSuccess(res, {
      ...project,
      members,
      categories,
      paymentMethods,
      expenses: expensesWithDetails,
    })
  } catch (error) {
    console.error('Error getting project:', error)
    return sendError(res, 'Failed to get project')
  }
}

// Update project details
async function updateProject(req: NextApiRequest, res: NextApiResponse, projectId: string) {
  try {
    if (!isPlainObject(req.body)) return sendError(res, 'Request body must be an object', 400)

    // Check if the project exists
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))

    if (!project) {
      return sendError(res, 'Project not found', 404)
    }

    // Build update object with only provided and validated fields
    const updateData: Partial<{
      name: string
      description: string | null
      currency: string
      emoji: string
    }> = {}
    if (req.body.name !== undefined) updateData.name = asTrimmedString(req.body.name, 'Project name')
    if (req.body.description !== undefined) {
      updateData.description = asOptionalTrimmedString(req.body.description, 'Description', 1_000)
    }
    if (req.body.currency !== undefined) updateData.currency = asCurrency(req.body.currency)
    if (req.body.emoji !== undefined) updateData.emoji = asEmoji(req.body.emoji)

    // Only update if there are fields to update
    if (Object.keys(updateData).length > 0) {
      await db
        .update(schema.projects)
        .set({
          ...updateData, // includes emoji, name, etc.
          updatedAt: sql`(strftime('%s', 'now'))`, // Use SQLite function directly
        })
        .where(eq(schema.projects.id, projectId))
    }

    // Get updated project details
    const [updatedProject] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))

    return sendSuccess(res, updatedProject)
  } catch (error) {
    console.error('Error updating project:', error)
    return sendError(res, error instanceof Error ? error.message : 'Failed to update project', 400)
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return sendError(res, 'Invalid project ID', 400)
  }

  switch (req.method) {
    case 'GET':
      return getProject(req, res, id)
    case 'PATCH':
      return updateProject(req, res, id)
    default:
      return sendError(res, 'Method not allowed', 405)
  }
}
