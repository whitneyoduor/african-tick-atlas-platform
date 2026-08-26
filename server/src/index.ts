import express from "express";
import cors from "cors";
import { occurrenceRouter } from "./routes/occurrences.js";
import { epidemiologicalRouter } from "./routes/epidemiological.js";
import { genbankRouter } from "./routes/genbank.js";
import { locationsRouter } from "./routes/locations.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use("/api/occurrences", occurrenceRouter);
app.use("/api/epidemiological", epidemiologicalRouter);
app.use("/api/genbank", genbankRouter);
app.use("/api/locations", locationsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
