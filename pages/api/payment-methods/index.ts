import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../db'
import { generateId } from '../../../utils/id'
import { sendSuccess, sendError } from '../../../utils/api'
import { asTrimmedString, isPlainObject } from '../../../utils/apiValidation'
import { eq } from 'drizzle-orm'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return getPaymentMethods(req, res)
    case 'POST':
      return createPaymentMethod(req, res)
    default:
      return sendError(res, 'Method not allowed', 405)
  }
}

async function getPaymentMethods(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { projectId } = req.query

    if (!projectId || typeof projectId !== 'string') {
      return sendError(res, 'Project ID is required', 400)
    }

    const paymentMethods = await db
      .select()
      .from(schema.paymentMethods)
      .where(eq(schema.paymentMethods.projectId, projectId))

    return sendSuccess(res, paymentMethods)
  } catch (error) {
    console.error('Error fetching payment methods:', error)
    return sendError(res, 'Failed to fetch payment methods')
  }
}

async function createPaymentMethod(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!isPlainObject(req.body)) return sendError(res, 'Request body must be an object', 400)

    const projectId = asTrimmedString(req.body.projectId, 'Project ID', 128)
    const name = asTrimmedString(req.body.name, 'Payment method name')
    const icon = asTrimmedString(req.body.icon || '💳', 'Payment method icon', 16)

    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
    if (!project) return sendError(res, 'Project not found', 404)

    const paymentMethodId = generateId()

    await db.insert(schema.paymentMethods).values({ id: paymentMethodId, projectId, name, icon })

    const [paymentMethod] = await db
      .select()
      .from(schema.paymentMethods)
      .where(eq(schema.paymentMethods.id, paymentMethodId))

    return sendSuccess(res, paymentMethod, 201)
  } catch (error) {
    console.error('Error creating payment method:', error)
    return sendError(res, error instanceof Error ? error.message : 'Failed to create payment method', 400)
  }
}
