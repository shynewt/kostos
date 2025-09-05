import React from 'react'

interface BaseTableProps {
  stats: any
  formatAmount: (amount: number) => string
}

export function CategoryBreakdownTable({ stats, formatAmount }: BaseTableProps) {
  return (
    <div className="mb-8 rounded-lg border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 text-lg font-semibold">Category Breakdown</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                % of Total
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                # of Expenses
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Average
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {stats?.expensesByCategory?.map((category: any) => (
              <tr key={category.id}>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center">
                    <div
                      className="mr-2 h-4 w-4 rounded-full"
                      style={{ backgroundColor: category.color }}
                    ></div>
                    {category.name}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">{formatAmount(category.totalAmount)}</td>
                <td className="whitespace-nowrap px-4 py-3">{category.percentage.toFixed(1)}%</td>
                <td className="whitespace-nowrap px-4 py-3">{category.expenseCount}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatAmount(category.averageAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function PaymentMethodsList({ stats, formatAmount }: BaseTableProps) {
  return (
    <div className="mb-8 rounded-lg border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 text-lg font-semibold">Payment Methods</h3>
      <div className="space-y-4">
        {stats?.expensesByPaymentMethod?.map((method: any) => (
          <div
            key={method.id}
            className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-700"
          >
            <div className="flex items-center">
              <span className="mr-3 text-2xl">{method.icon}</span>
              <div>
                <h3 className="font-medium">{method.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {method.expenseCount} {method.expenseCount === 1 ? 'expense' : 'expenses'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-medium">{formatAmount(method.totalAmount)}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {method.percentage.toFixed(1)}% of total
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PersonalCategoriesTable({ stats, formatAmount }: BaseTableProps) {
  if (!stats?.personalStats?.topCategories) return null

  return (
    <div className="mb-8 rounded-lg border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 text-lg font-semibold">Your Top Categories</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Paid
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Owed
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {stats.personalStats.topCategories.map((category: any) => (
              <tr key={category.id}>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center">
                    <div
                      className="mr-2 h-4 w-4 rounded-full"
                      style={{ backgroundColor: category.color }}
                    ></div>
                    {category.name}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">{formatAmount(category.paidAmount)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatAmount(category.owedAmount)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatAmount(category.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
