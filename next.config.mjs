import { localTunnelConfig } from './scripts/local-tunnel-config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = localTunnelConfig(process.env);

export default nextConfig;
