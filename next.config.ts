import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "0.0.0.0", "172.20.72.184"],
  outputFileTracingIncludes: {
    "/*": [
      "./src/templates/pulse-survey-master-template.xlsx",
      "./src/templates/pulse-survey-department-template.xlsx",
    ],
  },
};

export default nextConfig;
