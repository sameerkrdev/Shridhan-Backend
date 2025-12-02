import { Permit } from "permitio";
import env from "@/config/dotenv.js";

const permit = new Permit({
  // in production, you might need to change this url to fit your deployment
  pdp: "https://cloudpdp.api.permit.io",
  // your api key
  token: env.PERMIT_API_KEY,
});

export default permit;
