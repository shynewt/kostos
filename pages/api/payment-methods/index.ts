import { NextApiRequest, NextApiResponse } from "next";
import { db, schema } from "../../../db";
import { generateId } from "../../../utils/id";
import { sendSuccess, sendError } from "../../../utils/api";
import { eq } from "drizzle-orm";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  switch (req.method) {
    case "GET":
      return getPaymentMethods(req, res);
    case "POST":
      return createPaymentMethod(req, res);
    default:
      return sendError(res, "Method not allowed", 405);
  }
}

// Get payment methods for a project
async function getPaymentMethods(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== "string") {
      return sendError(res, "Project ID is required", 400);
    }

    const paymentMethods = await db
      .select()
      .from(schema.paymentMethods)
      .where(eq(schema.paymentMethods.projectId, projectId));

    return sendSuccess(res, paymentMethods);
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    return sendError(res, "Failed to fetch payment methods");
  }
}

// Create a new payment method
async function createPaymentMethod(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { projectId, name, icon } = req.body;

    if (!projectId) {
      return sendError(res, "Project ID is required");
    }

    if (!name) {
      return sendError(res, "Payment method name is required");
    }

    // Generate a unique ID for the payment method
    const paymentMethodId = generateId();

    // Create the payment method
    await db.insert(schema.paymentMethods).values({
      id: paymentMethodId,
      projectId,
      name,
      icon: icon || "💳", // Default card icon
    });

    // Fetch the created payment method
    const [paymentMethod] = await db
      .select()
      .from(schema.paymentMethods)
      .where(eq(schema.paymentMethods.id, paymentMethodId));

    return sendSuccess(res, paymentMethod, 201);
  } catch (error) {
    console.error("Error creating payment method:", error);
    return sendError(res, "Failed to create payment method");
  }
}
