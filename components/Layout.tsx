import React, { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

interface LayoutProps {
  children: ReactNode
  title?: string
}

const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  const router = useRouter()

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-900">
      <header className="bg-blue-600 text-white shadow-lg">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center text-xl font-bold">
            <img src="/icons/icon-192x192.webp" alt="Kostos" className="mr-2 h-10 w-10" />K O S T O S
          </Link>

          {title && <h1 className="hidden text-lg font-medium md:block">{title}</h1>}

          <div className="flex items-center space-x-4">
            {router.pathname !== '/' && (
              <Link
                href="/"
                className="flex items-center rounded-md px-3 py-1 transition-colors hover:bg-blue-700"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-1 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                Home
              </Link>
            )}
          </div>
        </div>
      </header>

      {title && (
        <div className="border-b border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 md:hidden">
          <div className="container mx-auto px-4 py-3">
            <h1 className="text-lg font-medium">{title}</h1>
          </div>
        </div>
      )}

      <main className="container mx-auto flex-grow px-4 py-6">{children}</main>

      <footer className="border-t border-gray-200 bg-white py-4 shadow-inner dark:border-gray-700 dark:bg-gray-800">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600 dark:text-gray-400">
          A project by{' '}
          <a href="https://shynewt.com" target="_blank" className="font-bold">
            Shy Newt Technologies
          </a>{' '}
          <span className="mx-2 font-bold">|</span>
          <a className="underline" href="https://github.com/shynewt/kostos?ref=kostos" target="_blank">
            Source
          </a>
        </div>
      </footer>
    </div>
  )
}

export default Layout
