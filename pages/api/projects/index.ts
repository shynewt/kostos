import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../db'
import { generateId } from '../../../utils/id'
import { sendSuccess, sendError } from '../../../utils/api'
import { asCurrency, asEmoji, asOptionalTrimmedString, asTrimmedString, isPlainObject } from '../../../utils/apiValidation'
import { eq } from 'drizzle-orm'

const DEFAULT_CATEGORIES = [
  { name: '🛒 Groceries', color: '#84cc16' },
  { name: '🍽️ Eating Out', color: '#ef4444' },
  { name: '⛽ Fuel', color: '#f59e0b' },
  { name: '🚗 Transportation', color: '#f97316' },
  { name: '🛋️ Furniture', color: '#a855f7' },
  { name: '📱 Electronics', color: '#06b6d4' },
  { name: '🏠 Rent', color: '#3b82f6' },
  { name: '💡 Utilities', color: '#6366f1' },
  { name: '🏥 Healthcare', color: '#ec4899' },
  { name: '✈️ Travel', color: '#14b8a6' },
  { name: '🛍️ Shopping', color: '#10b981' },
  { name: '🎮 Entertainment', color: '#8b5cf6' },
  { name: '📦 Other', color: '#64748b' },
]

const DEFAULT_PAYMENT_METHODS = [
  { name: 'Card', icon: '💳' },
  { name: 'Cash', icon: '💵' },
  { name: 'Bank Transfer', icon: '🏦' },
  { name: 'Gift Card', icon: '🎁' },
]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return sendError(res, 'Project listing is disabled', 403)
    case 'POST':
      return createProject(req, res)
    default:
      return sendError(res, 'Method not allowed', 405)
  }
}

async function createProject(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!isPlainObject(req.body)) return sendError(res, 'Request body must be an object', 400)

    const name = asTrimmedString(req.body.name, 'Project name')
    const description = asOptionalTrimmedString(req.body.description, 'Description', 1_000)
    const currency = asCurrency(req.body.currency)
    const emoji = asEmoji(req.body.emoji)

    if (!Array.isArray(req.body.members) || req.body.members.length === 0) {
      return sendError(res, 'At least one member is required', 400)
    }

    const memberNames = req.body.members.map((member, index) =>
      asTrimmedString(member, `Member ${index + 1} name`)
    )

    if (new Set(memberNames.map((member) => member.toLocaleLowerCase())).size !== memberNames.length) {
      return sendError(res, 'Member names must be unique', 400)
    }

    const projectId = generateId()
    let createdMembers: Array<{ id: string; name: string }> = []
    let createdCategories: Array<{ id: string; name: string; color: string }> = []
    let createdPaymentMethods: Array<{ id: string; name: string; icon: string }> = []

    db.transaction((tx) => {
      tx.insert(schema.projects)
        .values({ id: projectId, name, description, emoji, currency })
        .run()

      createdMembers = memberNames.map((memberName) => {
        const member = { id: generateId(), name: memberName }
        tx.insert(schema.members).values({ ...member, projectId }).run()
        return member
      })

      createdCategories = DEFAULT_CATEGORIES.map((category) => {
        const created = { id: generateId(), ...category }
        tx.insert(schema.categories).values({ ...created, projectId }).run()
        return created
      })

      createdPaymentMethods = DEFAULT_PAYMENT_METHODS.map((method) => {
        const created = { id: generateId(), ...method }
        tx.insert(schema.paymentMethods).values({ ...created, projectId }).run()
        return created
      })
    })

    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))

    return sendSuccess(
      res,
      { ...project, members: createdMembers, categories: createdCategories, paymentMethods: createdPaymentMethods },
      201
    )
  } catch (error) {
    console.error('Error creating project:', error)
    return sendError(res, error instanceof Error ? error.message : 'Failed to create project', 400)
  }
}
