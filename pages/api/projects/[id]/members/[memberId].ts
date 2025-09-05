import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../../../db'
import { sendSuccess, sendError } from '../../../../../utils/api'
import { eq, and } from 'drizzle-orm'

// Delete a member from the project
async function deleteMember(req: NextApiRequest, res: NextApiResponse, projectId: string, memberId: string) {
  try {
    // Check if project exists
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))

    if (!project) {
      return sendError(res, 'Project not found', 404)
    }

    // Check if member exists
    const [member] = await db
      .select()
      .from(schema.members)
      .where(and(eq(schema.members.id, memberId), eq(schema.members.projectId, projectId)))

    if (!member) {
      return sendError(res, 'Member not found', 404)
    }

    // Check if this is the last member
    const allMembers = await db.select().from(schema.members).where(eq(schema.members.projectId, projectId))

    if (allMembers.length <= 1) {
      return sendError(res, 'Cannot remove the last member of a project', 400)
    }

    // Check if member has any payment records
    const memberPayments = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.memberId, memberId))

    if (memberPayments.length > 0) {
      return sendError(
        res,
        'Cannot delete this member because they have paid for expenses. Please update those transactions first.',
        400
      )
    }

    // Check if member has any split records
    const memberSplits = await db.select().from(schema.splits).where(eq(schema.splits.memberId, memberId))

    if (memberSplits.length > 0) {
      return sendError(
        res,
        'Cannot delete this member because they are included in expense splits. Please update those transactions first.',
        400
      )
    }

    // Safe to delete - member has no transaction history
    await db.delete(schema.members).where(eq(schema.members.id, memberId))

    return sendSuccess(res, { message: 'Member removed successfully' })
  } catch (error) {
    console.error('Error removing member:', error)
    return sendError(res, 'Failed to remove member')
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id, memberId } = req.query

  if (!id || typeof id !== 'string') {
    return sendError(res, 'Invalid project ID', 400)
  }

  if (!memberId || typeof memberId !== 'string') {
    return sendError(res, 'Invalid member ID', 400)
  }

  switch (req.method) {
    case 'DELETE':
      return deleteMember(req, res, id, memberId)
    default:
      return sendError(res, 'Method not allowed', 405)
  }
}
