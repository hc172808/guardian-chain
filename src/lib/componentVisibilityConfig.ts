export function parseHiddenComponents(response: unknown): string[] | null {
  if (response == null) return [];
  if (typeof response !== 'object' || Array.isArray(response)) return null;

  const row = response as Record<string, unknown>;
  let value = row.configValue ?? row.config_value;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (value == null) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return null;

  const hidden = (value as Record<string, unknown>).hidden;
  if (!Array.isArray(hidden)) return [];
  return [...new Set(hidden.filter((key): key is string => typeof key === 'string'))];
}
