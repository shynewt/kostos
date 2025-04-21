import { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '../../../db';
import { sendSuccess, sendError } from '../../../utils/api';
import { eq } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return sendError(res, 'Invalid category ID', 400);
  }

  if (req.method === 'DELETE') {
    try {
      // Check if the category exists
      const [category] = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.id, id));

      if (!category) {
        return sendError(res, 'Category not found', 404);
      }

      // Delete the category
      await db
        .delete(schema.categories)
        .where(eq(schema.categories.id, id));

      return sendSuccess(res, { id });
    } catch (error) {
      console.error('Error deleting category:', error);
      return sendError(res, 'Failed to delete category');
    }
  } else if (req.method === 'PUT') {
    try {
      const { name, color } = req.body;
      
      // Validation
      if (!name && !color) {
        return sendError(res, 'Name or color is required for update', 400);
      }
      
      // Check if the category exists
      const [category] = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.id, id));

      if (!category) {
        return sendError(res, 'Category not found', 404);
      }
      
      // Update fields that were provided
      const updateData: { name?: string; color?: string } = {};
      if (name) updateData.name = name;
      if (color) updateData.color = color;
      
      // Update the category
      await db
        .update(schema.categories)
        .set(updateData)
        .where(eq(schema.categories.id, id));
      
      // Fetch updated category
      const [updatedCategory] = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.id, id));
      
      return sendSuccess(res, updatedCategory);
    } catch (error) {
      console.error('Error updating category:', error);
      return sendError(res, 'Failed to update category');
    }
  }

  return sendError(res, 'Method not allowed', 405);
} 