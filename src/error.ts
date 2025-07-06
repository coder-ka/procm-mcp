export function isError(error: unknown): error is Error {
  return (
    error instanceof Error ||
    (typeof error === "object" && error !== null && "message" in error)
  );
}

export function toErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  return JSON.stringify(error);
}
