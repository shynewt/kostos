import { useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../../components/Layout'
import { useProjectStats } from '../../../hooks/useProjectStats'
import { StatsFilters } from '../../../components/stats/StatsFilters'
import { SummaryCards } from '../../../components/stats/SummaryCards'
import {
  CategoryChart,
  PaymentMethodChart,
  MonthlyTrendsChart,
  DayOfWeekChart,
  MemberSpendingChart,
  PersonalMonthlySpendingChart,
  PersonalCategoryChart,
  PersonalPaymentMethodChart,
} from '../../../components/stats/StatsCharts'
import {
  CategoryBreakdownTable,
  PaymentMethodsList,
  PersonalCategoriesTable,
} from '../../../components/stats/StatsTables'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineController,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  RadialLinearScale,
} from 'chart.js'

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineController,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  RadialLinearScale
)

export default function ProjectStats() {
  const router = useRouter()
  const { id: projectId, memberId } = router.query

  // Filter states
  const [timeFrame, setTimeFrame] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null)
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'global' | 'personal'>('global')

  // Use the custom hook for data fetching
  const { isLoading, error, stats, project, currentMember, formatAmount, hasPersonalStats } = useProjectStats(
    {
      projectId: projectId as string | undefined,
      memberId: memberId as string | undefined,
      timeFrame,
      customStartDate,
      customEndDate,
      selectedCategory,
      selectedPaymentMethod,
    }
  )

  if (isLoading && !stats) {
    return (
      <Layout title={project?.name ? `${project.name} - Stats` : 'Project Stats'}>
        <div className="flex h-64 items-center justify-center">
          <p>Loading stats...</p>
        </div>
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout title={project?.name ? `${project.name} - Stats` : 'Project Stats'}>
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">{error}</div>
          <button
            onClick={() => router.push(`/projects/${projectId}?memberId=${memberId}`)}
            className="btn btn-primary"
          >
            Back to Project
          </button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title={project?.name ? `${project.name} - Stats` : 'Project Stats'}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{project?.name} - Statistics</h1>
            {project?.description && (
              <p className="mt-1 text-gray-600 dark:text-gray-400">{project.description}</p>
            )}
          </div>

          <button
            onClick={() => router.push(`/projects/${projectId}?memberId=${memberId}`)}
            className="btn btn-secondary"
          >
            Back to Project
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <ul className="-mb-px flex flex-wrap">
            <li className="mr-2">
              <button
                onClick={() => setActiveTab('global')}
                className={`inline-block rounded-t-lg border-b-2 px-4 py-4 text-center text-sm font-medium ${
                  activeTab === 'global'
                    ? 'active border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500'
                    : 'border-transparent hover:border-gray-300 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                Project Statistics
              </button>
            </li>
            {hasPersonalStats && (
              <li className="mr-2">
                <button
                  onClick={() => setActiveTab('personal')}
                  className={`inline-block rounded-t-lg border-b-2 px-4 py-4 text-center text-sm font-medium ${
                    activeTab === 'personal'
                      ? 'active border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500'
                      : 'border-transparent hover:border-gray-300 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                >
                  Personal Statistics
                </button>
              </li>
            )}
          </ul>
        </div>

        {/* Filters */}
        <StatsFilters
          timeFrame={timeFrame}
          setTimeFrame={setTimeFrame}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          selectedPaymentMethod={selectedPaymentMethod}
          setSelectedPaymentMethod={setSelectedPaymentMethod}
          customStartDate={customStartDate}
          setCustomStartDate={setCustomStartDate}
          customEndDate={customEndDate}
          setCustomEndDate={setCustomEndDate}
          stats={stats}
        />

        {/* Tab Content */}
        {activeTab === 'global' ? (
          <div className="global-stats-content">
            {/* Summary Cards */}
            <SummaryCards stats={stats} formatAmount={formatAmount} type="global" />

            {/* Expense Distribution Charts */}
            <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <CategoryChart stats={stats} formatAmount={formatAmount} />
              <PaymentMethodChart stats={stats} formatAmount={formatAmount} />
            </div>

            {/* Time-based Analysis */}
            <div className="mb-8 grid grid-cols-1 gap-6">
              <MonthlyTrendsChart stats={stats} formatAmount={formatAmount} />
              <DayOfWeekChart stats={stats} formatAmount={formatAmount} />
            </div>

            {/* Member Spending Analysis */}
            <MemberSpendingChart stats={stats} formatAmount={formatAmount} />

            {/* Category Breakdown Table */}
            <CategoryBreakdownTable stats={stats} formatAmount={formatAmount} />

            {/* Payment Methods Section */}
            <PaymentMethodsList stats={stats} formatAmount={formatAmount} />
          </div>
        ) : (
          <div className="personal-stats-content">
            {stats?.personalStats ? (
              <>
                {/* Personal Summary Cards */}
                <SummaryCards stats={stats} formatAmount={formatAmount} type="personal" />

                {/* Personal Charts Grid */}
                <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <PersonalCategoryChart stats={stats} formatAmount={formatAmount} />
                  <PersonalPaymentMethodChart stats={stats} formatAmount={formatAmount} />
                </div>

                {/* Personal Monthly Spending */}
                <PersonalMonthlySpendingChart stats={stats} formatAmount={formatAmount} />

                {/* Personal Categories Table */}
                <PersonalCategoriesTable stats={stats} formatAmount={formatAmount} />
              </>
            ) : (
              <div className="flex h-64 items-center justify-center text-gray-500">
                No personal data available
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
