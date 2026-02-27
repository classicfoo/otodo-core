# Agent Workflow

- After making code changes, commit them and push to the current git branch by default.
- Website for this repo: `https://otodo-core.infinityfree.me`. If the website address is not known for a repo, ask the user and store it in `AGENTS.md`.
- Before pushing to a GitHub repo on Linux, back up the project database to `/home/michael/Documents/Backups/[project-folder]`. For this repo, run `scripts/backup_database.sh`.
- For InfinityFree-hosted backups, use FTP/FTPS, not SFTP. Remote backups should download the deployed database from `${FTP_DIR}/data/otodo.sqlite` into `/home/michael/Documents/Backups/otodo-core/` using env vars such as `BACKUP_SOURCE=remote`, `FTP_HOST`, `FTP_USER`, `FTP_PASS`, and `FTP_DIR`.
- Changes to the actual app should follow the normal backup, commit, and push workflow unless the user says otherwise.
- Changes only under `playground/` are local design iterations. They may be committed locally when useful, but they do not need to be pushed or deployed unless the user explicitly asks.
- If the user explicitly asks not to commit or not to push, follow the user request.
- Keep commits focused and use clear, descriptive commit messages.
- Whenever creating a new branch, update the branch name in `.github/workflows/deploy.yml` so deploys track that branch.
