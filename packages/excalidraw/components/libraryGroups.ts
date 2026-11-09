import type { LibraryItem } from "../types";

export type LibrarySubgroup = {
  /** null holds the group's items that belong to no subgroup */
  title: string | null;
  items: LibraryItem[];
};

export type LibraryGroup = {
  /** null holds the items that belong to no group */
  title: string | null;
  items: LibraryItem[];
  /** the items again, under their headings: those without one first */
  subgroups: LibrarySubgroup[];
};

/** text, or null for anything else a library file may hold */
const text = (value: unknown) =>
  typeof value === "string" && value ? value : null;

const subgroupsOf = (items: LibraryItem[]): LibrarySubgroup[] => {
  const byTitle = new Map<string | null, LibraryItem[]>([[null, []]]);
  for (const item of items) {
    const title = text(item.subgroup);
    const list = byTitle.get(title);
    if (list) {
      list.push(item);
    } else {
      byTitle.set(title, [item]);
    }
  }
  return [...byTitle]
    .filter(([, list]) => list.length)
    .map(([title, list]) => ({ title, items: list }));
};

/**
 * Sort library items into their groups, in the order each group first
 * appears, with the ungrouped items last. A search query keeps the items
 * whose name matches, or every item of a group or subgroup whose title
 * matches; groups left empty are dropped.
 */
export const groupLibraryItems = (
  items: readonly LibraryItem[],
  query = "",
): LibraryGroup[] => {
  const q = query.trim().toLowerCase();
  // a library file can hold anything in these fields, so only text counts
  const matches = (value: string | null) =>
    !!value && value.toLowerCase().includes(q);

  const byTitle = new Map<string | null, LibraryItem[]>();
  for (const item of items) {
    const title = text(item.group);
    if (
      q &&
      !matches(title) &&
      !matches(text(item.subgroup)) &&
      !matches(text(item.name))
    ) {
      continue;
    }
    const list = byTitle.get(title);
    if (list) {
      list.push(item);
    } else {
      byTitle.set(title, [item]);
    }
  }

  const groups: LibraryGroup[] = [];
  let loose: LibraryItem[] | undefined;
  for (const [title, list] of byTitle) {
    if (title === null) {
      loose = list;
    } else {
      groups.push({ title, items: list, subgroups: subgroupsOf(list) });
    }
  }
  if (loose) {
    groups.push({ title: null, items: loose, subgroups: subgroupsOf(loose) });
  }
  return groups;
};
