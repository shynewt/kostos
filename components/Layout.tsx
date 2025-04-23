import React, { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <header className="bg-blue-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <Link href="/" className="text-xl font-bold flex items-center">
            <img src="/icons/icon-192x192.webp" alt="Kostos" className="w-10 h-10 mr-2" />K O S T O S
          </Link>

          {title && <h1 className="text-lg font-medium hidden md:block">{title}</h1>}

          <div className="flex space-x-4 items-center">
            {router.pathname !== "/" && (
              <Link
                href="/"
                className="flex items-center hover:bg-blue-700 px-3 py-1 rounded-md transition-colors"
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
        <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 md:hidden">
          <div className="container mx-auto px-4 py-3">
            <h1 className="text-lg font-medium">{title}</h1>
          </div>
        </div>
      )}

      <main className="flex-grow container mx-auto px-4 py-6">{children}</main>

      <footer className="bg-white dark:bg-gray-800 py-4 border-t border-gray-200 dark:border-gray-700 shadow-inner">
        <div className="container mx-auto px-4 text-center text-gray-600 dark:text-gray-400 text-sm">
          &copy; {new Date().getFullYear()} Kostos - Group Bill Splitting App
        </div>
      </footer>
    </div>
  );
};

export default Layout;
