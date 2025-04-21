import { formatCurrency } from "../../utils/currency";

interface Category {
  id: string;
  name: string;
  color: string;
}

interface Member {
  id: string;
  name: string;
}

interface Payment {
  memberId: string;
  amount: number;
}

interface Split {
  memberId: string;
  amount?: number;
  shares?: number;
  percent?: number;
  owedAmount: number;
}

interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
}

export interface ExpenseItemProps {
  expense: {
    id: string;
    description: string;
    amount: number;
    date: string | Date;
    splitType: "even" | "amount" | "percent" | "shares";
    categoryId: string | null;
    paymentMethodId?: string | null;
    payments: Payment[];
    splits: Split[];
    notes?: string;
    createdAt?: string | Date;
  };
  members: Member[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  currency: string;
  currentMemberId?: string;
  onEdit?: (expense: any) => void;
  onDelete?: (expense: any) => void;
  onClick?: (expense: any) => void;
  variant?: "default" | "compact" | "list" | "category";
  showActions?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function formatDate(date: Date | string | number): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ExpenseItem({
  expense,
  members,
  categories,
  paymentMethods,
  currency,
  currentMemberId,
  onEdit,
  onDelete,
  onClick,
  variant = "default",
  showActions = true,
}: ExpenseItemProps) {
  // Find the category if it exists
  const category = expense.categoryId
    ? categories.find((c) => c.id === expense.categoryId)
    : null;

  // Find the payment method if it exists
  const paymentMethod = expense.paymentMethodId
    ? paymentMethods.find((m) => m.id === expense.paymentMethodId)
    : null;

  // Find the primary payer (the one who paid the most)
  const primaryPayment =
    expense.payments.length > 0
      ? [...expense.payments].sort((a, b) => b.amount - a.amount)[0]
      : null;
  const primaryPayer = primaryPayment
    ? members.find((m) => m.id === primaryPayment.memberId)
    : null;

  // Calculate current user's position in this expense (if currentMemberId is provided)
  const currentUserPayment = currentMemberId
    ? expense.payments.find((p) => p.memberId === currentMemberId)
    : null;
  const currentUserSplit = currentMemberId
    ? expense.splits.find((s) => s.memberId === currentMemberId)
    : null;

  const amountPaid = currentUserPayment ? currentUserPayment.amount : 0;
  const amountOwed = currentUserSplit ? currentUserSplit.owedAmount : 0;
  const netPosition = amountPaid - amountOwed;

  // Format amount with currency
  const formatAmount = (amount: number): string => {
    return formatCurrency(amount, currency);
  };

  // Create compact split summary for the "all" view
  const createSplitSummary = () => {
    if (variant !== "default") return null;

    // Get payer names
    const payerNames = expense.payments.map((p) => {
      const member = members.find((m) => m.id === p.memberId);
      return member
        ? currentMemberId && member.id === currentMemberId
          ? "You"
          : member.name.split(" ")[0]
        : "Unknown";
    });

    // Get receivers (who the expense was for)
    const receivers = expense.splits
      .filter((s) => s.owedAmount > 0)
      .map((s) => {
        const member = members.find((m) => m.id === s.memberId);
        return member
          ? currentMemberId && member.id === currentMemberId
            ? "You"
            : member.name.split(" ")[0]
          : "Unknown";
      });

    // If no specific receivers (like in equal splits), include all members
    const allMembers = expense.splits.map((s) => {
      const member = members.find((m) => m.id === s.memberId);
      return member
        ? currentMemberId && member.id === currentMemberId
          ? "You"
          : member.name.split(" ")[0]
        : "Unknown";
    });

    // Create the arrow notation
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-gray-600 dark:text-gray-400">
          {payerNames.join(", ")} →{" "}
          {receivers.length > 0 ? receivers.join(", ") : allMembers.join(", ")}
        </span>
      </div>
    );
  };

  // Handle click
  const handleClick = () => {
    if (onClick) {
      onClick(expense);
    }
  };

  // === Render different variants ===

  // Default variant (used in "All expenses" tab with category indicator and net position)
  if (variant === "default") {
    return (
      <div
        key={expense.id}
        className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden flex"
        onClick={handleClick}
      >
        {/* Category indicator */}
        <div
          className="w-1.5 h-auto"
          style={{
            backgroundColor: category?.color || "#9ca3af",
          }}
        ></div>

        <div className="flex-1 p-3">
          <div className="flex justify-between items-start mb-1">
            <div className="flex-1 mr-2">
              <h3 className="font-medium text-gray-900 dark:text-white truncate w-full mb-1.5 md:w-auto">
                <span>{expense.description}</span>
                {expense.notes && expense.notes.trim() !== "" && (
                  <span
                    className="ml-1.5 text-gray-400 dark:text-gray-500 cursor-help"
                    title={expense.notes}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3.5 w-3.5 inline"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                      />
                    </svg>
                  </span>
                )}
              </h3>
              <div className="flex items-center flex-wrap gap-1.5">
                {category && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-xs text-white whitespace-nowrap"
                    style={{ backgroundColor: category.color }}
                  >
                    {category.name}
                  </span>
                )}
                {paymentMethod && (
                  <span className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs">
                    {paymentMethod.icon}
                  </span>
                )}
                <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs text-gray-600 dark:text-gray-400 capitalize">
                  {expense.splitType} split
                </span>
              </div>
            </div>

            {/* Amount Section */}
            <div className="text-right flex-shrink-0">
              <div
                className={`text-lg font-semibold ${
                  currentMemberId
                    ? netPosition > 0
                      ? "text-green-600 dark:text-green-400"
                      : netPosition < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-gray-900 dark:text-white"
                    : "text-gray-900 dark:text-white"
                }`}
              >
                {formatAmount(expense.amount)}
              </div>
              {/* User Net Position */}
              {currentMemberId && (
                <div
                  className={`text-sm font-medium ${
                    netPosition > 0
                      ? "text-green-500 dark:text-green-500"
                      : netPosition < 0
                      ? "text-red-500 dark:text-red-500"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {netPosition > 0
                    ? `+${formatAmount(netPosition)}`
                    : netPosition < 0
                    ? `${formatAmount(netPosition)}`
                    : "Settled"}
                </div>
              )}
            </div>
          </div>

          {/* Date and Split Summary */}
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <span>{formatDate(expense.date)}</span>
            {createSplitSummary()}
          </div>
        </div>
      </div>
    );
  }

  // List variant (used in ExpenseList component)
  if (variant === "list") {
    return (
      <div
        key={expense.id}
        className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-sm p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <span className="text-lg">
                  {getInitials(primaryPayer?.name || "Unknown")}
                </span>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-medium">{expense.description}</h3>
              <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                <span>{formatDate(expense.date)}</span>
                <span>•</span>
                <span>Paid by {primaryPayer?.name || "Unknown"}</span>
                {category && (
                  <>
                    <span>•</span>
                    <span
                      className="px-2 py-0.5 rounded-full text-white text-xs"
                      style={{ backgroundColor: category.color }}
                    >
                      {category.name}
                    </span>
                  </>
                )}
                {paymentMethod && (
                  <>
                    <span>•</span>
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs">
                      {paymentMethod.icon}
                    </span>
                  </>
                )}
                {expense.notes && expense.notes.trim() !== "" && (
                  <>
                    <span>•</span>
                    <span
                      className="text-gray-500 dark:text-gray-400 cursor-help"
                      title={expense.notes}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 inline"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                        />
                      </svg>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-lg font-medium">
                {formatAmount(expense.amount)}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {expense.splits.length}{" "}
                {expense.splits.length === 1 ? "person" : "people"}
              </div>
            </div>
            {showActions && onEdit && onDelete && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(expense);
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(expense);
                  }}
                  className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Category variant (used in "By Category" tab)
  if (variant === "category") {
    return (
      <div
        key={expense.id}
        className="p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center"
        onClick={handleClick}
      >
        <div className="flex-1">
          <div className="flex justify-between items-center">
            <h3 className="font-medium flex items-center">
              {expense.description}
              {expense.notes && expense.notes.trim() !== "" && (
                <span
                  className="ml-1.5 text-gray-400 dark:text-gray-500"
                  title={expense.notes}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                    />
                  </svg>
                </span>
              )}
            </h3>
            <span className="font-semibold">
              {formatAmount(expense.amount)}
            </span>
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center">
              <span>{formatDate(expense.date)}</span>
              <span className="mx-2">•</span>
              <span>
                Paid by: {primaryPayer ? primaryPayer.name : "Unknown"}
                {expense.payments.length > 1 &&
                  ` +${expense.payments.length - 1}`}
              </span>
            </div>
            <span className="capitalize">{expense.splitType} split</span>
          </div>
        </div>
      </div>
    );
  }

  // Compact variant (more minimal for other uses)
  return (
    <div
      key={expense.id}
      className="p-2 border border-gray-100 dark:border-gray-700 rounded bg-white dark:bg-gray-800 flex items-center"
      onClick={handleClick}
    >
      <div className="flex-1">
        <div className="flex justify-between">
          <h3 className="font-medium text-sm flex items-center">
            {expense.description}
            {expense.notes && expense.notes.trim() !== "" && (
              <span
                className="ml-1 text-gray-400 dark:text-gray-500 cursor-help"
                title={expense.notes}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3 inline"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                  />
                </svg>
              </span>
            )}
          </h3>
          <span className="font-medium text-sm">
            {formatAmount(expense.amount)}
          </span>
        </div>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{formatDate(expense.date)}</span>
          <span>Paid by {primaryPayer?.name || "Unknown"}</span>
        </div>
      </div>
    </div>
  );
}
