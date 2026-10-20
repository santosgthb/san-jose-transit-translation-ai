import { Router, type IRouter } from "express";
import { GetTransitMatchesQueryParams, GetTransitMatchesResponse, ResolveTransitRequestBody, ResolveTransitRequestResponse, ClassifyTransitInputBody, ClassifyTransitInputResponse } from "@workspace/api-zod";
import { matchTransit } from "../lib/transit-provider";
import { resolveRiderRequest } from "../lib/natural-transit";
import { classifyInputIntent } from "../lib/transit-intent";

const router: IRouter = Router();
router.post("/transit/classify", (req, res): void => {
  const input = ClassifyTransitInputBody.safeParse(req.body);
  if (!input.success || !input.data.message.trim()) {
    res.status(400).json({ error: "Enter a question or issue description." });
    return;
  }
  res.json(ClassifyTransitInputResponse.parse({ intent: classifyInputIntent(input.data.message) }));
});
router.post("/transit/request", async (req, res): Promise<void> => {
  const input = ResolveTransitRequestBody.safeParse(req.body);
  if (!input.success || !input.data.message.trim()) {
    res.status(400).json({ error: "Enter a transit question." });
    return;
  }
  const result = await resolveRiderRequest(input.data);
  res.json(ResolveTransitRequestResponse.parse(result));
});
router.get("/transit/matches", async (req, res): Promise<void> => {
  const query = GetTransitMatchesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Enter a valid route or stop search." });
    return;
  }
  try {
    const matches = await matchTransit(query.data.route?.trim() ?? "", query.data.stop?.trim() ?? "");
    res.json(GetTransitMatchesResponse.parse(matches));
  } catch {
    req.log.warn("Transit reference lookup unavailable");
    res.json(GetTransitMatchesResponse.parse({
      routes: [], stops: [],
      message: "Transit reference data is temporarily unavailable. You can still save your report without verified live context.",
    }));
  }
});
export default router;