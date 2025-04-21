import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/currency';

interface Category {
  id: string;
  name: string;
  color: string;
}

interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
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

interface EditExpenseFormProps {
  projectId: string;
  members: any[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  currentMemberId: string;
  currency: string;
  expense: any;
  isEditing: boolean;
  onClose: () => void;
  onExpenseAdded: () => void;
}

export default function EditExpenseForm({
  projectId,
  members,
  categories,
  paymentMethods,
  currentMemberId,
  currency,
  expense,
  isEditing,
  onClose,
  onExpenseAdded,
}: EditExpenseFormProps) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Core expense details
  const [description, setDescription] = useState<string>(expense.description);
  const [amount, setAmount] = useState<string>(expense.amount.toString());
  const [date, setDate] = useState<string>(new Date(expense.date).toISOString().split('T')[0]);
  const [categoryId, setCategoryId] = useState<string>(expense.categoryId || '');
  const [paymentMethodId, setSelectedPaymentMethod] = useState<string>(expense.paymentMethodId || '');
  const [notes, setNotes] = useState<string>(expense.notes || '');

  // Split related state
  const [splitType, setSplitType] = useState<'amount' | 'shares' | 'percent' | 'even'>(expense.splitType);
  const [participants, setParticipants] = useState<string[]>(expense.splits.map((s: Split) => s.memberId));
  const [payers, setPayers] = useState<Payment[]>(expense.payments || []);
  const [splits, setSplits] = useState<Split[]>(expense.splits || []);

  // Recalculate splits when participants, amount, or split type changes
  useEffect(() => {
    calculateOwedAmounts();
  }, [participants, amount, splitType]);

  // Ensure payer amounts add up to the total amount when payers change
  useEffect(() => {
    const totalAmountNum = parseFloat(amount) || 0;
    const currentPayersTotal = payers.reduce((sum, p) => sum + p.amount, 0);

    // If only one payer, automatically set their amount to the total
    if (payers.length === 1 && totalAmountNum > 0) {
        setPayers([{ ...payers[0], amount: totalAmountNum }]);
    }
    // Basic check if multiple payers don't sum up - can add more sophisticated logic later
    else if (payers.length > 1 && Math.abs(currentPayersTotal - totalAmountNum) > 0.01) {
      // Optionally add a warning or auto-adjustment logic here
      console.warn("Payer amounts don't sum up to the total expense amount.");
    }

  }, [amount, payers]);

  // --- Helper Functions (adapted from AddExpenseForm) ---

  const toggleParticipant = (memberId: string) => {
    setParticipants((prevParticipants) => {
      if (prevParticipants.includes(memberId)) {
        // Don't allow removing the last participant
        if (prevParticipants.length <= 1) return prevParticipants;
        return prevParticipants.filter((id) => id !== memberId);
      } else {
        return [...prevParticipants, memberId];
      }
    });
  };

  const addPayer = () => {
    const existingPayerIds = payers.map(p => p.memberId);
    const availableMembers = members.filter(m => !existingPayerIds.includes(m.id));
    if (availableMembers.length > 0) {
      setPayers([...payers, { memberId: availableMembers[0].id, amount: 0 }]);
    }
  };

  const removePayer = (index: number) => {
    if (payers.length > 1) {
      const newPayers = [...payers];
      newPayers.splice(index, 1);
      setPayers(newPayers);
      // Re-distribute amount if needed, or just update validation state
    }
  };

  const updatePayer = (index: number, field: 'memberId' | 'amount', value: string | number) => {
    const newPayers = [...payers];
    const newValue = field === 'amount' ? parseFloat(value as string) || 0 : value;

    // Prevent duplicate payers if changing memberId
    if (field === 'memberId' && payers.some((p, i) => i !== index && p.memberId === value)) {
      setError("This member is already listed as a payer.");
      return;
    }
     setError(null); // Clear error if validation passes

    newPayers[index] = {
      ...newPayers[index],
      [field]: newValue,
    };
    setPayers(newPayers);
  };

 const updateSplit = (memberId: string, field: 'amount' | 'shares' | 'percent', value: string) => {
    setSplits((prevSplits) => {
        let splitFound = false;
        const newSplits = prevSplits.map(split => {
            if (split.memberId === memberId) {
                splitFound = true;
                return {
                    ...split,
                    [field]: parseFloat(value) || 0,
                };
            }
            return split;
        });

        // If the split didn't exist (e.g., participant just added), create it
        if (!splitFound) {
             newSplits.push({
                memberId: memberId,
                owedAmount: 0, // Will be calculated
                [field]: parseFloat(value) || 0
            });
        }

        // Trigger recalculation after state update
        // Note: calculateOwedAmounts now reads 'splits' state directly or takes it as arg
        // Let's modify calculateOwedAmounts to accept splits
        // calculateOwedAmounts(newSplits); // This won't work directly due to state update timing
        return newSplits; // Rely on useEffect to recalculate
    });
};


 const calculateOwedAmounts = () => {
    const totalAmountNum = parseFloat(amount) || 0;

    // Filter splits to only include current participants
    const relevantSplits = participants.map(pId => {
        const existingSplit = splits.find(s => s.memberId === pId);
        return existingSplit || { memberId: pId, owedAmount: 0 }; // Create placeholder if needed
    });


    if (totalAmountNum <= 0 || participants.length === 0) {
      setSplits(relevantSplits.map(split => ({ ...split, owedAmount: 0 })));
      return;
    }

    let finalSplits: Split[] = [];
    const participantCount = participants.length;

    switch (splitType) {
      case 'even':
        const evenAmount = totalAmountNum / participantCount;
        finalSplits = relevantSplits.map(split => ({
          ...split,
          owedAmount: evenAmount,
        }));
        break;

      case 'amount':
        let currentTotalAmount = relevantSplits.reduce((sum, split) => sum + (split.amount || 0), 0);
        let diff = totalAmountNum - currentTotalAmount;

        finalSplits = relevantSplits.map((split, index) => {
            let owed = split.amount || 0;
             // Distribute difference proportionally or to the last person? Simple last person for now.
             if (index === participantCount - 1) {
                 owed += diff;
             }
            return {
                ...split,
                // Ensure owedAmount exists and is set
                owedAmount: Math.max(0, owed) // Prevent negative owed amounts from rounding errors
            };
        });
         // Recalculate the actual total owed after potential adjustments
        const finalTotalOwedAmount = finalSplits.reduce((sum, s) => sum + s.owedAmount, 0);
        if (Math.abs(finalTotalOwedAmount - totalAmountNum) > 0.01 && finalSplits.length > 0) {
            // Adjust the last split again to ensure precision
            const precisionDiff = totalAmountNum - finalTotalOwedAmount;
            const lastSplit = finalSplits[finalSplits.length - 1];
            lastSplit.owedAmount = (lastSplit.owedAmount || 0) + precisionDiff;
            // Also update the input 'amount' field if necessary, though maybe not ideal UX
             lastSplit.amount = lastSplit.owedAmount;
        }

        break;

      case 'percent':
        const totalPercent = relevantSplits.reduce((sum, split) => sum + (split.percent || 0), 0);
        if (Math.abs(totalPercent - 100) > 0.1) {
           setError("Percentages must add up to 100%");
           // Don't calculate owed amounts if percentages are wrong
           // Keep existing owed amounts or reset them? Resetting might be confusing.
           // For now, we'll proceed but the numbers will be wrong.
        } else {
            setError(null); // Clear error if valid
        }
         finalSplits = relevantSplits.map(split => ({
             ...split,
             owedAmount: totalAmountNum * ((split.percent || 0) / 100),
         }));

         // Adjust last split for rounding errors to match totalAmountNum
         const totalCalculatedPercentAmount = finalSplits.reduce((sum, s) => sum + s.owedAmount, 0);
         if (Math.abs(totalCalculatedPercentAmount - totalAmountNum) > 0.01 && finalSplits.length > 0) {
             const percentDiff = totalAmountNum - totalCalculatedPercentAmount;
             finalSplits[finalSplits.length - 1].owedAmount += percentDiff;
         }
        break;

      case 'shares':
        const totalShares = relevantSplits.reduce((sum, split) => sum + (split.shares || 0), 0);
        if (totalShares <= 0) {
           // Avoid division by zero, set all owed amounts to 0
           finalSplits = relevantSplits.map(split => ({ ...split, owedAmount: 0 }));
        } else {
            finalSplits = relevantSplits.map(split => ({
                ...split,
                owedAmount: totalAmountNum * ((split.shares || 0) / totalShares),
            }));
            // Adjust last split for rounding errors
            const totalCalculatedShareAmount = finalSplits.reduce((sum, s) => sum + s.owedAmount, 0);
            if (Math.abs(totalCalculatedShareAmount - totalAmountNum) > 0.01 && finalSplits.length > 0) {
                const shareDiff = totalAmountNum - totalCalculatedShareAmount;
                finalSplits[finalSplits.length - 1].owedAmount += shareDiff;
            }
        }
        break;
    }
    // Update the state with the final calculated splits
    setSplits(finalSplits);
  };


  // --- Validation ---
  const validateForm = (): boolean => {
    const totalAmountNum = parseFloat(amount) || 0;
    if (totalAmountNum <= 0) {
      setError("Amount must be greater than zero.");
      return false;
    }
     if (!description) {
        setError("Description cannot be empty.");
        return false;
    }
     if (participants.length === 0) {
        setError("At least one participant must be selected.");
        return false;
    }
     if (payers.length === 0) {
        setError("At least one payer must be selected.");
        return false;
    }

    const payersTotal = payers.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(payersTotal - totalAmountNum) > 0.01) {
      setError(`Total paid (${formatCurrency(payersTotal, currency)}) does not match the expense amount (${formatCurrency(totalAmountNum, currency)}).`);
      return false;
    }

    // Split validation
    const calculatedSplitsTotal = splits.reduce((sum, s) => sum + s.owedAmount, 0);
     if (Math.abs(calculatedSplitsTotal - totalAmountNum) > 0.01) {
         // This check might be redundant if calculateOwedAmounts always forces the sum
         // But good as a safeguard, especially for manual amount split
         setError(`The split amounts (${formatCurrency(calculatedSplitsTotal, currency)}) do not add up to the total expense amount (${formatCurrency(totalAmountNum, currency)}).`);
         return false;
     }

    if (splitType === 'percent') {
      const totalPercent = splits.reduce((sum, s) => sum + (s.percent || 0), 0);
      if (Math.abs(totalPercent - 100) > 0.1) {
        setError("Percentages must add up to 100%.");
        return false;
      }
    }
     if (splitType === 'shares') {
        const totalShares = splits.reduce((sum, s) => sum + (s.shares || 0), 0);
        if (totalShares <= 0) {
            setError("Total shares must be greater than zero.");
            return false;
        }
    }
     if (splitType === 'amount') {
        const totalSplitAmountInput = splits.reduce((sum, s) => sum + (s.amount || 0), 0);
         if (Math.abs(totalSplitAmountInput - totalAmountNum) > 0.01) {
             setError(`The entered split amounts (${formatCurrency(totalSplitAmountInput, currency)}) do not add up to the total expense amount (${formatCurrency(totalAmountNum, currency)}). Please adjust.`);
             return false;
         }
     }

    setError(null); // Clear error if all checks pass
    return true;
  };


  // --- Form Submission ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      return; // Stop submission if validation fails
    }

    setIsLoading(true);
    setError(null); // Clear previous errors

    // Ensure splits only contain participant data
    const finalSplits = splits.filter(s => participants.includes(s.memberId))
                              .map(split => ({
                                memberId: split.memberId,
                                amount: splitType === 'amount' ? split.owedAmount : null, // Send calculated owedAmount for 'amount' type
                                shares: splitType === 'shares' ? split.shares : null,
                                percent: splitType === 'percent' ? split.percent : null,
                                owedAmount: split.owedAmount, // Always send the calculated owedAmount
                              }));


    const payload = {
      description,
      amount: parseFloat(amount) || 0,
      date,
      splitType,
      categoryId: categoryId || null,
      paymentMethodId: paymentMethodId || null,
      notes,
      payments: payers.map(p => ({ memberId: p.memberId, amount: p.amount })), // Ensure amounts are numbers
      splits: finalSplits,
      projectId: projectId, // Include projectId if needed by API
    };


    try {
      const response = await fetch(`/api/expenses/${expense.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        onExpenseAdded();
        onClose();
      } else {
        setError(result.error || 'Failed to update expense');
      }
    } catch (err) {
      console.error('Error updating expense:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };


  // --- Render ---
  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-1">

      {/* --- Core Details --- */}
       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Description */}
      <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Description
        </label>
        <input
                id="description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          required
        />
      </div>

      {/* Amount */}
      <div>
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Amount ({currency})
        </label>
        <input
                id="amount"
          type="number"
          value={amount}
                 onChange={(e) => setAmount(e.target.value)}
          className="w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                min="0.01"
          step="0.01"
          required
        />
            </div>
      </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Date */}
      <div>
                <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Date
        </label>
        <input
                id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          required
        />
      </div>
      {/* Category Selection */}
      <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Category (Optional)
        </label>
        <select
                 id="category"
                value={categoryId || ''}
                onChange={(e) => setCategoryId(e.target.value)}
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

      {/* Payment Method Selection */}
      <div>
                <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Payment Method (Optional)
        </label>
        <select
                 id="paymentMethod"
                value={paymentMethodId || ''}
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
        </div>


      {/* --- Payers --- */}
      <div className="border-t dark:border-gray-700 pt-4 mt-4">
        <h3 className="text-lg font-medium mb-2 text-gray-800 dark:text-gray-200">Paid By</h3>
         <div className="space-y-3">
          {payers.map((payer, index) => (
            <div key={index} className="flex items-center gap-2">
              <select
                value={payer.memberId}
                onChange={(e) => updatePayer(index, 'memberId', e.target.value)}
                className="flex-grow pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none"
                 disabled={payers.length === 1}
              >
                {members.map(member => (
                   <option key={member.id} value={member.id} disabled={payers.some((p, i) => i !== index && p.memberId === member.id)}>
                    {member.name} {member.id === currentMemberId ? '(You)' : ''}
                  </option>
                ))}
              </select>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400 text-sm">{currency}</span>
                <input
                  type="number"
                  value={payer.amount}
                  onChange={(e) => updatePayer(index, 'amount', e.target.value)}
                  className="w-32 pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  min="0"
                  step="0.01"
                  placeholder="Amount"
                  disabled={payers.length === 1}
                />
              </div>
              {payers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePayer(index)}
                  className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-500 p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  aria-label="Remove Payer"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {members.length > payers.length && (
          <button
            type="button"
            onClick={addPayer}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
          >
            + Add another payer
          </button>
        )}
      </div>


      {/* --- Split Section --- */}
       <div className="border-t dark:border-gray-700 pt-4 mt-4">
           <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">Split Between</h3>

           {/* Participant Selection */}
           <div className="mb-4">
               <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Participants</label>
               <div className="flex flex-wrap gap-2">
                   {members.map(member => (
                       <button
                           key={member.id}
                           type="button"
                           onClick={() => toggleParticipant(member.id)}
                           className={`px-3 py-1 rounded-full text-sm border transition-colors duration-150 ease-in-out ${
                               participants.includes(member.id)
                                   ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                                   : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                           }`}
                       >
                           {member.name} {member.id === currentMemberId ? '(You)' : ''}
                       </button>
                   ))}
               </div>
           </div>


            {/* Split Type Selection */}
             <div className="mb-4">
                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Split Method</label>
                 <div className="flex flex-wrap gap-2">
                    {(['even', 'amount', 'percent', 'shares'] as const).map((type) => (
                         <button
                         key={type}
                         type="button"
                         onClick={() => setSplitType(type)}
                         className={`px-3 py-1.5 rounded-md text-sm capitalize font-medium transition-colors duration-150 ease-in-out ${
                         splitType === type
                             ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
                             : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                         }`}
                         >
                         {type}
                         </button>
                     ))}
                 </div>
            </div>

             {/* Split Details Inputs */}
            {splitType !== 'even' && (
                 <div className="space-y-2 mt-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                         {splitType === 'amount' ? 'Amounts' : splitType === 'percent' ? 'Percentages' : 'Shares'}
                     </label>
                     {members
                        .filter(member => participants.includes(member.id))
                        .map(member => {
                             const split = splits.find(s => s.memberId === member.id) || { memberId: member.id, owedAmount: 0 };
                             const valueKey = splitType === 'amount' ? 'amount' : splitType === 'percent' ? 'percent' : 'shares';
                             const value = (split as Split)[valueKey] ?? '';

                             return (
                                 <div key={member.id} className="flex items-center gap-2">
                                     <span className="w-1/3 text-sm text-gray-600 dark:text-gray-400 truncate" title={member.name}>
                                        {member.name} {member.id === currentMemberId ? '(You)' : ''}
                                     </span>
                                      <div className="relative w-2/3">
                                         {splitType === 'amount' && <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400 text-sm">{currency}</span>}
                                        <input
                                            type="number"
                                            value={value}
                                            onChange={(e) => updateSplit(member.id, valueKey, e.target.value)}
                                            className={`w-full py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${
                                                splitType === 'amount' ? 'pl-8 pr-3' : 'pl-3 pr-3'
                                                }${splitType === 'percent' ? ' pr-6' : ''} `}
                                            min="0"
                                            step={splitType === 'percent' ? "0.01" : (splitType === 'shares' ? "1" : "0.01")}
                                            placeholder={splitType === 'percent' ? '0.00' : (splitType === 'shares' ? '0' : '0.00')}
                                        />
                                         {splitType === 'percent' && <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 dark:text-gray-400 text-sm">%</span>}
                                      </div>
                                     <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2 w-24 text-right" title="Calculated amount owed">
                                         (= {formatCurrency(split.owedAmount, currency)})
                                     </span>
                                 </div>
                             );
                         })}
                       <div className="pt-1">
                         {splitType === 'amount' && (() => {
                             const totalAmountNum = parseFloat(amount) || 0;
                             const currentSplitTotalAmount = splits.reduce((sum, s) => sum + (s.amount || 0), 0);
                             const difference = totalAmountNum - currentSplitTotalAmount;
                             const isMatch = Math.abs(difference) < 0.01;
                             const hasInput = splits.some(s => s.amount !== undefined && s.amount !== null);

                             let textColor = 'text-gray-500 dark:text-gray-400';
                             let fontWeight = 'font-normal';
                             let hintText = `Total must equal ${formatCurrency(totalAmountNum, currency)}.`;
                             
                             if (hasInput) {
                                if (isMatch) {
                                  textColor = 'text-green-600 dark:text-green-400';
                                  fontWeight = 'font-semibold';
                                  hintText = `Total matches: ${formatCurrency(totalAmountNum, currency)}`;
                                } else {
                                  textColor = 'text-red-600 dark:text-red-400';
                                  fontWeight = 'font-semibold';
                                   hintText = `${formatCurrency(difference, currency)} ${difference > 0 ? 'left' : 'over'}. Current total: ${formatCurrency(currentSplitTotalAmount, currency)}`;
                                }
                             }

                             return (
                                <p className={`text-sm mt-1 ${textColor} ${fontWeight}`}>
                                    {hintText}
                                </p>
                             );
                         })()}
                         {splitType === 'percent' && (() => {
                            const currentTotalPercent = splits.reduce((sum, s) => sum + (s.percent || 0), 0);
                            const difference = 100 - currentTotalPercent;
                            const isMatch = Math.abs(difference) < 0.1;
                            const hasInput = splits.some(s => s.percent !== undefined && s.percent !== null);
                            
                            let textColor = 'text-gray-500 dark:text-gray-400';
                            let fontWeight = 'font-normal';
                            let hintText = `Total must equal 100%.`;

                            if (hasInput) {
                                if (isMatch) {
                                    textColor = 'text-green-600 dark:text-green-400';
                                    fontWeight = 'font-semibold';
                                    hintText = `Total is 100%.`;
                                } else {
                                    textColor = 'text-red-600 dark:text-red-400';
                                    fontWeight = 'font-semibold';
                                    hintText = `${difference.toFixed(2)}% ${difference > 0 ? 'left' : 'over'}. Current total: ${currentTotalPercent.toFixed(2)}%`;
                                }
                            }
                            return (
                                <p className={`text-sm mt-1 ${textColor} ${fontWeight}`}>
                                    {hintText}
                                </p>
                            );
                         })()}
                         {splitType === 'shares' && (
                             <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                 Total shares: {splits.reduce((sum, s) => sum + (s.shares || 0), 0)}
                             </p>
                         )}
                       </div>
                 </div>
            )}
            {splitType === 'even' && (
                 <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                     Splitting {formatCurrency(parseFloat(amount) || 0, currency)} evenly between {participants.length} participant(s)
                      ({formatCurrency((parseFloat(amount) || 0) / (participants.length || 1), currency)} each).
                 </p>
            )}
        </div>

      {/* --- Notes --- */}
       <div className="border-t dark:border-gray-700 pt-4 mt-4">
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Notes (Optional)
        </label>
        <textarea
           id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          rows={3}
        />
      </div>

      {/* --- Error Display --- */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300 px-4 py-3 rounded text-sm" role="alert">
          {error}
        </div>
      )}

      {/* --- Action Buttons --- */}
      <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
          disabled={isLoading || !!error}
        >
          {isLoading ? (
               <span className="flex items-center">
                   <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                   </svg>
                   Saving...
               </span>
            ) : 'Save Changes'}
        </button>
      </div>
    </form>
  );
} 