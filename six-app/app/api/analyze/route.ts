import { NextResponse } from "next/server";
import { fail, guard, providerFail, readJson } from "@/lib/http";
import { analyze } from "@/lib/providers";
import { MAX_CHARS } from "@/lib/types";

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = await readJson(req);
  const conversation = typeof body?.conversation === "string" ? body.conversation.trim() : "";
  if (!conversation) return fail(400, "Colle une conversation d'abord.");
  if (conversation.length > MAX_CHARS) return fail(400, `La conversation dépasse ${MAX_CHARS} caractères.`);
  try {
    return NextResponse.json(await analyze(conversation));
  } catch (e) {
    return providerFail(e);
  }
}
