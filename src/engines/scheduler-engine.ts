/**
 * Scheduler Engine
 *
 * Simulates browser resource scheduling by adjusting request priorities
 * and enforcing concurrent connection limits per category.
 *
 * This is not a faithful browser scheduler — it's an explicit approximation
 * that teaches how browser scheduling decisions affect performance.
 */

import type { ResolvedRequestV2, SchedulerProfile } from '../types';

/**
 * Apply a scheduler profile to requests.
 * Enforces per-category concurrency limits and adjusts priorities.
 */
export function applySchedulerProfile(
  requests: ResolvedRequestV2[],
  profile: SchedulerProfile,
): ResolvedRequestV2[] {
  // Build rules lookup by category
  const rulesByCategory = new Map(
    profile.rules.map(r => [r.category, r]),
  );

  // Sort requests by start time for scheduling
  const sorted = requests
    .map(r => ({ ...r }))
    .sort((a, b) => a.resolvedStartTime - b.resolvedStartTime);

  // Track active connections per category
  const activeByCat = new Map<string, { endTime: number }[]>();

  for (const req of sorted) {
    const rule = rulesByCategory.get(req.category);
    if (!rule) continue;

    // Assign browser priority from scheduler rule
    req.browserAssignedPriority = rule.priority;

    // Enforce concurrent connection limit
    const active = activeByCat.get(req.category) ?? [];
    // Remove completed connections
    const stillActive = active.filter(c => c.endTime > req.resolvedStartTime);

    if (stillActive.length >= rule.maxConcurrent) {
      // Must wait for the earliest connection to finish
      const earliest = stillActive.reduce(
        (min, c) => (c.endTime < min.endTime ? c : min),
        stillActive[0],
      );
      const delay = earliest.endTime - req.resolvedStartTime;
      if (delay > 0) {
        req.resolvedStartTime += delay;
        req.endTime = req.resolvedStartTime + req.resolvedDuration;
      }
      // Remove the finished connection
      const idx = stillActive.indexOf(earliest);
      stillActive.splice(idx, 1);
    }

    stillActive.push({ endTime: req.endTime });
    activeByCat.set(req.category, stillActive);
  }

  return sorted;
}
