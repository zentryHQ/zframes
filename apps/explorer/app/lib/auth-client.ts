"use client";

import { createAuthClient } from "better-auth/react";

// Same-origin; baseURL is inferred from the browser. Used by the sign-in UI +
// any client that needs the session.
export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
