import React from 'react'

interface SummaryCardsProps {
  stats: any
  formatAmount: (amount: number) => string
  type?: 'global' | 'personal'
}

export function SummaryCards({ stats, formatAmount, type = 'global' }: SummaryCardsProps) {
  if (type === 'personal' && stats?.personalStats) {
    return (
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-800/30 dark:bg-blue-900/30">
          <div className="mb-2 flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mr-1 h-5 w-5 text-blue-600 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Paid</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatAmount(stats.personalStats.summary.paidAmount || 0)}
          </p>
        </div>

        <div className="rounded-lg border border-rose-100 bg-rose-50 p-4 dark:border-rose-800/30 dark:bg-rose-900/30">
          <div className="mb-2 flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mr-1 h-5 w-5 text-rose-600 dark:text-rose-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z"
              />
            </svg>
            <h3 className="text-sm font-medium text-rose-700 dark:text-rose-300">Total Owed</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatAmount(stats.personalStats.summary.owedAmount || 0)}
          </p>
        </div>

        <div
          className={`${
            stats.personalStats.summary.balance >= 0
              ? 'border-green-100 bg-green-50 dark:border-green-800/30 dark:bg-green-900/30'
              : 'border-red-100 bg-red-50 dark:border-red-800/30 dark:bg-red-900/30'
          } rounded-lg border p-4`}
        >
          <div className="mb-2 flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`mr-1 h-5 w-5 ${
                stats.personalStats.summary.balance >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9M18 7l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
              />
            </svg>
            <h3
              className={`text-sm font-medium ${
                stats.personalStats.summary.balance >= 0
                  ? 'text-green-700 dark:text-green-300'
                  : 'text-red-700 dark:text-red-300'
              }`}
            >
              Net Balance
            </h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatAmount(Math.abs(stats.personalStats.summary.balance || 0))}
            {stats.personalStats.summary.balance >= 0 ? ' (to receive)' : ' (to pay)'}
          </p>
        </div>

        <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 dark:border-amber-800/30 dark:bg-amber-900/30">
          <div className="mb-2 flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mr-1 h-5 w-5 text-amber-600 dark:text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
            <h3 className="text-sm font-medium text-amber-700 dark:text-amber-300">Expenses</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.personalStats.summary.expenseCount || 0}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-800/30 dark:bg-blue-900/30">
        <div className="mb-2 flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="mr-1 h-5 w-5 text-blue-600 dark:text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Expenses</h3>
        </div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {formatAmount(stats?.summary?.totalAmount || 0)}
        </p>
      </div>

      <div className="rounded-lg border border-purple-100 bg-purple-50 p-4 dark:border-purple-800/30 dark:bg-purple-900/30">
        <div className="mb-2 flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="mr-1 h-5 w-5 text-purple-600 dark:text-purple-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z"
            />
          </svg>
          <h3 className="text-sm font-medium text-purple-700 dark:text-purple-300">Number of Expenses</h3>
        </div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {stats?.summary?.expenseCount || 0}
        </p>
      </div>

      <div className="rounded-lg border border-green-100 bg-green-50 p-4 dark:border-green-800/30 dark:bg-green-900/30">
        <div className="mb-2 flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="mr-1 h-5 w-5 text-green-600 dark:text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
            />
          </svg>
          <h3 className="text-sm font-medium text-green-700 dark:text-green-300">Average Expense</h3>
        </div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {formatAmount(stats?.summary?.averageAmount || 0)}
        </p>
      </div>

      <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 dark:border-amber-800/30 dark:bg-amber-900/30">
        <div className="mb-2 flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="mr-1 h-5 w-5 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
          <h3 className="text-sm font-medium text-amber-700 dark:text-amber-300">Largest Expense</h3>
        </div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {formatAmount(stats?.summary?.largestExpense?.amount || 0)}
        </p>
        {stats?.summary?.largestExpense && (
          <p className="mt-1 truncate text-xs text-gray-600 dark:text-gray-400">
            {stats.summary.largestExpense.description}
          </p>
        )}
      </div>
    </div>
  )
}
