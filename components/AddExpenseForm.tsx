import { useEffect, useState } from 'react'
import { formatCurrency } from '../utils/currency'

const roundToCent = (value: number): number => {
  return Math.round(value * 100) / 100
}

const isValidNumberFormat = <T extends unknown>(value: T) => Number.isFinite(Number(value))

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

interface AddExpenseFormProps {
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

export default function AddExpenseForm({
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
}: AddExpenseFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  }, [amount, participants, splitType, splits])

  const toggleParticipant = (memberId: string) => {
    if (participants.includes(memberId)) {
      if (participants.length <= 1) return

      setParticipants(participants.filter((id) => id !== memberId))
    } else {
      setParticipants([...participants, memberId])
    }
  }

  const initializeSplitsStructure = () => {
    const participantMembers = members.filter((member) => participants.includes(member.id))

    const updatedSplits = members.map((member) => {
      const existingSplit = splits.find((s) => s.memberId === member.id)

      if (!participants.includes(member.id)) {
        return { ...(existingSplit || { memberId: member.id }), owedAmount: 0 }
      }

      const baseSplit: Split = existingSplit || {
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
    const value = typeof rawValue === 'string' ? rawValue.replace(/[^0-9.,]/g, '') : rawValue
    const newPayers = [...payers]
    newPayers[index] = {
      ...newPayers[index],
      [field]: field === 'amount' ? parseFloat(value as string) || 0 : value,
    }
    setPayers(newPayers)
  }

  const updateSplit = (
    index: number,
    field: 'amount' | 'shares' | 'amountInput' | 'sharesInput',
    rawValue: string
  ) => {
    const value = rawValue.replace(/[^0-9.,]/g, '')

    const newSplits = [...splits]

    // Handle input fields and update corresponding numeric value
    if (field === 'amountInput' || field === 'sharesInput') {
      const numericField = field === 'amountInput' ? 'amount' : 'shares'

      // Update the string input value
      newSplits[index] = {
        ...newSplits[index],
        [field]: value,
      }

      const numericValue = Number(value)
      if (Number.isFinite(numericValue)) {
        newSplits[index][numericField] = numericValue
      }
      // Invalid numbers keep the previous value

      // Add calculation code back
      if (numericField === 'shares') {
        // Shares calculation logic
        const totalShares = newSplits
          .filter((s) => participants.includes(s.memberId))
          .reduce((sum, s) => sum + (s.shares || 0), 0)

        if (totalShares > 0) {
          const totalAmountNum = newSplits[index].amount || 0

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

        if (totalShares > 0) {
          const totalAmountNum = newSplits[index].amount || 0

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
      setError('Total payment amount must equal expense amount')
      return false
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
    // Consider all participants for distribution, regardless if they already have values
    const participantIds = participants

    if (participantIds.length === 0) return

    // Distribute amount evenly among all participants
    const amountPerPerson = roundToCent(totalAmountNum / participantIds.length)

    const newSplits = [...splits]

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

    setSplits(newSplits)
  }

  const autoFillShares = () => {
    if (!amount || parseFloat(amount) <= 0 || participants.length === 0) return

    // Always assign 1 share to all participants, regardless if they already have values
    const newSplits = [...splits]

    participants.forEach((pid) => {
      const splitIndex = newSplits.findIndex((s) => s.memberId === pid)
      if (splitIndex >= 0) {
        newSplits[splitIndex] = {
          ...newSplits[splitIndex],
          shares: 1,
          sharesInput: '1',
        }
      }
    })

    // Recalculate owed amounts based on shares
    const totalShares = newSplits
      .filter((s) => participants.includes(s.memberId))
      .reduce((sum, s) => sum + (s.shares || 0), 0)

    if (totalShares > 0) {
      const totalAmountNum = parseFloat(amount)

      const updatedSplits = newSplits.map((split) => {
        if (!participants.includes(split.memberId)) {
          return split
        }

        return {
          ...split,
          owedAmount: roundToCent(totalAmountNum * ((split.shares || 0) / totalShares)),
        }
      })

      // Fix any rounding errors
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
    }
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
            inputMode="decimal"
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
                      inputMode="decimal"
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
              <button
                type="button"
                onClick={autoFillSplits}
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                title="Auto-fill all inputs with even distribution"
              >
                Auto-fill Even
              </button>
            )}
            {splitType === 'shares' && (
              <button
                type="button"
                onClick={autoFillShares}
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                title="Set all to 1 share"
              >
                Auto-fill 1 Share Each
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
                          inputMode="decimal"
                          className={`input w-full pr-9 ${
                            (split.amountInput && !isValidNumberFormat(split.amountInput)) ||
                            (isValidNumberFormat(split.amountInput) &&
                              Number(split.amountInput) !== split.amount)
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
                            !isValidNumberFormat(split.amountInput)
                              ? 'Invalid number format - using previous valid value'
                              : Number(split.amountInput) !== split.amount
                                ? 'Number mismatch - using different value for calculations'
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
                        {((split.amountInput && !isValidNumberFormat(split.amountInput)) ||
                          (isValidNumberFormat(split.amountInput) &&
                            Number(split.amountInput) !== split.amount)) && (
                          <div className="absolute right-10 top-1/2 -translate-y-1/2 text-red-500 dark:text-red-400">
                            <span
                              className="cursor-help text-xs"
                              title={
                                !isValidNumberFormat(split.amountInput)
                                  ? 'Invalid number format - using previous valid value'
                                  : Number(split.amountInput) !== split.amount
                                    ? 'Number mismatch - using different value for calculations'
                                    : ''
                              }
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
                            inputMode="decimal"
                            className={`input flex-grow pr-9 ${
                              (split.sharesInput && !isValidNumberFormat(split.sharesInput)) ||
                              (isValidNumberFormat(split.sharesInput) &&
                                Number(split.sharesInput) !== split.shares)
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
                                : Number(split.sharesInput) !== split.shares
                                  ? 'Number mismatch - using different value for calculations'
                                  : ''
                            }
                          />
                          <button
                            type="button"
                            className="absolute bottom-0 right-0 top-0 flex items-center justify-center px-3 text-blue-600 hover:bg-black/5 dark:text-blue-400 dark:hover:bg-white/5"
                            onClick={() => {
                              // Always set to 1 share regardless of current value
                              const newSplits = [...splits]
                              newSplits[originalIndex] = {
                                ...newSplits[originalIndex],
                                shares: 1,
                                sharesInput: '1',
                              }

                              // Recalculate owed amounts based on shares
                              const totalShares = newSplits
                                .filter((s) => participants.includes(s.memberId))
                                .reduce((sum, s) => sum + (s.shares || 0), 0)

                              if (totalShares > 0 && amount) {
                                const totalAmountNum = parseFloat(amount)
                                newSplits[originalIndex].owedAmount = roundToCent(
                                  totalAmountNum * ((newSplits[originalIndex].shares || 0) / totalShares)
                                )

                                setSplits(newSplits)
                                recalculateOwedAmounts(totalAmountNum)
                              }
                            }}
                            title="Set to 1 share"
                          >
                            ↓
                          </button>
                          {((split.sharesInput && !isValidNumberFormat(split.sharesInput)) ||
                            (isValidNumberFormat(split.sharesInput) &&
                              Number(split.sharesInput) !== split.shares)) && (
                            <div className="absolute right-10 top-1/2 -translate-y-1/2 text-red-500 dark:text-red-400">
                              <span
                                className="cursor-help text-xs"
                                title={
                                  !isValidNumberFormat(split.sharesInput)
                                    ? 'Invalid number format - using previous valid value'
                                    : Number(split.sharesInput) !== split.shares
                                      ? 'Number mismatch - using different value for calculations'
                                      : ''
                                }
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

                          if (totalShares > 0 && split.shares) {
                            const percentage = (split.shares / totalShares) * 100
                            const displayPercentage = Math.round(percentage)
                            const needsApprox = Math.abs(percentage - displayPercentage) > 0.01
                            return (
                              <span className="ml-2 whitespace-nowrap text-gray-500 dark:text-gray-400">
                                {needsApprox ? '~' : ''}
                                {displayPercentage}%
                              </span>
                            )
                          }
                          return null
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
                  Each person pays {formatAmount(roundToCent(parseFloat(amount) / participants.length))}
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
