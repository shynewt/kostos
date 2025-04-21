import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { getJoinedProjects, JoinedProject } from "../utils/localStorage";

export default function Home() {
  const [joinedProjects, setJoinedProjects] = useState<JoinedProject[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    // Load joined projects from local storage
    setJoinedProjects(getJoinedProjects());
  }, []);

  // Handle file selection for import
  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
      alert("Project imported successfully! You will be redirected to the new project.");
      router.push(`/projects/join?projectId=${result.data.projectId}`);
    } catch (error) {
      console.error("Error importing project:", error);
      alert(error instanceof Error ? error.message : "Failed to import project");
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

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to Kostos</h1>
          <p className="text-gray-600 dark:text-gray-400">
            A simple app for splitting bills and expenses among groups
          </p>
        </div>

        {/* Moved Your Projects section here */}
        {joinedProjects.length > 0 ? (
          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-sm p-6 mb-8">
            <div className="flex items-center mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-gray-500 dark:text-gray-400 mr-2"
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
                  className="bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 mr-3 text-lg">
                        {project.emoji || "📊"}
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">{project.name}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          Joined as: <span className="font-medium">{project.memberName}</span>
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/projects/${project.id}?memberId=${project.memberId}`}
                      className="flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
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
          // Placeholder shown when no projects are joined
          <div className="text-center py-12 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-sm mb-8">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 mx-auto text-gray-400 mb-4"
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
            <p className="text-gray-600 dark:text-gray-400 mb-4">You haven't joined any projects yet.</p>
            <p className="text-gray-500 dark:text-gray-500 text-sm">
              Create a new project or join an existing one to get started.
            </p>
          </div>
        )}

        {/* Create/Join/Import section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow p-6">
            <div className="flex items-center mb-4 text-blue-600 dark:text-blue-400">
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
              <h2 className="text-xl font-semibold ml-2">Create a New Project</h2>
            </div>
            <p className="mb-6 text-gray-600 dark:text-gray-400">
              Start a new group for splitting expenses with friends, family, or colleagues.
            </p>
            <Link href="/projects/new" className="btn btn-primary block text-center">
              Create Project
            </Link>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow p-6">
            <div className="flex items-center mb-4 text-purple-600 dark:text-purple-400">
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
              <h2 className="text-xl font-semibold ml-2">Join a Project</h2>
            </div>
            <p className="mb-6 text-gray-600 dark:text-gray-400">
              Join an existing project using a project code and select your name.
            </p>
            <Link href="/projects/join" className="btn btn-primary block text-center">
              Join Project
            </Link>
          </div>

          {/* Import Project Card - moved inside the grid */}
          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow p-6 md:col-span-2">
            {" "}
            {/* Span across both columns */}
            <div className="flex items-center mb-4 text-green-600 dark:text-green-500">
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
              <h2 className="text-lg font-semibold ml-2">Import from Spliit or Kostos</h2>
            </div>
            <p className="mb-4 text-gray-600 dark:text-gray-400 text-sm">
              Import a project from a Spliit export or another Kostos project.
            </p>
            <label
              className={`btn ${
                isImporting ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"
              } text-white px-3 py-2 rounded-lg text-sm flex items-center justify-center cursor-pointer`}
              style={{ maxWidth: "220px" }}
            >
              {isImporting ? (
                <span className="flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="animate-spin h-4 w-4 mr-2"
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
                    className="h-4 w-4 mr-2"
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
  );
}
