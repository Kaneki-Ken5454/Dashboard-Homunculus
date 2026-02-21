# Cannot pull / cannot automatically merge

If GitHub says **"Can't automatically merge"** or local `git pull` fails due to conflicts:

## 1) Rebase your feature branch on latest main

```bash
git checkout <your-feature-branch>
git fetch origin main
git rebase origin/main
```

Or use the helper script in this repo:

```bash
scripts/fix-cannot-pull.sh origin main
```

## 2) Resolve conflicts

Open the listed files, resolve conflict markers, then:

```bash
git add <resolved-files>
git rebase --continue
```

Repeat until rebase completes.

## 3) Push updated history

```bash
git push --force-with-lease
```

Use `--force-with-lease` (not `--force`) to avoid clobbering others' work.

## 4) If you need to abort

```bash
git rebase --abort
```
