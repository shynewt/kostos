import { useState, useEffect } from 'react'
import { generateId } from '../utils/id'

interface PaymentMethod {
  id: string
  name: string
  icon: string
}

interface PaymentMethodManagerProps {
  projectId: string
  onPaymentMethodsChange: (paymentMethods: PaymentMethod[]) => void
  initialPaymentMethods?: PaymentMethod[]
}

const DEFAULT_ICONS = ['💳', '💵', '🎁', '🏦', '📱', '💸', '🎫', '💎']

export default function PaymentMethodManager({
  projectId,
  onPaymentMethodsChange,
  initialPaymentMethods = [],
}: PaymentMethodManagerProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(initialPaymentMethods)
  const [newMethodName, setNewMethodName] = useState('')
  const [newMethodIcon, setNewMethodIcon] = useState(DEFAULT_ICONS[0])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialPaymentMethods.length > 0) {
      setPaymentMethods(initialPaymentMethods)
    } else {
      fetchPaymentMethods()
    }
  }, [projectId, initialPaymentMethods])

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch(`/api/payment-methods?projectId=${projectId}`)
      const result = await response.json()

      if (result.success) {
        setPaymentMethods(result.data)
        onPaymentMethodsChange(result.data)
      } else {
        console.error('Error fetching payment methods:', result.error)
      }
    } catch (error) {
      console.error('Error fetching payment methods:', error)
    }
  }

  const addPaymentMethod = async () => {
    if (!newMethodName.trim()) {
      setError('Payment method name is required')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/payment-methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          name: newMethodName,
          icon: newMethodIcon,
        }),
      })

      const result = await response.json()

      if (result.success) {
        const updatedMethods = [...paymentMethods, result.data]
        setPaymentMethods(updatedMethods)
        onPaymentMethodsChange(updatedMethods)
        setNewMethodName('')
        setNewMethodIcon(DEFAULT_ICONS[Math.floor(Math.random() * DEFAULT_ICONS.length)])
      } else {
        setError(result.error || 'Failed to create payment method')
      }
    } catch (error) {
      console.error('Error creating payment method:', error)
      setError(error instanceof Error ? error.message : 'Failed to create payment method')
    } finally {
      setIsLoading(false)
    }
  }

  const deletePaymentMethod = async (methodId: string) => {
    if (!confirm('Are you sure you want to delete this payment method?')) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/payment-methods/${methodId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        const updatedMethods = paymentMethods.filter((method) => method.id !== methodId)
        setPaymentMethods(updatedMethods)
        onPaymentMethodsChange(updatedMethods)
      } else {
        setError(result.error || 'Failed to delete payment method')
      }
    } catch (error) {
      console.error('Error deleting payment method:', error)
      setError(error instanceof Error ? error.message : 'Failed to delete payment method')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">{error}</div>
      )}

      <div className="mb-4">
        <h3 className="mb-2 text-sm font-medium text-gray-500">Current Payment Methods</h3>
        {paymentMethods.length > 0 ? (
          <div className="space-y-2">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-2 dark:border-gray-700"
              >
                <div className="flex items-center">
                  <span className="mr-2 text-xl">{method.icon}</span>
                  <span>{method.name}</span>
                </div>
                <button
                  onClick={() => deletePaymentMethod(method.id)}
                  className="rounded-full p-1 text-red-600 hover:bg-red-50 hover:text-red-800 dark:hover:bg-red-900/20"
                  disabled={isLoading}
                  title="Delete payment method"
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
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm italic text-gray-500">No payment methods yet</p>
        )}
      </div>

      <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
        <h3 className="mb-2 text-sm font-medium text-gray-500">Add New Payment Method</h3>
        <div className="flex gap-2">
          <input
            type="text"
            className="input flex-grow"
            value={newMethodName}
            onChange={(e) => setNewMethodName(e.target.value)}
            placeholder="New payment method name"
          />

          <div className="relative">
            <select
              className="h-10 w-16 cursor-pointer rounded border border-gray-300 bg-white text-center text-xl dark:border-gray-600 dark:bg-gray-700"
              value={newMethodIcon}
              onChange={(e) => setNewMethodIcon(e.target.value)}
            >
              {DEFAULT_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={addPaymentMethod}
            className="btn btn-primary"
            disabled={isLoading || !newMethodName.trim()}
          >
            {isLoading ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
