import React from 'react'
import { Bar, Pie, Line, Doughnut, Chart } from 'react-chartjs-2'
import { format } from 'date-fns'

interface ChartContainerProps {
  title: string
  children: React.ReactNode
  height?: string
}

function ChartContainer({ title, children, height = 'h-64' }: ChartContainerProps) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 text-lg font-semibold">{title}</h3>
      <div className={`relative ${height}`}>{children}</div>
    </div>
  )
}

interface BaseChartProps {
  stats: any
  formatAmount: (amount: number) => string
}

export function CategoryChart({ stats, formatAmount }: BaseChartProps) {
  const prepareCategoryChartData = () => {
    if (!stats || !stats.expensesByCategory || stats.expensesByCategory.length === 0) return null

    return {
      labels: stats.expensesByCategory.map((category: any) => category.name),
      datasets: [
        {
          data: stats.expensesByCategory.map((category: any) => category.totalAmount),
          backgroundColor: stats.expensesByCategory.map((category: any) => category.color),
          borderWidth: 1,
        },
      ],
    }
  }

  const chartData = prepareCategoryChartData()

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'right' as const,
        align: 'center' as const,
      },
    },
  }

  return (
    <ChartContainer title="Expenses by Category">
      {chartData ? (
        <Doughnut data={chartData} options={options} />
      ) : (
        <div className="flex h-full items-center justify-center text-gray-500">
          No category data available
        </div>
      )}
    </ChartContainer>
  )
}

export function PaymentMethodChart({ stats }: BaseChartProps) {
  const preparePaymentMethodChartData = () => {
    if (!stats || !stats.expensesByPaymentMethod || stats.expensesByPaymentMethod.length === 0)
      return null

    return {
      labels: stats.expensesByPaymentMethod.map((method: any) => method.name),
      datasets: [
        {
          data: stats.expensesByPaymentMethod.map((method: any) => method.totalAmount),
          backgroundColor: [
            'rgba(59, 130, 246, 0.7)',
            'rgba(16, 185, 129, 0.7)',
            'rgba(249, 115, 22, 0.7)',
            'rgba(236, 72, 153, 0.7)',
            'rgba(139, 92, 246, 0.7)',
            'rgba(20, 184, 166, 0.7)',
            'rgba(245, 158, 11, 0.7)',
            'rgba(239, 68, 68, 0.7)',
            'rgba(99, 102, 241, 0.7)',
          ],
          borderWidth: 1,
        },
      ],
    }
  }

  const chartData = preparePaymentMethodChartData()

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
  }

  return (
    <ChartContainer title="Expenses by Payment Method">
      {chartData ? (
        <Pie data={chartData} options={options} />
      ) : (
        <div className="flex h-full items-center justify-center text-gray-500">
          No payment method data available
        </div>
      )}
    </ChartContainer>
  )
}

export function MonthlyTrendsChart({ stats, formatAmount }: BaseChartProps) {
  const formatMonthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split('-')
    return format(new Date(parseInt(year), parseInt(month) - 1, 1), 'MMM yyyy')
  }

  const prepareMonthlyTrendsChartData = () => {
    if (!stats || !stats.monthlyTrends || stats.monthlyTrends.length < 2) return null

    return {
      labels: stats.monthlyTrends.map((item: any) => formatMonthLabel(item.month)),
      datasets: [
        {
          type: 'bar' as const,
          label: 'Amount',
          data: stats.monthlyTrends.map((item: any) => item.amount),
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 1,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line' as const,
          label: '% Change',
          data: stats.monthlyTrends.map((item: any) => item.changePercent),
          borderColor: 'rgb(16, 185, 129)',
          backgroundColor: 'rgba(16, 185, 129, 0.5)',
          borderWidth: 2,
          tension: 0.3,
          yAxisID: 'y1',
          order: 1,
        },
      ],
    }
  }

  const chartData = prepareMonthlyTrendsChartData()

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            const label = context.dataset.label || ''
            const value = context.raw !== null ? context.raw : 0
            if (context.datasetIndex === 1) {
              return `${label}: ${value.toFixed(1)}%`
            }
            return `${label}: ${formatAmount(value)}`
          },
        },
      },
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Amount',
        },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: {
          drawOnChartArea: false,
        },
        title: {
          display: true,
          text: '% Change',
        },
      },
    },
  }

  return (
    <ChartContainer title="Monthly Expense Trends" height="h-72">
      {chartData ? (
        <Chart type="bar" data={chartData as any} options={options} />
      ) : (
        <div className="flex h-full items-center justify-center text-gray-500">
          Insufficient data for trends (need at least 2 months)
        </div>
      )}
    </ChartContainer>
  )
}

export function DayOfWeekChart({ stats }: BaseChartProps) {
  const prepareDayOfWeekChartData = () => {
    if (!stats || !stats.expensesByDayOfWeek) return null

    return {
      labels: stats.expensesByDayOfWeek.map((item: any) => item.day),
      datasets: [
        {
          label: 'Expense Count',
          data: stats.expensesByDayOfWeek.map((item: any) => item.count),
          backgroundColor: 'rgba(99, 102, 241, 0.5)',
          borderColor: 'rgb(99, 102, 241)',
          borderWidth: 1,
          yAxisID: 'y',
        },
        {
          label: 'Amount Spent',
          data: stats.expensesByDayOfWeek.map((item: any) => item.amount),
          backgroundColor: 'rgba(236, 72, 153, 0.5)',
          borderColor: 'rgb(236, 72, 153)',
          borderWidth: 1,
          yAxisID: 'y1',
        },
      ],
    }
  }

  const chartData = prepareDayOfWeekChartData()

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Count',
        },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: {
          drawOnChartArea: false,
        },
        title: {
          display: true,
          text: 'Amount',
        },
      },
    },
  }

  return (
    <ChartContainer title="Expenses by Day of Week" height="h-72">
      {chartData ? (
        <Bar data={chartData} options={options} />
      ) : (
        <div className="flex h-full items-center justify-center text-gray-500">
          No day of week data available
        </div>
      )}
    </ChartContainer>
  )
}

export function MemberSpendingChart({ stats }: BaseChartProps) {
  const prepareMemberSpendingChartData = () => {
    if (!stats || !stats.memberSpending || stats.memberSpending.length === 0) return null

    return {
      labels: stats.memberSpending.map((member: any) => member.name),
      datasets: [
        {
          label: 'Paid',
          data: stats.memberSpending.map((member: any) => member.paidAmount),
          backgroundColor: 'rgba(16, 185, 129, 0.5)',
          borderColor: 'rgb(16, 185, 129)',
          borderWidth: 1,
        },
        {
          label: 'Owed',
          data: stats.memberSpending.map((member: any) => member.owedAmount),
          backgroundColor: 'rgba(239, 68, 68, 0.5)',
          borderColor: 'rgb(239, 68, 68)',
          borderWidth: 1,
        },
      ],
    }
  }

  const chartData = prepareMemberSpendingChartData()

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
  }

  return (
    <div className="mb-8 rounded-lg border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 text-lg font-semibold">Member Spending Analysis</h3>
      <div className="relative h-80">
        {chartData ? (
          <Bar data={chartData} options={options} />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            No member spending data available
          </div>
        )}
      </div>
    </div>
  )
}

export function PersonalMonthlySpendingChart({ stats, formatAmount }: BaseChartProps) {
  const formatMonthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split('-')
    return format(new Date(parseInt(year), parseInt(month) - 1, 1), 'MMM yyyy')
  }

  const preparePersonalMonthlySpendingChartData = () => {
    if (!stats?.personalStats?.monthlySpending || stats.personalStats.monthlySpending.length === 0)
      return null

    return {
      labels: stats.personalStats.monthlySpending.map((item: any) => formatMonthLabel(item.month)),
      datasets: [
        {
          label: 'Paid',
          data: stats.personalStats.monthlySpending.map((item: any) => item.paidAmount),
          backgroundColor: 'rgba(16, 185, 129, 0.5)',
          borderColor: 'rgb(16, 185, 129)',
          borderWidth: 1,
        },
        {
          label: 'Owed',
          data: stats.personalStats.monthlySpending.map((item: any) => item.owedAmount),
          backgroundColor: 'rgba(239, 68, 68, 0.5)',
          borderColor: 'rgb(239, 68, 68)',
          borderWidth: 1,
        },
      ],
    }
  }

  const chartData = preparePersonalMonthlySpendingChartData()

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
  }

  return (
    <div className="mb-8 rounded-lg border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 text-lg font-semibold">Your Monthly Spending</h3>
      <div className="relative h-72">
        {chartData ? (
          <Bar data={chartData} options={options} />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            No monthly data available
          </div>
        )}
      </div>
    </div>
  )
}

export function PersonalCategoryChart({ stats }: BaseChartProps) {
  const preparePersonalCategoryChartData = () => {
    if (!stats?.personalStats?.topCategories || stats.personalStats.topCategories.length === 0) return null

    return {
      labels: stats.personalStats.topCategories.map((category: any) => category.name),
      datasets: [
        {
          data: stats.personalStats.topCategories.map((category: any) => category.totalAmount),
          backgroundColor: stats.personalStats.topCategories.map((category: any) => category.color),
          borderWidth: 1,
        },
      ],
    }
  }

  const chartData = preparePersonalCategoryChartData()

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'right' as const,
        align: 'center' as const,
      },
    },
  }

  return (
    <ChartContainer title="Your Top Categories">
      {chartData ? (
        <Doughnut data={chartData} options={options} />
      ) : (
        <div className="flex h-full items-center justify-center text-gray-500">
          No category data available
        </div>
      )}
    </ChartContainer>
  )
}

export function PersonalPaymentMethodChart({ stats }: BaseChartProps) {
  const preparePersonalPaymentMethodChartData = () => {
    if (!stats?.personalStats?.topPaymentMethods || stats.personalStats.topPaymentMethods.length === 0)
      return null

    return {
      labels: stats.personalStats.topPaymentMethods.map((method: any) => method.name),
      datasets: [
        {
          data: stats.personalStats.topPaymentMethods.map((method: any) => method.totalAmount),
          backgroundColor: [
            'rgba(59, 130, 246, 0.7)',
            'rgba(16, 185, 129, 0.7)',
            'rgba(249, 115, 22, 0.7)',
            'rgba(236, 72, 153, 0.7)',
            'rgba(139, 92, 246, 0.7)',
          ],
          borderWidth: 1,
        },
      ],
    }
  }

  const chartData = preparePersonalPaymentMethodChartData()

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
  }

  return (
    <ChartContainer title="Your Payment Methods">
      {chartData ? (
        <Pie data={chartData} options={options} />
      ) : (
        <div className="flex h-full items-center justify-center text-gray-500">
          No payment method data available
        </div>
      )}
    </ChartContainer>
  )
}
