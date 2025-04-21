import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../../components/Layout';
import { format, parseISO, subMonths } from 'date-fns';
import { formatCurrency } from '../../../utils/currency';
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
  ChartData,
} from 'chart.js';
import { Bar, Pie, Line, Doughnut, PolarArea, Radar, Chart } from 'react-chartjs-2';

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
);

// Define time frame options
const TIME_FRAMES = [
  { label: 'All Time', value: 'all' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year', value: 'year' },
  { label: 'Last 3 Months', value: '3months' },
  { label: 'Last 6 Months', value: '6months' },
  { label: 'Custom', value: 'custom' },
];

// Day of week labels
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ProjectStats() {
  const router = useRouter();
  const { id: projectId, memberId } = router.query;
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [project, setProject] = useState<any>(null);
  const [currentMember, setCurrentMember] = useState<any>(null);
  
  // Filter states
  const [timeFrame, setTimeFrame] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'global' | 'personal'>('global');
  
  // Fetch project data (for name, description, etc.)
  useEffect(() => {
    if (!projectId || !memberId) return;
    
    const fetchProject = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`);
        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch project');
        }
        
        setProject(result.data);
        
        // Find current member
        const member = result.data.members.find((m: any) => m.id === memberId);
        if (!member) {
          throw new Error('Member not found in this project');
        }
        
        setCurrentMember(member);
      } catch (error) {
        console.error('Error fetching project:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch project');
      }
    };
    
    fetchProject();
  }, [projectId, memberId]);
  
  // Fetch stats data with filters
  useEffect(() => {
    if (!projectId || !memberId) return;
    
    const fetchStats = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Build query parameters based on selected time frame and filters
        const params = new URLSearchParams();
        
        // Always include memberId for personal stats
        params.append('memberId', memberId as string);
        
        if (timeFrame === 'month') {
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          params.append('startDate', startOfMonth.toISOString());
        } else if (timeFrame === 'year') {
          const now = new Date();
          const startOfYear = new Date(now.getFullYear(), 0, 1);
          params.append('startDate', startOfYear.toISOString());
        } else if (timeFrame === '3months') {
          const now = new Date();
          const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
          params.append('startDate', threeMonthsAgo.toISOString());
        } else if (timeFrame === '6months') {
          const now = new Date();
          const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
          params.append('startDate', sixMonthsAgo.toISOString());
        } else if (timeFrame === 'custom') {
          if (customStartDate) {
            params.append('startDate', new Date(customStartDate).toISOString());
          }
          if (customEndDate) {
            params.append('endDate', new Date(customEndDate).toISOString());
          }
        }
        
        // Apply category and payment method filters
        if (selectedCategory) {
          params.append('categoryId', selectedCategory);
        }
        
        if (selectedPaymentMethod) {
          params.append('paymentMethodId', selectedPaymentMethod);
        }
        
        const response = await fetch(`/api/projects/${projectId}/stats?${params.toString()}`);
        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch stats');
        }
        
        setStats(result.data);
      } catch (error) {
        console.error('Error fetching stats:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch stats');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchStats();
  }, [projectId, memberId, timeFrame, customStartDate, customEndDate, selectedCategory, selectedPaymentMethod]);
  
  // Format currency with project's currency
  const formatAmount = (amount: number) => {
    return formatCurrency(amount, stats?.currency || project?.currency || 'USD');
  };
  
  // Format date
  const formatDate = (dateValue: any) => {
    if (!dateValue) return 'No date';
    
    // Handle different date formats
    let date;
    if (dateValue instanceof Date) {
      date = dateValue;
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else if (typeof dateValue === 'number') {
      date = new Date(dateValue);
    } else {
      return 'Invalid Date';
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    return date.toLocaleDateString();
  };
  
  // Format month labels
  const formatMonthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    return `${format(new Date(parseInt(year), parseInt(month) - 1, 1), 'MMM yyyy')}`;
  };
  
  // Filter expenses by category if a category is selected
  const filterStatsByCategory = (stats: any) => {
    if (!stats || !selectedCategory) return stats;
    
    // Deep clone the stats object to avoid modifying the original
    const filteredStats = JSON.parse(JSON.stringify(stats));
    
    // Get the selected category data
    const selectedCategoryData = selectedCategory === 'uncategorized'
      ? stats.expensesByCategory.find((c: any) => c.id === 'uncategorized')
      : stats.expensesByCategory.find((c: any) => c.id === selectedCategory);
    
    if (!selectedCategoryData) return stats;
    
    // Update summary data with category-specific values
    filteredStats.summary.totalAmount = selectedCategoryData.totalAmount;
    filteredStats.summary.expenseCount = selectedCategoryData.expenseCount;
    filteredStats.summary.averageAmount = selectedCategoryData.averageAmount;
    filteredStats.summary.largestExpense = selectedCategoryData.largestExpense;
    
    // Filter expensesByCategory to only show the selected category
    filteredStats.expensesByCategory = [selectedCategoryData];
    
    // Use category-specific member spending data
    filteredStats.memberSpending = selectedCategoryData.memberSpending;
    
    // For monthly data and day of week data, we don't have category-specific data
    // So we'll set these to null to indicate they're not available for category filtering
    filteredStats.expensesByMonth = null;
    filteredStats.expensesByDayOfWeek = null;
    
    return filteredStats;
  };
  
  // Filter stats by payment method if a payment method is selected
  const filterStatsByPaymentMethod = (stats: any) => {
    if (!stats || !selectedPaymentMethod) return stats;
    
    // Deep clone the stats object to avoid modifying the original
    const filteredStats = JSON.parse(JSON.stringify(stats));
    
    // Get the selected payment method data
    const selectedPaymentMethodData = selectedPaymentMethod === 'none'
      ? stats.expensesByPaymentMethod.find((m: any) => m.id === 'none')
      : stats.expensesByPaymentMethod.find((m: any) => m.id === selectedPaymentMethod);
    
    if (!selectedPaymentMethodData) return stats;
    
    // Update summary data with payment method-specific values
    filteredStats.summary.totalAmount = selectedPaymentMethodData.totalAmount;
    filteredStats.summary.expenseCount = selectedPaymentMethodData.expenseCount;
    filteredStats.summary.averageAmount = selectedPaymentMethodData.averageAmount;
    filteredStats.summary.largestExpense = selectedPaymentMethodData.largestExpense;
    
    // Filter expensesByPaymentMethod to only show the selected payment method
    filteredStats.expensesByPaymentMethod = [selectedPaymentMethodData];
    
    // Use payment method-specific member spending data
    filteredStats.memberSpending = selectedPaymentMethodData.memberSpending;
    
    // For monthly data and day of week data, we don't have payment method-specific data
    // So we'll set these to null to indicate they're not available for payment method filtering
    filteredStats.expensesByMonth = null;
    filteredStats.expensesByDayOfWeek = null;
    
    return filteredStats;
  };
  
  // Prepare chart data for expenses by category
  const prepareCategoryChartData = () => {
    if (!stats || !stats.expensesByCategory || stats.expensesByCategory.length === 0) return null;
    
    return {
      labels: stats.expensesByCategory.map((category: any) => category.name),
      datasets: [
        {
          data: stats.expensesByCategory.map((category: any) => category.totalAmount),
          backgroundColor: stats.expensesByCategory.map((category: any) => category.color),
          borderWidth: 1,
        },
      ],
    };
  };
  
  // Prepare chart data for expenses by payment method
  const preparePaymentMethodChartData = () => {
    if (!stats || !stats.expensesByPaymentMethod || stats.expensesByPaymentMethod.length === 0) return null;
    
    return {
      labels: stats.expensesByPaymentMethod.map((method: any) => method.name),
      datasets: [
        {
          data: stats.expensesByPaymentMethod.map((method: any) => method.totalAmount),
          backgroundColor: [
            'rgba(59, 130, 246, 0.7)',   // blue
            'rgba(16, 185, 129, 0.7)',   // green
            'rgba(249, 115, 22, 0.7)',   // orange
            'rgba(236, 72, 153, 0.7)',   // pink
            'rgba(139, 92, 246, 0.7)',   // purple
            'rgba(20, 184, 166, 0.7)',   // teal
            'rgba(245, 158, 11, 0.7)',   // amber
            'rgba(239, 68, 68, 0.7)',    // red
            'rgba(99, 102, 241, 0.7)',   // indigo
          ],
          borderWidth: 1,
        },
      ],
    };
  };
  
  // Prepare chart data for expenses by month
  const prepareMonthlyChartData = () => {
    if (!stats || !stats.expensesByMonth || stats.expensesByMonth.length === 0) return null;
    
    return {
      labels: stats.expensesByMonth.map((item: any) => formatMonthLabel(item.month)),
      datasets: [
        {
          label: 'Monthly Expenses',
          data: stats.expensesByMonth.map((item: any) => item.amount),
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 1,
        },
      ],
    };
  };
  
  // Prepare chart data for monthly trends (amount + percentage change)
  const prepareMonthlyTrendsChartData = () => {
    if (!stats || !stats.monthlyTrends || stats.monthlyTrends.length < 2) return null;
    
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
    };
  };
  
  // Prepare chart data for expenses by day of week
  const prepareDayOfWeekChartData = () => {
    if (!stats || !stats.expensesByDayOfWeek) return null;
    
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
    };
  };
  
  // Prepare chart data for expenses by day of month
  const prepareDayOfMonthChartData = () => {
    if (!stats || !stats.expensesByDayOfMonth) return null;
    
    return {
      labels: stats.expensesByDayOfMonth.map((item: any) => item.day),
      datasets: [
        {
          label: 'Amount Spent',
          data: stats.expensesByDayOfMonth.map((item: any) => item.amount),
          backgroundColor: 'rgba(14, 165, 233, 0.5)',
          borderColor: 'rgb(14, 165, 233)',
          borderWidth: 1,
        },
      ],
    };
  };
  
  // Prepare chart data for member spending
  const prepareMemberSpendingChartData = () => {
    if (!stats || !stats.memberSpending || stats.memberSpending.length === 0) return null;
    
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
    };
  };
  
  // Prepare chart data for personal monthly spending
  const preparePersonalMonthlySpendingChartData = () => {
    if (!stats?.personalStats?.monthlySpending || 
        stats.personalStats.monthlySpending.length === 0) return null;
    
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
    };
  };
  
  // Prepare chart data for personal categories
  const preparePersonalCategoryChartData = () => {
    if (!stats?.personalStats?.topCategories || 
        stats.personalStats.topCategories.length === 0) return null;
    
    return {
      labels: stats.personalStats.topCategories.map((category: any) => category.name),
      datasets: [
        {
          data: stats.personalStats.topCategories.map((category: any) => category.totalAmount),
          backgroundColor: stats.personalStats.topCategories.map((category: any) => category.color),
          borderWidth: 1,
        },
      ],
    };
  };
  
  // Prepare chart data for personal payment methods
  const preparePersonalPaymentMethodChartData = () => {
    if (!stats?.personalStats?.topPaymentMethods || 
        stats.personalStats.topPaymentMethods.length === 0) return null;
    
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
    };
  };
  
  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
  };
  
  // Special chart options for day of week chart (dual y-axis)
  const dayOfWeekChartOptions = {
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
  };
  
  // Special chart options for monthly trends chart (dual y-axis)
  const monthlyTrendsChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const label = context.dataset.label || '';
            const value = context.raw !== null ? context.raw : 0;
            if (context.datasetIndex === 1) {
              return `${label}: ${value.toFixed(1)}%`;
            }
            return `${label}: ${formatAmount(value)}`;
          }
        }
      }
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
  };
  
  // Handle time frame change
  const handleTimeFrameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTimeFrame(e.target.value);
    
    // Reset custom dates if not using custom time frame
    if (e.target.value !== 'custom') {
      setCustomStartDate('');
      setCustomEndDate('');
    }
  };
  
  // Handle category filter change
  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCategory(e.target.value === 'all' ? null : e.target.value);
  };
  
  // Handle payment method filter change
  const handlePaymentMethodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedPaymentMethod(e.target.value === 'all' ? null : e.target.value);
  };
  
  // Helper to determine if we have personal stats
  const hasPersonalStats = stats?.personalStats && 
    (stats.personalStats.topCategories?.length > 0 || 
     stats.personalStats.topPaymentMethods?.length > 0);
  
  if (isLoading && !stats) {
    return (
      <Layout title={project?.name ? `${project.name} - Stats` : 'Project Stats'}>
        <div className="flex justify-center items-center h-64">
          <p>Loading stats...</p>
        </div>
      </Layout>
    );
  }
  
  if (error) {
    return (
      <Layout title={project?.name ? `${project.name} - Stats` : 'Project Stats'}>
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
          <button
            onClick={() => router.push(`/projects/${projectId}?memberId=${memberId}`)}
            className="btn btn-primary"
          >
            Back to Project
          </button>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout title={project?.name ? `${project.name} - Stats` : 'Project Stats'}>
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">{project?.name} - Statistics</h1>
            {project?.description && (
              <p className="text-gray-600 dark:text-gray-400 mt-1">{project.description}</p>
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
          <ul className="flex flex-wrap -mb-px">
            <li className="mr-2">
              <button
                onClick={() => setActiveTab('global')}
                className={`inline-block py-4 px-4 text-sm font-medium text-center rounded-t-lg border-b-2 ${
                  activeTab === 'global'
                    ? 'text-blue-600 border-blue-600 active dark:text-blue-500 dark:border-blue-500'
                    : 'border-transparent hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300'
                }`}
              >
                Project Statistics
              </button>
            </li>
            {hasPersonalStats && (
              <li className="mr-2">
                <button
                  onClick={() => setActiveTab('personal')}
                  className={`inline-block py-4 px-4 text-sm font-medium text-center rounded-t-lg border-b-2 ${
                    activeTab === 'personal'
                      ? 'text-blue-600 border-blue-600 active dark:text-blue-500 dark:border-blue-500'
                      : 'border-transparent hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300'
                  }`}
                >
                  Personal Statistics
                </button>
              </li>
            )}
          </ul>
        </div>
        
        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-sm p-6 mb-8">
          <div className="flex items-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 dark:text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <h2 className="text-xl font-semibold">Filters</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Time Frame Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Time Frame
              </label>
              <div className="relative">
                <select
                  value={timeFrame}
                  onChange={handleTimeFrameChange}
                  className="w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none"
                >
                  {TIME_FRAMES.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            
            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category
              </label>
              <div className="relative">
                <select
                  value={selectedCategory || 'all'}
                  onChange={handleCategoryChange}
                  className="w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none"
                >
                  <option value="all">All Categories</option>
                  {stats?.expensesByCategory?.map((category: any) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            
            {/* Payment Method Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Payment Method
              </label>
              <div className="relative">
                <select
                  value={selectedPaymentMethod || 'all'}
                  onChange={handlePaymentMethodChange}
                  className="w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none"
                >
                  <option value="all">All Payment Methods</option>
                  {stats?.expensesByPaymentMethod?.map((method: any) => (
                    <option key={method.id} value={method.id}>
                      {method.icon} {method.name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            
            {/* Custom Date Range (only shown when custom time frame is selected) */}
            {timeFrame === 'custom' && (
              <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Start Date
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    End Date
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Display the appropriate tab content */}
        {activeTab === 'global' ? (
          <div className="global-stats-content">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 border border-blue-100 dark:border-blue-800/30">
                <div className="flex items-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Expenses</h3>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatAmount(stats?.summary?.totalAmount || 0)}
                </p>
              </div>
              
              <div className="bg-purple-50 dark:bg-purple-900/30 rounded-lg p-4 border border-purple-100 dark:border-purple-800/30">
                <div className="flex items-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-600 dark:text-purple-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                  <h3 className="text-sm font-medium text-purple-700 dark:text-purple-300">Number of Expenses</h3>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats?.summary?.expenseCount || 0}
                </p>
              </div>
              
              <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-4 border border-green-100 dark:border-green-800/30">
                <div className="flex items-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600 dark:text-green-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                  <h3 className="text-sm font-medium text-green-700 dark:text-green-300">Average Expense</h3>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatAmount(stats?.summary?.averageAmount || 0)}
                </p>
              </div>
              
              <div className="bg-amber-50 dark:bg-amber-900/30 rounded-lg p-4 border border-amber-100 dark:border-amber-800/30">
                <div className="flex items-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600 dark:text-amber-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <h3 className="text-sm font-medium text-amber-700 dark:text-amber-300">Largest Expense</h3>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatAmount(stats?.summary?.largestExpense?.amount || 0)}
                </p>
                {stats?.summary?.largestExpense && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                    {stats.summary.largestExpense.description}
                  </p>
                )}
              </div>
            </div>
            
            {/* Expense Distribution Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Expenses by Category */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                <h3 className="text-lg font-semibold mb-4">Expenses by Category</h3>
                <div className="h-64 relative">
                  {prepareCategoryChartData() ? (
                    <Doughnut 
                      data={prepareCategoryChartData()!} 
                      options={{
                        ...chartOptions,
                        cutout: '60%',
                        plugins: {
                          ...chartOptions.plugins,
                          legend: {
                            position: 'right',
                            align: 'center',
                          }
                        }
                      }} 
                    />
                  ) : (
                    <div className="flex justify-center items-center h-full text-gray-500">
                      No category data available
                    </div>
                  )}
                </div>
              </div>
              
              {/* Expenses by Payment Method */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                <h3 className="text-lg font-semibold mb-4">Expenses by Payment Method</h3>
                <div className="h-64 relative">
                  {preparePaymentMethodChartData() ? (
                    <Pie 
                      data={preparePaymentMethodChartData()!} 
                      options={chartOptions} 
                    />
                  ) : (
                    <div className="flex justify-center items-center h-full text-gray-500">
                      No payment method data available
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Time-based Analysis */}
            <div className="grid grid-cols-1 gap-6 mb-8">
              {/* Monthly Trends */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                <h3 className="text-lg font-semibold mb-4">Monthly Expense Trends</h3>
                <div className="h-72 relative">
                  {prepareMonthlyTrendsChartData() ? (
                    <Chart 
                      type="bar" 
                      data={prepareMonthlyTrendsChartData()! as any}
                      options={monthlyTrendsChartOptions} 
                    />
                  ) : (
                    <div className="flex justify-center items-center h-full text-gray-500">
                      Insufficient data for trends (need at least 2 months)
                    </div>
                  )}
                </div>
              </div>
              
              {/* Day of Week Analysis */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                <h3 className="text-lg font-semibold mb-4">Expenses by Day of Week</h3>
                <div className="h-72 relative">
                  {prepareDayOfWeekChartData() ? (
                    <Bar 
                      data={prepareDayOfWeekChartData()!} 
                      options={dayOfWeekChartOptions} 
                    />
                  ) : (
                    <div className="flex justify-center items-center h-full text-gray-500">
                      No day of week data available
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Member Spending Analysis */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-5 mb-8">
              <h3 className="text-lg font-semibold mb-4">Member Spending Analysis</h3>
              <div className="h-80 relative">
                {prepareMemberSpendingChartData() ? (
                  <Bar 
                    data={prepareMemberSpendingChartData()!} 
                    options={chartOptions} 
                  />
                ) : (
                  <div className="flex justify-center items-center h-full text-gray-500">
                    No member spending data available
                  </div>
                )}
              </div>
            </div>
            
            {/* Category Breakdown Table */}
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-sm p-5 mb-8">
              <h3 className="text-lg font-semibold mb-4">Category Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        % of Total
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        # of Expenses
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Average
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {stats?.expensesByCategory?.map((category: any) => (
                      <tr key={category.id}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <div 
                              className="w-4 h-4 rounded-full mr-2"
                              style={{ backgroundColor: category.color }}
                            ></div>
                            {category.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatAmount(category.totalAmount)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {category.percentage.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {category.expenseCount}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatAmount(category.averageAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Payment Methods Section */}
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-sm p-5 mb-8">
              <h3 className="text-lg font-semibold mb-4">Payment Methods</h3>
              <div className="space-y-4">
                {stats?.expensesByPaymentMethod?.map((method: any) => (
                  <div key={method.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center">
                      <span className="text-2xl mr-3">{method.icon}</span>
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
          </div>
        ) : (
          <div className="personal-stats-content">
            {/* Personal Stats Content */}
            {stats?.personalStats ? (
              <>
                {/* Personal Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 border border-blue-100 dark:border-blue-800/30">
                    <div className="flex items-center mb-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Paid</h3>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatAmount(stats.personalStats.summary.paidAmount || 0)}
                    </p>
                  </div>
                  
                  <div className="bg-rose-50 dark:bg-rose-900/30 rounded-lg p-4 border border-rose-100 dark:border-rose-800/30">
                    <div className="flex items-center mb-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-rose-600 dark:text-rose-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                      </svg>
                      <h3 className="text-sm font-medium text-rose-700 dark:text-rose-300">Total Owed</h3>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatAmount(stats.personalStats.summary.owedAmount || 0)}
                    </p>
                  </div>
                  
                  <div className={`${
                    stats.personalStats.summary.balance >= 0 
                      ? "bg-green-50 dark:bg-green-900/30 border-green-100 dark:border-green-800/30" 
                      : "bg-red-50 dark:bg-red-900/30 border-red-100 dark:border-red-800/30"
                  } rounded-lg p-4 border`}>
                    <div className="flex items-center mb-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-1 ${
                        stats.personalStats.summary.balance >= 0 
                          ? "text-green-600 dark:text-green-400" 
                          : "text-red-600 dark:text-red-400"
                      }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9M18 7l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                      </svg>
                      <h3 className={`text-sm font-medium ${
                        stats.personalStats.summary.balance >= 0 
                          ? "text-green-700 dark:text-green-300" 
                          : "text-red-700 dark:text-red-300"
                      }`}>Net Balance</h3>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatAmount(Math.abs(stats.personalStats.summary.balance || 0))}
                      {stats.personalStats.summary.balance >= 0 ? ' (to receive)' : ' (to pay)'}
                    </p>
                  </div>
                  
                  <div className="bg-amber-50 dark:bg-amber-900/30 rounded-lg p-4 border border-amber-100 dark:border-amber-800/30">
                    <div className="flex items-center mb-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600 dark:text-amber-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      <h3 className="text-sm font-medium text-amber-700 dark:text-amber-300">Expenses</h3>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {stats.personalStats.summary.expenseCount || 0}
                    </p>
                  </div>
                </div>
                
                {/* Personal Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  {/* Personal Top Categories */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <h3 className="text-lg font-semibold mb-4">Your Top Categories</h3>
                    <div className="h-64 relative">
                      {preparePersonalCategoryChartData() ? (
                        <Doughnut 
                          data={preparePersonalCategoryChartData()!} 
                          options={{
                            ...chartOptions,
                            cutout: '60%',
                            plugins: {
                              ...chartOptions.plugins,
                              legend: {
                                position: 'right',
                                align: 'center',
                              }
                            }
                          }} 
                        />
                      ) : (
                        <div className="flex justify-center items-center h-full text-gray-500">
                          No category data available
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Personal Payment Methods */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <h3 className="text-lg font-semibold mb-4">Your Payment Methods</h3>
                    <div className="h-64 relative">
                      {preparePersonalPaymentMethodChartData() ? (
                        <Pie 
                          data={preparePersonalPaymentMethodChartData()!} 
                          options={chartOptions} 
                        />
                      ) : (
                        <div className="flex justify-center items-center h-full text-gray-500">
                          No payment method data available
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Personal Monthly Spending */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-5 mb-8">
                  <h3 className="text-lg font-semibold mb-4">Your Monthly Spending</h3>
                  <div className="h-72 relative">
                    {preparePersonalMonthlySpendingChartData() ? (
                      <Bar 
                        data={preparePersonalMonthlySpendingChartData()!} 
                        options={chartOptions} 
                      />
                    ) : (
                      <div className="flex justify-center items-center h-full text-gray-500">
                        No monthly data available
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Personal Categories Table */}
                <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-sm p-5 mb-8">
                  <h3 className="text-lg font-semibold mb-4">Your Top Categories</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Category
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Paid
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Owed
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {stats.personalStats.topCategories?.map((category: any) => (
                          <tr key={category.id}>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center">
                                <div 
                                  className="w-4 h-4 rounded-full mr-2"
                                  style={{ backgroundColor: category.color }}
                                ></div>
                                {category.name}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {formatAmount(category.paidAmount)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {formatAmount(category.owedAmount)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {formatAmount(category.totalAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex justify-center items-center h-64 text-gray-500">
                No personal data available
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
