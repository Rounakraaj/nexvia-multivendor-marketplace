export type ToastKind = "success" | "error";
export type ToastDetail = { message: string; kind?: ToastKind };

export function showToast(message: string, kind: ToastKind = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastDetail>("nexvia:toast", { detail: { message, kind } }));
}
