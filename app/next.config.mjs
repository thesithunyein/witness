/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Uses the repo-root node_modules for @noble/curves if ever needed, and keeps
  // the build tolerant of the monorepo-ish layout (contracts/ + app/).
  outputFileTracingRoot: undefined,
};

export default nextConfig;
