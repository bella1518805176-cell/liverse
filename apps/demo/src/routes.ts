export const sectionPaths = { look: "/seats", onsite: "/onsite", me: "/me" } as const;
export type Tab = keyof typeof sectionPaths;

export function getSection(pathname: string): Tab | null {
  const path = pathname.replace(/\/+$/, "");
  return (Object.keys(sectionPaths) as Tab[]).find((tab) => sectionPaths[tab] === path) ?? null;
}
