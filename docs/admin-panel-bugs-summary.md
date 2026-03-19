# Admin Panel Bug Fixes & Investigation — March 19, 2026

## Summary

Fixed **Bug #2** (auto-open next item). Investigated **Bug #1** and **Bug #3** with findings documented below.

---

## Bug #2: Auto-Open Next Item ✅ FIXED

**Issue:** After approving/rejecting a signal or proposal, the user had to manually click the next item. Very inconvenient during bulk review.

**Root Cause:** After taking an action, the code called `setSelectedItem(null)`, clearing the detail panel entirely.

**Solution Implemented:**
1. Modified `UnifiedReviewList` to export filtered items via `onFilteredItemsChange` callback
2. `Admin.tsx` now tracks `filteredItems` state
3. Added `selectNextItem()` helper that finds the current item in the filtered array and auto-selects the next one
4. Updated handlers (`handleSignalAction`, `handleProposalApprove`, `handleProposalReject`) to call `selectNextItem()` instead of just clearing selection

**Commit:** `b1da8eb` — "fix(admin): auto-open next pending item after taking action"

**Behavior:**
- User approves/rejects item
- Next pending item in the filtered list automatically opens
- If it's the last item, selection clears (no more items)
- Firestore subscription updates will automatically remove the approved item from the list shortly after

---

## Bug #1: Approved Items Staying on Pending List — INVESTIGATION

**Issue:** Even after approval, items remain visible in the "pending" filtered review list.

**Expected Behavior:** Firestore real-time subscription should automatically remove items when their status changes from "pending" to "approved" (since the query filters by `status === "pending"`).

**Technical Analysis:**
- Signal subscription uses: `query(signalsRef, where("status", "==", "pending"), orderBy("fetched_at", "desc"))`
- When an item is updated to `status: "approved"`, the Firestore listener should trigger with updated results
- There may be a brief lag (milliseconds) before Firestore notifies of the change

**Possible Causes:**
1. **Firestore latency:** The subscription update might lag slightly behind the write, causing a brief visual flicker
2. **Race condition in selectNextItem():** When we call `selectNextItem()` immediately after writing to Firestore, the filtered items might not have updated yet
3. **Client-side caching:** (Unlikely) but could be Firestore SDK behavior

**Recommendation for Testing:**
1. Try the admin panel with the auto-next fix (Bug #2) now in place
2. Watch carefully if approved items disappear immediately or if there's a brief lag
3. If items persist for >1 second, check Firestore logs for subscription delays
4. Consider adding an optimistic update: immediately remove the approved item from local state

**Note:** With Bug #2 fixed, users won't notice this as much since they'll automatically move to the next item, and the list will update in the background.

---

## Bug #3: Signals from Other Sources Not Appearing — INVESTIGATION

**Issue:** User reports not seeing signals from multiple sources in the review list. Only seeing signals from one or two sources.

**Data Sources Configured:** The system has **17 sources** configured across 5 categories:
- **Research (5):** arXiv, Alignment Forum, AI Safety Newsletter, Nature Machine Intelligence, AI Now Institute
- **Journalism (5):** MIT Tech Review, Wired, Ars Technica, IEEE Spectrum, The Guardian
- **Tech/Community (2):** The Verge, TechCrunch
- **Active Search (1):** GDELT API
- **Newsletters (4):** TLDR AI, Import AI, Last Week in AI, Ben's Bites

**Signal Scout Agent:**
- Scheduled to run every **12 hours** (not 6h as documented in old CLAUDE.md)
- Fetches from all enabled sources
- Stores signals with `source_name` field populated
- No source filtering is applied in the admin review UI — all sources are queried equally

**Possible Causes:**

1. **RSS Feed Issues:** Some sources may have broken feeds or require auth
   - Check logs: `/Users/dehakuran/Projects/ai-4-society/functions/src/agents/signal-scout/index.ts` logs which sources fail to fetch
   - Each source has a try/catch with warning logging

2. **Last Run Timing:** If Signal Scout hasn't run in >12 hours, there won't be new signals
   - Check Firebase Function execution logs
   - Manually trigger via `triggerSignalScout` Cloud Function (available via HTTP)

3. **Credibility/Threshold Filtering:** Signals are filtered by confidence score
   - All sources have credibility scores (0.5-0.9)
   - Signals with low confidence might be filtered out
   - Check `SignalScout` config in Firestore: `agents/signal-scout/config/current`

4. **Source-Specific Issues:**
   - Some RSS feeds might be down
   - GDELT API might be rate-limited
   - Feed parsing might fail for certain formats

**Recommendation for Testing:**

1. **Check Recent Signal Scout Runs:**
   ```bash
   # View Firebase Function logs for scheduledSignalScout
   # Check last execution timestamp and error messages
   ```

2. **Manually Trigger Signal Scout:**
   - Call the `triggerSignalScout` Cloud Function via admin panel or console
   - Watch logs to see which sources fetch successfully vs. fail
   - Count articles from each source

3. **Verify Signal Storage:**
   ```sql
   -- In Firestore, check signals collection
   SELECT source_name, COUNT(*) as count FROM signals
   WHERE status = 'pending'
   GROUP BY source_name
   ```

4. **Check Agent Config:**
   - Firestore path: `agents/signal-scout/config/current`
   - Verify all sources are `enabled: true`
   - Check if credibility overrides are causing filtering

5. **Review Source URLs:**
   - Test RSS feeds manually to ensure they're alive
   - Check GDELT API quotas

---

## Files Modified

- `src/pages/Admin.tsx` — Added auto-selection logic, tracks filtered items
- `src/components/admin/UnifiedReviewList.tsx` — Exports filtered items via callback

## Next Steps

1. ✅ **Bug #2** — Merged and ready for testing
2. **Bug #1** — Monitor with Bug #2 fix in place; may resolve itself
3. **Bug #3** — Requires manual investigation of Signal Scout logs and Firestore data
