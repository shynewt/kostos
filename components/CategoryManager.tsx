import { useState, useEffect } from 'react';
import { generateId } from '../utils/id';

interface Category {
  id: string;
  name: string;
  color: string;
}

interface CategoryManagerProps {
  projectId: string;
  onCategoriesChange: (categories: Category[]) => void;
  initialCategories?: Category[];
}

const DEFAULT_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // yellow
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f97316', // orange
  '#64748b', // slate
];

export default function CategoryManager({
  projectId,
  onCategoriesChange,
  initialCategories = [],
}: CategoryManagerProps) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(DEFAULT_COLORS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State for editing categories
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  useEffect(() => {
    if (initialCategories.length > 0) {
      setCategories(initialCategories);
    } else {
      fetchCategories();
    }
  }, [projectId, initialCategories]);

  // Start editing a category
  const startEditing = (category: Category) => {
    setEditingCategory(category);
    setEditName(category.name);
    setEditColor(category.color);
    setError(null);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingCategory(null);
    setEditName('');
    setEditColor('');
    setError(null);
  };

  // Fetch categories from the API
  const fetchCategories = async () => {
    try {
      const response = await fetch(`/api/categories?projectId=${projectId}`);
      const result = await response.json();
      
      if (result.success) {
        setCategories(result.data);
        onCategoriesChange(result.data);
      } else {
        console.error('Error fetching categories:', result.error);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  // Add a new category
  const addCategory = async () => {
    if (!newCategoryName.trim()) {
      setError('Category name is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          name: newCategoryName,
          color: newCategoryColor,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const updatedCategories = [...categories, result.data];
        setCategories(updatedCategories);
        onCategoriesChange(updatedCategories);
        setNewCategoryName('');
        setNewCategoryColor(DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]);
      } else {
        setError(result.error || 'Failed to create category');
      }
    } catch (error) {
      console.error('Error creating category:', error);
      setError(error instanceof Error ? error.message : 'Failed to create category');
    } finally {
      setIsLoading(false);
    }
  };

  // Update a category
  const updateCategory = async () => {
    if (!editingCategory) return;
    
    if (!editName.trim()) {
      setError('Category name is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/categories/${editingCategory.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editName,
          color: editColor,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const updatedCategories = categories.map(cat => 
          cat.id === editingCategory.id ? result.data : cat
        );
        setCategories(updatedCategories);
        onCategoriesChange(updatedCategories);
        cancelEditing();
      } else {
        setError(result.error || 'Failed to update category');
      }
    } catch (error) {
      console.error('Error updating category:', error);
      setError(error instanceof Error ? error.message : 'Failed to update category');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete a category
  const deleteCategory = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category?')) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/categories/${categoryId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        const updatedCategories = categories.filter(category => category.id !== categoryId);
        setCategories(updatedCategories);
        onCategoriesChange(updatedCategories);
        // If currently editing this category, cancel edit mode
        if (editingCategory && editingCategory.id === categoryId) {
          cancelEditing();
        }
      } else {
        setError(result.error || 'Failed to delete category');
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete category');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-500 mb-2">Current Categories</h3>
        {categories.length > 0 ? (
          <div className="space-y-2">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between p-2 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                {editingCategory && editingCategory.id === category.id ? (
                  // Edit mode UI
                  <div className="flex items-center flex-grow mr-2">
                    <div className="flex items-center space-x-2 w-full">
                      <input
                        type="color"
                        className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                      />
                      <input
                        type="text"
                        className="input flex-grow"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Category name"
                      />
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={updateCategory}
                          className="text-green-600 hover:text-green-800 p-1 rounded-full hover:bg-green-50 dark:hover:bg-green-900/20"
                          disabled={isLoading}
                          title="Save changes"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="text-gray-600 hover:text-gray-800 p-1 rounded-full hover:bg-gray-50 dark:hover:bg-gray-900/20"
                          disabled={isLoading}
                          title="Cancel editing"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Normal display mode UI
                  <>
                    <div className="flex items-center">
                      <div 
                        className="w-5 h-5 rounded-full mr-2" 
                        style={{ backgroundColor: category.color }}
                      ></div>
                      <span>{category.name}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => startEditing(category)}
                        className="text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        disabled={isLoading || !!editingCategory}
                        title="Edit category"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteCategory(category.id)}
                        className="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                        disabled={isLoading || !!editingCategory}
                        title="Delete category"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic text-sm">No categories yet</p>
        )}
      </div>

      {!editingCategory && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Add New Category</h3>
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-grow"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name"
              disabled={isLoading}
            />
            
            <div className="relative">
              <input
                type="color"
                className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                value={newCategoryColor}
                onChange={(e) => setNewCategoryColor(e.target.value)}
                disabled={isLoading}
              />
            </div>
            
            <button
              type="button"
              onClick={addCategory}
              className="btn btn-primary"
              disabled={isLoading || !newCategoryName.trim()}
            >
              {isLoading ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
