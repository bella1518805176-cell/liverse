import type { ContentItem } from "./demo-data";

export type Submission = Omit<ContentItem, "photo" | "state"> & {
  state: "pending";
  photoCount: number;
  proposalDate?: string;
};

const storageKey = "liverse-demo:submissions:v1";
const photoStore = "photos";

export function loadSubmissions(): Submission[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.id === "string" &&
          ["photo", "feeling"].includes(item.kind) && item.state === "pending")
      : [];
  } catch {
    return [];
  }
}

// Keep small metadata in localStorage and large photo blobs in IndexedDB.
async function photoRequest<T>(
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open("liverse-demo", 1);
    open.onupgradeneeded = () => open.result.createObjectStore(photoStore);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(photoStore, mode);
      const operation = request(transaction.objectStore(photoStore));
      transaction.oncomplete = () => resolve(operation.result);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function loadSubmissionPhoto(id: string): Promise<Blob | undefined> {
  const photos = await photoRequest<Blob[] | undefined>("readonly", (store) => store.get(id));
  return photos?.[0];
}

// Repository boundary: a future backend can replace these reads and writes.
export async function saveSubmission(item: Submission, photos: File[]): Promise<Submission[]> {
  if (photos.length) await photoRequest("readwrite", (store) => store.put(photos, item.id));
  try {
    const items = [item, ...loadSubmissions()];
    localStorage.setItem(storageKey, JSON.stringify(items));
    return items;
  } catch (error) {
    if (photos.length) await photoRequest("readwrite", (store) => store.delete(item.id)).catch(() => {});
    throw error;
  }
}
