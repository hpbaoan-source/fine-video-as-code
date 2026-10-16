# GitHub support ticket — request dangling object purge

> **Use this template** at https://support.github.com/contact?tags=rrs-priv
> to ask GitHub to remove pre-`311bcd0` commits that are still findable via
> direct SHA hash (they exist as "dangling" objects in the repository's
> internal storage for up to 90 days after a force-push).
>
> **When to send:** After this commit is pushed, send the ticket ASAP so
> GitHub's GC runs before any external copy of the old SHAs can be cached
> elsewhere.

---

## Subject

`Repository privacy: request immediate garbage collection of dangling objects after force-push`

## Body

Hello,

I maintain https://github.com/hpbaoan-source/fine-video-as-code and recently performed a force-push to rewrite the commit history of the `main` branch. The reason was that an earlier commit (`311bcd045f6625072f628d2add5d47b74be818b4`) contained sensitive references in its commit message that should not be publicly visible.

**What I did already:**

- Used `git filter-repo --replace-message` with the patterns VNPT, sang kien, FFB900, 0050AA, anhpb, etc. — all replaced with `[redacted]` in the rewritten commit message
- Force-pushed `main` to `28e54ce` (then later to `8c7d938`) — the rewritten commit no longer appears in any branch's reflog
- Verified the rewritten message is clean by fetching `https://api.github.com/repos/hpbaoan-source/fine-video-as-code/commits?sha=311bcd0` — content is now `[redacted]` (as expected)

**What I'm asking:**

I understand that git's force-push only moves the branch ref — the underlying objects for the pre-filter-repo commits are kept by GitHub as "dangling" objects for up to 90 days. Anyone with the old commit SHAs can still fetch them via `git fetch origin <old-sha>`.

Could you please run a manual garbage collection on the repository to purge these dangling objects immediately? The repository is public, and I want to make sure no sensitive content is reachable from any historical SHA.

**Repository:** hpbaoan-source/fine-video-as-code
**Branch:** main
**Current HEAD SHA:** 8c7d938 (and a previous force-push to 28e54ce)
**Old SHAs that should be purged** (from before the force-push):
- `d783f87` (initial scaffold — contained "VNPT IT" reference in commit message)
- `8fc76e5` (M1-M5 — clean but pre-filter-repo)
- `7fba032` (wip commit before filter-repo run)
- `434846b` (intermediate SHA during filter-branch attempts)
- And any earlier commits from the original author

**If there's anything else I need to do on my end** (e.g. clone, rewrite, push to a fresh repo, or run `git reflog expire --expire=now --all && git gc --prune=now` on the bare repo), please let me know — I can do that from my local machine if it helps.

Thank you for the help.

---

## Notes

- This is a **request, not a demand** — GitHub's policy allows them to decline if the repo has too many active clones.
- If declined, the dangling objects will be GC'd automatically within 90 days. After 90 days, the SHAs become truly unreachable.
- This is a clean best-effort purge; the primary fix (rewriting the visible commit message) is already in place.
