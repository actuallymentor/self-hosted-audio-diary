FROM ghcr.io/puppeteer/puppeteer:25.9.0@sha256:5c341215d78353c3416b6c92aae9fac66e8f11c146c3753234980443d6792f8f

USER root
WORKDIR /workspace

# Keep test dependencies coupled to package-lock.json. Babysit mounts the host
# workspace's node_modules separately, so bind-mounting it into sibling Docker
# containers can silently expose stale packages.
COPY --chown=pptruser:pptruser package.json package-lock.json ./
RUN chown pptruser:pptruser /workspace

USER pptruser
RUN npm ci --ignore-scripts
