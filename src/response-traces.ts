import type { ResponseDecisionTrace } from "./responses.js";

export class InMemoryResponseTraceStore {
  private readonly tracesByResponseId = new Map<string, ResponseDecisionTrace>();

  set(trace: ResponseDecisionTrace) {
    this.tracesByResponseId.set(trace.response_id, trace);
  }

  get(responseId: string) {
    return this.tracesByResponseId.get(responseId);
  }
}
