import { NextResponse } from "next/server";
import { fail, guard, providerFail, readJson } from "@/lib/http";
import { isSituation } from "@/lib/prompt";
import { topics } from "@/lib/providers";

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const b = await readJson(req, 4_000);
  if (!isSituation(b?.situation)) return fail(400, "Choisis une situation.");
  const contexte = typeof b?.contexte === "string" ? b.contexte.trim().slice(0, 200) : "";
  try {
    return NextResponse.json(await topics(b.situation, contexte));
  } catch (e) {
    return providerFail(e);
  }
}
