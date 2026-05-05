import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../db'
import { sendSuccess, sendError } from '../../../utils/api'
import { asColor, asOptionalTrimmedString, isPlainObject } from '../../../utils/apiValidation'
import { eq } from 'drizzle-orm'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return sendError(res, 'Invalid category ID', 400)
  }

  switch (req.method) {
    case 'DELETE':
      return deleteCategory(req, res, id)
    case 'PUT':
      return updateCategory(req, res, id)
    default:
      return sendError(res, 'Method not allowed', 405)
  }
}

async function deleteCategory(req: NextApiRequest, res: NextApiResponse, id: string) {
  try {
    const [category] = await db.select().from(schema.categories).where(eq(schema.categories.id, id))

    if (!category) return sendError(res, 'Category not found', 404)

    const usedByExpenses = await db
      .select({ id: schema.expenses.id })
      .from(schema.expenses)
      .where(eq(schema.expenses.categoryId, id))
      .limit(1)

    if (usedByExpenses.length > 0) {
      await db.update(schema.expenses).set({ categoryId: null }).where(eq(schema.expenses.categoryId, id))
    }

    await db.delete(schema.categories).where(eq(schema.categories.id, id))

    return sendSuccess(res, { id })
  } catch (error) {
    console.error('Error deleting category:', error)
    return sendError(res, 'Failed to delete category')
  }
}

async function updateCategory(req: NextApiRequest, res: NextApiResponse, id: string) {
  try {
    if (!isPlainObject(req.body)) return sendError(res, 'Request body must be an object', 400)

    const name = asOptionalTrimmedString(req.body.name, 'Category name')
    const color = req.body.color === undefined ? null : asColor(req.body.color)

    if (!name && !color) return sendError(res, 'Name or color is required for update', 400)

    const [category] = await db.select().from(schema.categories).where(eq(schema.categories.id, id))
    if (!category) return sendError(res, 'Category not found', 404)

    await db
      .update(schema.categories)
      .set({ ...(name ? { name } : {}), ...(color ? { color } : {}) })
      .where(eq(schema.categories.id, id))

    const [updatedCategory] = await db.select().from(schema.categories).where(eq(schema.categories.id, id))

    return sendSuccess(res, updatedCategory)
  } catch (error) {
    console.error('Error updating category:', error)
    return sendError(res, error instanceof Error ? error.message : 'Failed to update category', 400)
  }
}
