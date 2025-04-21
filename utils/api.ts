import { NextApiResponse } from 'next';

// Standard API response format
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Success response helper
export function sendSuccess<T>(res: NextApiResponse, data: T, status = 200) {
  return res.status(status).json({
    success: true,
    data,
  });
}

// Error response helper
export function sendError(res: NextApiResponse, error: string, status = 400) {
  return res.status(status).json({
    success: false,
    error,
  });
}
