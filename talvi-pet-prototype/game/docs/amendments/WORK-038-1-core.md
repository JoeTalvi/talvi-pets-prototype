# Amendment: core.md CONTRACT-CONTENT (WORK-038-1, DEC-049)

- Date: 2026-11-02. Lane WORK-038-1, RUN-005, task TASK-238. As built at d86a5e2.
- Contract-table rows covered: `systems/core.md` (no CONTRACT change expected) and `strings.json` / CONTRACT-CONTENT.
- No CONTRACT-STATE, CONTRACT-ACTIONS or CONTRACT-EVENTS change: no sim rule, state field, action or event was added or changed (`git diff 71f575c -- src/sim` is empty). "Held 0 before the grant" is an argument the caller computes (`RewardCardSpec.items.heldBefore`); nothing is stored.
- CONTRACT-CONTENT strings (`src/content/strings.json`):
  - `tpp.reward.verb` = "{pet} can now {verb}" (placeholder wording, gate Q4(a); `{verb}` is `verbs[].name`).
  - `tpp.reward.new` = "New" — the reward card's "New" ribbon (spec §0). FORK: the order named one key; the ribbon needs its visible text from content, so a second key was added rather than a literal in code. Reverse cost: delete the key and the ribbon text.
