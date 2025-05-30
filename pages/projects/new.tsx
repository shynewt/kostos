import { useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import { addJoinedProject } from '../../utils/localStorage'
import { CURRENCY_OPTIONS } from '../../utils/currency'

// Default project emojis
const DEFAULT_EMOJIS = [
  '📊',
  '💰',
  '🏠',
  '🏢',
  '🚗',
  '✈️',
  '🏖️',
  '🍽️',
  '🛒',
  '🎓',
  '👨‍👩‍👧‍👦',
  '👥',
  '🎮',
  '📱',
  '💻',
  '🎉',
  '🎁',
  '🎯',
  '⚽',
  '🏋️‍♀️',
  '☀️',
  '🌙',
  '⭐',
  '🌈',
  '🌊',
  '🏔️',
  '🗻',
  '🌲',
  '🌺',
  '🌸',
  '🎨',
  '🎭',
  '🎪',
  '🎡',
  '🎢',
  '🎠',
  '🏰',
  '⛺',
  '🏕️',
  '🗺️',
]

export default function NewProject() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectCurrency, setProjectCurrency] = useState('USD')
  const [projectEmoji, setProjectEmoji] = useState('📊')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [members, setMembers] = useState<string[]>([''])

  // Add a new member input field
  const addMember = () => {
    setMembers([...members, ''])
  }

  // Update a member name at a specific index
  const updateMember = (index: number, value: string) => {
    const updatedMembers = [...members]
    updatedMembers[index] = value
    setMembers(updatedMembers)
  }

  // Remove a member at a specific index
  const removeMember = (index: number) => {
    if (members.length > 1) {
      const updatedMembers = [...members]
      updatedMembers.splice(index, 1)
      setMembers(updatedMembers)
    }
  }

  // Select an emoji
  const selectEmoji = (emoji: string) => {
    setProjectEmoji(emoji)
    setShowEmojiPicker(false)
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // Validate form
    if (!projectName.trim()) {
      setError('Project name is required')
      setIsLoading(false)
      return
    }

    // Filter out empty member names
    const filteredMembers = members.filter((member) => member.trim() !== '')

    if (filteredMembers.length === 0) {
      setError('At least one member is required')
      setIsLoading(false)
      return
    }

    try {
      // Create project via API
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: projectName,
          description: projectDescription,
          currency: projectCurrency,
          emoji: projectEmoji,
          members: filteredMembers,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to create project')
      }

      // Add project to local storage
      const project = result.data
      const firstMember = project.members[0]

      addJoinedProject({
        id: project.id,
        name: project.name,
        memberName: firstMember.name,
        memberId: firstMember.id,
        joinedAt: Date.now(),
      })

      // Redirect to project page
      router.push(`/projects/${project.id}?memberId=${firstMember.id}`)
    } catch (error) {
      console.error('Error creating project:', error)
      setError(error instanceof Error ? error.message : 'Failed to create project')
      setIsLoading(false)
    }
  }

  return (
    <Layout title="Create New Project">
      <div className="mx-auto max-w-2xl">
        {error && (
          <div className="mb-6 flex items-start rounded-lg border border-red-400 bg-red-100 px-4 py-3 text-red-700">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2 mt-0.5 h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Project Icon and Name in a row */}
            <div className="flex gap-4">
              <div className="w-24">
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Project Icon
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="flex h-10 w-full items-center justify-center rounded-lg border border-gray-300 bg-gray-50 text-2xl transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                  >
                    {projectEmoji}
                  </button>

                  {showEmojiPicker && (
                    <div className="absolute z-10 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                      <div className="grid grid-cols-5 gap-1">
                        {DEFAULT_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => selectEmoji(emoji)}
                            className="flex h-10 items-center justify-center rounded text-xl hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 border-t border-gray-200 pt-2 dark:border-gray-700">
                        <input
                          type="text"
                          placeholder="Custom emoji..."
                          value={projectEmoji}
                          onChange={(e) => setProjectEmoji(e.target.value.slice(0, 2))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1">
                <label
                  htmlFor="projectName"
                  className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Project Name
                </label>
                <input
                  type="text"
                  id="projectName"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Trip to Paris, Apartment expenses, etc."
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="projectCurrency"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Currency
              </label>
              <select
                id="projectCurrency"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                value={projectCurrency}
                onChange={(e) => setProjectCurrency(e.target.value)}
              >
                {CURRENCY_OPTIONS.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.symbol} - {currency.name} ({currency.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="projectDescription"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Description (Optional)
              </label>
              <textarea
                id="projectDescription"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Add some details about this project..."
                rows={3}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Members</label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {members.filter((m) => m.trim() !== '').length}{' '}
                  {members.filter((m) => m.trim() !== '').length === 1 ? 'member' : 'members'}
                </span>
              </div>
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                Add the names of people who will be part of this project.
              </p>

              <div className="mb-4 space-y-3">
                {members.map((member, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="relative flex-grow">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      </div>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        value={member}
                        onChange={(e) => updateMember(index, e.target.value)}
                        placeholder={`Member ${index + 1}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMember(index)}
                      className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                      disabled={members.length <= 1}
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

              <button
                type="button"
                onClick={addMember}
                className="flex w-full items-center justify-center rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-1 h-5 w-5"
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
                Add Another Member
              </button>
            </div>

            <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-gray-700">
              <button type="submit" className="btn btn-primary px-6" disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  )
}
