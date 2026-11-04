// The collector rewrites this file on the `data` branch every five minutes.
export const DATA_URL =
  process.env.NEXT_PUBLIC_ASSAYER_DATA_URL ??
  "https://raw.githubusercontent.com/midexol/assayer/data/site/dashboard.json";

export const RAW_URL = "https://github.com/midexol/assayer/tree/data/raw";

export const THESIS_URL =
  process.env.NEXT_PUBLIC_ASSAYER_THESIS_URL ??
  "https://raw.githubusercontent.com/midexol/assayer/data/site/thesis.json";
