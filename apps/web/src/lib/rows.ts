export type Tabular = {
  data?: unknown;
  metadata?: string[];
  headers?: string[];
};

export function rowsOf(result: Tabular): Record<string, unknown>[] {
  const data = result.data;
  if (!Array.isArray(data) || data.length === 0) return [];
  const headers = result.headers ?? [];
  if (Array.isArray(data[0])) {
    return data.map((row) => {
      const values = row as unknown[];
      return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    });
  }
  if (typeof data[0] === "object" && data[0] !== null) {
    return data as Record<string, unknown>[];
  }
  return [];
}

export function cellNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

export function cellString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

export function cellBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}
