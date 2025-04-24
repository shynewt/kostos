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
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold">Welcome to Kostos</h1>
          <p className="text-gray-600 dark:text-gray-400">
            A simple app for splitting bills and expenses among groups
          </p>
        </div>

        {joinedProjects.length > 0 ? (
          <div className="mb-8 rounded-lg border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="mr-2 h-5 w-5 text-gray-500 dark:text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <h2 className="text-xl font-semibold">Your Projects</h2>
            </div>
            <div className="grid gap-3">
              {joinedProjects.map((project) => (
                <div
                  key={`${project.id}-${project.memberId}`}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-4 transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800/50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-lg dark:bg-gray-700">
                        {project.emoji || '📊'}
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">{project.name}</h3>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          Joined as: <span className="font-medium">{project.memberName}</span>
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/projects/${project.id}?memberId=${project.memberId}`}
                      className="flex items-center font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <span className="mr-1">Open</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-8 rounded-lg border border-gray-100 bg-white py-12 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
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
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="mb-4 text-gray-600 dark:text-gray-400">You haven't joined any projects yet.</p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Create a new project or join an existing one to get started.
            </p>
          </div>
        )}

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center text-blue-600 dark:text-blue-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
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
              <h2 className="ml-2 text-xl font-semibold">Create a New Project</h2>
            </div>
            <p className="mb-6 text-gray-600 dark:text-gray-400">
              Start a new group for splitting expenses with friends, family, or colleagues.
            </p>
            <Link href="/projects/new" className="btn btn-primary block text-center">
              Create Project
            </Link>
          </div>

          <div className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center text-purple-600 dark:text-purple-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
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
              <h2 className="ml-2 text-xl font-semibold">Join a Project</h2>
            </div>
            <p className="mb-6 text-gray-600 dark:text-gray-400">
              Join an existing project using a project code and select your name.
            </p>
            <Link href="/projects/join" className="btn btn-primary block text-center">
              Join Project
            </Link>
          </div>

          <div className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800 md:col-span-2">
            <div className="mb-4 flex items-center text-green-600 dark:text-green-500">
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              <h2 className="ml-2 text-lg font-semibold">Import from Spliit or Kostos</h2>
            </div>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Import a project from a Spliit export or another Kostos project.
            </p>
            <label
              className={`btn ${
                isImporting ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'
              } flex cursor-pointer items-center justify-center rounded-lg px-3 py-2 text-sm text-white`}
              style={{ maxWidth: '220px' }}
            >
              {isImporting ? (
                <span className="flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="mr-2 h-4 w-4 animate-spin"
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
                  Importing...
                </span>
              ) : (
                <span className="flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="mr-2 h-4 w-4"
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
                  Import Project
                </span>
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
        </div>
      </div>
    </Layout>
  )
}
