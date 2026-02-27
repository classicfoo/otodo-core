# Agent Workflow

- After making code changes, commit them and push to the current git branch by default.
- Before pushing to a GitHub repo on Linux, back up the project database to `/home/michael/Documents/Backups/[project-folder]`. For this repo, run `scripts/backup_database.sh` so `data/otodo.sqlite` is backed up to `/home/michael/Documents/Backups/otodo-core/`.
- If the user explicitly asks not to commit or not to push, follow the user request.
- Keep commits focused and use clear, descriptive commit messages.
- Whenever creating a new branch, update the branch name in `.github/workflows/deploy.yml` so deploys track that branch.
