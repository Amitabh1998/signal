// Records RocketRide `apaevt_flow` events for one task and condenses them into
// the steps the engine actually executed. Enter/leave events nest like a call
// stack (`pipes` is the stack), so time between consecutive events belongs to
// whichever component is on top. A step spans the first to last moment one of
// its components was doing that exclusive work.
const minimumWorkSeconds = 0.001;

// `capture` names components whose emitted answer text should be kept, so a
// caller can read what that component actually produced (e.g. the judge).
// `toolNodes` names tool components whose completed invocations are recorded.
export function createFlowRecorder(steps, { capture = [], toolNodes = [] } = {}) {
  const events = [];
  const captured = {};
  const toolCalls = [];
  const stepFor = new Map(steps.flatMap(step => step.components.map(component => [component, step])));

  return {
    onEvent(message) {
      if (message?.event !== 'apaevt_flow' || !message.body) return;
      const body = message.body;
      const answer = body.trace?.data?.answers?.answer;
      if (capture.includes(body.component) && typeof answer === 'string') captured[body.component] = answer;
      const invoke = body.trace?.data?.param;
      if (toolNodes.includes(body.component) && body.op === 'leave' && invoke?.op === 'tool.invoke') {
        toolCalls.push({ node: body.component, tool: invoke.tool_name, input: invoke.input || {}, output: invoke.output, at: Number(body.eventTime) });
      }
      // Keep the timing skeleton only; lane data can be large.
      events.push({ op: body.op, component: body.component, pipes: body.pipes, eventTime: body.eventTime, logSeq: body.logSeq, trace: { lane: body.trace?.lane, error: body.trace?.error } });
    },
    captured,
    toolCalls,
    summarize() {
      const timed = events
        .filter(event => Number.isFinite(Number(event.eventTime)))
        .sort((a, b) => (a.logSeq ?? 0) - (b.logSeq ?? 0) || Number(a.eventTime) - Number(b.eventTime));
      if (!timed.length) return { eventCount: 0, durationMs: 0, steps: [] };
      const startedAt = Number(timed[0].eventTime);
      const windows = new Map();
      const errors = new Map();
      timed.forEach((event, index) => {
        const active = event.op === 'enter' ? event.component : event.pipes?.at(-1);
        const step = stepFor.get(active);
        if (step && event.trace?.error) errors.set(step.label, String(event.trace.error).slice(0, 300));
        const next = timed[index + 1];
        if (!step || !next) return;
        const from = Number(event.eventTime);
        const to = Number(next.eventTime);
        if (to - from < minimumWorkSeconds) return;
        const window = windows.get(step.label) || { start: from, end: to, workSeconds: 0, events: 0 };
        window.end = Math.max(window.end, to);
        window.workSeconds += to - from;
        window.events += 1;
        windows.set(step.label, window);
      });
      return {
        eventCount: events.length,
        durationMs: Math.round((Number(timed.at(-1).eventTime) - startedAt) * 1000),
        steps: steps
          .filter(step => windows.has(step.label))
          .map(step => {
            const window = windows.get(step.label);
            return {
              label: step.label,
              kind: step.kind,
              components: step.components,
              startMs: Math.round((window.start - startedAt) * 1000),
              durationMs: Math.round((window.end - window.start) * 1000),
              workMs: Math.round(window.workSeconds * 1000),
              events: window.events,
              ...(errors.has(step.label) ? { error: errors.get(step.label) } : {})
            };
          })
          .sort((a, b) => a.startMs - b.startMs)
      };
    }
  };
}

// `work` names the component whose activity means the step has really started
// (prompt nodes receive the evidence at the very beginning, before their turn).
export const scopeFlowSteps = [
  { label: 'Parse evidence', kind: 'step', components: ['evidence_in', 'parse_evidence'], work: ['parse_evidence'] },
  { label: 'Customer advocate', kind: 'role', components: ['customer_prompt', 'customer_llm', 'customer_document'], work: ['customer_llm'] },
  { label: 'Skeptic', kind: 'role', components: ['skeptic_prompt', 'skeptic_llm', 'skeptic_document'], work: ['skeptic_llm'] },
  { label: 'Product strategist', kind: 'role', components: ['strategist_prompt', 'strategist_llm', 'strategist_document'], work: ['strategist_llm'] },
  { label: 'Promise judge', kind: 'judge', components: ['promise_judge_prompt', 'promise_judge_llm', 'promise_judge_document'], work: ['promise_judge_llm'] },
  { label: 'Decision synthesis', kind: 'step', components: ['synthesis_prompt', 'synthesis_llm', 'synthesis_document'], work: ['synthesis_llm'] },
  { label: 'Enforce report contract', kind: 'step', components: ['report_extractor', 'formatter_llm'], work: ['report_extractor'] },
  { label: 'Return decision', kind: 'step', components: ['decision_response'] }
];

export const deliveryFlowSteps = [
  { label: 'Parse delivery', kind: 'step', components: ['delivery_in', 'parse_delivery', 'delivery_question'] },
  { label: 'Diff reader agent', kind: 'agent', components: ['diff_agent', 'diff_agent_llm', 'git_reader', 'diff_memory', 'diff_document'] },
  { label: 'Change reviewer', kind: 'role', components: ['change_prompt', 'change_llm', 'change_document'] },
  { label: 'Quality gatekeeper', kind: 'role', components: ['quality_prompt', 'quality_llm', 'quality_document'] },
  { label: 'Release skeptic', kind: 'role', components: ['release_prompt', 'release_llm', 'release_document'] },
  { label: 'Review synthesis', kind: 'step', components: ['synthesis_prompt', 'synthesis_llm', 'synthesis_document'] },
  { label: 'Enforce review contract', kind: 'step', components: ['review_extractor', 'formatter_llm'] },
  { label: 'Return review', kind: 'step', components: ['delivery_response'] }
];
