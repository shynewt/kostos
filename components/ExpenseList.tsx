import { formatCurrency } from '../utils/currency'
import { useState } from 'react'
import ExpenseItem from './ui/ExpenseItem'

interface Category {
  id: string
  name: string
  color: string
}

interface PaymentMethod {
  id: string
  name: string
  icon: string
}

interface ExpenseListProps {
  expenses: any[]
  members: any[]
  categories: Category[]
  paymentMethods: PaymentMethod[]
  currency: string
  onEditExpense: (expense: any) => void
  onDeleteExpense: (expense: any) => void
  itemsPerPage?: number
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

export default function ExpenseList({
  expenses,
  members,
  categories,
  paymentMethods,
  currency,
  onEditExpense,
  onDeleteExpense,
  itemsPerPage = 50,
}: ExpenseListProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [perPage, setPerPage] = useState(itemsPerPage)

  const formatAmount = (amount: number): string => {
    return formatCurrency(amount, currency)
  }

  const totalPages = Math.ceil(expenses.length / perPage)
  const indexOfLastExpense = currentPage * perPage
  const indexOfFirstExpense = indexOfLastExpense - perPage
  const currentExpenses = expenses.slice(indexOfFirstExpense, indexOfLastExpense)

  const goToPage = (page: number) => {
    setCurrentPage(page)
  }

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPerPage = parseInt(e.target.value, 10)
    setPerPage(newPerPage)
    setCurrentPage(1)
  }

  return (
    <div>
      <div className="space-y-4">
        {currentExpenses.map((expense) => (
          <ExpenseItem
            key={expense.id}
            expense={expense}
            members={members}
            categories={categories}
            paymentMethods={paymentMethods}
            currency={currency}
            onEdit={onEditExpense}
            onDelete={onDeleteExpense}
            variant="list"
          />
        ))}
      </div>

      {expenses.length > 0 && (
        <div className="mt-6 flex flex-col items-center justify-between space-y-3 sm:flex-row sm:space-y-0">
          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
            <span>
              Showing {indexOfFirstExpense + 1}-{Math.min(indexOfLastExpense, expenses.length)} of{' '}
              {expenses.length} expenses
            </span>
            <div className="ml-4 flex items-center">
              <label htmlFor="itemsPerPage" className="mr-2">
                Items per page:
              </label>
              <select
                id="itemsPerPage"
                value={perPage}
                onChange={handleItemsPerPageChange}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
              className="rounded-md border border-gray-300 bg-white p-1.5 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-md border border-gray-300 bg-white p-1.5 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex items-center">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum

                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => goToPage(pageNum)}
                    className={`mx-0.5 h-8 w-8 rounded-md ${
                      currentPage === pageNum
                        ? 'bg-indigo-600 text-white'
                        : 'border border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages || totalPages === 0}
              className="rounded-md border border-gray-300 bg-white p-1.5 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
              className="rounded-md border border-gray-300 bg-white p-1.5 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 5l7 7-7 7M5 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
