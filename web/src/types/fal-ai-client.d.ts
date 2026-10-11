declare module "@fal-ai/client" {
  export interface FalConfig {
    credentials?: string;
  }

  export interface SubscribeInput {
    input: Record<string, unknown>;
    logs?: boolean;
  }

  export interface SubscribeResult<T = unknown> {
    data: T;
    requestId?: string;
  }

  export interface Fal {
    config(options: FalConfig): void;
    subscribe<T = unknown>(endpoint: string, options: SubscribeInput): Promise<SubscribeResult<T>>;
  }

  export const fal: Fal;
}
