# Repository access

- Keep `origin` on `git@github.com:actuallymentor/self-hosted-audio-diary.git`.
- Use SSH for all repository access. Never replace the remote with an HTTPS URL.
- Agents may always use the ignored repo-local `.ssh_key` deploy key. Configure Git
  with `ssh -i .ssh_key -o IdentitiesOnly=yes` when needed.
- Never commit `.ssh_key` or `.ssh_key.pub`.
