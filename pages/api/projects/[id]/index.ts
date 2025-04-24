import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../../db'
import { sendSuccess, sendError } from '../../../../utils/api'
import { eq, sql } from 'drizzle-orm'

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

    // For each expense, get the payments and splits
    const expensesWithDetails = await Promise.all(
      expenses.map(async (expense) => {
        const payments = await db
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.expenseId, expense.id))

        const splits = await db.select().from(schema.splits).where(eq(schema.splits.expenseId, expense.id))

        return {
          ...expense,
          payments,
          splits,
        }
      })
    )

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
    // Get updatable fields from request body
    const { name, description, currency, emoji } = req.body

    // Check if the project exists
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))

    if (!project) {
      return sendError(res, 'Project not found', 404)
    }

    // Build update object with only provided fields
    const updateData: Record<string, any> = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (currency !== undefined) updateData.currency = currency
    if (emoji !== undefined) updateData.emoji = emoji

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
    return sendError(res, 'Failed to update project')
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
