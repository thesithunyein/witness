/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Uses the repo-root node_modules for @noble/curves if ever needed, and keeps
  // the build tolerant of the monorepo-ish layout (contracts/ + app/).
  outputFileTracingRoot: undefined,
  /**
   * The developer page used to live at /integrate. It is named for what it is
   * now, and the old address forwards instead of 404ing: it was printed in a
   * shipped README, so someone still has that link somewhere.
   */
  async redirects() {
    return [{ source: "/integrate", destination: "/docs", permanent: true }];
  },
};

export default nextConfig;
