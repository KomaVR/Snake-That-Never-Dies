# Survival Loop

A self-preserving snake AI that learns safe shortcuts while a mathematical
guardian keeps it alive.

## Deploy to Vercel

1. Unzip this folder.
2. Put the files in a GitHub, GitLab, or Bitbucket repository.
3. In Vercel, choose **Add New → Project** and import that repository.
4. Keep the detected framework set to **Next.js** and select **Deploy**.

No environment variables or external services are required.

You can also deploy from a terminal after installing the Vercel CLI:

```bash
npm install
vercel
```

The AI stores its learned action values in each visitor's browser using local
storage, so its memory remains device-local.
