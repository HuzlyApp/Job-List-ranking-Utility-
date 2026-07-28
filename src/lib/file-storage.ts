import { mkdir, writeFile, readFile, access } from "fs/promises";
import path from "path";

const UPLOAD_ROOT =
  process.env.UPLOAD_DIR ||
  (process.env.VERCEL ? "/tmp/uploads" : path.join(process.cwd(), ".uploads"));

export function getUploadRoot(): string {
  return UPLOAD_ROOT;
}

export async function saveUploadFile(
  tenantId: string,
  batchId: string,
  filename: string,
  content: Buffer
): Promise<string> {
  const dir = path.join(UPLOAD_ROOT, tenantId, batchId);
  await mkdir(dir, { recursive: true });
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = path.join(tenantId, batchId, safeName);
  const fullPath = path.join(UPLOAD_ROOT, storageKey);
  await writeFile(fullPath, content);
  return storageKey;
}

export async function loadUploadFile(storageKey: string): Promise<Buffer> {
  const fullPath = path.join(UPLOAD_ROOT, storageKey);
  return readFile(fullPath);
}

export async function fileExists(storageKey: string): Promise<boolean> {
  try {
    await access(path.join(UPLOAD_ROOT, storageKey));
    return true;
  } catch {
    return false;
  }
}
