import { NextResponse } from "next/server";
import { fail, guard, providerFail, readJson } from "@/lib/http";
import { adjust } from "@/lib/providers";

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const b = await readJson(req);
  const reponse = typeof b?.reponse === "string" ? b.reponse.trim() : "";
  const consigne = typeof b?.consigne === "string" ? b.consigne.trim().slice(0, 200) : "";
  if (!reponse || reponse.length > 1500) return fail(400, "Réponse absente ou trop longue.");
  if (!consigne) return fail(400, "Dis ce que tu veux changer.");
  try {
    return NextResponse.json(await adjust(reponse, consigne));
  } catch (e) {
    return providerFail(e);
  }
}
