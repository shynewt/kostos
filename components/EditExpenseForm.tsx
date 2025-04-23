import React, { useState, useEffect } from "react";
import { formatCurrency } from "../utils/currency";

const roundToCent = (value: number): number => {
  return Math.round(value * 100) / 100;
};

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

  const [description, setDescription] = useState<string>(expense.description);
  const [amount, setAmount] = useState<string>(expense.amount.toString());
  const [date, setDate] = useState<string>(new Date(expense.date).toISOString().split("T")[0]);
  const [categoryId, setCategoryId] = useState<string>(expense.categoryId || "");
  const [paymentMethodId, setSelectedPaymentMethod] = useState<string>(expense.paymentMethodId || "");
  const [notes, setNotes] = useState<string>(expense.notes || "");

  const [splitType, setSplitType] = useState<"amount" | "shares" | "even">(() => {
    if (expense.splitType === "percent") {
      return "shares";
    }
    return expense.splitType as "amount" | "shares" | "even";
  });
  const [participants, setParticipants] = useState<string[]>(expense.splits.map((s: Split) => s.memberId));
  const [payers, setPayers] = useState<Payment[]>(expense.payments || []);
  const [splits, setSplits] = useState<Split[]>(expense.splits || []);

  useEffect(() => {
    const parsedAmount = parseFloat(amount) || 0;
    recalculateOwedAmounts(parsedAmount);
  }, [amount, participants, splitType, splits]);

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
      const allMemberIds = new Set([...prevSplits.map((s) => s.memberId), ...participants]);

      return Array.from(allMemberIds).map((memberId) => {
        const existingSplit = prevSplits.find((s) => s.memberId === memberId) || { memberId, owedAmount: 0 };
        return {
          ...existingSplit,
          owedAmount: participants.includes(memberId) ? calculatedMap.get(memberId) ?? 0 : 0,
        };
      });
    });
  };

  useEffect(() => {
    setSplits((prevSplits) => {
      const participantSet = new Set(participants);
      const existingMemberIds = new Set(prevSplits.map((s) => s.memberId));
      const updatedSplits = [...prevSplits];

      participants.forEach((pId) => {
        if (!existingMemberIds.has(pId)) {
          updatedSplits.push({
            memberId: pId,
            owedAmount: 0,
            amount: undefined,
            shares: undefined,
          });
        }
      });

      return updatedSplits.map((split) => ({
        ...split,
        owedAmount: participantSet.has(split.memberId) ? split.owedAmount : 0,
      }));
    });

    const parsedAmount = parseFloat(amount) || 0;
    recalculateOwedAmounts(parsedAmount);
  }, [participants, splitType]);

  useEffect(() => {
    const totalAmountNum = parseFloat(amount) || 0;
    const currentPayersTotal = payers.reduce((sum, p) => sum + p.amount, 0);

    if (payers.length === 1 && totalAmountNum > 0) {
      setPayers([{ ...payers[0], amount: totalAmountNum }]);
    } else if (payers.length > 1 && Math.abs(currentPayersTotal - totalAmountNum) > 0.01) {
      console.warn("Payer amounts don't sum up to the total expense amount.");
    }
  }, [amount, payers]);

  const toggleParticipant = (memberId: string) => {
    setParticipants((prevParticipants) => {
      if (prevParticipants.includes(memberId)) {
        if (prevParticipants.length <= 1) return prevParticipants;
        return prevParticipants.filter((id) => id !== memberId);
      } else {
        return [...prevParticipants, memberId];
      }
    });
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
    const newValue = field === "amount" ? parseFloat(value as string) || 0 : value;

    if (field === "memberId" && payers.some((p, i) => i !== index && p.memberId === value)) {
      setError("This member is already listed as a payer.");
      return;
    }
    setError(null);

    newPayers[index] = {
      ...newPayers[index],
      [field]: newValue,
    };
    setPayers(newPayers);
  };

  const handleAmountChange = (newAmount: string) => {
    const parsedAmount = parseFloat(newAmount) || 0;
    setAmount(newAmount);

    if (payers.length === 1) {
      setPayers([{ ...payers[0], amount: parsedAmount }]);
    }

    const evenSplits = calculateEvenSplits(parsedAmount);
    const sharesSplits = calculateSharesSplits(parsedAmount);

    setSplits((prevSplits) => {
      const updatedSplits = prevSplits.map((split) => {
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

      return updatedSplits;
    });
  };

  const calculateEvenSplits = (totalAmount: number): Split[] => {
    if (participants.length === 0 || totalAmount <= 0) return [];

    const evenAmount = totalAmount / participants.length;
    const resultSplits: Split[] = [];

    participants.forEach((pId) => {
      resultSplits.push({
        memberId: pId,
        owedAmount: roundToCent(evenAmount),
      });
    });

    const totalCalculated = resultSplits.reduce((sum, s) => sum + s.owedAmount, 0);
    const difference = roundToCent(totalAmount - totalCalculated);

    if (Math.abs(difference) > 0.001 && resultSplits.length > 0) {
      const lastIndex = resultSplits.length - 1;
      resultSplits[lastIndex].owedAmount = roundToCent(resultSplits[lastIndex].owedAmount + difference);
    }

    return resultSplits;
  };

  const calculateSharesSplits = (totalAmount: number): Split[] => {
    if (participants.length === 0 || totalAmount <= 0) return [];

    const participantSplits = splits.filter((s) => participants.includes(s.memberId));
    const totalShares = participantSplits.reduce((sum, s) => sum + (s.shares || 0), 0);

    if (totalShares <= 0) {
      return calculateEvenSplits(totalAmount);
    }

    const resultSplits: Split[] = [];

    participants.forEach((pId) => {
      const existingSplit = splits.find((s) => s.memberId === pId);
      const shares = existingSplit?.shares || 0;
      const sharesProportion = shares / totalShares;

      resultSplits.push({
        memberId: pId,
        shares,
        owedAmount: roundToCent(totalAmount * sharesProportion),
      });
    });

    const totalCalculated = resultSplits.reduce((sum, s) => sum + s.owedAmount, 0);
    const difference = roundToCent(totalAmount - totalCalculated);

    if (Math.abs(difference) > 0.001 && resultSplits.length > 0) {
      const lastIndex = resultSplits.length - 1;
      resultSplits[lastIndex].owedAmount = roundToCent(resultSplits[lastIndex].owedAmount + difference);
    }

    return resultSplits;
  };

  const updateSplit = (memberId: string, field: "amount" | "shares", value: string) => {
    const updatedValue = parseFloat(value) || 0;

    setSplits((prevSplits) => {
      let splitFound = false;
      let newSplits = prevSplits.map((split) => {
        if (split.memberId === memberId) {
          splitFound = true;
          return {
            ...split,
            [field]: updatedValue,
            ...(field === "amount" ? { owedAmount: updatedValue } : {}),
          };
        }
        return split;
      });

      if (!splitFound) {
        newSplits.push({
          memberId: memberId,
          owedAmount: field === "amount" ? updatedValue : 0,
          [field]: updatedValue,
        });
      }

      if (field === "shares") {
        const participantSplits = newSplits.filter((s) => participants.includes(s.memberId));
        const totalShares = participantSplits.reduce((sum, s) => sum + (s.shares || 0), 0);

        if (totalShares > 0) {
          const totalAmountNum = parseFloat(amount) || 0;

          newSplits = newSplits.map((split) => {
            if (!participants.includes(split.memberId)) {
              return split;
            }

            const sharesProportion = (split.shares || 0) / totalShares;
            const owedAmount = roundToCent(totalAmountNum * sharesProportion);

            return {
              ...split,
              owedAmount: owedAmount,
            };
          });

          const calculatedTotal = participantSplits.reduce((sum, s) => {
            const splitIndex = newSplits.findIndex((ns) => ns.memberId === s.memberId);
            return sum + (splitIndex >= 0 ? newSplits[splitIndex].owedAmount : 0);
          }, 0);

          const roundingDiff = roundToCent(totalAmountNum - calculatedTotal);

          if (Math.abs(roundingDiff) > 0.001 && participantSplits.length > 0) {
            const lastParticipantId = participantSplits[participantSplits.length - 1].memberId;
            const lastIndex = newSplits.findIndex((s) => s.memberId === lastParticipantId);

            if (lastIndex >= 0) {
              newSplits[lastIndex].owedAmount = roundToCent(newSplits[lastIndex].owedAmount + roundingDiff);
            }
          }
        }
      }

      return newSplits;
    });
  };

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
      setError(
        `Total paid (${formatCurrency(
          payersTotal,
          currency
        )}) does not match the expense amount (${formatCurrency(totalAmountNum, currency)}).`
      );
      return false;
    }

    const calculatedSplitsTotal = splits.reduce((sum, s) => sum + s.owedAmount, 0);
    if (Math.abs(calculatedSplitsTotal - totalAmountNum) > 0.01) {
      setError(
        `The split amounts (${formatCurrency(
          calculatedSplitsTotal,
          currency
        )}) do not add up to the total expense amount (${formatCurrency(totalAmountNum, currency)}).`
      );
      return false;
    }

    if (splitType === "shares") {
      const totalShares = splits.reduce((sum, s) => sum + (s.shares || 0), 0);
      if (totalShares <= 0) {
        setError("Total shares must be greater than zero.");
        return false;
      }
    }
    if (splitType === "amount") {
      const totalSplitAmountInput = splits.reduce((sum, s) => sum + (s.amount || 0), 0);
      if (Math.abs(totalSplitAmountInput - totalAmountNum) > 0.01) {
        setError(
          `The entered split amounts (${formatCurrency(
            totalSplitAmountInput,
            currency
          )}) do not add up to the total expense amount (${formatCurrency(
            totalAmountNum,
            currency
          )}). Please adjust.`
        );
        return false;
      }
    }

    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const finalSplits = splits
      .filter((s) => participants.includes(s.memberId))
      .map((split) => ({
        memberId: split.memberId,
        amount: splitType === "amount" ? split.amount : null,
        shares: splitType === "shares" ? split.shares : null,
        percent: null,
        owedAmount: split.owedAmount,
      }));

    const payload = {
      description,
      amount: parseFloat(amount) || 0,
      date,
      splitType,
      categoryId: categoryId || null,
      paymentMethodId: paymentMethodId || null,
      notes,
      payments: payers.map((p) => ({ memberId: p.memberId, amount: p.amount })),
      splits: finalSplits,
      projectId: projectId,
    };

    try {
      const response = await fetch(`/api/expenses/${expense.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        onExpenseAdded();
        onClose();
      } else {
        setError(result.error || "Failed to update expense");
      }
    } catch (err) {
      console.error("Error updating expense:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-1">
      {error && (
        <div
          className="bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300 px-4 py-3 rounded text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-1">
            Description
          </label>
          <input
            id="description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input w-full"
            required
          />
        </div>

        <div>
          <label htmlFor="amount" className="block text-sm font-medium mb-1">
            Amount {currency && `(${currency})`}
          </label>
          <input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            className="input w-full"
            min="0.01"
            step="0.01"
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
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input w-full"
            required
          />
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-medium mb-1">
            Category (Optional)
          </label>
          <select
            id="category"
            value={categoryId || ""}
            onChange={(e) => setCategoryId(e.target.value)}
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
          <label htmlFor="paymentMethod" className="block text-sm font-medium mb-1">
            Payment Method (Optional)
          </label>
          <select
            id="paymentMethod"
            value={paymentMethodId || ""}
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

        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => toggleParticipant(member.id)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors duration-150 ease-in-out ${
                  participants.includes(member.id)
                    ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                    : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                }`}
              >
                {member.name} {member.id === currentMemberId ? "(You)" : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <h3 className="text-md font-medium mb-2">Paid by</h3>
          <div className="space-y-3">
            {payers.map((payer, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  value={payer.memberId}
                  onChange={(e) => updatePayer(index, "memberId", e.target.value)}
                  className="input flex-grow"
                  disabled={payers.length === 1}
                >
                  {members.map((member) => (
                    <option
                      key={member.id}
                      value={member.id}
                      disabled={payers.some((p, i) => i !== index && p.memberId === member.id)}
                    >
                      {member.name} {member.id === currentMemberId ? "(You)" : ""}
                    </option>
                  ))}
                </select>

                {(payers.length > 1 || index > 0) && (
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400 text-sm">
                      {currency}
                    </span>
                    <input
                      type="number"
                      value={payer.amount}
                      onChange={(e) => updatePayer(index, "amount", e.target.value)}
                      className="input w-32 pl-8"
                      min="0"
                      step="0.01"
                      placeholder="Amount"
                      disabled={payers.length === 1}
                    />
                  </div>
                )}

                {payers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePayer(index)}
                    className="btn btn-secondary flex-shrink-0"
                    aria-label="Remove Payer"
                  >
                    Remove
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
      </div>

      <div className="border-t pt-4 mt-1">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-md font-medium">How to split?</h3>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {(["even", "amount", "shares"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSplitType(type)}
              className={`btn ${splitType === type ? "btn-primary" : "btn-secondary"}`}
            >
              {type === "even" ? "Split Evenly" : type === "amount" ? "By Amount" : "By Shares"}
            </button>
          ))}
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium mb-2">Split Details</h4>

          {splitType !== "even" && (
            <div className="space-y-2">
              {members
                .filter((member) => participants.includes(member.id))
                .map((member) => {
                  const split = splits.find((s) => s.memberId === member.id) || {
                    memberId: member.id,
                    owedAmount: 0,
                  };
                  const valueKey = splitType === "amount" ? "amount" : "shares";
                  const value = (split as Split)[valueKey] ?? "";

                  return (
                    <div key={member.id} className="flex items-center gap-2">
                      <span
                        className="w-1/4 text-sm text-gray-600 dark:text-gray-400 truncate"
                        title={member.name}
                      >
                        {member.name} {member.id === currentMemberId ? "(You)" : ""}
                      </span>
                      <div className="relative flex-grow">
                        {splitType === "amount" && (
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400 text-sm">
                            {currency}
                          </span>
                        )}
                        <input
                          type="number"
                          value={
                            splitType === "amount" && typeof value === "number" ? value.toFixed(2) : value
                          }
                          onChange={(e) => updateSplit(member.id, valueKey, e.target.value)}
                          className={`input w-full ${splitType === "amount" ? "pl-8" : ""}`}
                          min="0"
                          step={splitType === "shares" ? "1" : "0.01"}
                          placeholder={splitType === "shares" ? "0" : "0.00"}
                        />
                        {splitType === "shares" &&
                          (() => {
                            const totalShares = participants.reduce((sum, pId) => {
                              const pSplit = splits.find((s) => s.memberId === pId);
                              return sum + (pSplit?.shares || 0);
                            }, 0);

                            if (totalShares > 0 && "shares" in split && split.shares) {
                              const percentage = (split.shares / totalShares) * 100;
                              const displayPercentage = Math.round(percentage);
                              const needsApprox = Math.abs(percentage - displayPercentage) > 0.01;
                              return (
                                <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 dark:text-gray-400 text-sm">
                                  {needsApprox ? "~" : ""}
                                  {displayPercentage}%
                                </span>
                              );
                            }
                            return null;
                          })()}
                      </div>
                      <span className="w-20 text-right text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatCurrency(split.owedAmount, currency)}
                      </span>
                    </div>
                  );
                })}

              <div className="pt-1">
                {splitType === "amount" &&
                  (() => {
                    const totalAmountNum = parseFloat(amount) || 0;
                    const currentSplitTotalAmount = splits.reduce((sum, s) => sum + (s.amount || 0), 0);
                    const difference = totalAmountNum - currentSplitTotalAmount;
                    const isMatch = Math.abs(difference) < 0.01;
                    const hasInput = splits.some((s) => s.amount !== undefined && s.amount !== null);

                    let textColor = "text-gray-500 dark:text-gray-400";
                    let fontWeight = "font-normal";
                    let hintText = `Total must equal ${formatCurrency(totalAmountNum, currency)}.`;

                    if (hasInput) {
                      if (isMatch) {
                        textColor = "text-green-600 dark:text-green-400";
                        fontWeight = "font-semibold";
                        hintText = `Total matches: ${formatCurrency(totalAmountNum, currency)}`;
                      } else {
                        textColor = "text-red-600 dark:text-red-400";
                        fontWeight = "font-semibold";
                        hintText = `${formatCurrency(Math.abs(difference), currency)} ${
                          difference > 0 ? "left" : "over"
                        }. Current total: ${formatCurrency(currentSplitTotalAmount, currency)}`;
                      }
                    }

                    return <p className={`text-sm mt-1 ${textColor} ${fontWeight}`}>{hintText}</p>;
                  })()}

                {splitType === "shares" && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Total shares: {splits.reduce((sum, s) => sum + (s.shares || 0), 0)}
                  </p>
                )}
              </div>
            </div>
          )}

          {splitType === "even" && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Splitting {formatCurrency(parseFloat(amount) || 0, currency)} evenly between{" "}
              {participants.length} participant(s) (
              {formatCurrency((parseFloat(amount) || 0) / (participants.length || 1), currency)} each).
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium mb-1">
          Notes (Optional)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input w-full"
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button type="button" onClick={onClose} className="btn btn-secondary" disabled={isLoading}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={isLoading || !!error}>
          {isLoading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
