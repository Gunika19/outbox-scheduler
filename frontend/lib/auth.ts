import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  // Google ID tokens expire after 1 hour and we don't refresh them (demo trade-off),
  // so the session lasts 1 hour too. Any 401 from the API also signs the user out.
  session: { strategy: "jwt", maxAge: 60 * 60 },
  callbacks: {
    async jwt({ token, account }) {
      // `account` is only present right after sign-in: keep Google's id_token.
      if (account?.id_token) token.idToken = account.id_token;
      return token;
    },
    async session({ session, token }) {
      session.idToken = token.idToken; // the backend verifies this as a Bearer token
      return session;
    },
  },
  pages: { signIn: "/" },
};
