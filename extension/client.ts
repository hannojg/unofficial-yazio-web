import type { Command, DeskEvent, Reply, Results } from "./messages";

export async function request<K extends Command["type"]>(
  command: Extract<Command, { type: K }>,
  signal?: AbortSignal,
): Promise<Results[K]> {
  signal?.throwIfAborted();
  const reply: Reply<Results[K]> = await chrome.runtime.sendMessage({
    kind: "ND_REQUEST",
    command,
  });
  signal?.throwIfAborted();
  if (reply.ok) return reply.value;
  throw new Error(reply.error);
}

export function subscribe(listener: (event: DeskEvent) => void) {
  function receive(event: DeskEvent) {
    if (event.kind === "ND_SESSION_CHANGED" || event.kind === "ND_PAIR_ERROR") {
      listener(event);
    }
  }
  chrome.runtime.onMessage.addListener(receive);
  return () => chrome.runtime.onMessage.removeListener(receive);
}
