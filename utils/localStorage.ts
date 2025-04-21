// Key for storing joined projects in local storage
const JOINED_PROJECTS_KEY = 'kostos_joined_projects';

// Type for joined project
export interface JoinedProject {
  id: string;
  name: string;
  memberId: string;
  memberName: string;
  emoji?: string; // Optional emoji field
  joinedAt: number;
}

/**
 * Get all joined projects from local storage
 * @returns Array of joined projects
 */
export function getJoinedProjects(): JoinedProject[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const storedProjects = localStorage.getItem(JOINED_PROJECTS_KEY);
    
    if (!storedProjects) {
      return [];
    }
    
    return JSON.parse(storedProjects);
  } catch (error) {
    console.error('Error getting joined projects from local storage:', error);
    return [];
  }
}

/**
 * Add a project to joined projects in local storage
 * @param project Project to add
 */
export function addJoinedProject(project: JoinedProject): void {
  if (typeof window === 'undefined') return;
  
  try {
    const currentProjects = getJoinedProjects();
    
    // Check if the project (with the same member) is already in the list
    const existingProjectIndex = currentProjects.findIndex(
      p => p.id === project.id && p.memberId === project.memberId
    );
    
    if (existingProjectIndex !== -1) {
      // Update existing project
      currentProjects[existingProjectIndex] = {
        ...currentProjects[existingProjectIndex],
        name: project.name,
        memberName: project.memberName,
        emoji: project.emoji,
        joinedAt: Date.now(),
      };
    } else {
      // Add new project to the beginning of the list
      currentProjects.unshift(project);
    }
    
    // Save to local storage
    localStorage.setItem(JOINED_PROJECTS_KEY, JSON.stringify(currentProjects));
  } catch (error) {
    console.error('Error adding project to local storage:', error);
  }
}

/**
 * Remove a project from joined projects in local storage
 * @param projectId ID of the project to remove
 * @param memberId ID of the member
 */
export function removeJoinedProject(projectId: string, memberId: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const currentProjects = getJoinedProjects();
    
    // Filter out the project with the specified ID and member
    const updatedProjects = currentProjects.filter(
      p => !(p.id === projectId && p.memberId === memberId)
    );
    
    // Save to local storage
    localStorage.setItem(JOINED_PROJECTS_KEY, JSON.stringify(updatedProjects));
  } catch (error) {
    console.error('Error removing project from local storage:', error);
  }
}
