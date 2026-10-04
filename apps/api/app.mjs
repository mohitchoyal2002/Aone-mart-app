// Vercel bundles compiled ESM, preserving our NodeNext TypeScript configuration.
import express from "express";
import { app } from "./dist/app.js";
const handler = express();
handler.disable("x-powered-by");
handler.use(app);
export default handler;
