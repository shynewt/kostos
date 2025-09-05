import { useState, useEffect } from 'react'
import { formatCurrency } from '../utils/currency'

interface UseProjectStatsOptions {
  projectId: string | undefined
  memberId: string | undefined
  timeFrame: string
  customStartDate: string
  customEndDate: string
  selectedCategory: string | null
  selectedPaymentMethod: string | null
}

export function useProjectStats({
  projectId,
  memberId,
  timeFrame,
  customStartDate,
  customEndDate,
  selectedCategory,
  selectedPaymentMethod,
}: UseProjectStatsOptions) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [currentMember, setCurrentMember] = useState<any>(null)

  // Fetch project data
  useEffect(() => {
    if (!projectId || !memberId) return

    const fetchProject = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`)
        const result = await response.json()

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch project')
        }

        setProject(result.data)

        // Find current member
        const member = result.data.members.find((m: any) => m.id === memberId)
        if (!member) {
          throw new Error('Member not found in this project')
        }

        setCurrentMember(member)
      } catch (error) {
        console.error('Error fetching project:', error)
        setError(error instanceof Error ? error.message : 'Failed to fetch project')
      }
    }

    fetchProject()
  }, [projectId, memberId])

  // Fetch stats data with filters
  useEffect(() => {
    if (!projectId || !memberId) return

    const fetchStats = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Build query parameters
        const params = new URLSearchParams()
        params.append('memberId', memberId as string)

        if (timeFrame === 'month') {
          const now = new Date()
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
          params.append('startDate', startOfMonth.toISOString())
        } else if (timeFrame === 'year') {
          const now = new Date()
          const startOfYear = new Date(now.getFullYear(), 0, 1)
          params.append('startDate', startOfYear.toISOString())
        } else if (timeFrame === '3months') {
          const now = new Date()
          const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
          params.append('startDate', threeMonthsAgo.toISOString())
        } else if (timeFrame === '6months') {
          const now = new Date()
          const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
          params.append('startDate', sixMonthsAgo.toISOString())
        } else if (timeFrame === 'custom') {
          if (customStartDate) {
            params.append('startDate', new Date(customStartDate).toISOString())
          }
          if (customEndDate) {
            params.append('endDate', new Date(customEndDate).toISOString())
          }
        }

        if (selectedCategory) {
          params.append('categoryId', selectedCategory)
        }

        if (selectedPaymentMethod) {
          params.append('paymentMethodId', selectedPaymentMethod)
        }

        const response = await fetch(`/api/projects/${projectId}/stats?${params.toString()}`)
        const result = await response.json()

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch stats')
        }

        setStats(result.data)
      } catch (error) {
        console.error('Error fetching stats:', error)
        setError(error instanceof Error ? error.message : 'Failed to fetch stats')
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [
    projectId,
    memberId,
    timeFrame,
    customStartDate,
    customEndDate,
    selectedCategory,
    selectedPaymentMethod,
  ])

  // Format currency with project's currency
  const formatAmount = (amount: number) => {
    return formatCurrency(amount, stats?.currency || project?.currency || 'USD')
  }

  // Helper to determine if we have personal stats
  const hasPersonalStats =
    stats?.personalStats &&
    (stats.personalStats.topCategories?.length > 0 || stats.personalStats.topPaymentMethods?.length > 0)

  return {
    isLoading,
    error,
    stats,
    project,
    currentMember,
    formatAmount,
    hasPersonalStats,
  }
}
