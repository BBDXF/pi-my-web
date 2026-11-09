/**
 * Pending extension UI requests (ctx.ui.select/confirm/input/editor) for one session.
 * Event shapes mirror pi's rpc-extension-ui protocol.
 */
import { randomUUID } from "node:crypto";

export class UiRequests {
  /** @param {(event: unknown) => void} emit */
  constructor(emit) {
    this.emit = emit;
    /** @type {Map<string, {request: any, settle: (v: unknown) => void, cleanup: () => void}>} */
    this.pending = new Map();
  }

  /**
   * @param {"select"|"confirm"|"input"|"editor"} method
   * @param {Record<string, unknown>} fields
   * @param {{signal?: AbortSignal, timeout?: number}} [opts]
   */
  request(method, fields, opts = {}) {
    const cancelled = method === "confirm" ? false : undefined;
    if (opts.signal?.aborted) return Promise.resolve(cancelled);
    const id = randomUUID();
    const timeout = Number(opts.timeout) > 0 ? Number(opts.timeout) : undefined;
    const request = { type: "extension_ui_request", id, method, ...fields, ...(timeout ? { timeout } : {}) };
    return new Promise((resolve) => {
      let timer;
      const onAbort = () => finish(cancelled, true);
      const finish = (value, dismiss) => {
        if (!this.pending.delete(id)) return;
        if (timer) clearTimeout(timer);
        opts.signal?.removeEventListener?.("abort", onAbort);
        if (dismiss) this.emit({ type: "extension_ui_dismiss", id });
        resolve(value);
      };
      if (timeout) timer = setTimeout(() => finish(cancelled, true), timeout);
      opts.signal?.addEventListener?.("abort", onAbort, { once: true });
      this.pending.set(id, { request, settle: (v) => finish(v, false), cleanup: () => finish(cancelled, true) });
      this.emit(request);
    });
  }

  list() {
    return [...this.pending.values()].map((p) => p.request);
  }

  /** @returns {boolean} false if unknown request */
  respond(id, { value, cancelled } = {}) {
    const p = this.pending.get(id);
    if (!p) return false;
    const m = p.request.method;
    if (cancelled) p.settle(m === "confirm" ? false : undefined);
    else if (m === "confirm") p.settle(value === true || value === "true");
    else p.settle(typeof value === "string" ? value : value == null ? undefined : String(value));
    return true;
  }

  cancelAll() {
    for (const p of [...this.pending.values()]) p.cleanup();
  }

  /** UI context overrides. */
  overrides() {
    return {
      select: (title, options, opts) =>
        this.request("select", { title: String(title ?? ""), options: (options ?? []).map(String) }, opts),
      confirm: (title, message, opts) =>
        this.request("confirm", { title: String(title ?? ""), message: String(message ?? "") }, opts),
      input: (title, placeholder, opts) =>
        this.request("input", { title: String(title ?? ""), placeholder }, opts),
      editor: (title, prefill) => this.request("editor", { title: String(title ?? ""), prefill }),
    };
  }
}
