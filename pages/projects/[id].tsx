import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import AddExpenseForm from "../../components/AddExpenseForm";
import CategoryManager from "../../components/CategoryManager";
import PaymentMethodManager from "../../components/PaymentMethodManager";
import {
  removeJoinedProject,
  addJoinedProject,
  getJoinedProjects,
} from "../../utils/localStorage";
import { formatCurrency } from "../../utils/currency";
import EditExpenseForm from "../../components/EditExpenseForm";
import ExpenseItem from "../../components/ui/ExpenseItem";

// Default project emojis for quick selection
const DEFAULT_EMOJIS = [
  "📊",
  "💰",
  "🏠",
  "🏢",
  "🚗",
  "✈️",
  "🏖️",
  "🍽️",
  "🛒",
  "🎓",
  "👨‍👩‍👧‍👦",
  "👥",
  "🎮",
  "📱",
  "💻",
  "🎉",
  "🎁",
  "🎯",
  "⚽",
  "🏋️‍♀️",
  "☀️",
  "🌙",
  "⭐",
  "🌈",
  "🌊",
  "🏔️",
  "🗻",
  "🌲",
  "🌺",
  "🌸",
  "🎨",
  "🎭",
  "🎪",
  "🎡",
  "🎢",
  "🎠",
  "🏰",
  "⛺",
  "🏕️",
  "🗺️",
];

export default function ProjectDetail() {
  const router = useRouter();
  const { id: projectId, memberId } = router.query;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<any>(null);
  const [currentMember, setCurrentMember] = useState<any>(null);

  // Modal states
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showExpenseDetail, setShowExpenseDetail] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showEditExpense, setShowEditExpense] = useState(false);
  const [showMemberManager, setShowMemberManager] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"all" | "byCategory">("all");
  const [showPaymentMethodManager, setShowPaymentMethodManager] =
    useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUpdatingEmoji, setIsUpdatingEmoji] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Close emoji picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch project data
  useEffect(() => {
    if (!projectId || !memberId) return;

    fetchProject();
  }, [projectId, memberId]);

  // Create a reusable function to fetch project data
  const fetchProject = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch project");
      }

      setProject(result.data);

      // Find current member
      const member = result.data.members.find((m: any) => m.id === memberId);
      if (!member) {
        throw new Error("Member not found in this project");
      }

      setCurrentMember(member);
    } catch (error) {
      console.error("Error fetching project:", error);
      setError(
        error instanceof Error ? error.message : "Failed to fetch project"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Update project emoji
  const updateEmoji = async (emoji: string) => {
    if (!projectId || !project) return;

    setIsUpdatingEmoji(true);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emoji,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to update project emoji");
      }

      // Update only the emoji field in the project state, preserving all other data
      setProject((prevProject: any) => ({
        ...prevProject,
        emoji: result.data.emoji,
      }));

      setShowEmojiPicker(false);
    } catch (error) {
      console.error("Error updating project emoji:", error);
    } finally {
      setIsUpdatingEmoji(false);
    }
  };

  // Leave project
  const handleLeaveProject = () => {
    if (!projectId || !memberId) return;

    if (
      confirm(
        "Are you sure you want to leave this project? Your data will still be available if you rejoin."
      )
    ) {
      removeJoinedProject(projectId as string, memberId as string);
      router.push("/");
    }
  };

  // Export project data
  const handleExportProject = () => {
    if (!projectId) return;

    // Redirect to export endpoint which will trigger a file download
    window.location.href = `/api/projects/${projectId}/export`;
  };

  // Handle file selection for import
  const handleFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      // Read the file content
      const fileContents = await readFileAsJson(file);

      // Send to the import API
      const response = await fetch("/api/projects/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fileContents),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to import project");
      }

      // Redirect to the newly created project
      alert(
        "Project imported successfully! You will be redirected to the new project."
      );
      router.push(`/projects/join?projectId=${result.data.projectId}`);
    } catch (error) {
      console.error("Error importing project:", error);
      alert(
        error instanceof Error ? error.message : "Failed to import project"
      );
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Helper to read file as JSON
  const readFileAsJson = (file: File): Promise<any> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          resolve(json);
        } catch (error) {
          reject(new Error("Invalid JSON file"));
        }
      };

      reader.onerror = () => {
        reject(new Error("Error reading file"));
      };

      reader.readAsText(file);
    });
  };

  // Calculate balances
  const calculateBalances = () => {
    if (!project || !project.expenses) return [];

    const balances: Record<string, number> = {};

    // Initialize balances for all members
    project.members.forEach((member: any) => {
      balances[member.id] = 0;
    });

    // Calculate balances based on expenses
    project.expenses.forEach((expense: any) => {
      // Add amounts for payers
      expense.payments.forEach((payment: any) => {
        balances[payment.memberId] += payment.amount;
      });

      // Subtract amounts for splits
      expense.splits.forEach((split: any) => {
        balances[split.memberId] -= split.owedAmount;
      });
    });

    // Simplify debts to minimize transactions
    const simplifiedDebts = simplifyDebts(balances, project.members);

    // Convert to array with member details
    return project.members.map((member: any) => ({
      ...member,
      balance: balances[member.id],
      // Add simplified debt info
      owes: simplifiedDebts
        .filter((debt) => debt.from === member.id)
        .map((debt) => ({ memberId: debt.to, amount: debt.amount })),
      isOwed: simplifiedDebts
        .filter((debt) => debt.to === member.id)
        .map((debt) => ({ memberId: debt.from, amount: debt.amount })),
    }));
  };

  // Simplify debts to minimize transactions
  const simplifyDebts = (balances: Record<string, number>, members: any[]) => {
    // Separate members into debtors (negative balance) and creditors (positive balance)
    const debtors: { id: string; amount: number }[] = [];
    const creditors: { id: string; amount: number }[] = [];

    // Create a copy of balances to work with
    const workingBalances = { ...balances };

    members.forEach((member) => {
      const balance = workingBalances[member.id];
      if (balance < -0.01) {
        // Debtor (owes money)
        debtors.push({ id: member.id, amount: -balance });
      } else if (balance > 0.01) {
        // Creditor (is owed money)
        creditors.push({ id: member.id, amount: balance });
      }
    });

    // Sort by amount (descending)
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    // Simplified debt transactions
    const transactions: { from: string; to: string; amount: number }[] = [];

    // Match debtors with creditors until all debts are settled
    while (debtors.length > 0 && creditors.length > 0) {
      const debtor = debtors[0];
      const creditor = creditors[0];

      // Find the amount to transfer (minimum of what is owed and what is due)
      const amount = Math.min(debtor.amount, creditor.amount);

      if (amount > 0.01) {
        // Only create transactions for significant amounts
        transactions.push({
          from: debtor.id,
          to: creditor.id,
          amount,
        });
      }

      // Update balances
      debtor.amount -= amount;
      creditor.amount -= amount;

      // Remove settled accounts
      if (debtor.amount <= 0.01) debtors.shift();
      if (creditor.amount <= 0.01) creditors.shift();
    }

    return transactions;
  };

  // Format currency based on project's currency
  const formatAmount = (amount: number) => {
    return formatCurrency(amount, project?.currency || "USD");
  };

  // Format date
  const formatDate = (dateValue: any) => {
    if (!dateValue) return "No date";

    // Handle different date formats
    let date;
    if (dateValue instanceof Date) {
      date = dateValue;
    } else if (typeof dateValue === "string") {
      date = new Date(dateValue);
    } else if (typeof dateValue === "number") {
      date = new Date(dateValue);
    } else {
      return "Invalid Date";
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return "Invalid Date";
    }

    return date.toLocaleDateString();
  };

  // Update the project in local storage with the new emoji when it changes
  useEffect(() => {
    if (project && currentMember) {
      // Update the project in local storage with the current emoji
      const joinedProjects = getJoinedProjects();
      const existingProject = joinedProjects.find(
        (p) => p.id === project.id && p.memberId === currentMember.id
      );

      if (existingProject) {
        addJoinedProject({
          ...existingProject,
          emoji: project.emoji || "📊",
        });
      }
    }
  }, [project?.emoji, project?.id, currentMember?.id]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <p>Loading project...</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
          <button onClick={() => router.push("/")} className="btn btn-primary">
            Back to Home
          </button>
        </div>
      </Layout>
    );
  }

  if (!project || !currentMember) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto">
          <p>Project or member not found.</p>
          <button
            onClick={() => router.push("/")}
            className="btn btn-primary mt-4"
          >
            Back to Home
          </button>
        </div>
      </Layout>
    );
  }

  const balances = calculateBalances();
  const memberBalances = balances.find((b: any) => b.id === currentMember.id);

  return (
    <Layout title={project.name}>
      <div className="max-w-4xl mx-auto">
        {/* Consolidated Header with Project info and Key User Data */}
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-sm p-4 sm:p-6 mb-4 sm:mb-6">
          {/* Project name and user info */}
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-2xl"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  disabled={isUpdatingEmoji}
                >
                  {isUpdatingEmoji ? (
                    <svg
                      className="animate-spin h-5 w-5 text-gray-500"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  ) : (
                    project.emoji || "📊"
                  )}
                </button>

                {showEmojiPicker && (
                  <div
                    ref={emojiPickerRef}
                    className="absolute z-10 mt-1 w-56 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="grid grid-cols-5 gap-1">
                      {DEFAULT_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => updateEmoji(emoji)}
                          className="h-10 text-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <input
                        type="text"
                        placeholder="Custom emoji..."
                        value={project.emoji || ""}
                        onChange={(e) =>
                          updateEmoji(e.target.value.slice(0, 2))
                        }
                        className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <h1 className="text-2xl font-bold">{project.name}</h1>
                {project.description && (
                  <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
                    {project.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={() =>
                  router.push(
                    `/projects/${projectId}/stats?memberId=${memberId}`
                  )
                }
                className="btn bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg flex items-center font-medium text-sm shadow-sm whitespace-nowrap"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                Stats
              </button>

              <button
                onClick={() => setShowAddExpense(true)}
                className="btn bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg flex items-center font-medium text-sm shadow-sm whitespace-nowrap"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
                Add Expense
              </button>

              <button
                onClick={() => setShowMemberManager(true)}
                className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full flex items-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <span className="text-gray-500 dark:text-gray-400 mr-1">
                  You:
                </span>
                <span className="font-medium">{currentMember.name}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3 ml-1 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Grid with balance and summary info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            {/* Your Balance */}
            <div className="md:col-span-1 rounded-lg border overflow-hidden">
              {memberBalances && (
                <>
                  <div
                    className={`
                    p-3 flex items-center justify-between 
                    ${
                      memberBalances.balance > 0
                        ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                        : memberBalances.balance < 0
                        ? "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                        : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600"
                    }
                  `}
                  >
                    <div className="flex items-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 mr-1.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="font-semibold text-sm">
                        Your Balance
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        router.push(
                          `/projects/${projectId}/stats?memberId=${memberId}`
                        )
                      }
                      className="text-xs bg-white bg-opacity-30 hover:bg-opacity-40 px-2 py-0.5 rounded flex items-center"
                      aria-label="View detailed statistics"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-3 w-3 mr-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                      Details
                    </button>
                  </div>

                  <div className="p-3">
                    <div className="flex items-center justify-center">
                      <div>
                        <p className="text-2xl font-bold text-center mb-1">
                          {formatAmount(Math.abs(memberBalances.balance))}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
                          {memberBalances.balance > 0
                            ? "You are owed"
                            : memberBalances.balance < 0
                            ? "You owe"
                            : "All settled up"}
                        </p>
                      </div>
                    </div>

                    {memberBalances.balance !== 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs">
                        {/* Show who you owe money to */}
                        {memberBalances.owes &&
                          memberBalances.owes.length > 0 && (
                            <div>
                              {memberBalances.owes.map(
                                (debt: any, idx: number) => {
                                  const member = balances.find(
                                    (m: any) => m.id === debt.memberId
                                  );
                                  if (!member) return null;

                                  return (
                                    <div
                                      key={`debt-${member.id}-${idx}`}
                                      className="flex justify-between items-center py-1"
                                    >
                                      <span className="flex items-center">
                                        <span className="inline-block w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-[10px] flex items-center justify-center mr-1.5">
                                          {member.name.charAt(0).toUpperCase()}
                                        </span>
                                        <span>{member.name}</span>
                                      </span>
                                      <span className="text-red-600 dark:text-red-400">
                                        you owe {formatAmount(debt.amount)}
                                      </span>
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          )}

                        {/* Show who owes you money */}
                        {memberBalances.isOwed &&
                          memberBalances.isOwed.length > 0 && (
                            <div>
                              {memberBalances.isOwed.map(
                                (debt: any, idx: number) => {
                                  const member = balances.find(
                                    (m: any) => m.id === debt.memberId
                                  );
                                  if (!member) return null;

                                  return (
                                    <div
                                      key={`credit-${member.id}-${idx}`}
                                      className="flex justify-between items-center py-1"
                                    >
                                      <span className="flex items-center">
                                        <span className="inline-block w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-[10px] flex items-center justify-center mr-1.5">
                                          {member.name.charAt(0).toUpperCase()}
                                        </span>
                                        <span>{member.name}</span>
                                      </span>
                                      <span className="text-green-600 dark:text-green-400">
                                        owes you {formatAmount(debt.amount)}
                                      </span>
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Project Stats */}
            {project.expenses && project.expenses.length > 0 ? (
              <div className="md:col-span-2 rounded-lg border overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-3 flex items-center justify-between">
                  <div className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1.5 text-indigo-500 dark:text-indigo-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                    <span className="font-semibold text-sm">Project Stats</span>
                  </div>
                  <div className="flex items-center text-xs">
                    <span className="text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 px-2 py-0.5 rounded-full">
                      <span className="font-medium">
                        {project.expenses.length}
                      </span>{" "}
                      expenses
                    </span>
                  </div>
                </div>

                <div className="p-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
                        Total
                      </p>
                      <p className="text-sm font-bold">
                        {formatAmount(
                          project.expenses.reduce(
                            (sum: number, e: any) => sum + e.amount,
                            0
                          )
                        )}
                      </p>
                    </div>

                    <div className="text-center p-2 bg-purple-50 dark:bg-purple-900/20 rounded">
                      <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-1">
                        Average
                      </p>
                      <p className="text-sm font-bold">
                        {formatAmount(
                          project.expenses.reduce(
                            (sum: number, e: any) => sum + e.amount,
                            0
                          ) / project.expenses.length
                        )}
                      </p>
                    </div>

                    <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded">
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">
                        Largest
                      </p>
                      <p className="text-sm font-bold">
                        {formatAmount(
                          Math.max(
                            ...project.expenses.map((e: any) => e.amount)
                          )
                        )}
                      </p>
                    </div>

                    <div className="text-center p-2 bg-amber-50 dark:bg-amber-900/20 rounded">
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">
                        This Month
                      </p>
                      <p className="text-sm font-bold">
                        {formatAmount(
                          project.expenses
                            .filter((e: any) => {
                              const now = new Date();
                              const expenseDate = new Date(e.date);
                              return (
                                expenseDate.getMonth() === now.getMonth() &&
                                expenseDate.getFullYear() === now.getFullYear()
                              );
                            })
                            .reduce((sum: number, e: any) => sum + e.amount, 0)
                        )}
                      </p>
                    </div>

                    {/* Payment Method Distribution */}
                    <div className="text-center p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded col-span-2 sm:col-span-4">
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mb-2">
                        Payment Method Distribution
                      </p>
                      <div className="flex items-center justify-center gap-3 flex-wrap">
                        {project.paymentMethods.map((method: any) => {
                          const expensesWithMethod = project.expenses.filter(
                            (e: any) => e.paymentMethodId === method.id
                          );
                          const totalAmount = expensesWithMethod.reduce(
                            (sum: number, e: any) => sum + e.amount,
                            0
                          );
                          const percentage =
                            project.expenses.length > 0
                              ? Math.round(
                                  (expensesWithMethod.length /
                                    project.expenses.length) *
                                    100
                                )
                              : 0;

                          return (
                            <div
                              key={method.id}
                              className="flex items-center gap-1.5 bg-white dark:bg-gray-800 px-2 py-1 rounded"
                            >
                              <span className="text-lg">{method.icon}</span>
                              <div className="text-left">
                                <p className="text-xs font-medium">
                                  {formatAmount(totalAmount)}
                                </p>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                  {expensesWithMethod.length} expenses (
                                  {percentage}%)
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        {/* Show uncategorized payment methods if any */}
                        {(() => {
                          const uncategorizedExpenses = project.expenses.filter(
                            (e: any) => !e.paymentMethodId
                          );
                          if (uncategorizedExpenses.length > 0) {
                            const totalAmount = uncategorizedExpenses.reduce(
                              (sum: number, e: any) => sum + e.amount,
                              0
                            );
                            const percentage = Math.round(
                              (uncategorizedExpenses.length /
                                project.expenses.length) *
                                100
                            );
                            return (
                              <div className="flex items-center gap-1.5 bg-white dark:bg-gray-800 px-2 py-1 rounded">
                                <span className="text-lg">❔</span>
                                <div className="text-left">
                                  <p className="text-xs font-medium">
                                    {formatAmount(totalAmount)}
                                  </p>
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                    {uncategorizedExpenses.length} expenses (
                                    {percentage}%)
                                  </p>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="md:col-span-2 rounded-lg border overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-3">
                  <div className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1.5 text-indigo-500 dark:text-indigo-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                    <span className="font-semibold text-sm">Project Stats</span>
                  </div>
                </div>
                <div className="p-6 text-center">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Add your first expense to see project stats
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Members Section */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-700/50 p-3 flex justify-between items-center">
              <div className="flex items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-1.5 text-gray-500 dark:text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                <span className="font-semibold text-sm">Members</span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 px-2 py-0.5 rounded-full">
                <span className="font-medium">{project.members.length}</span>{" "}
                total
              </span>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                {balances.map((member: any) => {
                  const isCurrentUser = member.id === currentMember.id;

                  return (
                    <div
                      key={member.id}
                      className="flex items-center bg-gray-50 dark:bg-gray-800/70 p-1.5 rounded"
                    >
                      <div
                        className={`
                        w-6 h-6 rounded-full flex items-center justify-center mr-1.5
                        ${
                          isCurrentUser
                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                        }
                      `}
                      >
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-grow min-w-0">
                        <p
                          className={`text-xs truncate ${
                            isCurrentUser ? "font-semibold" : ""
                          }`}
                        >
                          {member.name}
                          {isCurrentUser && " (You)"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Expenses Section */}
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-sm p-4 sm:p-6 mb-4 sm:mb-6">
          {/* Expenses Header */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center">
                <h2 className="text-xl font-semibold mr-3">Expenses</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    router.push(
                      `/projects/${projectId}/stats?memberId=${memberId}`
                    )
                  }
                  className="btn bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg flex items-center text-sm shadow-sm"
                  aria-label="View statistics"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                  <span className="hidden sm:inline">Stats</span>
                </button>
                <button
                  onClick={() => setShowAddExpense(true)}
                  className="btn bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg flex items-center text-sm shadow-sm"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  <span className="hidden sm:inline">Add</span>
                  <span className="sm:hidden">+</span>
                </button>
              </div>
            </div>

            {/* View Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-3">
              <button
                className={`px-3 py-1.5 font-medium text-sm border-b-2 ${
                  activeTab === "all"
                    ? "border-blue-600 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
                onClick={() => setActiveTab("all")}
              >
                All Expenses
              </button>
              <button
                className={`px-3 py-1.5 font-medium text-sm border-b-2 ${
                  activeTab === "byCategory"
                    ? "border-blue-600 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
                onClick={() => setActiveTab("byCategory")}
              >
                By Category
              </button>
            </div>
          </div>

          {project.expenses && project.expenses.length > 0 ? (
            activeTab === "all" ? (
              <div className="grid gap-3">
                {(() => {
                  // Sort expenses by date first
                  const sortedExpenses = project.expenses
                    .slice()
                    .sort((a: any, b: any) => {
                      // Primary sort by date
                      const dateA = new Date(a.date);
                      const dateB = new Date(b.date);

                      // If dates are different, sort by date (newest first)
                      if (dateA.getTime() !== dateB.getTime()) {
                        return dateB.getTime() - dateA.getTime();
                      }

                      // If dates are the same, sort by createdAt (newest first)
                      // Convert string timestamps or use timestamp directly
                      const createdAtA = a.createdAt
                        ? new Date(a.createdAt).getTime()
                        : 0;
                      const createdAtB = b.createdAt
                        ? new Date(b.createdAt).getTime()
                        : 0;

                      return createdAtB - createdAtA;
                    });

                  // Calculate pagination values
                  const indexOfLastExpense = currentPage * itemsPerPage;
                  const indexOfFirstExpense = indexOfLastExpense - itemsPerPage;
                  const currentExpenses = sortedExpenses.slice(
                    indexOfFirstExpense,
                    indexOfLastExpense
                  );
                  const totalPages = Math.ceil(
                    sortedExpenses.length / itemsPerPage
                  );

                  // Handle page change
                  const handlePageChange = (page: number) => {
                    setCurrentPage(page);
                  };

                  // Handle items per page change
                  const handleItemsPerPageChange = (
                    e: React.ChangeEvent<HTMLSelectElement>
                  ) => {
                    const newPerPage = parseInt(e.target.value, 10);
                    setItemsPerPage(newPerPage);
                    setCurrentPage(1); // Reset to first page when changing items per page
                  };

                  return (
                    <>
                      {currentExpenses.map((expense: any) => (
                        <ExpenseItem
                          key={expense.id}
                          expense={expense}
                          members={project.members}
                          categories={project.categories}
                          paymentMethods={project.paymentMethods}
                          currency={project.currency}
                          currentMemberId={currentMember?.id}
                          onClick={(expense) => {
                            setSelectedExpense(expense);
                            setShowExpenseDetail(true);
                          }}
                          variant="default"
                          showActions={false}
                        />
                      ))}

                      {/* Pagination Controls */}
                      {project.expenses.length > 0 && (
                        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between space-y-3 sm:space-y-0">
                          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                            <span>
                              Showing {indexOfFirstExpense + 1}-
                              {Math.min(
                                indexOfLastExpense,
                                sortedExpenses.length
                              )}{" "}
                              of {sortedExpenses.length} expenses
                            </span>
                            <div className="ml-4 flex items-center">
                              <label htmlFor="itemsPerPage" className="mr-2">
                                Items per page:
                              </label>
                              <select
                                id="itemsPerPage"
                                value={itemsPerPage}
                                onChange={handleItemsPerPageChange}
                                className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-sm"
                              >
                                <option value="10">10</option>
                                <option value="25">25</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handlePageChange(1)}
                              disabled={currentPage === 1}
                              className="p-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 disabled:opacity-50"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => handlePageChange(currentPage - 1)}
                              disabled={currentPage === 1}
                              className="p-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 disabled:opacity-50"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 19l-7-7 7-7"
                                />
                              </svg>
                            </button>

                            <div className="flex items-center">
                              {Array.from(
                                { length: Math.min(5, totalPages) },
                                (_, i) => {
                                  let pageNum;

                                  if (totalPages <= 5) {
                                    // If 5 or fewer pages, show all page numbers
                                    pageNum = i + 1;
                                  } else if (currentPage <= 3) {
                                    // If on pages 1-3, show pages 1-5
                                    pageNum = i + 1;
                                  } else if (currentPage >= totalPages - 2) {
                                    // If on last 3 pages, show last 5 pages
                                    pageNum = totalPages - 4 + i;
                                  } else {
                                    // Otherwise show current page and 2 pages on each side
                                    pageNum = currentPage - 2 + i;
                                  }

                                  return (
                                    <button
                                      key={pageNum}
                                      onClick={() => handlePageChange(pageNum)}
                                      className={`w-8 h-8 mx-0.5 rounded-md ${
                                        currentPage === pageNum
                                          ? "bg-indigo-600 text-white"
                                          : "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                                      }`}
                                    >
                                      {pageNum}
                                    </button>
                                  );
                                }
                              )}
                            </div>

                            <button
                              onClick={() => handlePageChange(currentPage + 1)}
                              disabled={
                                currentPage === totalPages || totalPages === 0
                              }
                              className="p-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 disabled:opacity-50"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => handlePageChange(totalPages)}
                              disabled={
                                currentPage === totalPages || totalPages === 0
                              }
                              className="p-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 disabled:opacity-50"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M13 5l7 7-7 7M5 5l7 7-7 7"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-6">
                {/* By Category View */}
                {project.categories && project.categories.length > 0 ? (
                  project.categories.map((category: any) => {
                    const categoryExpenses = project.expenses.filter(
                      (e: any) => e.categoryId === category.id
                    );
                    if (categoryExpenses.length === 0) return null;

                    const totalAmount = categoryExpenses.reduce(
                      (sum: number, e: any) => sum + e.amount,
                      0
                    );

                    return (
                      <div
                        key={category.id}
                        className="border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm"
                      >
                        <div
                          className="px-4 py-3 text-white font-medium flex justify-between items-center"
                          style={{ backgroundColor: category.color }}
                        >
                          <div className="flex items-center">
                            <span>{category.name}</span>
                            <span className="ml-2 bg-white bg-opacity-20 text-xs rounded-full px-2 py-0.5">
                              {categoryExpenses.length}{" "}
                              {categoryExpenses.length === 1
                                ? "expense"
                                : "expenses"}
                            </span>
                          </div>
                          <span>{formatAmount(totalAmount)}</span>
                        </div>

                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                          {categoryExpenses
                            .slice()
                            .sort((a: any, b: any) => {
                              // Primary sort by date
                              const dateA = new Date(a.date);
                              const dateB = new Date(b.date);

                              // If dates are different, sort by date (newest first)
                              if (dateA.getTime() !== dateB.getTime()) {
                                return dateB.getTime() - dateA.getTime();
                              }

                              // If dates are the same, sort by createdAt (newest first)
                              const createdAtA = a.createdAt
                                ? new Date(a.createdAt).getTime()
                                : 0;
                              const createdAtB = b.createdAt
                                ? new Date(b.createdAt).getTime()
                                : 0;

                              return createdAtB - createdAtA;
                            })
                            .map((expense: any) => (
                              <ExpenseItem
                                key={expense.id}
                                expense={expense}
                                members={project.members}
                                categories={project.categories}
                                paymentMethods={project.paymentMethods}
                                currency={project.currency}
                                currentMemberId={currentMember?.id}
                                onClick={(expense) => {
                                  setSelectedExpense(expense);
                                  setShowExpenseDetail(true);
                                }}
                                variant="category"
                                showActions={false}
                              />
                            ))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-center py-4 text-gray-500">
                    No categories available. Add categories to organize
                    expenses.
                  </p>
                )}

                {/* Uncategorized expenses */}
                {project.expenses.filter((e: any) => !e.categoryId).length >
                  0 && (
                  <div className="border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm">
                    <div className="px-4 py-3 bg-gray-500 text-white font-medium flex justify-between items-center">
                      <div className="flex items-center">
                        <span>Uncategorized</span>
                        <span className="ml-2 bg-white bg-opacity-20 text-xs rounded-full px-2 py-0.5">
                          {
                            project.expenses.filter((e: any) => !e.categoryId)
                              .length
                          }{" "}
                          expenses
                        </span>
                      </div>
                      <span>
                        {formatAmount(
                          project.expenses
                            .filter((e: any) => !e.categoryId)
                            .reduce((sum: number, e: any) => sum + e.amount, 0)
                        )}
                      </span>
                    </div>

                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                      {project.expenses
                        .filter((e: any) => !e.categoryId)
                        .slice()
                        .sort((a: any, b: any) => {
                          // Primary sort by date
                          const dateA = new Date(a.date);
                          const dateB = new Date(b.date);

                          // If dates are different, sort by date (newest first)
                          if (dateA.getTime() !== dateB.getTime()) {
                            return dateB.getTime() - dateA.getTime();
                          }

                          // If dates are the same, sort by createdAt (newest first)
                          const createdAtA = a.createdAt
                            ? new Date(a.createdAt).getTime()
                            : 0;
                          const createdAtB = b.createdAt
                            ? new Date(b.createdAt).getTime()
                            : 0;

                          return createdAtB - createdAtA;
                        })
                        .map((expense: any) => (
                          <ExpenseItem
                            key={expense.id}
                            expense={expense}
                            members={project.members}
                            categories={project.categories}
                            paymentMethods={project.paymentMethods}
                            currency={project.currency}
                            currentMemberId={currentMember?.id}
                            onClick={(expense) => {
                              setSelectedExpense(expense);
                              setShowExpenseDetail(true);
                            }}
                            variant="category"
                            showActions={false}
                          />
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-10 w-10 mx-auto text-gray-400 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z"
                />
              </svg>
              <p className="text-gray-600 dark:text-gray-400 mb-3 text-sm">
                No expenses yet.
              </p>
              <button
                onClick={() => setShowAddExpense(true)}
                className="btn btn-primary text-sm"
              >
                Add Your First Expense
              </button>
            </div>
          )}
        </div>

        {/* Utilities Section - At the bottom */}
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-sm p-4 sm:p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Categories Section */}
            <div className="p-3 border rounded-lg border-gray-100 dark:border-gray-700">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-2 text-gray-500 dark:text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                    />
                  </svg>
                  Categories
                </h2>
                <button
                  onClick={() => setShowCategoryManager(true)}
                  className="btn btn-secondary text-xs py-1 px-2"
                >
                  Manage
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {project.categories && project.categories.length > 0 ? (
                  project.categories.map((category: any) => (
                    <div
                      key={category.id}
                      className="flex items-center px-2 py-0.5 rounded-full text-white text-xs"
                      style={{ backgroundColor: category.color }}
                    >
                      <span>{category.name}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 italic text-xs">
                    No categories yet. Click "Manage" to add some.
                  </p>
                )}
              </div>
            </div>

            {/* Payment Methods Section */}
            <div className="p-3 border rounded-lg border-gray-100 dark:border-gray-700">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-2 text-gray-500 dark:text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                  Payment Methods
                </h2>
                <button
                  onClick={() => setShowPaymentMethodManager(true)}
                  className="btn btn-secondary text-xs py-1 px-2"
                >
                  Manage
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {project.paymentMethods && project.paymentMethods.length > 0 ? (
                  project.paymentMethods.map((method: any) => (
                    <div
                      key={method.id}
                      className="flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs"
                    >
                      <span className="mr-1">{method.icon}</span>
                      <span>{method.name}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 italic text-xs">
                    No payment methods yet. Click "Manage" to add some.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modals - unchanged */}
        {/* Add Expense Modal */}
        {showAddExpense && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Add Expense</h2>
                  <button
                    onClick={() => setShowAddExpense(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>

                <AddExpenseForm
                  projectId={projectId as string}
                  members={project.members}
                  categories={project.categories || []}
                  paymentMethods={project.paymentMethods || []}
                  currentMemberId={currentMember.id}
                  currency={project.currency}
                  onClose={() => setShowAddExpense(false)}
                  onExpenseAdded={() => {
                    // Fetch updated data instead of refreshing the page
                    fetchProject();
                    setShowAddExpense(false);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Category Manager Modal */}
        {showCategoryManager && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Manage Categories</h2>
                  <button
                    onClick={() => setShowCategoryManager(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>

                <CategoryManager
                  projectId={projectId as string}
                  initialCategories={project.categories || []}
                  onCategoriesChange={(categories) => {
                    setProject({
                      ...project,
                      categories,
                    });
                  }}
                />

                <div className="flex justify-end mt-6">
                  <button
                    onClick={() => setShowCategoryManager(false)}
                    className="btn btn-primary"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Expense Modal */}
        {showEditExpense && selectedExpense && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Edit Expense</h2>
                  <button
                    onClick={() => setShowEditExpense(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>

                <EditExpenseForm
                  projectId={projectId as string}
                  members={project.members}
                  categories={project.categories || []}
                  paymentMethods={project.paymentMethods || []}
                  currentMemberId={currentMember.id}
                  currency={project.currency}
                  expense={selectedExpense}
                  isEditing={true}
                  onClose={() => setShowEditExpense(false)}
                  onExpenseAdded={() => {
                    // Fetch updated data instead of refreshing the page
                    fetchProject();
                    setShowEditExpense(false);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Expense Detail Modal */}
        {showExpenseDetail && selectedExpense && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Find the category if it exists */}
              {(() => {
                const category = selectedExpense.categoryId
                  ? project.categories.find(
                      (c: any) => c.id === selectedExpense.categoryId
                    )
                  : null;

                // Calculate current user's impact
                const currentUserPayment = selectedExpense.payments.find(
                  (p: any) => p.memberId === currentMember.id
                );
                const currentUserSplit = selectedExpense.splits.find(
                  (s: any) => s.memberId === currentMember.id
                );
                const amountPaid = currentUserPayment
                  ? currentUserPayment.amount
                  : 0;
                const amountOwed = currentUserSplit
                  ? currentUserSplit.owedAmount
                  : 0;
                const netPosition = amountPaid - amountOwed;

                return (
                  <>
                    {/* Header with category color bar */}
                    <div
                      className="h-2 rounded-t-lg"
                      style={{ backgroundColor: category?.color || "#9ca3af" }}
                    ></div>

                    <div className="p-6">
                      {/* Header with close button */}
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex-1 mr-4">
                          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                            {selectedExpense.description}
                          </h2>
                          <div className="flex items-center flex-wrap gap-2">
                            <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4 mr-1"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                              {formatDate(selectedExpense.date)}
                            </div>

                            {category && (
                              <span
                                className="px-2 py-0.5 rounded-full text-xs text-white"
                                style={{ backgroundColor: category.color }}
                              >
                                {category.name}
                              </span>
                            )}

                            {selectedExpense.paymentMethodId && (
                              <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs mr-1.5">
                                {
                                  project.paymentMethods.find(
                                    (m: any) =>
                                      m.id === selectedExpense.paymentMethodId
                                  )?.icon
                                }
                              </span>
                            )}

                            <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs text-gray-600 dark:text-gray-400 capitalize">
                              {selectedExpense.splitType} split
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => setShowExpenseDetail(false)}
                          className="p-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>

                      {/* Amount and user impact */}
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-5 mb-6 flex justify-between items-center">
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium mb-1">
                            Total Amount
                          </p>
                          <p className="text-3xl font-bold text-gray-900 dark:text-white">
                            {formatAmount(selectedExpense.amount)}
                          </p>
                        </div>

                        {netPosition !== 0 && (
                          <div
                            className={`
                            text-right px-4 py-3 rounded-lg
                            ${
                              netPosition > 0
                                ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                            }
                          `}
                          >
                            <p className="text-xs uppercase font-medium mb-1">
                              Your Impact
                            </p>
                            <p className="text-xl font-bold">
                              {netPosition > 0 ? "+" : ""}
                              {formatAmount(netPosition)}
                            </p>
                            <p className="text-xs mt-1">
                              {netPosition > 0
                                ? "You are owed this amount"
                                : "You owe this amount"}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        {/* Payment details */}
                        <div>
                          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 mr-1.5 text-emerald-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z"
                              />
                            </svg>
                            Paid by
                          </h3>
                          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                              {selectedExpense.payments.map((payment: any) => {
                                const payer = project.members.find(
                                  (m: any) => m.id === payment.memberId
                                );
                                const isCurrentUser =
                                  payment.memberId === currentMember.id;

                                return (
                                  <div
                                    key={payment.id}
                                    className={`
                                    flex justify-between items-center p-3
                                    ${
                                      isCurrentUser
                                        ? "bg-blue-50 dark:bg-blue-900/20"
                                        : ""
                                    }
                                  `}
                                  >
                                    <span
                                      className={`flex items-center ${
                                        isCurrentUser ? "font-medium" : ""
                                      }`}
                                    >
                                      <span
                                        className={`
                                        inline-block w-6 h-6 rounded-full mr-2 flex items-center justify-center text-xs
                                        ${
                                          isCurrentUser
                                            ? "bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200"
                                            : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                        }
                                      `}
                                      >
                                        {payer?.name.charAt(0).toUpperCase() ||
                                          "?"}
                                      </span>
                                      {payer ? payer.name : "Unknown"}{" "}
                                      {isCurrentUser && "(You)"}
                                    </span>
                                    <span className="font-medium">
                                      {formatAmount(payment.amount)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Split details */}
                        <div>
                          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 mr-1.5 text-indigo-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                              />
                            </svg>
                            Split details
                          </h3>
                          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                              {selectedExpense.splits.map((split: any) => {
                                const member = project.members.find(
                                  (m: any) => m.id === split.memberId
                                );
                                const isCurrentUser =
                                  split.memberId === currentMember.id;

                                return (
                                  <div
                                    key={split.id}
                                    className={`
                                    flex justify-between items-center p-3
                                    ${
                                      isCurrentUser
                                        ? "bg-blue-50 dark:bg-blue-900/20"
                                        : ""
                                    }
                                  `}
                                  >
                                    <span
                                      className={`flex items-center ${
                                        isCurrentUser ? "font-medium" : ""
                                      }`}
                                    >
                                      <span
                                        className={`
                                        inline-block w-6 h-6 rounded-full mr-2 flex items-center justify-center text-xs
                                        ${
                                          isCurrentUser
                                            ? "bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200"
                                            : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                        }
                                      `}
                                      >
                                        {member?.name.charAt(0).toUpperCase() ||
                                          "?"}
                                      </span>
                                      {member ? member.name : "Unknown"}{" "}
                                      {isCurrentUser && "(You)"}
                                    </span>
                                    <span
                                      className={`font-medium ${
                                        split.owedAmount < 0
                                          ? "text-red-600 dark:text-red-400"
                                          : ""
                                      }`}
                                    >
                                      {formatAmount(split.owedAmount)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Additional split details if available */}
                      {(selectedExpense.splitType === "shares" ||
                        selectedExpense.splitType === "percent") && (
                        <div className="mb-6">
                          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 mr-1.5 text-amber-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M7 11l5-5m0 0l5 5m-5-5v12"
                              />
                            </svg>
                            {selectedExpense.splitType === "shares"
                              ? "Share allocation"
                              : "Percentage allocation"}
                          </h3>
                          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                              {selectedExpense.splits.map((split: any) => {
                                const member = project.members.find(
                                  (m: any) => m.id === split.memberId
                                );
                                const isCurrentUser =
                                  split.memberId === currentMember.id;
                                const value =
                                  selectedExpense.splitType === "shares"
                                    ? split.shares
                                    : split.percent
                                    ? `${split.percent}%`
                                    : "N/A";

                                return (
                                  <div
                                    key={split.id}
                                    className={`
                                    flex justify-between items-center p-3
                                    ${
                                      isCurrentUser
                                        ? "bg-blue-50 dark:bg-blue-900/20"
                                        : ""
                                    }
                                  `}
                                  >
                                    <span
                                      className={`flex items-center ${
                                        isCurrentUser ? "font-medium" : ""
                                      }`}
                                    >
                                      <span
                                        className={`
                                        inline-block w-6 h-6 rounded-full mr-2 flex items-center justify-center text-xs
                                        ${
                                          isCurrentUser
                                            ? "bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200"
                                            : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                        }
                                      `}
                                      >
                                        {member?.name.charAt(0).toUpperCase() ||
                                          "?"}
                                      </span>
                                      {member ? member.name : "Unknown"}{" "}
                                      {isCurrentUser && "(You)"}
                                    </span>
                                    <span className="font-medium">
                                      {value}
                                      {selectedExpense.splitType ===
                                        "shares" && (
                                        <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                                          {Math.round(
                                            (split.shares /
                                              selectedExpense.splits.reduce(
                                                (sum: number, s: any) =>
                                                  sum + s.shares,
                                                0
                                              )) *
                                              100
                                          )}
                                          %
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Notes section */}
                      {selectedExpense.notes && (
                        <div className="mb-6">
                          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 mr-1.5 text-blue-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                              />
                            </svg>
                            Notes
                          </h3>
                          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
                            <div className="p-4 text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm bg-gray-50 dark:bg-gray-700/30">
                              {selectedExpense.notes}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex justify-between items-center mt-8 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <button
                          onClick={async () => {
                            if (
                              confirm(
                                "Are you sure you want to delete this expense?"
                              )
                            ) {
                              try {
                                const response = await fetch(
                                  `/api/expenses/${selectedExpense.id}`,
                                  {
                                    method: "DELETE",
                                  }
                                );

                                const result = await response.json();

                                if (result.success) {
                                  // Close the modal
                                  setShowExpenseDetail(false);
                                  setSelectedExpense(null);

                                  // Fetch updated data instead of refreshing the page
                                  fetchProject();
                                } else {
                                  alert(
                                    "Failed to delete expense: " + result.error
                                  );
                                }
                              } catch (error) {
                                console.error("Error deleting expense:", error);
                                alert("Failed to delete expense");
                              }
                            }
                          }}
                          className="flex items-center text-red-600 hover:text-red-800 dark:text-red-500 dark:hover:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors px-3 py-1.5 rounded-lg"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 mr-1.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                          Delete Expense
                        </button>

                        <div className="space-x-3">
                          <button
                            onClick={() => {
                              setShowExpenseDetail(false);
                              setShowEditExpense(true);
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center text-sm shadow-sm transition-colors"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 mr-1.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                            Edit Expense
                          </button>

                          <button
                            onClick={() => setShowExpenseDetail(false)}
                            className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg text-sm transition-colors"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Member Manager Modal */}
        {showMemberManager && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Manage Members</h2>
                  <button
                    onClick={() => setShowMemberManager(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>

                {/* Current user section */}
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Your current identity
                  </h3>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300 flex items-center justify-center font-semibold text-sm">
                        {currentMember.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="ml-2 font-medium">
                        {currentMember.name}
                      </span>
                    </div>
                    <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-700 text-blue-700 dark:text-blue-200 rounded-full">
                      Current
                    </span>
                  </div>
                </div>

                {/* Switch to member section */}
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Switch to another member
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {project.members
                      .filter((m: any) => m.id !== currentMember.id)
                      .map((member: any) => (
                        <button
                          key={member.id}
                          onClick={() => {
                            // Switch to this member
                            router.push(
                              `/projects/${projectId}?memberId=${member.id}`
                            );
                            setShowMemberManager(false);
                          }}
                          className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between transition-colors"
                        >
                          <div className="flex items-center">
                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center justify-center font-semibold text-sm">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="ml-2">{member.name}</span>
                          </div>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </button>
                      ))}
                  </div>
                </div>

                {/* Add member section */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Add a new member
                  </h3>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.target as HTMLFormElement;
                      const nameInput = form.elements.namedItem(
                        "memberName"
                      ) as HTMLInputElement;

                      if (!nameInput.value.trim()) return;

                      try {
                        const response = await fetch(
                          `/api/projects/${projectId}/members`,
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              name: nameInput.value.trim(),
                            }),
                          }
                        );

                        const result = await response.json();

                        if (result.success) {
                          // Fetch updated data instead of refreshing the page
                          fetchProject();
                          nameInput.value = "";
                        } else {
                          alert("Failed to add member: " + result.error);
                        }
                      } catch (error) {
                        console.error("Error adding member:", error);
                        alert("Failed to add member");
                      }
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      name="memberName"
                      placeholder="Member name"
                      className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-sm"
                      required
                    />
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium"
                    >
                      Add
                    </button>
                  </form>
                </div>

                {/* Remove member section - only show if more than 1 member */}
                {project.members.length > 1 && (
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h3 className="text-sm font-medium text-gray-500 mb-2">
                      Remove a member
                    </h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {project.members.map((member: any) => (
                        <div
                          key={`remove-${member.id}`}
                          className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between"
                        >
                          <div className="flex items-center">
                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center justify-center font-semibold text-sm">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="ml-2">{member.name}</span>
                          </div>
                          <button
                            onClick={async () => {
                              // Prevent removing the last member
                              if (project.members.length <= 1) {
                                alert("Cannot remove the last member");
                                return;
                              }

                              if (
                                confirm(
                                  `Are you sure you want to remove ${member.name}?`
                                )
                              ) {
                                try {
                                  const response = await fetch(
                                    `/api/projects/${projectId}/members/${member.id}`,
                                    {
                                      method: "DELETE",
                                    }
                                  );

                                  const result = await response.json();

                                  if (result.success) {
                                    // If removing current member, switch to another member
                                    if (member.id === currentMember.id) {
                                      const otherMember = project.members.find(
                                        (m: any) => m.id !== member.id
                                      );
                                      if (otherMember) {
                                        router.push(
                                          `/projects/${projectId}?memberId=${otherMember.id}`
                                        );
                                      } else {
                                        router.push("/");
                                      }
                                    } else {
                                      // Refresh project data
                                      router.replace(router.asPath);
                                    }
                                  } else {
                                    alert(
                                      "Failed to remove member: " + result.error
                                    );
                                  }
                                } catch (error) {
                                  console.error(
                                    "Error removing member:",
                                    error
                                  );
                                  alert("Failed to remove member");
                                }
                              }
                            }}
                            className="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Remove member"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end mt-6">
                  <button
                    onClick={() => setShowMemberManager(false)}
                    className="btn btn-secondary"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payment Method Manager Modal */}
        {showPaymentMethodManager && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">
                    Manage Payment Methods
                  </h2>
                  <button
                    onClick={() => setShowPaymentMethodManager(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>

                <PaymentMethodManager
                  projectId={projectId as string}
                  initialPaymentMethods={project.paymentMethods || []}
                  onPaymentMethodsChange={(paymentMethods) => {
                    setProject({
                      ...project,
                      paymentMethods,
                    });
                  }}
                />

                <div className="flex justify-end mt-6">
                  <button
                    onClick={() => setShowPaymentMethodManager(false)}
                    className="btn btn-primary"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Project actions */}
        <div className="mt-8 border-t pt-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowCategoryManager(true)}
              className="text-indigo-600 hover:text-indigo-800 text-xs"
            >
              Manage Categories
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => setShowPaymentMethodManager(true)}
              className="text-indigo-600 hover:text-indigo-800 text-xs"
            >
              Manage Payment Methods
            </button>
          </div>

          <div className="flex items-center space-x-4">
            {/* Import/Export & Share buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleExportProject}
                className="text-blue-600 hover:text-blue-800 text-xs flex items-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Export
              </button>

              <label className="text-green-600 hover:text-green-800 text-xs flex items-center cursor-pointer">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                {isImporting ? "Importing..." : "Import"}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".json"
                  onChange={handleFileSelected}
                  disabled={isImporting}
                />
              </label>

              <button
                onClick={() => {
                  const joinUrl = `${window.location.origin}/projects/join?projectId=${projectId}`;
                  navigator.clipboard
                    .writeText(joinUrl)
                    .then(() => {
                      // Show a temporary "Copied!" notification
                      const button = document.getElementById("share-button");
                      if (button) {
                        const originalText = button.innerText;
                        button.innerText = "Copied!";
                        setTimeout(() => {
                          button.innerText = originalText;
                        }, 2000);
                      }
                    })
                    .catch((err) => {
                      console.error("Failed to copy share link:", err);
                      alert("Failed to copy link to clipboard.");
                    });
                }}
                id="share-button"
                className="text-purple-600 hover:text-purple-800 text-xs flex items-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
                Share Link
              </button>
            </div>

            <span className="text-gray-300">|</span>

            <button
              onClick={handleLeaveProject}
              className="text-red-600 hover:text-red-800 text-xs"
            >
              Leave Project
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
