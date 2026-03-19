import { NextRequest } from "next/server";
import { GET, PUT } from "@/app/api/professor/settings/route";

export { GET };

export async function POST(req: NextRequest) {
  return PUT(req);
}
