import { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '../../../db';
import { generateId } from '../../../utils/id';
import { sendSuccess, sendError } from '../../../utils/api';
import { eq } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return getCategories(req, res);
    case 'POST':
      return createCategory(req, res);
    default:
      return sendError(res, 'Method not allowed', 405);
  }
}

// Get categories for a project
async function getCategories(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { projectId } = req.query;
    
    if (!projectId || typeof projectId !== 'string') {
      return sendError(res, 'Project ID is required', 400);
    }
    
    const categories = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.projectId, projectId));
    
    return sendSuccess(res, categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return sendError(res, 'Failed to fetch categories');
  }
}

// Create a new category
async function createCategory(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { projectId, name, color } = req.body;
    
    if (!projectId) {
      return sendError(res, 'Project ID is required');
    }
    
    if (!name) {
      return sendError(res, 'Category name is required');
    }
    
    // Generate a unique ID for the category
    const categoryId = generateId();
    
    // Create the category
    await db.insert(schema.categories).values({
      id: categoryId,
      projectId,
      name,
      color: color || '#3b82f6', // Default blue color
    });
    
    // Fetch the created category
    const [category] = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, categoryId));
    
    return sendSuccess(res, category, 201);
  } catch (error) {
    console.error('Error creating category:', error);
    return sendError(res, 'Failed to create category');
  }
}
