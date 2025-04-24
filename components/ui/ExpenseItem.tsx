import { formatCurrency } from '../../utils/currency'

interface Category {
  id: string
  name: string
  color: string
}

interface Member {
  id: string
  name: string
}

interface Payment {
  memberId: string
  amount: number
}

interface Split {
  memberId: string
  amount?: number
  shares?: number
  percent?: number
  owedAmount: number
}

interface PaymentMethod {
  id: string
  name: string
  icon: string
}

export interface ExpenseItemProps {
  expense: {
    id: string
    description: string
    amount: number
    date: string | Date
    splitType: 'even' | 'amount' | 'percent' | 'shares'
    categoryId: string | null
    paymentMethodId?: string | null
    payments: Payment[]
    splits: Split[]
    notes?: string
    createdAt?: string | Date
  }
  members: Member[]
  categories: Category[]
  paymentMethods: PaymentMethod[]
  currency: string
  currentMemberId?: string
  onEdit?: (expense: any) => void
  onDelete?: (expense: any) => void
  onClick?: (expense: any) => void
  variant?: 'default' | 'compact' | 'list' | 'category'
  showActions?: boolean
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

function formatDate(date: Date | string | number): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
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
  variant = 'default',
  showActions = true,
}: ExpenseItemProps) {
  const category = expense.categoryId ? categories.find((c) => c.id === expense.categoryId) : null
  const paymentMethod = expense.paymentMethodId
    ? paymentMethods.find((m) => m.id === expense.paymentMethodId)
    : null

  // Find the member who paid the most for this expense
  const primaryPayment =
    expense.payments.length > 0 ? [...expense.payments].sort((a, b) => b.amount - a.amount)[0] : null
  const primaryPayer = primaryPayment ? members.find((m) => m.id === primaryPayment.memberId) : null

  // Calculate the current user's payment and owed amount, if applicable
  const currentUserPayment = currentMemberId
    ? expense.payments.find((p) => p.memberId === currentMemberId)
    : null
  const currentUserSplit = currentMemberId ? expense.splits.find((s) => s.memberId === currentMemberId) : null

  const amountPaid = currentUserPayment ? currentUserPayment.amount : 0
  const amountOwed = currentUserSplit ? currentUserSplit.owedAmount : 0
  const netPosition = amountPaid - amountOwed

  const formatAmount = (amount: number): string => {
    return formatCurrency(amount, currency)
  }

  // Returns a summary of who paid and who owes for the default variant
  const createSplitSummary = () => {
    if (variant !== 'default') return null

    const payerNames = expense.payments.map((p) => {
      const member = members.find((m) => m.id === p.memberId)
      return member
        ? currentMemberId && member.id === currentMemberId
          ? 'You'
          : member.name.split(' ')[0]
        : 'Unknown'
    })

    const receivers = expense.splits
      .filter((s) => s.owedAmount > 0)
      .map((s) => {
        const member = members.find((m) => m.id === s.memberId)
        return member
          ? currentMemberId && member.id === currentMemberId
            ? 'You'
            : member.name.split(' ')[0]
          : 'Unknown'
      })

    const allMembers = expense.splits.map((s) => {
      const member = members.find((m) => m.id === s.memberId)
      return member
        ? currentMemberId && member.id === currentMemberId
          ? 'You'
          : member.name.split(' ')[0]
        : 'Unknown'
    })

    return (
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-gray-600 dark:text-gray-400">
          {payerNames.join(', ')} → {receivers.length > 0 ? receivers.join(', ') : allMembers.join(', ')}
        </span>
      </div>
    )
  }

  const handleClick = () => {
    if (onClick) {
      onClick(expense)
    }
  }

  // Render the default variant (shows category, net position, etc.)
  if (variant === 'default') {
    return (
      <div
        key={expense.id}
        className="flex cursor-pointer overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
        onClick={handleClick}
      >
        {/* Colored bar for category */}
        <div
          className="h-auto w-1.5"
          style={{
            backgroundColor: category?.color || '#9ca3af',
          }}
        ></div>

        <div className="flex-1 p-3">
          <div className="mb-1 flex items-start justify-between">
            <div className="mr-2 flex-1">
              <h3 className="mb-1.5 w-full truncate font-medium text-gray-900 dark:text-white md:w-auto">
                <span>{expense.description}</span>
                {expense.notes && expense.notes.trim() !== '' && (
                  <span className="ml-1.5 cursor-help text-gray-400 dark:text-gray-500" title={expense.notes}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="inline h-3.5 w-3.5"
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
              <div className="flex flex-wrap items-center gap-1.5">
                {category && (
                  <span
                    className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-xs text-white"
                    style={{ backgroundColor: category.color }}
                  >
                    {category.name}
                  </span>
                )}
                {paymentMethod && (
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                    {paymentMethod.icon}
                  </span>
                )}
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs capitalize text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  {expense.splitType} split
                </span>
              </div>
            </div>

            <div className="flex-shrink-0 text-right">
              <div
                className={`text-lg font-semibold ${
                  currentMemberId
                    ? netPosition > 0
                      ? 'text-green-600 dark:text-green-400'
                      : netPosition < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-900 dark:text-white'
                    : 'text-gray-900 dark:text-white'
                }`}
              >
                {formatAmount(expense.amount)}
              </div>
              {currentMemberId && (
                <div
                  className={`text-sm font-medium ${
                    netPosition > 0
                      ? 'text-green-500 dark:text-green-500'
                      : netPosition < 0
                        ? 'text-red-500 dark:text-red-500'
                        : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {netPosition > 0
                    ? `+${formatAmount(netPosition)}`
                    : netPosition < 0
                      ? `${formatAmount(netPosition)}`
                      : 'Settled'}
                </div>
              )}
            </div>
          </div>

          <div className="text-sm text-gray-500 dark:text-gray-400">
            <span>{formatDate(expense.date)}</span>
            {createSplitSummary()}
          </div>
        </div>
      </div>
    )
  }

  // Render the list variant (used in ExpenseList component)
  if (variant === 'list') {
    return (
      <div
        key={expense.id}
        className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
                <span className="text-lg">{getInitials(primaryPayer?.name || 'Unknown')}</span>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-medium">{expense.description}</h3>
              <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                <span>{formatDate(expense.date)}</span>
                <span>•</span>
                <span>Paid by {primaryPayer?.name || 'Unknown'}</span>
                {category && (
                  <>
                    <span>•</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs text-white"
                      style={{ backgroundColor: category.color }}
                    >
                      {category.name}
                    </span>
                  </>
                )}
                {paymentMethod && (
                  <>
                    <span>•</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                      {paymentMethod.icon}
                    </span>
                  </>
                )}
                {expense.notes && expense.notes.trim() !== '' && (
                  <>
                    <span>•</span>
                    <span className="cursor-help text-gray-500 dark:text-gray-400" title={expense.notes}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="inline h-4 w-4"
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
              <div className="text-lg font-medium">{formatAmount(expense.amount)}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {expense.splits.length} {expense.splits.length === 1 ? 'person' : 'people'}
              </div>
            </div>
            {showActions && onEdit && onDelete && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(expense)
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
                    e.stopPropagation()
                    onDelete(expense)
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
    )
  }

  // Render the category variant (used in "By Category" tab)
  if (variant === 'category') {
    return (
      <div
        key={expense.id}
        className="flex cursor-pointer items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-800"
        onClick={handleClick}
      >
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center font-medium">
              {expense.description}
              {expense.notes && expense.notes.trim() !== '' && (
                <span className="ml-1.5 text-gray-400 dark:text-gray-500" title={expense.notes}>
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
            <span className="font-semibold">{formatAmount(expense.amount)}</span>
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center">
              <span>{formatDate(expense.date)}</span>
              <span className="mx-2">•</span>
              <span>
                Paid by: {primaryPayer ? primaryPayer.name : 'Unknown'}
                {expense.payments.length > 1 && ` +${expense.payments.length - 1}`}
              </span>
            </div>
            <span className="capitalize">{expense.splitType} split</span>
          </div>
        </div>
      </div>
    )
  }

  // Render the compact variant (minimal display)
  return (
    <div
      key={expense.id}
      className="flex items-center rounded border border-gray-100 bg-white p-2 dark:border-gray-700 dark:bg-gray-800"
      onClick={handleClick}
    >
      <div className="flex-1">
        <div className="flex justify-between">
          <h3 className="flex items-center text-sm font-medium">
            {expense.description}
            {expense.notes && expense.notes.trim() !== '' && (
              <span className="ml-1 cursor-help text-gray-400 dark:text-gray-500" title={expense.notes}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="inline h-3 w-3"
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
          <span className="text-sm font-medium">{formatAmount(expense.amount)}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{formatDate(expense.date)}</span>
          <span>Paid by {primaryPayer?.name || 'Unknown'}</span>
        </div>
      </div>
    </div>
  )
}
