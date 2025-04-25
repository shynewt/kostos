import { useEffect, useState } from 'react'
import { formatCurrency } from '../utils/currency'

const roundToCent = (value: number): number => {
  return Math.round(value * 100) / 100
}

interface Member {
  id: string
  name: string
}

interface Category {
  id: string
  name: string
  color: string
}

interface Payment {
  memberId: string
  amount: number
}

interface Split {
  memberId: string
  amount?: number
  amountInput?: string
  shares?: number
  sharesInput?: string
  percent?: number
  owedAmount: number
}

interface PaymentMethod {
  id: string
  name: string
  icon: string
}

interface AddOrEditExpenseFormProps {
  projectId: string
  members: Member[]
  categories: Category[]
  paymentMethods: PaymentMethod[]
  currentMemberId: string
  onClose: () => void
  onExpenseAdded: () => void
  currency: string
  expense?: {
    id: string
    description: string
    amount: number
    date: string | Date
    splitType: 'even' | 'amount' | 'percent' | 'shares'
    categoryId: string | null
    payments: Payment[]
    splits: Split[]
    notes?: string
  }
  isEditing?: boolean
}

export default function AddOrEditExpenseForm({
  projectId,
  members,
  categories,
  paymentMethods,
  currentMemberId,
  onClose,
  onExpenseAdded,
  currency,
  expense,
  isEditing = false,
}: AddOrEditExpenseFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mathEvaluate, setMathEvaluate] = useState<((expr: string) => number) | null>(null)

  // Dynamically import mathjs on client-side only
  useEffect(() => {
    let isMounted = true
    const loadMathjs = async () => {
      try {
        const mathjs = await import('mathjs')
        if (isMounted) {
          setMathEvaluate(() => mathjs.evaluate)
        }
      } catch (err) {
        console.error('Failed to load mathjs:', err)
      }
    }

    loadMathjs()
    return () => {
      isMounted = false
    }
  }, [])

  // Client-side evaluateExpression function that uses mathjs when available
  const evaluateExpressionClient = (expression: string): number | null => {
    if (!expression.trim()) return null

    try {
      // Replace commas with dots for decimal notation
      const normalizedExpression = expression.replace(/,/g, '.')

      // If mathjs is loaded, use it for complex expressions
      if (mathEvaluate) {
        const result = mathEvaluate(normalizedExpression)
        if (typeof result === 'number') return result
      }

      // Fallback to simple parsing
      const parsedNumber = Number(normalizedExpression)
      if (Number.isFinite(parsedNumber)) return parsedNumber
      return null
    } catch (error) {
      return null
    }
  }

  // Move isValidNumberFormat inside component to use evaluateExpressionClient
  const isValidNumberFormat = <T extends unknown>(value: T, acceptOperators = false) => {
    if (Number.isFinite(Number(value))) return true
    if (acceptOperators && typeof value === 'string' && evaluateExpressionClient(value) !== null) return true
    return false
  }

  const [description, setDescription] = useState(expense?.description || '')
  const [amount, setAmount] = useState(expense ? expense.amount.toString() : '')
  const [date, setDate] = useState(() => {
    if (expense?.date) {
      if (expense.date instanceof Date) {
        return expense.date.toISOString().split('T')[0]
      } else if (typeof expense.date === 'string') {
        const dateObj = new Date(expense.date)
        if (!isNaN(dateObj.getTime())) {
          return dateObj.toISOString().split('T')[0]
        }
      }
    }
    return new Date().toISOString().split('T')[0]
  })
  const [splitType, setSplitType] = useState<'even' | 'amount' | 'shares'>(() => {
    if (expense?.splitType === 'percent') {
      return 'shares'
    }
    return (expense?.splitType as 'even' | 'amount' | 'shares') || 'even'
  })
  const [categoryId, setCategoryId] = useState<string | null>(expense?.categoryId || null)
  const [notes, setNotes] = useState<string>(expense?.notes || '')

  const initialParticipants = expense?.splits
    ? expense.splits.map((split) => split.memberId)
    : members.map((member) => member.id)

  const [participants, setParticipants] = useState<string[]>(initialParticipants)

  const [payers, setPayers] = useState<Payment[]>(
    expense?.payments || [{ memberId: currentMemberId, amount: 0 }]
  )

  const [splits, setSplits] = useState<Split[]>(expense?.splits || [])

  useEffect(() => {
    initializeSplitsStructure()
  }, [participants, splitType])

  useEffect(() => {
    const parsedAmount = parseFloat(amount) || 0
    recalculateOwedAmounts(parsedAmount)
  }, [amount, participants, splitType])

  const toggleParticipant = (memberId: string) => {
    if (participants.includes(memberId)) {
      if (participants.length <= 1) return

      setParticipants(participants.filter((id) => id !== memberId))
    } else {
      setParticipants([...participants, memberId])
    }
  }

  const initializeSplitsStructure = () => {
    const updatedSplits = members.map((member) => {
      const existingSplit = splits.find((s) => s.memberId === member.id)

      if (!participants.includes(member.id)) {
        return { ...(existingSplit || { memberId: member.id }), owedAmount: 0 }
      }

      // For edit mode: preserve existing split data with all properties
      if (isEditing && existingSplit) {
        return {
          ...existingSplit,
          // Ensure these fields exist for editing
          amountInput: existingSplit.amount?.toString() || '',
          sharesInput: existingSplit.shares?.toString() || '',
        } satisfies Split
      }

      // Default split for new expenses or non-existing splits in edit mode
      const baseSplit: Split = {
        memberId: member.id,
        owedAmount: 0,
        amount: 0,
        amountInput: '',
        shares: 0,
        sharesInput: '',
      }

      return baseSplit
    })

    setSplits(updatedSplits)
  }

  const addPayer = () => {
    const existingPayerIds = payers.map((p) => p.memberId)
    const availableMembers = members.filter((m) => !existingPayerIds.includes(m.id))

    if (availableMembers.length > 0) {
      setPayers([...payers, { memberId: availableMembers[0].id, amount: 0 }])
    }
  }

  const removePayer = (index: number) => {
    if (payers.length > 1) {
      const newPayers = [...payers]
      newPayers.splice(index, 1)
      setPayers(newPayers)
    }
  }

  const updatePayer = (index: number, field: 'memberId' | 'amount', rawValue: string | number) => {
    let value: string | number
    if (field === 'amount') {
      value = typeof rawValue === 'string' ? rawValue.replace(/[^0-9.,]/g, '') : rawValue
      value = parseFloat(value as string) || 0
    } else {
      value = rawValue
    }

    const newPayers = [...payers]
    newPayers[index] = {
      ...newPayers[index],
      [field]: value,
    }
    setPayers(newPayers)
  }

  const updateSplit = (
    index: number,
    field: 'amount' | 'shares' | 'amountInput' | 'sharesInput',
    rawValue: string
  ) => {
    const value =
      field === 'amountInput' ? rawValue.replace(/[^0-9.,+\-*/() ]/g, '') : rawValue.replace(/[^0-9.,]/g, '')

    const newSplits = [...splits]

    // Handle input fields and update corresponding numeric value
    if (field === 'amountInput' || field === 'sharesInput') {
      const numericField = field === 'amountInput' ? 'amount' : 'shares'

      // Update the string input value
      newSplits[index] = {
        ...newSplits[index],
        [field]: value,
      }

      const evaluatedValue = field === 'amountInput' ? evaluateExpressionClient(value || '0') : Number(value)
      if (evaluatedValue !== null && Number.isFinite(evaluatedValue)) {
        newSplits[index][numericField] = roundToCent(evaluatedValue)
      }

      // Add calculation code back
      if (numericField === 'shares') {
        // Shares calculation logic
        const totalShares = newSplits
          .filter((s) => participants.includes(s.memberId))
          .reduce((sum, s) => sum + (s.shares || 0), 0)

        const totalAmountNum = parseFloat(amount) || 0

        if (totalShares > 0) {
          const updatedSplits = newSplits.map((split) => {
            if (!participants.includes(split.memberId)) {
              return split
            }

            return {
              ...split,
              owedAmount: roundToCent(totalAmountNum * ((split.shares || 0) / totalShares)),
            }
          })

          const participantSplits = updatedSplits.filter((s) => participants.includes(s.memberId))
          const totalCalculated = participantSplits.reduce((sum, s) => sum + s.owedAmount, 0)
          const difference = roundToCent(totalAmountNum - totalCalculated)

          if (Math.abs(difference) > 0.001 && participantSplits.length > 0) {
            const lastParticipantId = participantSplits[participantSplits.length - 1].memberId
            const lastIndex = updatedSplits.findIndex((s) => s.memberId === lastParticipantId)

            if (lastIndex >= 0) {
              updatedSplits[lastIndex] = {
                ...updatedSplits[lastIndex],
                owedAmount: roundToCent(updatedSplits[lastIndex].owedAmount + difference),
              }
            }
          }

          setSplits(updatedSplits)
        } else {
          // When all shares are 0, distribute evenly like in "even" split type
          const participantCount = participants.length
          if (participantCount > 0 && totalAmountNum > 0) {
            const evenAmount = roundToCent(totalAmountNum / participantCount)

            const evenSplits = newSplits.map((split) => {
              if (!participants.includes(split.memberId)) {
                return split
              }
              return {
                ...split,
                owedAmount: evenAmount,
              }
            })

            // Fix rounding errors
            const totalEvenAmount = evenAmount * participantCount
            const difference = roundToCent(totalAmountNum - totalEvenAmount)

            if (Math.abs(difference) > 0.001 && participants.length > 0) {
              const lastParticipantId = participants[participants.length - 1]
              const lastIndex = evenSplits.findIndex((s) => s.memberId === lastParticipantId)

              if (lastIndex >= 0) {
                evenSplits[lastIndex] = {
                  ...evenSplits[lastIndex],
                  owedAmount: roundToCent(evenSplits[lastIndex].owedAmount + difference),
                }
              }
            }

            setSplits(evenSplits)
          } else {
            setSplits(newSplits)
          }
        }
      } else if (numericField === 'amount') {
        // Amount calculation logic
        const amountValue = newSplits[index].amount || 0
        newSplits[index] = {
          ...newSplits[index],
          owedAmount: amountValue,
        }
        setSplits(newSplits)
      }
    } else {
      // Direct numeric field updates (original function behavior)
      newSplits[index] = {
        ...newSplits[index],
        [field]: value === '' ? 0 : parseFloat(value) || 0,
      }

      if (field === 'shares') {
        // Shares calculation logic (same as above)
        const totalShares = newSplits
          .filter((s) => participants.includes(s.memberId))
          .reduce((sum, s) => sum + (s.shares || 0), 0)

        const totalAmountNum = parseFloat(amount) || 0

        if (totalShares > 0) {
          const updatedSplits = newSplits.map((split) => {
            if (!participants.includes(split.memberId)) {
              return split
            }

            return {
              ...split,
              owedAmount: roundToCent(totalAmountNum * ((split.shares || 0) / totalShares)),
            }
          })

          const participantSplits = updatedSplits.filter((s) => participants.includes(s.memberId))
          const totalCalculated = participantSplits.reduce((sum, s) => sum + s.owedAmount, 0)
          const difference = roundToCent(totalAmountNum - totalCalculated)

          if (Math.abs(difference) > 0.001 && participantSplits.length > 0) {
            const lastParticipantId = participantSplits[participantSplits.length - 1].memberId
            const lastIndex = updatedSplits.findIndex((s) => s.memberId === lastParticipantId)

            if (lastIndex >= 0) {
              updatedSplits[lastIndex] = {
                ...updatedSplits[lastIndex],
                owedAmount: roundToCent(updatedSplits[lastIndex].owedAmount + difference),
              }
            }
          }

          setSplits(updatedSplits)
        } else {
          // When all shares are 0, distribute evenly like in "even" split type
          const participantCount = participants.length
          if (participantCount > 0 && totalAmountNum > 0) {
            const evenAmount = roundToCent(totalAmountNum / participantCount)

            const evenSplits = newSplits.map((split) => {
              if (!participants.includes(split.memberId)) {
                return split
              }
              return {
                ...split,
                owedAmount: evenAmount,
              }
            })

            // Fix rounding errors
            const totalEvenAmount = evenAmount * participantCount
            const difference = roundToCent(totalAmountNum - totalEvenAmount)

            if (Math.abs(difference) > 0.001 && participants.length > 0) {
              const lastParticipantId = participants[participants.length - 1]
              const lastIndex = evenSplits.findIndex((s) => s.memberId === lastParticipantId)

              if (lastIndex >= 0) {
                evenSplits[lastIndex] = {
                  ...evenSplits[lastIndex],
                  owedAmount: roundToCent(evenSplits[lastIndex].owedAmount + difference),
                }
              }
            }

            setSplits(evenSplits)
          } else {
            setSplits(newSplits)
          }
        }
      } else if (field === 'amount') {
        // Amount calculation logic (same as above)
        const memberIndex = newSplits.findIndex((s, i) => i === index)
        if (memberIndex >= 0) {
          newSplits[memberIndex] = {
            ...newSplits[memberIndex],
            owedAmount: newSplits[memberIndex].amount || 0,
          }
          setSplits(newSplits)
        }
      }
    }
  }

  const recalculateOwedAmounts = (totalAmount: number) => {
    if (participants.length === 0 || totalAmount <= 0) {
      // Don't reset to 0, just retain existing values
      return
    }

    let calculatedSplits: Split[] = []

    const participantSplits = splits.filter((s) => participants.includes(s.memberId))

    switch (splitType) {
      case 'even':
        calculatedSplits = calculateEvenSplits(totalAmount)
        break
      case 'amount':
        calculatedSplits = participantSplits.map((split) => ({
          ...split,
          owedAmount: split.amount || 0,
        }))
        break
      case 'shares':
        calculatedSplits = calculateSharesSplits(totalAmount)
        break
    }

    setSplits((prevSplits) => {
      const calculatedMap = new Map(calculatedSplits.map((s) => [s.memberId, s.owedAmount]))
      return prevSplits.map((split) => ({
        ...split,
        owedAmount: participants.includes(split.memberId) ? (calculatedMap.get(split.memberId) ?? 0) : 0,
      }))
    })
  }

  const validateForm = () => {
    if (!description.trim()) {
      setError('Description is required')
      return false
    }

    const parsedAmount = Number(amount)
    if (amount === '' || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Valid amount is required')
      return false
    }

    const totalPayment = payers.reduce((sum, payer) => sum + payer.amount, 0)
    if (Math.abs(totalPayment - parsedAmount) > 0.01) {
      // If there's only one payer, adjust the amount automatically
      if (payers.length === 1) {
        setPayers([{ ...payers[0], amount: parsedAmount }])
      } else if (isEditing) {
        // In edit mode, adjust payer amounts proportionally
        const ratio = parsedAmount / totalPayment
        const newPayers = [...payers]
        let totalAdjusted = 0

        // Adjust all but the last payer
        for (let i = 0; i < newPayers.length - 1; i++) {
          const adjustedAmount = roundToCent(newPayers[i].amount * ratio)
          newPayers[i].amount = adjustedAmount
          totalAdjusted += adjustedAmount
        }

        // Adjust the last payer to account for rounding errors
        newPayers[newPayers.length - 1].amount = roundToCent(parsedAmount - totalAdjusted)

        setPayers(newPayers)
      } else {
        setError('Total payment amount must equal expense amount')
        return false
      }
    }

    if (splitType === 'amount') {
      const totalSplitAmount = splits.reduce((sum, split) => sum + (split.owedAmount || 0), 0)
      if (Math.abs(totalSplitAmount - parsedAmount) > 0.01) {
        setError('Total split amount must equal expense amount')
        return false
      }
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const url = isEditing && expense ? `/api/expenses/${expense.id}` : '/api/expenses'

      const method = isEditing ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          description,
          amount: parseFloat(amount),
          date,
          splitType,
          categoryId,
          paymentMethodId: selectedPaymentMethod || null,
          payments: payers,
          splits,
          notes: notes.trim() || null,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || `Failed to ${isEditing ? 'update' : 'create'} expense`)
      }

      onExpenseAdded()

      onClose()
    } catch (error) {
      console.error(`Error ${isEditing ? 'updating' : 'creating'} expense:`, error)
      setError(
        error instanceof Error ? error.message : `Failed to ${isEditing ? 'update' : 'create'} expense`
      )
      setIsLoading(false)
    }
  }

  const getMemberName = (memberId: string) => {
    const member = members.find((m) => m.id === memberId)
    return member ? member.name : 'Unknown'
  }

  const formatAmount = (value: number) => {
    return formatCurrency(value, currency)
  }

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('')

  const handleAmountChange = (rawNewValue: string) => {
    const newValue = rawNewValue.replace(/[^0-9.,]/g, '')

    // Always update the string input value
    setAmount(newValue)

    // Only process valid numbers and non-empty values
    if (newValue !== '' && !isNaN(Number(newValue))) {
      const parsedValue = Number(newValue)

      // Update payer amount
      if (payers.length === 1) {
        setPayers([{ ...payers[0], amount: parsedValue }])
      }

      // Don't automatically calculate splits, keep existing values or empty
    }
  }

  const calculateEvenSplits = (totalAmount: number): Split[] => {
    if (participants.length === 0 || totalAmount <= 0) return []

    const evenAmount = totalAmount / participants.length
    const splits: Split[] = []

    participants.forEach((pId) => {
      splits.push({
        memberId: pId,
        owedAmount: roundToCent(evenAmount),
      })
    })

    const totalCalculated = splits.reduce((sum, s) => sum + s.owedAmount, 0)
    const difference = roundToCent(totalAmount - totalCalculated)

    if (Math.abs(difference) > 0.001 && splits.length > 0) {
      const lastIndex = splits.length - 1
      splits[lastIndex].owedAmount = roundToCent(splits[lastIndex].owedAmount + difference)
    }

    return splits
  }

  const calculateSharesSplits = (totalAmount: number): Split[] => {
    if (participants.length === 0 || totalAmount <= 0) return []

    const participantSplits = splits.filter((s) => participants.includes(s.memberId))
    const totalShares = participantSplits.reduce((sum, s) => sum + (s.shares || 0), 0)

    if (totalShares <= 0) {
      return calculateEvenSplits(totalAmount)
    }

    const newSplits: Split[] = []

    participants.forEach((pId) => {
      const existingSplit = splits.find((s) => s.memberId === pId)
      const shares = existingSplit?.shares || 0
      const sharesProportion = shares / totalShares

      newSplits.push({
        memberId: pId,
        shares,
        owedAmount: roundToCent(totalAmount * sharesProportion),
      })
    })

    const totalCalculated = newSplits.reduce((sum, s) => sum + s.owedAmount, 0)
    const difference = roundToCent(totalAmount - totalCalculated)

    if (Math.abs(difference) > 0.001 && newSplits.length > 0) {
      const lastIndex = newSplits.length - 1
      newSplits[lastIndex].owedAmount = roundToCent(newSplits[lastIndex].owedAmount + difference)
    }

    return newSplits
  }

  const autoFillSplits = () => {
    if (!amount || parseFloat(amount) <= 0 || participants.length === 0) return

    const totalAmountNum = parseFloat(amount)
    const participantIds = participants

    if (participantIds.length === 0) return

    const newSplits = [...splits]
    const participantSplits = newSplits.filter((s) => participantIds.includes(s.memberId))

    // Check if all participants already have amounts set
    const allHaveAmounts = participantSplits.every(
      (s) => s.amount !== undefined && s.amount > 0 && s.amountInput !== undefined && s.amountInput !== ''
    )

    // Check if any participants have amounts set
    const someHaveAmounts = participantSplits.some(
      (s) => s.amount !== undefined && s.amount > 0 && s.amountInput !== undefined && s.amountInput !== ''
    )

    // If all fields are set, override everything
    // If some fields are set, only update the empty ones
    if (allHaveAmounts || !someHaveAmounts) {
      // Distribute evenly among all participants
      const amountPerPerson = roundToCent(totalAmountNum / participantIds.length)

      participantIds.forEach((pid, idx) => {
        const splitIndex = newSplits.findIndex((s) => s.memberId === pid)
        if (splitIndex >= 0) {
          // Last person gets any remaining cents to ensure total is exact
          const isLast = idx === participantIds.length - 1
          const adjustedAmount = isLast
            ? roundToCent(totalAmountNum - amountPerPerson * (participantIds.length - 1))
            : amountPerPerson

          newSplits[splitIndex] = {
            ...newSplits[splitIndex],
            amount: adjustedAmount,
            amountInput: adjustedAmount.toString(),
            owedAmount: adjustedAmount,
          }
        }
      })
    } else {
      // Some fields have values, only update the empty ones
      // First, calculate how much is already allocated
      const totalAllocated = participantSplits.reduce((sum, s) => sum + (s.amount || 0), 0)

      // Count participants without amounts
      const emptyParticipants = participantSplits.filter(
        (s) => s.amount === undefined || s.amount === 0 || s.amountInput === undefined || s.amountInput === ''
      )

      if (emptyParticipants.length > 0) {
        // Calculate remaining amount to distribute among empty fields
        const remainingAmount = Math.max(0, totalAmountNum - totalAllocated)

        const amountPerEmptyPerson = roundToCent(remainingAmount / emptyParticipants.length)

        // Update only the empty fields
        let distributedAmount = 0
        emptyParticipants.forEach((split, idx) => {
          const splitIndex = newSplits.findIndex((s) => s.memberId === split.memberId)
          if (splitIndex >= 0) {
            // Last empty person gets any remaining cents to ensure total is exact
            const isLast = idx === emptyParticipants.length - 1
            const adjustedAmount = isLast
              ? roundToCent(remainingAmount - distributedAmount)
              : amountPerEmptyPerson

            distributedAmount += amountPerEmptyPerson

            newSplits[splitIndex] = {
              ...newSplits[splitIndex],
              amount: adjustedAmount,
              amountInput: adjustedAmount.toString(),
              owedAmount: adjustedAmount,
            }
          }
        })
      }
    }

    setSplits(newSplits)
  }

  const fillRemainingPayerAmount = (index: number) => {
    if (!amount || parseFloat(amount) <= 0) return

    const totalAmountNum = parseFloat(amount)
    const currentPayments = payers.reduce((sum, p, i) => (i !== index ? sum + (p.amount || 0) : sum), 0)
    const remainingAmount = roundToCent(totalAmountNum - currentPayments)

    // Always replace the amount regardless of current value
    // Ensure value is not negative
    const newAmount = Math.max(0, remainingAmount)

    const newPayers = [...payers]
    newPayers[index] = {
      ...newPayers[index],
      amount: newAmount,
    }

    setPayers(newPayers)
  }

  const [disableAutoFillAmount, setDisableAutoFillAmount] = useState<boolean>(false)

  useEffect(() => {
    const totalAmountNum = parseFloat(amount) || 0
    const currentAllocated = splits
      .filter((s) => participants.includes(s.memberId))
      .reduce((sum, s) => sum + (s.amount || 0), 0)
    const remainingAmount = totalAmountNum - currentAllocated
    setDisableAutoFillAmount(!(remainingAmount > 0))
  }, [amount, participants, splits])

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium">
            Description
          </label>
          <input
            type="text"
            id="description"
            className="input w-full"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dinner, Groceries, etc."
            required
          />
        </div>

        <div>
          <label htmlFor="amount" className="mb-1 block text-sm font-medium">
            Amount {currency && `(${currency})`}
          </label>
          <input
            type="text"
            inputMode="tel"
            id="amount"
            className="input w-full"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="date" className="mb-1 block text-sm font-medium">
            Date
          </label>
          <input
            type="date"
            id="date"
            className="input w-full"
            value={date}
            onChange={(e) => {
              const { value } = e.target
              const date = new Date(value)
              if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(date.getTime())) {
                setDate(value)
              }
            }}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Category (Optional)</label>
          <select
            value={categoryId || ''}
            onChange={(e) => setCategoryId(e.target.value || null)}
            className="input w-full"
          >
            <option value="">No Category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Payment Method (Optional)</label>
          <select
            value={selectedPaymentMethod || ''}
            onChange={(e) => setSelectedPaymentMethod(e.target.value)}
            className="input w-full"
          >
            <option value="">No Payment Method</option>
            {paymentMethods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.icon} {method.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-1 border-t pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-md font-medium">Who's involved?</h3>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3">
          {members.map((member) => (
            <div
              key={member.id}
              className={`flex cursor-pointer items-center rounded border p-2 ${
                participants.includes(member.id)
                  ? 'border-blue-500 bg-blue-100 dark:border-blue-400 dark:bg-blue-900'
                  : 'border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-800'
              } `}
              onClick={() => toggleParticipant(member.id)}
            >
              <input
                type="checkbox"
                checked={participants.includes(member.id)}
                onChange={() => {}}
                className="mr-2"
              />
              <span>{member.name}</span>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <h3 className="text-md mb-2 font-medium">Paid by</h3>

          <div className="space-y-3">
            {payers.map((payer, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  className="input flex-grow"
                  value={payer.memberId}
                  onChange={(e) => updatePayer(index, 'memberId', e.target.value)}
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>

                {(payers.length > 1 || index > 0) && (
                  <div className="relative w-28">
                    <input
                      type="text"
                      inputMode="tel"
                      className="input w-full pr-9"
                      value={payer.amount || ''}
                      onChange={(e) => updatePayer(index, 'amount', e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                    />
                    <button
                      type="button"
                      className="absolute bottom-0 right-0 top-0 flex items-center justify-center px-3 text-blue-600 hover:bg-black/5 dark:text-blue-400 dark:hover:bg-white/5"
                      onClick={() => fillRemainingPayerAmount(index)}
                      title="Fill with remaining amount"
                    >
                      ↓
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => removePayer(index)}
                  className="btn btn-secondary flex-shrink-0"
                  disabled={payers.length <= 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addPayer}
            className="mt-3 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            disabled={payers.length >= members.length}
          >
            + Add another payer
          </button>
        </div>
      </div>

      <div className="mt-1 border-t pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-md font-medium">How to split?</h3>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            className={`btn ${splitType === 'even' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSplitType('even')}
          >
            Split Evenly
          </button>

          <button
            type="button"
            className={`btn ${splitType === 'amount' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSplitType('amount')}
          >
            By Amount
          </button>

          <button
            type="button"
            className={`btn ${splitType === 'shares' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSplitType('shares')}
          >
            By Shares
          </button>
        </div>

        <div className="rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium">Split Details</h4>
            {splitType === 'amount' && (
              <span className="ml-2 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                (Math expressions allowed)
              </span>
            )}
            {splitType === 'amount' && (
              <button
                type="button"
                onClick={autoFillSplits}
                className="text-sm text-blue-600 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
                title="Auto-fill all inputs with even distribution"
                disabled={disableAutoFillAmount}
              >
                {participants.some((memberId) => {
                  const split = splits.find((s) => s.memberId === memberId)
                  return split?.amount !== undefined && split.amount !== 0 && Number.isFinite(split.amount)
                }) &&
                !participants.every((memberId) => {
                  const split = splits.find((s) => s.memberId === memberId)
                  return split?.amount !== undefined && split.amount !== 0 && Number.isFinite(split.amount)
                })
                  ? 'Auto-fill empty'
                  : 'Auto-fill all'}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {splits
              .filter((split) => participants.includes(split.memberId))
              .map((split) => {
                const originalIndex = splits.findIndex((s) => s.memberId === split.memberId)
                if (originalIndex === -1) return null

                return (
                  <div key={originalIndex} className="flex items-center gap-2">
                    <span className="w-1/4">{getMemberName(split.memberId)}</span>

                    {splitType === 'amount' && (
                      <div className="relative flex-grow">
                        <input
                          type="text"
                          inputMode="tel"
                          className={`input w-full pr-9 ${
                            !isValidNumberFormat(split.amountInput, true)
                              ? 'border-red-500 bg-red-50 dark:border-red-400 dark:bg-red-900/20'
                              : ''
                          }`}
                          value={split.amountInput || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateSplit(originalIndex, 'amountInput', e.target.value)
                          }
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          title={
                            !isValidNumberFormat(split.amountInput, true)
                              ? 'Invalid number format - using previous valid value'
                              : ''
                          }
                        />
                        <button
                          type="button"
                          className="absolute bottom-0 right-0 top-0 flex items-center justify-center px-3 text-blue-600 hover:bg-black/5 dark:text-blue-400 dark:hover:bg-white/5"
                          onClick={() => {
                            if (!amount || parseFloat(amount) <= 0) return

                            const totalAmountNum = parseFloat(amount)
                            const otherSplits = splits
                              .filter(
                                (s) => participants.includes(s.memberId) && s.memberId !== split.memberId
                              )
                              .reduce((sum, s) => sum + (s.amount || 0), 0)

                            const remainingAmount = roundToCent(totalAmountNum - otherSplits)

                            // Always replace the value regardless of current value
                            // Ensure value is not negative
                            const newAmount = Math.max(0, remainingAmount)

                            const newSplits = [...splits]
                            newSplits[originalIndex] = {
                              ...newSplits[originalIndex],
                              amount: newAmount,
                              amountInput: newAmount.toString(),
                              owedAmount: newAmount,
                            }

                            setSplits(newSplits)
                          }}
                          title="Fill with remaining amount"
                        >
                          ↓
                        </button>
                        {!isValidNumberFormat(split.amountInput, true) && (
                          <div className="absolute right-10 top-1/2 -translate-y-1/2 text-red-500 dark:text-red-400">
                            <span
                              className="cursor-help text-xs"
                              title="Invalid number format - using previous valid value"
                            >
                              !
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {splitType === 'shares' && (
                      <div className="flex flex-grow items-center">
                        <div className="relative flex-grow">
                          <input
                            type="text"
                            inputMode="tel"
                            className={`input flex-grow pr-9 ${
                              !isValidNumberFormat(split.sharesInput)
                                ? 'border-red-500 bg-red-50 dark:border-red-400 dark:bg-red-900/20'
                                : ''
                            }`}
                            value={split.sharesInput || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              updateSplit(originalIndex, 'sharesInput', e.target.value)
                            }
                            placeholder="1"
                            step="1"
                            min="0"
                            title={
                              !isValidNumberFormat(split.sharesInput)
                                ? 'Invalid number format - using previous valid value'
                                : ''
                            }
                          />
                          {!isValidNumberFormat(split.sharesInput) && (
                            <div className="absolute right-10 top-1/2 -translate-y-1/2 text-red-500 dark:text-red-400">
                              <span
                                className="cursor-help text-xs"
                                title="Invalid number format - using previous valid value"
                              >
                                !
                              </span>
                            </div>
                          )}
                        </div>
                        {(() => {
                          const totalShares = splits
                            .filter((s) => participants.includes(s.memberId))
                            .reduce((sum, s) => sum + (s.shares || 0), 0)

                          const percentage = totalShares === 0 ? 0 : ((split.shares ?? 0) / totalShares) * 100
                          const displayPercentage = Math.round(percentage)
                          const needsApprox = Math.abs(percentage - displayPercentage) > 0.01
                          return (
                            <span className="ml-2 whitespace-nowrap text-gray-500 dark:text-gray-400">
                              {needsApprox ? '~' : ''}
                              {displayPercentage.toLocaleString()}%
                            </span>
                          )
                        })()}
                      </div>
                    )}

                    <span className="w-20 text-right text-gray-600 dark:text-gray-400">
                      {formatAmount(split.owedAmount)}
                    </span>
                  </div>
                )
              })}
            <div className="pt-1">
              {splitType === 'amount' &&
                (() => {
                  const totalAmountNum = parseFloat(amount) || 0
                  const participantSplits = splits.filter((s) => participants.includes(s.memberId))
                  const currentSplitTotalAmount = participantSplits.reduce(
                    (sum, s) => sum + (s.amount || 0),
                    0
                  )
                  const difference = roundToCent(totalAmountNum - currentSplitTotalAmount)
                  const isMatch = Math.abs(difference) < 0.01
                  const hasInput = participantSplits.some((s) => s.amount !== undefined && s.amount !== null)

                  let textColor = 'text-gray-500 dark:text-gray-400'
                  let fontWeight = 'font-normal'
                  let hintText = `Total must equal ${formatAmount(totalAmountNum)}.`

                  if (hasInput) {
                    if (isMatch) {
                      textColor = 'text-green-600 dark:text-green-400'
                      fontWeight = 'font-semibold'
                      hintText = `Total matches: ${formatAmount(totalAmountNum)}`
                    } else {
                      textColor = 'text-red-600 dark:text-red-400'
                      fontWeight = 'font-semibold'
                      hintText = `${formatAmount(Math.abs(difference))} ${
                        difference > 0 ? 'left' : 'over'
                      }. Current total: ${formatAmount(currentSplitTotalAmount)}`
                    }
                  }

                  return <p className={`mt-1 text-sm ${textColor} ${fontWeight}`}>{hintText}</p>
                })()}
              {splitType === 'shares' && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Total shares:{' '}
                  {splits
                    .filter((s) => participants.includes(s.memberId))
                    .reduce((sum, s) => sum + (s.shares || 0), 0)}
                </p>
              )}
              {splitType === 'even' && participants.length > 0 && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Each person pays{' '}
                  {formatAmount(roundToCent((parseFloat(amount) || 0) / participants.length))}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="mb-1 block text-sm font-medium">
          Notes (Optional)
        </label>
        <textarea
          id="notes"
          className="input w-full"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any additional details or notes about this expense..."
          rows={2}
        />
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading
            ? isEditing
              ? 'Updating...'
              : 'Adding...'
            : isEditing
              ? 'Update Expense'
              : 'Add Expense'}
        </button>
      </div>
    </form>
  )
}
