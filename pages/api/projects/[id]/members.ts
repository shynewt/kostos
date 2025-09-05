import { NextApiRequest, NextApiResponse } from 'next'
import { db, schema } from '../../../../db'
import { sendSuccess, sendError } from '../../../../utils/api'
import { generateId } from '../../../../utils/id'
import { eq } from 'drizzle-orm'

// Add a new member to the project
async function addMember(req: NextApiRequest, res: NextApiResponse, projectId: string) {
  try {
    const { name } = req.body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return sendError(res, 'Member name is required', 400)
    }

    // Check if project exists
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))

    if (!project) {
      return sendError(res, 'Project not found', 404)
    }

    // Generate member ID and create member
    const memberId = generateId()
    const newMember = {
      id: memberId,
      projectId: projectId,
      name: name.trim(),
    }

    await db.insert(schema.members).values(newMember)

    return sendSuccess(res, newMember, 201)
  } catch (error) {
    console.error('Error adding member:', error)
    return sendError(res, 'Failed to add member')
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return sendError(res, 'Invalid project ID', 400)
  }

  switch (req.method) {
    case 'POST':
      return addMember(req, res, id)
    default:
      return sendError(res, 'Method not allowed', 405)
  }
}
