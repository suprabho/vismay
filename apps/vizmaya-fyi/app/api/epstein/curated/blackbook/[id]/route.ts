import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env vars");
  return createClient(url, anon);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const sb = client();

  const bbR = await sb
    .from("epstein_blackbook")
    .select(
      "id, page, page_link, name, surname, first_name, company, address_type, address, zip, city, country, phone_generic, phone_work, phone_home, phone_mobile, email, lat, lng"
    )
    .eq("id", id)
    .maybeSingle();

  const entry = bbR.data as
    | {
        id: number;
        page: number | null;
        page_link: string | null;
        name: string | null;
        surname: string | null;
        first_name: string | null;
        company: string | null;
        address_type: string | null;
        address: string | null;
        zip: string | null;
        city: string | null;
        country: string | null;
        phone_generic: string | null;
        phone_work: string | null;
        phone_home: string | null;
        phone_mobile: string | null;
        email: string | null;
        lat: number | null;
        lng: number | null;
      }
    | null;

  if (!entry) {
    return NextResponse.json({ blackbook: null, persons: [] });
  }

  // Match epstein_persons by surname when available. Surname matching is the
  // same heuristic the person API uses in reverse — anchor on the
  // structured surname column to avoid noise from common name tokens.
  let persons: Array<{ entity_id: string; name: string }> = [];
  const surname = entry.surname?.trim().toLowerCase();
  if (surname && surname.length >= 4) {
    const personsR = await sb
      .from("epstein_persons")
      .select("entity_id, name")
      .ilike("name", `%${surname}%`)
      .limit(12);
    persons = (personsR.data ?? []) as Array<{ entity_id: string; name: string }>;
  }

  return NextResponse.json({ blackbook: entry, persons });
}
