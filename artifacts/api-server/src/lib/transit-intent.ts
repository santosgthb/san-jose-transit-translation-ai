export type InputIntent = "transit_lookup" | "issue_report";

// Questions about departures or current service are requests for information,
// not complaints. Keep factual issue descriptions in the reporting workflow.
export function classifyInputIntent(message: string): InputIntent {
  const value = message.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const departureQuestion = /\b(?:when|what time|how long)\b[^.!]*\b(?:next|train|bus|departure|arriv)/i.test(value)
    || /^\s*(?:(?:please|show me|i need|find(?: me)?)\s+)?next\s+(?:(?:\d+|one|two|three)\s+)?(?:trains?|bus(?:es)?|light rail|departures?)\b/i.test(value)
    || /\b(?:is|when|will)\b[^.!]*\banother\s+(?:one|train|bus)\b/i.test(value)
    || /(?:proxim[oa]|siguiente|tiep theo|ਅਗਲ)/iu.test(value);
  const statusQuestion = /\b(?:is|are|will|has)\b[^.!]*\b(?:route|bus|train|rail|service)\b[^.!]*\b(?:delay(?:ed)?|late|running|cancel(?:led|ed)?|on time)\b/i.test(value);
  return departureQuestion || statusQuestion ? "transit_lookup" : "issue_report";
}