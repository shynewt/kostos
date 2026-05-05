import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../db'
import { generateId } from '../../../utils/id'
import { sendSuccess, sendError } from '../../../utils/api'
import { asColor, asTrimmedString, isPlainObject } from '../../../utils/apiValidation'
import { eq } from 'drizzle-orm'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return getCategories(req, res)
    case 'POST':
      return createCategory(req, res)
    default:
      return sendError(res, 'Method not allowed', 405)
  }
}

async function getCategories(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { projectId } = req.query

    if (!projectId || typeof projectId !== 'string') {
      return sendError(res, 'Project ID is required', 400)
    }

    const categories = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.projectId, projectId))

    return sendSuccess(res, categories)
  } catch (error) {
    console.error('Error fetching categories:', error)
    return sendError(res, 'Failed to fetch categories')
  }
}

async function createCategory(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!isPlainObject(req.body)) return sendError(res, 'Request body must be an object', 400)

    const projectId = asTrimmedString(req.body.projectId, 'Project ID', 128)
    const name = asTrimmedString(req.body.name, 'Category name')
    const color = asColor(req.body.color)

    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
    if (!project) return sendError(res, 'Project not found', 404)

    const categoryId = generateId()

    await db.insert(schema.categories).values({ id: categoryId, projectId, name, color })

    const [category] = await db.select().from(schema.categories).where(eq(schema.categories.id, categoryId))

    return sendSuccess(res, category, 201)
  } catch (error) {
    console.error('Error creating category:', error)
    return sendError(res, error instanceof Error ? error.message : 'Failed to create category', 400)
  }
}
