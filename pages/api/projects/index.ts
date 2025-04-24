import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../db'
import { generateId } from '../../../utils/id'
import { sendSuccess, sendError } from '../../../utils/api'
import { eq } from 'drizzle-orm'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return getProjects(req, res)
    case 'POST':
      return createProject(req, res)
    default:
      return sendError(res, 'Method not allowed', 405)
  }
}

// Get all projects
async function getProjects(req: NextApiRequest, res: NextApiResponse) {
  try {
    const projects = await db.select().from(schema.projects)
    return sendSuccess(res, projects)
  } catch (error) {
    console.error('Error fetching projects:', error)
    return sendError(res, 'Failed to fetch projects')
  }
}

// Create a new project
async function createProject(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { name, description, members, currency, emoji } = req.body

    if (!name) {
      return sendError(res, 'Project name is required')
    }

    if (!members || !Array.isArray(members) || members.length === 0) {
      return sendError(res, 'At least one member is required')
    }

    // Generate a unique ID for the project
    const projectId = generateId()

    // Create the project
    await db.insert(schema.projects).values({
      id: projectId,
      name,
      description: description || null,
      emoji: emoji || '📊', // Use provided emoji or default
      currency: currency || 'USD',
    })

    // Create members
    const memberPromises = members.map(async (memberName: string) => {
      const memberId = generateId()
      await db.insert(schema.members).values({
        id: memberId,
        projectId,
        name: memberName,
      })
      return { id: memberId, name: memberName }
    })

    const createdMembers = await Promise.all(memberPromises)

    // Add default categories
    const defaultCategories = [
      { name: '🛒 Groceries', color: '#84cc16' }, // lime
      { name: '🍽️ Eating Out', color: '#ef4444' }, // red
      { name: '⛽ Fuel', color: '#f59e0b' }, // yellow
      { name: '🚗 Transportation', color: '#f97316' }, // orange
      { name: '🛋️ Furniture', color: '#a855f7' }, // purple
      { name: '📱 Electronics', color: '#06b6d4' }, // cyan
      { name: '🏠 Rent', color: '#3b82f6' }, // blue
      { name: '💡 Utilities', color: '#6366f1' }, // indigo
      { name: '🏥 Healthcare', color: '#ec4899' }, // pink
      { name: '✈️ Travel', color: '#14b8a6' }, // teal
      { name: '🛍️ Shopping', color: '#10b981' }, // green
      { name: '🎮 Entertainment', color: '#8b5cf6' }, // purple
      { name: '📦 Other', color: '#64748b' }, // slate
    ]

    const categoryPromises = defaultCategories.map(async (category) => {
      const categoryId = generateId()
      await db.insert(schema.categories).values({
        id: categoryId,
        projectId,
        name: category.name,
        color: category.color,
      })
      return { id: categoryId, ...category }
    })

    const createdCategories = await Promise.all(categoryPromises)

    // Add default payment methods
    const defaultPaymentMethods = [
      { name: 'Card', icon: '💳' },
      { name: 'Cash', icon: '💵' },
      { name: 'Bank Transfer', icon: '🏦' },
      { name: 'Gift Card', icon: '🎁' },
    ]

    const paymentMethodPromises = defaultPaymentMethods.map(async (method) => {
      const methodId = generateId()
      await db.insert(schema.paymentMethods).values({
        id: methodId,
        projectId,
        name: method.name,
        icon: method.icon,
      })
      return { id: methodId, ...method }
    })

    const createdPaymentMethods = await Promise.all(paymentMethodPromises)

    // Fetch the created project
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))

    return sendSuccess(
      res,
      {
        ...project,
        members: createdMembers,
        categories: createdCategories,
        paymentMethods: createdPaymentMethods,
      },
      201
    )
  } catch (error) {
    console.error('Error creating project:', error)
    return sendError(res, 'Failed to create project')
  }
}
