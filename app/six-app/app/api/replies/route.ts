import { NextResponse } from "next/server";
import { fail, guard, providerFail, readJson } from "@/lib/http";
import { isCanal, isLongueur, isTon, parseStyle } from "@/lib/prompt";
import { replies } from "@/lib/providers";
import { MAX_CHARS } from "@/lib/types";

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const b = await readJson(req);
  const conversation = typeof b?.conversation === "string" ? b.conversation.trim() : "";
  const objectif = typeof b?.objectif === "string" ? b.objectif.trim().slice(0, 120) : "";
  const precision = typeof b?.precision === "string" ? b.precision.trim().slice(0, 300) : undefined;
  if (!conversation || conversation.length > MAX_CHARS) return fail(400, "Conversation absente ou trop longue.");
  if (!objectif) return fail(400, "Choisis un objectif.");
  if (!isTon(b?.ton) || !isLongueur(b?.longueur)) return fail(400, "Ton ou longueur invalide.");
  try {
    return NextResponse.json(
      // Réseau inconnu ou absent : ignoré, Six garde la forme de la conversation.
      await replies({ conversation, objectif, ton: b.ton, longueur: b.longueur, precision, style: parseStyle(b.style), canal: isCanal(b.canal) ? b.canal : undefined }),
    );
  } catch (e) {
    return providerFail(e);
  }
}
