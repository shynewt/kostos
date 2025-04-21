import { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '../../../../db';
import { sendSuccess, sendError } from '../../../../utils/api';
import { eq, and, gte, lte, sql, desc, count } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id: projectId } = req.query;
  
  if (!projectId || typeof projectId !== 'string') {
    return sendError(res, 'Invalid project ID', 400);
  }
  
  switch (req.method) {
    case 'GET':
      return getProjectStats(req, res, projectId);
    default:
      return sendError(res, 'Method not allowed', 405);
  }
}

// Get project statistics
async function getProjectStats(req: NextApiRequest, res: NextApiResponse, projectId: string) {
  try {
    // Parse query parameters
    const { startDate, endDate, memberId, categoryId, paymentMethodId } = req.query;
    
    let startTimestamp: Date | undefined;
    let endTimestamp: Date | undefined;
    
    if (startDate && typeof startDate === 'string') {
      startTimestamp = new Date(startDate);
      if (isNaN(startTimestamp.getTime())) {
        return sendError(res, 'Invalid start date format', 400);
      }
    }
    
    if (endDate && typeof endDate === 'string') {
      endTimestamp = new Date(endDate);
      if (isNaN(endTimestamp.getTime())) {
        return sendError(res, 'Invalid end date format', 400);
      }
      // Set end date to end of day
      endTimestamp.setHours(23, 59, 59, 999);
    }
    
    const currentMemberId = typeof memberId === 'string' ? memberId : undefined;
    const selectedCategoryId = typeof categoryId === 'string' ? categoryId : undefined;
    const selectedPaymentMethodId = typeof paymentMethodId === 'string' ? paymentMethodId : undefined;
    
    // Verify project exists
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId));
    
    if (!project) {
      return sendError(res, 'Project not found', 404);
    }
    
    // Get project members
    const members = await db
      .select()
      .from(schema.members)
      .where(eq(schema.members.projectId, projectId));
    
    // Get the current member if specified
    const currentMember = currentMemberId 
      ? members.find(member => member.id === currentMemberId) 
      : undefined;
    
    // Get project categories
    const categories = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.projectId, projectId));
    
    // Get project payment methods
    const paymentMethods = await db
      .select()
      .from(schema.paymentMethods)
      .where(eq(schema.paymentMethods.projectId, projectId));
    
    // Build query conditions for filtering
    let conditions = [eq(schema.expenses.projectId, projectId)];
    
    if (startTimestamp) {
      conditions.push(gte(schema.expenses.date, startTimestamp));
    }
    
    if (endTimestamp) {
      conditions.push(lte(schema.expenses.date, endTimestamp));
    }
    
    if (selectedCategoryId) {
      conditions.push(eq(schema.expenses.categoryId, selectedCategoryId));
    }
    
    if (selectedPaymentMethodId) {
      conditions.push(eq(schema.expenses.paymentMethodId, selectedPaymentMethodId));
    }
    
    // Get expenses with applied filters
    const expenses = await db
      .select()
      .from(schema.expenses)
      .where(and(...conditions))
      .orderBy(desc(schema.expenses.date));
    
    // For each expense, get the payments and splits
    const expensesWithDetails = await Promise.all(
      expenses.map(async (expense) => {
        const payments = await db
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.expenseId, expense.id));
        
        const splits = await db
          .select()
          .from(schema.splits)
          .where(eq(schema.splits.expenseId, expense.id));
        
        return {
          ...expense,
          payments,
          splits,
        };
      })
    );
    
    // Filter expenses by current member if specified
    const memberExpensesWithDetails = currentMemberId 
      ? expensesWithDetails.filter(expense => 
          expense.payments.some(payment => payment.memberId === currentMemberId) ||
          expense.splits.some(split => split.memberId === currentMemberId)
        )
      : expensesWithDetails;
    
    // Calculate total expenses
    const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    
    // Calculate expenses by category with detailed stats
    const expensesByCategory = categories.map(category => {
      const categoryExpenses = expenses.filter(expense => expense.categoryId === category.id);
      const categoryTotal = categoryExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      const percentage = totalAmount > 0 ? (categoryTotal / totalAmount) * 100 : 0;
      const averageAmount = categoryExpenses.length > 0 ? categoryTotal / categoryExpenses.length : 0;
      const largestExpense = categoryExpenses.length > 0 
        ? categoryExpenses.reduce((max, expense) => expense.amount > max.amount ? expense : max, categoryExpenses[0])
        : null;
      
      // Calculate member spending for this category
      const categoryExpensesWithDetails = expensesWithDetails.filter(expense => 
        expense.categoryId === category.id
      );
      
      const memberSpending = members.map(member => {
        // Calculate how much the member has paid for this category
        const paidAmount = categoryExpensesWithDetails.reduce((sum, expense) => {
          const memberPayment = expense.payments.find(payment => payment.memberId === member.id);
          return sum + (memberPayment ? memberPayment.amount : 0);
        }, 0);
        
        // Calculate how much the member owes for this category
        const owedAmount = categoryExpensesWithDetails.reduce((sum, expense) => {
          const memberSplit = expense.splits.find(split => split.memberId === member.id);
          return sum + (memberSplit ? memberSplit.owedAmount : 0);
        }, 0);
        
        // Calculate net balance
        const balance = paidAmount - owedAmount;
        
        return {
          ...member,
          paidAmount,
          owedAmount,
          balance,
        };
      });
      
      return {
        ...category,
        totalAmount: categoryTotal,
        percentage,
        expenseCount: categoryExpenses.length,
        averageAmount,
        largestExpense,
        memberSpending,
      };
    });
    
    // Sort categories by amount (descending)
    expensesByCategory.sort((a, b) => b.totalAmount - a.totalAmount);
    
    // Calculate expenses by payment method with detailed stats
    const expensesByPaymentMethod = paymentMethods.map(method => {
      const methodExpenses = expenses.filter(expense => expense.paymentMethodId === method.id);
      const methodTotal = methodExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      const percentage = totalAmount > 0 ? (methodTotal / totalAmount) * 100 : 0;
      const averageAmount = methodExpenses.length > 0 ? methodTotal / methodExpenses.length : 0;
      const largestExpense = methodExpenses.length > 0 
        ? methodExpenses.reduce((max, expense) => expense.amount > max.amount ? expense : max, methodExpenses[0])
        : null;
      
      // Calculate member spending for this payment method
      const methodExpensesWithDetails = expensesWithDetails.filter(expense => 
        expense.paymentMethodId === method.id
      );
      
      const memberSpending = members.map(member => {
        // Calculate how much the member has paid for this payment method
        const paidAmount = methodExpensesWithDetails.reduce((sum, expense) => {
          const memberPayment = expense.payments.find(payment => payment.memberId === member.id);
          return sum + (memberPayment ? memberPayment.amount : 0);
        }, 0);
        
        // Calculate how much the member owes for this payment method
        const owedAmount = methodExpensesWithDetails.reduce((sum, expense) => {
          const memberSplit = expense.splits.find(split => split.memberId === member.id);
          return sum + (memberSplit ? memberSplit.owedAmount : 0);
        }, 0);
        
        // Calculate net balance
        const balance = paidAmount - owedAmount;
        
        return {
          ...member,
          paidAmount,
          owedAmount,
          balance,
        };
      });
      
      return {
        ...method,
        totalAmount: methodTotal,
        percentage,
        expenseCount: methodExpenses.length,
        averageAmount,
        largestExpense,
        memberSpending,
      };
    });
    
    // Sort payment methods by amount (descending)
    expensesByPaymentMethod.sort((a, b) => b.totalAmount - a.totalAmount);
    
    // Add expenses with no payment method
    const noPaymentMethodExpenses = expenses.filter(expense => !expense.paymentMethodId);
    const noPaymentMethodTotal = noPaymentMethodExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const noPaymentMethodPercentage = totalAmount > 0 ? (noPaymentMethodTotal / totalAmount) * 100 : 0;
    const noPaymentMethodAverage = noPaymentMethodExpenses.length > 0 ? noPaymentMethodTotal / noPaymentMethodExpenses.length : 0;
    const noPaymentMethodLargestExpense = noPaymentMethodExpenses.length > 0 
      ? noPaymentMethodExpenses.reduce((max, expense) => expense.amount > max.amount ? expense : max, noPaymentMethodExpenses[0])
      : null;
    
    // Calculate member spending for expenses with no payment method
    const noPaymentMethodExpensesWithDetails = expensesWithDetails.filter(expense => 
      !expense.paymentMethodId
    );
    
    const noPaymentMethodMemberSpending = members.map(member => {
      // Calculate how much the member has paid for expenses with no payment method
      const paidAmount = noPaymentMethodExpensesWithDetails.reduce((sum, expense) => {
        const memberPayment = expense.payments.find(payment => payment.memberId === member.id);
        return sum + (memberPayment ? memberPayment.amount : 0);
      }, 0);
      
      // Calculate how much the member owes for expenses with no payment method
      const owedAmount = noPaymentMethodExpensesWithDetails.reduce((sum, expense) => {
        const memberSplit = expense.splits.find(split => split.memberId === member.id);
        return sum + (memberSplit ? memberSplit.owedAmount : 0);
      }, 0);
      
      // Calculate net balance
      const balance = paidAmount - owedAmount;
      
      return {
        ...member,
        paidAmount,
        owedAmount,
        balance,
      };
    });
    
    // Add no payment method stats to the list if there are any such expenses
    if (noPaymentMethodExpenses.length > 0) {
      expensesByPaymentMethod.push({
        id: 'none',
        projectId,
        name: 'No Payment Method',
        icon: '❓',
        totalAmount: noPaymentMethodTotal,
        percentage: noPaymentMethodPercentage,
        expenseCount: noPaymentMethodExpenses.length,
        averageAmount: noPaymentMethodAverage,
        largestExpense: noPaymentMethodLargestExpense,
        memberSpending: noPaymentMethodMemberSpending,
        createdAt: null,
      });
    }
    
    // Calculate expenses by month
    const expensesByMonth: Record<string, number> = {};
    
    expenses.forEach(expense => {
      const date = new Date(expense.date as Date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!expensesByMonth[monthKey]) {
        expensesByMonth[monthKey] = 0;
      }
      
      expensesByMonth[monthKey] += expense.amount;
    });
    
    // Sort months chronologically
    const sortedExpensesByMonth = Object.entries(expensesByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));
    
    // Calculate expenses by day of month (1-31)
    const expensesByDayOfMonth = Array(31).fill(0);
    const amountByDayOfMonth = Array(31).fill(0);
    
    expenses.forEach(expense => {
      const date = new Date(expense.date as Date);
      const dayOfMonth = date.getDate() - 1; // 0-30
      expensesByDayOfMonth[dayOfMonth]++;
      amountByDayOfMonth[dayOfMonth] += expense.amount;
    });
    
    // Convert to array with labels
    const dayOfMonthStats = expensesByDayOfMonth.map((count, index) => ({
      day: index + 1,
      count,
      amount: amountByDayOfMonth[index]
    }));
    
    // Calculate member spending
    const memberSpending = members.map(member => {
      // Calculate how much the member has paid
      const paidAmount = expensesWithDetails.reduce((sum, expense) => {
        const memberPayment = expense.payments.find(payment => payment.memberId === member.id);
        return sum + (memberPayment ? memberPayment.amount : 0);
      }, 0);
      
      // Calculate how much the member owes
      const owedAmount = expensesWithDetails.reduce((sum, expense) => {
        const memberSplit = expense.splits.find(split => split.memberId === member.id);
        return sum + (memberSplit ? memberSplit.owedAmount : 0);
      }, 0);
      
      // Calculate net balance
      const balance = paidAmount - owedAmount;
      
      // Calculate member's top categories
      const memberCategories = categories.map(category => {
        const categoryExpenses = expensesWithDetails.filter(expense => 
          expense.categoryId === category.id
        );
        
        // How much paid in this category
        const paidInCategory = categoryExpenses.reduce((sum, expense) => {
          const memberPayment = expense.payments.find(payment => payment.memberId === member.id);
          return sum + (memberPayment ? memberPayment.amount : 0);
        }, 0);
        
        // How much owed in this category
        const owedInCategory = categoryExpenses.reduce((sum, expense) => {
          const memberSplit = expense.splits.find(split => split.memberId === member.id);
          return sum + (memberSplit ? memberSplit.owedAmount : 0);
        }, 0);
        
        return {
          ...category,
          paidAmount: paidInCategory,
          owedAmount: owedInCategory,
          totalAmount: paidInCategory + owedInCategory,
        };
      }).filter(cat => cat.paidAmount > 0 || cat.owedAmount > 0)
        .sort((a, b) => b.totalAmount - a.totalAmount);
      
      // Calculate member's top payment methods
      const memberPaymentMethods = paymentMethods.map(method => {
        const methodExpenses = expensesWithDetails.filter(expense => 
          expense.paymentMethodId === method.id
        );
        
        // How much paid with this method
        const paidWithMethod = methodExpenses.reduce((sum, expense) => {
          const memberPayment = expense.payments.find(payment => payment.memberId === member.id);
          return sum + (memberPayment ? memberPayment.amount : 0);
        }, 0);
        
        // How much owed with this method
        const owedWithMethod = methodExpenses.reduce((sum, expense) => {
          const memberSplit = expense.splits.find(split => split.memberId === member.id);
          return sum + (memberSplit ? memberSplit.owedAmount : 0);
        }, 0);
        
        return {
          ...method,
          paidAmount: paidWithMethod,
          owedAmount: owedWithMethod,
          totalAmount: paidWithMethod + owedWithMethod,
        };
      }).filter(method => method.paidAmount > 0 || method.owedAmount > 0)
        .sort((a, b) => b.totalAmount - a.totalAmount);
      
      // Calculate expense count for this member (either paid or owed)
      const memberExpenseCount = expensesWithDetails.filter(expense => 
        expense.payments.some(payment => payment.memberId === member.id) ||
        expense.splits.some(split => split.memberId === member.id)
      ).length;
      
      // Calculate largest expense for this member
      const memberLargestExpense = expensesWithDetails
        .filter(expense => 
          expense.payments.some(payment => payment.memberId === member.id) ||
          expense.splits.some(split => split.memberId === member.id)
        )
        .sort((a, b) => {
          // Sort by the amount this member paid or owes
          const aPaid = a.payments.find(payment => payment.memberId === member.id)?.amount || 0;
          const bPaid = b.payments.find(payment => payment.memberId === member.id)?.amount || 0;
          
          const aOwed = a.splits.find(split => split.memberId === member.id)?.owedAmount || 0;
          const bOwed = b.splits.find(split => split.memberId === member.id)?.owedAmount || 0;
          
          const aTotal = aPaid + aOwed;
          const bTotal = bPaid + bOwed;
          
          return bTotal - aTotal;
        })[0] || null;
      
      return {
        ...member,
        paidAmount,
        owedAmount,
        balance,
        expenseCount: memberExpenseCount,
        largestExpense: memberLargestExpense,
        topCategories: memberCategories.slice(0, 5), // Top 5 categories
        topPaymentMethods: memberPaymentMethods.slice(0, 5), // Top 5 payment methods
      };
    });
    
    // Sort members by amount paid (descending)
    memberSpending.sort((a, b) => b.paidAmount - a.paidAmount);
    
    // Calculate expense frequency by day of week
    const expensesByDayOfWeek = [0, 0, 0, 0, 0, 0, 0]; // Sunday to Saturday
    const amountByDayOfWeek = [0, 0, 0, 0, 0, 0, 0]; // Sunday to Saturday
    
    expenses.forEach(expense => {
      const date = new Date(expense.date as Date);
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
      expensesByDayOfWeek[dayOfWeek]++;
      amountByDayOfWeek[dayOfWeek] += expense.amount;
    });
    
    // Convert to an array of objects with day names
    const dayOfWeekLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeekStats = expensesByDayOfWeek.map((count, index) => ({
      day: dayOfWeekLabels[index],
      count,
      amount: amountByDayOfWeek[index]
    }));
    
    // Calculate average expense amount
    const averageAmount = expenses.length > 0 ? totalAmount / expenses.length : 0;
    
    // Find largest expense
    const largestExpense = expenses.length > 0 
      ? expenses.reduce((max, expense) => expense.amount > max.amount ? expense : max, expenses[0])
      : null;
    
    // Calculate monthly trends
    const monthlyTrendData = sortedExpensesByMonth.length >= 2 
      ? sortedExpensesByMonth.map((current, index, array) => {
          if (index === 0) return { ...current, changePercent: 0 };
          
          const previous = array[index - 1];
          const changePercent = previous.amount === 0 
            ? 100 
            : ((current.amount - previous.amount) / previous.amount) * 100;
          
          return {
            ...current,
            changePercent
          };
        })
      : sortedExpensesByMonth.map(month => ({ ...month, changePercent: 0 }));
    
    // Calculate expense count by split type
    const expensesBySplitType: Record<string, { count: number, amount: number }> = {
      'even': { count: 0, amount: 0 },
      'amount': { count: 0, amount: 0 },
      'percent': { count: 0, amount: 0 },
      'shares': { count: 0, amount: 0 },
    };
    
    expenses.forEach(expense => {
      if (expensesBySplitType[expense.splitType]) {
        expensesBySplitType[expense.splitType].count++;
        expensesBySplitType[expense.splitType].amount += expense.amount;
      }
    });
    
    // Generate personal stats for the current member if specified
    let personalStats = null;
    if (currentMember && currentMemberId) {
      const memberData = memberSpending.find(member => member.id === currentMemberId);
      
      if (memberData) {
        // Get current member's monthly spending
        const memberMonthlySpending: Record<string, {paidAmount: number, owedAmount: number}> = {};
        
        memberExpensesWithDetails.forEach(expense => {
          const date = new Date(expense.date as Date);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          
          if (!memberMonthlySpending[monthKey]) {
            memberMonthlySpending[monthKey] = { paidAmount: 0, owedAmount: 0 };
          }
          
          // Add paid amount
          const memberPayment = expense.payments.find(payment => payment.memberId === currentMemberId);
          if (memberPayment) {
            memberMonthlySpending[monthKey].paidAmount += memberPayment.amount;
          }
          
          // Add owed amount
          const memberSplit = expense.splits.find(split => split.memberId === currentMemberId);
          if (memberSplit) {
            memberMonthlySpending[monthKey].owedAmount += memberSplit.owedAmount;
          }
        });
        
        // Sort months chronologically
        const sortedMemberMonthlySpending = Object.entries(memberMonthlySpending)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, data]) => ({ month, ...data }));
        
        personalStats = {
          member: currentMember,
          summary: {
            paidAmount: memberData.paidAmount,
            owedAmount: memberData.owedAmount,
            balance: memberData.balance,
            expenseCount: memberData.expenseCount,
            largestExpense: memberData.largestExpense,
          },
          topCategories: memberData.topCategories,
          topPaymentMethods: memberData.topPaymentMethods,
          monthlySpending: sortedMemberMonthlySpending,
          // Get the trend for personal spending
          spendingTrend: sortedMemberMonthlySpending.length >= 2
            ? (sortedMemberMonthlySpending[sortedMemberMonthlySpending.length - 1].owedAmount - 
               sortedMemberMonthlySpending[sortedMemberMonthlySpending.length - 2].owedAmount) /
              sortedMemberMonthlySpending[sortedMemberMonthlySpending.length - 2].owedAmount * 100
            : 0,
        };
      }
    }
    
    return sendSuccess(res, {
      projectId,
      currency: project.currency,
      timeFrame: {
        startDate: startTimestamp,
        endDate: endTimestamp,
      },
      summary: {
        totalAmount,
        expenseCount: expenses.length,
        averageAmount,
        largestExpense,
      },
      expensesByCategory,
      expensesByPaymentMethod,
      expensesByMonth: sortedExpensesByMonth,
      monthlyTrends: monthlyTrendData,
      expensesByDayOfWeek: dayOfWeekStats,
      expensesByDayOfMonth: dayOfMonthStats,
      expensesBySplitType,
      memberSpending,
      personalStats,
    });
  } catch (error) {
    console.error('Error fetching project stats:', error);
    return sendError(res, 'Failed to fetch project statistics');
  }
}
