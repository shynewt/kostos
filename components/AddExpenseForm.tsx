import { useEffect, useState } from "react";
import { formatCurrency } from "../utils/currency";

const roundToCent = (value: number): number => {
  return Math.round(value * 100) / 100;
};

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
  currency: string;
  expense?: {
    id: string;
    description: string;
    amount: number;
    date: string | Date;
    splitType: "even" | "amount" | "percent" | "shares";
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

  const [description, setDescription] = useState(expense?.description || "");
  const [amount, setAmount] = useState(expense ? expense.amount.toString() : "");
  const [date, setDate] = useState(() => {
    if (expense?.date) {
      if (expense.date instanceof Date) {
        return expense.date.toISOString().split("T")[0];
      } else if (typeof expense.date === "string") {
        const dateObj = new Date(expense.date);
        if (!isNaN(dateObj.getTime())) {
          return dateObj.toISOString().split("T")[0];
        }
      }
    }
    return new Date().toISOString().split("T")[0];
  });
  const [splitType, setSplitType] = useState<"even" | "amount" | "shares">(() => {
    if (expense?.splitType === "percent") {
      return "shares";
    }
    return (expense?.splitType as "even" | "amount" | "shares") || "even";
  });
  const [categoryId, setCategoryId] = useState<string | null>(expense?.categoryId || null);
  const [notes, setNotes] = useState<string>(expense?.notes || "");

  const initialParticipants = expense?.splits
    ? expense.splits.map((split) => split.memberId)
    : members.map((member) => member.id);

  const [participants, setParticipants] = useState<string[]>(initialParticipants);

  const [payers, setPayers] = useState<Payment[]>(
    expense?.payments || [{ memberId: currentMemberId, amount: 0 }]
  );

  const [splits, setSplits] = useState<Split[]>(expense?.splits || []);

  useEffect(() => {
    initializeSplitsStructure();
  }, [participants, splitType]);

  useEffect(() => {
    const parsedAmount = parseFloat(amount) || 0;
    recalculateOwedAmounts(parsedAmount);
  }, [amount, participants, splitType, splits]);

  const toggleParticipant = (memberId: string) => {
    if (participants.includes(memberId)) {
      if (participants.length <= 1) return;

      setParticipants(participants.filter((id) => id !== memberId));
    } else {
      setParticipants([...participants, memberId]);
    }
  };

  const initializeSplitsStructure = () => {
    const participantMembers = members.filter((member) => participants.includes(member.id));
    const participantCount = participantMembers.length;
    const parsedAmount = parseFloat(amount) || 0;

    const updatedSplits = members.map((member) => {
      const existingSplit = splits.find((s) => s.memberId === member.id);

      if (!participants.includes(member.id)) {
        return { ...(existingSplit || { memberId: member.id }), owedAmount: 0 };
      }

      const baseSplit: Split = existingSplit || {
        memberId: member.id,
        owedAmount: 0,
        amount: undefined,
        shares: undefined,
      };

      let structureUpdate: Partial<Split> = {};
      switch (splitType) {
        case "amount":
          if (baseSplit.amount === undefined || baseSplit.amount === null) {
            structureUpdate.amount = participantCount > 0 ? roundToCent(parsedAmount / participantCount) : 0;
          }
          break;
        case "shares":
          if (baseSplit.shares === undefined || baseSplit.shares === null) {
            structureUpdate.shares = 1;
          }
          break;
        case "even":
        default:
          break;
      }
      const finalSplit: Split = { ...baseSplit, ...structureUpdate };
      return finalSplit;
    });

    setSplits(updatedSplits);
  };

  const addPayer = () => {
    const existingPayerIds = payers.map((p) => p.memberId);
    const availableMembers = members.filter((m) => !existingPayerIds.includes(m.id));

    if (availableMembers.length > 0) {
      setPayers([...payers, { memberId: availableMembers[0].id, amount: 0 }]);
    }
  };

  const removePayer = (index: number) => {
    if (payers.length > 1) {
      const newPayers = [...payers];
      newPayers.splice(index, 1);
      setPayers(newPayers);
    }
  };

  const updatePayer = (index: number, field: "memberId" | "amount", value: string | number) => {
    const newPayers = [...payers];
    newPayers[index] = {
      ...newPayers[index],
      [field]: field === "amount" ? parseFloat(value as string) || 0 : value,
    };
    setPayers(newPayers);
  };

  const updateSplit = (index: number, field: "amount" | "shares", value: string) => {
    const newSplits = [...splits];
    newSplits[index] = {
      ...newSplits[index],
      [field]: parseFloat(value) || 0,
    };

    setSplits(newSplits);

    if (field === "shares") {
      const totalShares = newSplits
        .filter((s) => participants.includes(s.memberId))
        .reduce((sum, s) => sum + (s.shares || 0), 0);

      if (totalShares > 0) {
        const totalAmountNum = parseFloat(amount) || 0;

        const updatedSplits = newSplits.map((split) => {
          if (!participants.includes(split.memberId)) {
            return split;
          }

          return {
            ...split,
            owedAmount: roundToCent(totalAmountNum * ((split.shares || 0) / totalShares)),
          };
        });

        const participantSplits = updatedSplits.filter((s) => participants.includes(s.memberId));
        const totalCalculated = participantSplits.reduce((sum, s) => sum + s.owedAmount, 0);
        const difference = roundToCent(totalAmountNum - totalCalculated);

        if (Math.abs(difference) > 0.001 && participantSplits.length > 0) {
          const lastParticipantId = participantSplits[participantSplits.length - 1].memberId;
          const lastIndex = updatedSplits.findIndex((s) => s.memberId === lastParticipantId);

          if (lastIndex >= 0) {
            updatedSplits[lastIndex].owedAmount = roundToCent(
              updatedSplits[lastIndex].owedAmount + difference
            );
          }
        }

        setSplits(updatedSplits);
      }
    } else if (field === "amount") {
      const memberIndex = newSplits.findIndex((s, i) => i === index);
      if (memberIndex >= 0) {
        const updatedSplits = [...newSplits];
        updatedSplits[memberIndex].owedAmount = updatedSplits[memberIndex].amount || 0;
        setSplits(updatedSplits);
      }
    }
  };

  const recalculateOwedAmounts = (totalAmount: number) => {
    if (participants.length === 0 || totalAmount <= 0) {
      setSplits((prevSplits) => prevSplits.map((split) => ({ ...split, owedAmount: 0 })));
      return;
    }

    let calculatedSplits: Split[] = [];

    const participantSplits = splits.filter((s) => participants.includes(s.memberId));

    switch (splitType) {
      case "even":
        calculatedSplits = calculateEvenSplits(totalAmount);
        break;
      case "amount":
        calculatedSplits = participantSplits.map((split) => ({
          ...split,
          owedAmount: split.amount || 0,
        }));
        break;
      case "shares":
        calculatedSplits = calculateSharesSplits(totalAmount);
        break;
    }

    setSplits((prevSplits) => {
      const calculatedMap = new Map(calculatedSplits.map((s) => [s.memberId, s.owedAmount]));
      return prevSplits.map((split) => ({
        ...split,
        owedAmount: participants.includes(split.memberId) ? calculatedMap.get(split.memberId) ?? 0 : 0,
      }));
    });
  };

  const validateForm = () => {
    if (!description.trim()) {
      setError("Description is required");
      return false;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Valid amount is required");
      return false;
    }

    const totalPayment = payers.reduce((sum, payer) => sum + payer.amount, 0);
    if (Math.abs(totalPayment - parsedAmount) > 0.01) {
      setError("Total payment amount must equal expense amount");
      return false;
    }

    if (splitType === "amount") {
      const totalSplitAmount = splits.reduce((sum, split) => sum + (split.owedAmount || 0), 0);
      if (Math.abs(totalSplitAmount - parsedAmount) > 0.01) {
        setError("Total split amount must equal expense amount");
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const url = isEditing && expense ? `/api/expenses/${expense.id}` : "/api/expenses";

      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
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
        throw new Error(result.error || `Failed to ${isEditing ? "update" : "create"} expense`);
      }

      onExpenseAdded();

      onClose();
    } catch (error) {
      console.error(`Error ${isEditing ? "updating" : "creating"} expense:`, error);
      setError(
        error instanceof Error ? error.message : `Failed to ${isEditing ? "update" : "create"} expense`
      );
      setIsLoading(false);
    }
  };

  const getMemberName = (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    return member ? member.name : "Unknown";
  };

  const formatAmount = (value: number) => {
    return formatCurrency(value, currency);
  };

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("");

  const handleAmountChange = (newValue: string) => {
    let value = newValue;
    if (value === ".") value = "0.";
    if (/^\d*\.?\d*$/.test(value)) {
      const parsedValue = parseFloat(value) || 0;
      setAmount(value);

      if (payers.length === 1) {
        setPayers([{ ...payers[0], amount: parsedValue }]);
      }

      const evenSplits = calculateEvenSplits(parsedValue);

      const sharesSplits = calculateSharesSplits(parsedValue);

      const updatedSplits = splits.map((split) => {
        if (!participants.includes(split.memberId)) {
          return split;
        }

        let updatedSplit;
        if (splitType === "even") {
          updatedSplit = evenSplits.find((s) => s.memberId === split.memberId) || split;
        } else if (splitType === "shares") {
          updatedSplit = sharesSplits.find((s) => s.memberId === split.memberId) || split;
        } else {
          updatedSplit = { ...split };
        }

        return {
          ...split,
          owedAmount: updatedSplit.owedAmount,
        };
      });

      setSplits(updatedSplits);
    }
  };

  const calculateEvenSplits = (totalAmount: number): Split[] => {
    if (participants.length === 0 || totalAmount <= 0) return [];

    const evenAmount = totalAmount / participants.length;
    const splits: Split[] = [];

    participants.forEach((pId) => {
      splits.push({
        memberId: pId,
        owedAmount: roundToCent(evenAmount),
      });
    });

    const totalCalculated = splits.reduce((sum, s) => sum + s.owedAmount, 0);
    const difference = roundToCent(totalAmount - totalCalculated);

    if (Math.abs(difference) > 0.001 && splits.length > 0) {
      const lastIndex = splits.length - 1;
      splits[lastIndex].owedAmount = roundToCent(splits[lastIndex].owedAmount + difference);
    }

    return splits;
  };

  const calculateSharesSplits = (totalAmount: number): Split[] => {
    if (participants.length === 0 || totalAmount <= 0) return [];

    const participantSplits = splits.filter((s) => participants.includes(s.memberId));
    const totalShares = participantSplits.reduce((sum, s) => sum + (s.shares || 0), 0);

    if (totalShares <= 0) {
      return calculateEvenSplits(totalAmount);
    }

    const newSplits: Split[] = [];

    participants.forEach((pId) => {
      const existingSplit = splits.find((s) => s.memberId === pId);
      const shares = existingSplit?.shares || 0;
      const sharesProportion = shares / totalShares;

      newSplits.push({
        memberId: pId,
        shares,
        owedAmount: roundToCent(totalAmount * sharesProportion),
      });
    });

    const totalCalculated = newSplits.reduce((sum, s) => sum + s.owedAmount, 0);
    const difference = roundToCent(totalAmount - totalCalculated);

    if (Math.abs(difference) > 0.001 && newSplits.length > 0) {
      const lastIndex = newSplits.length - 1;
      newSplits[lastIndex].owedAmount = roundToCent(newSplits[lastIndex].owedAmount + difference);
    }

    return newSplits;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            Amount {currency && `(${currency})`}
          </label>
          <input
            type="number"
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              const date = new Date(value);
              if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(date.getTime())) {
                setDate(value);
              }
            }}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Category (Optional)</label>
          <select
            value={categoryId || ""}
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
          <label className="block text-sm font-medium mb-1">Payment Method (Optional)</label>
          <select
            value={selectedPaymentMethod || ""}
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

      <div className="border-t pt-4 mt-1">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-md font-medium">Who's involved?</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          {members.map((member) => (
            <div
              key={member.id}
              className={`
                p-2 rounded border cursor-pointer flex items-center
                ${
                  participants.includes(member.id)
                    ? "bg-blue-100 border-blue-500 dark:bg-blue-900 dark:border-blue-400"
                    : "bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600"
                }
              `}
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
          <h3 className="text-md font-medium mb-2">Paid by</h3>

          <div className="space-y-3">
            {payers.map((payer, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  className="input flex-grow"
                  value={payer.memberId}
                  onChange={(e) => updatePayer(index, "memberId", e.target.value)}
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>

                {(payers.length > 1 || index > 0) && (
                  <input
                    type="number"
                    className="input w-24"
                    value={payer.amount || ""}
                    onChange={(e) => updatePayer(index, "amount", e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
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

      <div className="border-t pt-4 mt-1">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-md font-medium">How to split?</h3>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <button
            type="button"
            className={`btn ${splitType === "even" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSplitType("even")}
          >
            Split Evenly
          </button>

          <button
            type="button"
            className={`btn ${splitType === "amount" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSplitType("amount")}
          >
            By Amount
          </button>

          <button
            type="button"
            className={`btn ${splitType === "shares" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSplitType("shares")}
          >
            By Shares
          </button>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium mb-2">Split Details</h4>

          <div className="space-y-3">
            {splits
              .filter((split) => participants.includes(split.memberId))
              .map((split) => {
                const originalIndex = splits.findIndex((s) => s.memberId === split.memberId);
                if (originalIndex === -1) return null;

                return (
                  <div key={originalIndex} className="flex gap-2 items-center">
                    <span className="w-1/4">{getMemberName(split.memberId)}</span>

                    {splitType === "amount" && (
                      <input
                        type="number"
                        className="input flex-grow"
                        value={
                          typeof split.amount === "number" ? split.amount.toFixed(2) : split.amount ?? ""
                        }
                        onChange={(e) => updateSplit(originalIndex, "amount", e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                      />
                    )}

                    {splitType === "shares" && (
                      <div className="flex items-center flex-grow">
                        <input
                          type="number"
                          className="input flex-grow"
                          value={split.shares ?? ""}
                          onChange={(e) => updateSplit(originalIndex, "shares", e.target.value)}
                          placeholder="1"
                          step="1"
                          min="0"
                        />
                        {(() => {
                          const totalShares = splits
                            .filter((s) => participants.includes(s.memberId))
                            .reduce((sum, s) => sum + (s.shares || 0), 0);

                          if (totalShares > 0 && split.shares) {
                            const percentage = (split.shares / totalShares) * 100;
                            const displayPercentage = Math.round(percentage);
                            const needsApprox = Math.abs(percentage - displayPercentage) > 0.01;
                            return (
                              <span className="ml-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                {needsApprox ? "~" : ""}
                                {displayPercentage}%
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}

                    <span className="w-20 text-right text-gray-600 dark:text-gray-400">
                      {formatAmount(split.owedAmount)}
                    </span>
                  </div>
                );
              })}
            <div className="pt-1">
              {splitType === "amount" &&
                (() => {
                  const totalAmountNum = parseFloat(amount) || 0;
                  const participantSplits = splits.filter((s) => participants.includes(s.memberId));
                  const currentSplitTotalAmount = participantSplits.reduce(
                    (sum, s) => sum + (s.amount || 0),
                    0
                  );
                  const difference = roundToCent(totalAmountNum - currentSplitTotalAmount);
                  const isMatch = Math.abs(difference) < 0.01;
                  const hasInput = participantSplits.some((s) => s.amount !== undefined && s.amount !== null);

                  let textColor = "text-gray-500 dark:text-gray-400";
                  let fontWeight = "font-normal";
                  let hintText = `Total must equal ${formatAmount(totalAmountNum)}.`;

                  if (hasInput) {
                    if (isMatch) {
                      textColor = "text-green-600 dark:text-green-400";
                      fontWeight = "font-semibold";
                      hintText = `Total matches: ${formatAmount(totalAmountNum)}`;
                    } else {
                      textColor = "text-red-600 dark:text-red-400";
                      fontWeight = "font-semibold";
                      hintText = `${formatAmount(Math.abs(difference))} ${
                        difference > 0 ? "left" : "over"
                      }. Current total: ${formatAmount(currentSplitTotalAmount)}`;
                    }
                  }

                  return <p className={`text-sm mt-1 ${textColor} ${fontWeight}`}>{hintText}</p>;
                })()}
              {splitType === "shares" && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Total shares:{" "}
                  {splits
                    .filter((s) => participants.includes(s.memberId))
                    .reduce((sum, s) => sum + (s.shares || 0), 0)}
                </p>
              )}
              {splitType === "even" && participants.length > 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Each person pays {formatAmount(roundToCent(parseFloat(amount) / participants.length))}
                </p>
              )}
            </div>
          </div>
        </div>
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
              ? "Updating..."
              : "Adding..."
            : isEditing
            ? "Update Expense"
            : "Add Expense"}
        </button>
      </div>
    </form>
  );
}
