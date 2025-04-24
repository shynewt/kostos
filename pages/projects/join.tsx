import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import { addJoinedProject } from '../../utils/localStorage'

export default function JoinProject() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [projectId, setProjectId] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [project, setProject] = useState<any>(null)

  // Effect to auto-fetch project when projectId is in URL
  useEffect(() => {
    const { projectId: queryProjectId } = router.query

    if (queryProjectId && typeof queryProjectId === 'string') {
      setProjectId(queryProjectId)
      fetchProject(queryProjectId)
    }
  }, [router.query])

  // Fetch project details
  const fetchProject = async (projectIdToFetch?: string) => {
    const idToUse = projectIdToFetch || projectId

    if (!idToUse.trim()) {
      setError('Project ID is required')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/projects/${idToUse}`)
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch project')
      }

      setProject(result.data)
      setSelectedMemberId('') // Reset selected member when project changes
    } catch (error) {
      console.error('Error fetching project:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch project')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!project) {
      setError('Please fetch a valid project first')
      return
    }

    if (!selectedMemberId) {
      setError('Please select a member')
      return
    }

    // Find the selected member
    const selectedMember = project.members.find((m: any) => m.id === selectedMemberId)

    if (!selectedMember) {
      setError('Invalid member selection')
      return
    }

    // Add project to local storage
    addJoinedProject({
      id: project.id,
      name: project.name,
      memberName: selectedMember.name,
      memberId: selectedMember.id,
      joinedAt: Date.now(),
    })

    // Redirect to project page
    router.push(`/projects/${project.id}?memberId=${selectedMember.id}`)
  }

  return (
    <Layout title="Join Project">
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

        <div className="mb-6 rounded-lg border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center text-purple-600 dark:text-purple-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h2 className="text-xl font-semibold">Enter Project ID</h2>
          </div>
          <p className="mb-4 text-gray-600 dark:text-gray-400">
            Enter the project ID shared with you to join an existing project.
          </p>
          <div className="flex gap-2">
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
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="Enter the project ID"
              />
            </div>
            <button
              type="button"
              onClick={() => fetchProject()}
              className="flex items-center whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <svg
                    className="-ml-1 mr-2 h-4 w-4 animate-spin text-white"
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
                  Loading...
                </>
              ) : (
                <>Find Project</>
              )}
            </button>
          </div>
        </div>

        {project && (
          <div className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center">
              <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{project.name}</h2>
                {project.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">{project.description}</p>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select Your Name
                </label>
                <div className="relative">
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
                  <select
                    className="w-full appearance-none rounded-lg border border-gray-300 py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    value={selectedMemberId}
                    onChange={(e) => setSelectedMemberId(e.target.value)}
                    required
                  >
                    <option value="">-- Select your name --</option>
                    {project.members.map((member: any) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  disabled={!selectedMemberId}
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
                      d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                    />
                  </svg>
                  Join Project
                </button>
              </div>
            </form>
          </div>
        )}

        {!project && !isLoading && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-800/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mx-auto mb-4 h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 16l2.879-2.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="mb-2 text-gray-600 dark:text-gray-400">
              Enter a project ID to find and join a project
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              The project ID is shared by the project creator
            </p>
          </div>
        )}
      </div>
    </Layout>
  )
}
