// Records RocketRide `apaevt_flow` events for one task and condenses them into
// the steps the engine actually executed. Enter/leave events nest like a call
// stack (`pipes` is the stack), so time between consecutive events belongs to
// whichever component is on top. A step spans the first to last moment one of
// its components was doing that exclusive work.
const minimumWorkSeconds = 0.001;

export function createFlowRecorder(steps) {
  const events = [];
  const stepFor = new Map(steps.flatMap(step => step.components.map(component => [component, step])));

  return {
    onEvent(message) {
      if (message?.event !== 'apaevt_flow' || !message.body) return;
      events.push(message.body);
    },
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

export const scopeFlowSteps = [
  { label: 'Parse evidence', kind: 'step', components: ['evidence_in', 'parse_evidence'] },
  { label: 'Customer advocate', kind: 'role', components: ['customer_prompt', 'customer_llm', 'customer_document'] },
  { label: 'Skeptic', kind: 'role', components: ['skeptic_prompt', 'skeptic_llm', 'skeptic_document'] },
  { label: 'Product strategist', kind: 'role', components: ['strategist_prompt', 'strategist_llm', 'strategist_document'] },
  { label: 'Promise judge', kind: 'judge', components: ['promise_judge_prompt', 'promise_judge_llm', 'promise_judge_document'] },
  { label: 'Decision synthesis', kind: 'step', components: ['synthesis_prompt', 'synthesis_llm', 'synthesis_document'] },
  { label: 'Enforce report contract', kind: 'step', components: ['report_extractor', 'formatter_llm'] },
  { label: 'Return decision', kind: 'step', components: ['decision_response'] }
];

export const deliveryFlowSteps = [
  { label: 'Parse delivery', kind: 'step', components: ['delivery_in', 'parse_delivery'] },
  { label: 'Change reviewer', kind: 'role', components: ['change_prompt', 'change_llm', 'change_document'] },
  { label: 'Quality gatekeeper', kind: 'role', components: ['quality_prompt', 'quality_llm', 'quality_document'] },
  { label: 'Release skeptic', kind: 'role', components: ['release_prompt', 'release_llm', 'release_document'] },
  { label: 'Review synthesis', kind: 'step', components: ['synthesis_prompt', 'synthesis_llm', 'synthesis_document'] },
  { label: 'Enforce review contract', kind: 'step', components: ['review_extractor', 'formatter_llm'] },
  { label: 'Return review', kind: 'step', components: ['delivery_response'] }
];
