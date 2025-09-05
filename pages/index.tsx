import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout'
import { getJoinedProjects, JoinedProject } from '../utils/localStorage'

export default function Home() {
  const [joinedProjects, setJoinedProjects] = useState<JoinedProject[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    setJoinedProjects(getJoinedProjects())
  }, [])

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImporting(true)

    try {
      const fileContents = await readFileAsJson(file)
      const response = await fetch('/api/projects/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fileContents),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to import project')
      }

      alert('Project imported successfully! You will be redirected to the new project.')
      router.push(`/projects/join?projectId=${result.data.projectId}`)
    } catch (error) {
      console.error('Error importing project:', error)
      alert(error instanceof Error ? error.message : 'Failed to import project')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const readFileAsJson = (file: File): Promise<any> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string)
          resolve(json)
        } catch (error) {
          reject(new Error('Invalid JSON file'))
        }
      }
      reader.onerror = () => {
        reject(new Error('Error reading file'))
      }
      reader.readAsText(file)
    })
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl">
        {/* Subtle tagline */}
        <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Split expenses with friends, family & groups
        </p>

        {/* Main content area */}
        <div>
          {/* Projects section */}
          <div>
            {/* Quick actions bar */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Link
                href="/projects/new"
                className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 sm:px-4 sm:py-2.5 sm:text-sm"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Project
              </Link>
              <Link
                href="/projects/join"
                className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 sm:px-4 sm:py-2.5 sm:text-sm"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
                Join Project
              </Link>
              <label
                className={`col-span-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:col-span-1 sm:px-4 sm:py-2.5 sm:text-sm ${
                  isImporting
                    ? 'border-gray-300 bg-gray-100 text-gray-400 dark:border-gray-600 dark:bg-gray-700'
                    : 'border-green-600 text-green-600 hover:bg-green-50 dark:border-green-500 dark:text-green-500 dark:hover:bg-green-950/20'
                }`}
              >
                {isImporting ? (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 animate-spin"
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
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Importing...
                  </>
                ) : (
                  <>
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
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    Import
                  </>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".json"
                  onChange={handleFileSelected}
                  disabled={isImporting}
                />
              </label>
            </div>

            {/* Projects list */}
            {joinedProjects.length > 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                  <h2 className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
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
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                    Recent Projects
                  </h2>
                </div>
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {joinedProjects.map((project) => (
                    <Link
                      key={`${project.id}-${project.memberId}`}
                      href={`/projects/${project.id}?memberId=${project.memberId}`}
                      className="group flex items-center justify-between px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-lg dark:bg-gray-700">
                          {project.emoji || '📊'}
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                            {project.name}
                          </h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400">as {project.memberName}</p>
                        </div>
                      </div>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-600 dark:group-hover:text-blue-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center dark:border-gray-600 dark:bg-gray-800/50">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="mx-auto mb-3 h-10 w-10 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                <h3 className="mb-1 text-sm font-medium text-gray-900 dark:text-white">No projects yet</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Create your first project or join an existing one
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Large info cards below main content */}
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* How It Works Card */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-blue-600 dark:text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">How It Works</h3>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Simple expense tracking without the hassle of creating accounts or managing passwords.
            </p>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-blue-500">•</span>
                <span>Create or join a project instantly</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-blue-500">•</span>
                <span>Add expenses with flexible splitting options</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-blue-500">•</span>
                <span>Track balances in real-time</span>
              </li>
            </ul>
          </div>

          {/* Perfect For Card */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-green-600 dark:text-green-400"
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
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">Perfect For</h3>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Ideal for any situation where you need to split costs with others.
            </p>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-500">•</span>
                <span>Travel with friends</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-500">•</span>
                <span>Shared living expenses</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-500">•</span>
                <span>Group events & parties</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-green-500">•</span>
                <span>Restaurant bills</span>
              </li>
            </ul>
          </div>

          {/* Privacy First Card */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800 md:col-span-2 lg:col-span-1">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-purple-600 dark:text-purple-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">Privacy First</h3>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Your data stays local and secure. No accounts, no tracking, no personal information required.
            </p>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-purple-500">•</span>
                <span>No user accounts needed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-purple-500">•</span>
                <span>Export your data anytime</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-purple-500">•</span>
                <span>Open source and self-hostable</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  )
}
