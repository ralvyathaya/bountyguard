export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new AppError(
      503,
      `Configure ${name} to enable this connected operation.`,
      "SETUP_REQUIRED",
    );
  return value;
}
