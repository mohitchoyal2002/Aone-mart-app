export type DialogAction = {
  text?: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void | Promise<void>;
};
export type DialogRequest = {
  title: string;
  message: string;
  actions: DialogAction[];
  tone?: "error" | "success";
};
let queue: DialogRequest[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
export const AppDialog = {
  alert(
    title: string,
    message = "",
    actions: DialogAction[] = [{ text: "Okay" }],
    options?: { tone?: "error" | "success" },
  ) {
    queue = [...queue, { title, message, actions, tone: options?.tone }];
    notify();
  },
};
export const dialogStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  snapshot: () => queue[0] ?? null,
  close(action?: DialogAction) {
    queue = queue.slice(1);
    notify();
    if (action?.onPress) {
      Promise.resolve()
        .then(action.onPress)
        .catch((e) =>
          AppDialog.alert(
            "Please check",
            e instanceof Error ? e.message : "Please try again.",
            undefined,
            { tone: "error" },
          ),
        );
    }
  },
};
