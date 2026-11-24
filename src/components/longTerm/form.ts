import type { FormEvent } from "react";
export function safeSubmit(
  onError: (error: unknown) => void,
  action: (event: FormEvent<HTMLFormElement>) => Promise<void>,
) {
  return async (event: FormEvent<HTMLFormElement>) => {
    try {
      await action(event);
    } catch (error) {
      onError(error);
    }
  };
}
