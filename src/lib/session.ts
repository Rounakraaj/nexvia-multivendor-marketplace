import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// One session lookup per request, shared by the layout, header and pages.
export const getSession = cache(() => getServerSession(authOptions));
