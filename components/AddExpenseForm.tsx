import { useState, useEffect } from 'react';
import { generateId } from '../utils/id';
import { formatCurrency } from '../utils/currency';

interface Member {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
}

interface Payment {
  memberId: string;
  amount: number;
}

interface Split {
  memberId: string;
  amount?: number;
  shares?: number;
  percent?: number;
  owedAmount: number;
}

interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
}

interface AddExpenseFormProps {
  projectId: string;
  members: Member[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  currentMemberId: string;
  onClose: () => void;
  onExpenseAdded: () => void;
  currency: string; // Add currency code
  expense?: {
    id: string;
    description: string;
    amount: number;
    date: string | Date;
    splitType: 'even' | 'amount' | 'percent' | 'shares';
    categoryId: string | null;
    payments: Payment[];
    splits: Split[];
    notes?: string;
  };
  isEditing?: boolean;
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [description, setDescription] = useState(expense?.description || '');
  const [amount, setAmount] = useState(expense ? expense.amount.toString() : '');
  const [date, setDate] = useState(() => {
    if (expense?.date) {
      if (expense.date instanceof Date) {
        return expense.date.toISOString().split('T')[0];
      } else if (typeof expense.date === 'string') {
        const dateObj = new Date(expense.date);
        if (!isNaN(dateObj.getTime())) {
          return dateObj.toISOString().split('T')[0];
        }
      }
    }
    return new Date().toISOString().split('T')[0];
  });
  const [splitType, setSplitType] = useState<'even' | 'amount' | 'percent' | 'shares'>(
    expense?.splitType || 'even'
  );
  const [categoryId, setCategoryId] = useState<string | null>(expense?.categoryId || null);
  const [notes, setNotes] = useState<string>(expense?.notes || '');
  
  // Get participant IDs from expense splits if editing
  const initialParticipants = expense?.splits 
    ? expense.splits.map(split => split.memberId)
    : members.map(member => member.id);
  
  // Participants state (who's involved in the expense)
  const [participants, setParticipants] = useState<string[]>(initialParticipants);
  
  // Payers state (who paid)
  const [payers, setPayers] = useState<Payment[]>(
    expense?.payments || [{ memberId: currentMemberId, amount: 0 }]
  );
  
  // Splits state (who owes)
  const [splits, setSplits] = useState<Split[]>(expense?.splits || []);
  
  // Initialize splits when participants or split type changes
  useEffect(() => {
    initializeSplits();
  }, [participants, splitType]);
  
  // Update payer amount when total amount changes
  useEffect(() => {
    if (payers.length === 1 && amount) {
      setPayers([
        { ...payers[0], amount: parseFloat(amount) || 0 }
      ]);
    }
  }, [amount]);
  
  // Toggle participant selection
  const toggleParticipant = (memberId: string) => {
    if (participants.includes(memberId)) {
      // Don't allow removing the last participant
      if (participants.length <= 1) return;
      
      // Remove participant
      setParticipants(participants.filter(id => id !== memberId));
    } else {
      // Add participant
      setParticipants([...participants, memberId]);
    }
  };
  
  // Initialize splits based on split type and selected participants
  const initializeSplits = () => {
    // Only create splits for selected participants
    const participantMembers = members.filter(member => participants.includes(member.id));
    const participantCount = participantMembers.length;
    
    const newSplits = participantMembers.map(member => {
      const baseSplit: Split = {
        memberId: member.id,
        owedAmount: 0,
      };
      
      switch (splitType) {
        case 'amount':
          return { ...baseSplit, amount: parseFloat(amount) / participantCount || 0 };
        case 'percent':
          return { ...baseSplit, percent: participantCount > 0 ? 100 / participantCount : 0 };
        case 'shares':
          return { ...baseSplit, shares: 1 };
        case 'even':
        default:
          return baseSplit;
      }
    });
    
    setSplits(newSplits);
    calculateOwedAmounts(newSplits);
  };
  
  // Add another payer
  const addPayer = () => {
    // Find a member who isn't already a payer
    const existingPayerIds = payers.map(p => p.memberId);
    const availableMembers = members.filter(m => !existingPayerIds.includes(m.id));
    
    if (availableMembers.length > 0) {
      setPayers([...payers, { memberId: availableMembers[0].id, amount: 0 }]);
    }
  };
  
  // Remove a payer
  const removePayer = (index: number) => {
    if (payers.length > 1) {
      const newPayers = [...payers];
      newPayers.splice(index, 1);
      setPayers(newPayers);
    }
  };
  
  // Update payer
  const updatePayer = (index: number, field: 'memberId' | 'amount', value: string | number) => {
    const newPayers = [...payers];
    newPayers[index] = { 
      ...newPayers[index], 
      [field]: field === 'amount' ? parseFloat(value as string) || 0 : value 
    };
    setPayers(newPayers);
  };
  
  // Update split
  const updateSplit = (index: number, field: 'amount' | 'shares' | 'percent', value: string) => {
    const newSplits = [...splits];
    newSplits[index] = { 
      ...newSplits[index], 
      [field]: parseFloat(value) || 0 
    };
    
    // Recalculate owed amounts
    calculateOwedAmounts(newSplits);
  };
  
  // Calculate owed amounts based on split type
  const calculateOwedAmounts = (currentSplits = splits) => {
    const totalAmount = parseFloat(amount) || 0;
    
    if (totalAmount <= 0) {
      setSplits(currentSplits.map(split => ({ ...split, owedAmount: 0 })));
      return;
    }
    
    let newSplits = [...currentSplits];
    const participantCount = participants.length;
    
    switch (splitType) {
      case 'even':
        // Split evenly among selected participants
        const evenAmount = totalAmount / participantCount;
        newSplits = newSplits.map(split => ({
          ...split,
          owedAmount: evenAmount,
        }));
        break;
        
      case 'amount':
        // Use the specified amounts directly
        newSplits = newSplits.map(split => ({
          ...split,
          owedAmount: split.amount || 0,
        }));
        
        // Adjust the last split to make the total match
        const totalSplitAmount = newSplits.reduce((sum, split) => sum + split.owedAmount, 0);
        if (Math.abs(totalSplitAmount - totalAmount) > 0.01 && newSplits.length > 0) {
          const lastIndex = newSplits.length - 1;
          newSplits[lastIndex].owedAmount += (totalAmount - totalSplitAmount);
          newSplits[lastIndex].amount = newSplits[lastIndex].owedAmount;
        }
        break;
        
      case 'percent':
        // Calculate based on percentages
        newSplits = newSplits.map(split => ({
          ...split,
          owedAmount: totalAmount * ((split.percent || 0) / 100),
        }));
        break;
        
      case 'shares':
        // Calculate based on shares
        const totalShares = newSplits.reduce((sum, split) => sum + (split.shares || 0), 0);
        if (totalShares > 0) {
          newSplits = newSplits.map(split => ({
            ...split,
            owedAmount: totalAmount * ((split.shares || 0) / totalShares),
          }));
        }
        break;
    }
    
    setSplits(newSplits);
  };
  
  // Validate the form
  const validateForm = () => {
    if (!description.trim()) {
      setError('Description is required');
      return false;
    }
    
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Valid amount is required');
      return false;
    }
    
    // Check if total payment amount matches expense amount
    const totalPayment = payers.reduce((sum, payer) => sum + payer.amount, 0);
    if (Math.abs(totalPayment - parsedAmount) > 0.01) {
      setError('Total payment amount must equal expense amount');
      return false;
    }
    
    // For amount split type, check if total split amount matches expense amount
    if (splitType === 'amount') {
      const totalSplitAmount = splits.reduce((sum, split) => sum + (split.owedAmount || 0), 0);
      if (Math.abs(totalSplitAmount - parsedAmount) > 0.01) {
        setError('Total split amount must equal expense amount');
        return false;
      }
    }
    
    // For percent split type, check if percentages add up to 100%
    if (splitType === 'percent') {
      const totalPercent = splits.reduce((sum, split) => sum + (split.percent || 0), 0);
      if (Math.abs(totalPercent - 100) > 0.01) {
        setError('Percentages must add up to 100%');
        return false;
      }
    }
    
    return true;
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Determine if we're creating or updating an expense
      const url = isEditing && expense 
        ? `/api/expenses/${expense.id}` 
        : '/api/expenses';
      
      const method = isEditing ? 'PUT' : 'POST';
      
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
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || `Failed to ${isEditing ? 'update' : 'create'} expense`);
      }
      
      // Notify parent component
      onExpenseAdded();
      
      // Close the form
      onClose();
    } catch (error) {
      console.error(`Error ${isEditing ? 'updating' : 'creating'} expense:`, error);
      setError(error instanceof Error ? error.message : `Failed to ${isEditing ? 'update' : 'create'} expense`);
      setIsLoading(false);
    }
  };
  
  // Get member name by ID
  const getMemberName = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    return member ? member.name : 'Unknown';
  };
  
  // Format currency for display with the project's currency
  const formatAmount = (value: number) => {
    return formatCurrency(value, currency);
  };
  
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-1">
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
        <label htmlFor="amount" className="block text-sm font-medium mb-1">
          Amount
        </label>
        <input
          type="number"
          id="amount"
          className="input w-full"
          value={amount}
          onChange={(e) => {
            let value = e.target.value;
            // Handle edge case where value is decimal point only
            if (value === '.') value = '0.';
            // Ensure valid numeric input
            if (/^\d*\.?\d*$/.test(value)) {
              const parsedValue = parseFloat(value) || 0;
              setAmount(value);
              
              // Update single payer amount immediately
              if (payers.length === 1) {
                setPayers([{ ...payers[0], amount: parsedValue }]);
              }
              
              // Recalculate splits with the new parsed value
              const newSplits = splits.map(split => {
                switch (splitType) {
                  case 'even':
                    return { ...split, owedAmount: parsedValue / participants.length };
                  case 'amount':
                    return { ...split, owedAmount: split.amount || 0 };
                  case 'percent':
                    return { ...split, owedAmount: parsedValue * ((split.percent || 0) / 100) };
                  case 'shares':
                    const totalShares = splits.reduce((sum, s) => sum + (s.shares || 0), 0);
                    if (totalShares > 0) {
                      return { ...split, owedAmount: parsedValue * ((split.shares || 0) / totalShares) };
                    }
                    return { ...split, owedAmount: 0 };
                  default:
                    return split;
                }
              });
              setSplits(newSplits);
            }
          }}
          placeholder="0.00"
          step="0.01"
          min="0"
          required
        />
      </div>
      
      <div>
        <label htmlFor="date" className="block text-sm font-medium mb-1">
          Date
        </label>
        <input
          type="date"
          id="date"
          className="input w-full"
          value={date}
          onChange={(e) => {
            const { value } = e.target;
            // Validate date format YYYY-MM-DD and ensure it's a valid date
            const date = new Date(value);
            if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(date.getTime())) {
              setDate(value);
            }
          }}
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Category (Optional)
        </label>
        <select
          value={categoryId || ''}
          onChange={(e) => setCategoryId(e.target.value || null)}
          className="w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none"
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
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Payment Method (Optional)
        </label>
        <select
          value={selectedPaymentMethod || ''}
          onChange={(e) => setSelectedPaymentMethod(e.target.value)}
          className="w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none"
        >
          <option value="">No Payment Method</option>
          {paymentMethods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.icon} {method.name}
            </option>
          ))}
        </select>
      </div>
      
      <div>
        <label htmlFor="notes" className="block text-sm font-medium mb-1">
          Notes (Optional)
        </label>
        <textarea
          id="notes"
          className="input w-full"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any additional details or notes about this expense..."
          rows={3}
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">
          Participants
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          {members.map(member => (
            <div 
              key={member.id}
              className={`
                p-2 rounded border cursor-pointer flex items-center
                ${participants.includes(member.id) 
                  ? 'bg-blue-100 border-blue-500 dark:bg-blue-900 dark:border-blue-400' 
                  : 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600'}
              `}
              onClick={() => toggleParticipant(member.id)}
            >
              <input 
                type="checkbox" 
                checked={participants.includes(member.id)}
                onChange={() => {}} // Handled by the div onClick
                className="mr-2"
              />
              <span>{member.name}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">
          Paid by
        </label>
        
        <div className="space-y-3">
          {payers.map((payer, index) => (
            <div key={index} className="flex gap-2">
              <select
                className="input flex-grow"
                value={payer.memberId}
                onChange={(e) => updatePayer(index, 'memberId', e.target.value)}
              >
                {members.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              
              <input
                type="number"
                className="input w-24"
                value={payer.amount || ''}
                onChange={(e) => updatePayer(index, 'amount', e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
              
              <button
                type="button"
                onClick={() => removePayer(index)}
                className="btn btn-secondary"
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
      
      <div>
        <label className="block text-sm font-medium mb-2">
          Split Type
        </label>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
            className={`btn ${splitType === 'percent' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSplitType('percent')}
          >
            By Percentage
          </button>
          
          <button
            type="button"
            className={`btn ${splitType === 'shares' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSplitType('shares')}
          >
            By Shares
          </button>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">
          Split Details
        </label>
        
        <div className="space-y-3">
          {splits.map((split, index) => (
            <div key={index} className="flex gap-2 items-center">
              <span className="w-1/3">{getMemberName(split.memberId)}</span>
              
              {splitType === 'amount' && (
                <input
                  type="number"
                  className="input flex-grow"
                  value={split.amount || ''}
                  onChange={(e) => updateSplit(index, 'amount', e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              )}
              
              {splitType === 'percent' && (
                <div className="flex items-center flex-grow">
                  <input
                    type="number"
                    className="input flex-grow"
                    value={split.percent || ''}
                    onChange={(e) => updateSplit(index, 'percent', e.target.value)}
                    placeholder="0"
                    step="0.01"
                    min="0"
                    max="100"
                  />
                  <span className="ml-2">%</span>
                </div>
              )}
              
              {splitType === 'shares' && (
                <input
                  type="number"
                  className="input flex-grow"
                  value={split.shares || ''}
                  onChange={(e) => updateSplit(index, 'shares', e.target.value)}
                  placeholder="1"
                  step="1"
                  min="0"
                />
              )}
              
              <span className="w-24 text-right">
                {formatAmount(split.owedAmount)}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="btn btn-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isLoading}
        >
          {isLoading 
            ? isEditing ? 'Updating...' : 'Adding...' 
            : isEditing ? 'Update Expense' : 'Add Expense'
          }
        </button>
      </div>
    </form>
  );
}
