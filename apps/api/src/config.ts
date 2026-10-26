import "dotenv/config";
export function production() {
  return process.env.NODE_ENV === "production";
}
export function assertEnvironment() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (production()) {
    for (const key of [
      "APP_ORIGIN",
      "WECHAT_APP_ID",
      "WECHAT_APP_SECRET",
      "CONTACT_EMAIL",
      "COS_BUCKET",
      "COS_REGION",
      "COS_SECRET_ID",
      "COS_SECRET_KEY",
    ])
      if (!process.env[key])
        throw new Error(`${key} is required in production`);
    if (
      process.env.ENABLE_DEV_LOGIN === "true" ||
      !process.env.APP_ORIGIN?.startsWith("https://")
    )
      throw new Error("Unsafe production configuration");
  }
}
