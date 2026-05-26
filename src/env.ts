export function env(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  return fallback;
}

export function requiredEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
