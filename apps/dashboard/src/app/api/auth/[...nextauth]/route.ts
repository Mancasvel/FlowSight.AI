import NextAuth, { NextAuthOptions } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import { getUsersCollection } from '@/lib/mongodb';

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user.email) return false;

      try {
        // Store or update user in database
        const users = await getUsersCollection();
        await users.updateOne(
          { email: user.email },
          {
            $set: {
              userId: user.email,
              email: user.email,
              name: user.name || user.email,
              avatar: user.image,
              githubId: account?.providerAccountId,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              role: 'dev', // Default role
              projectIds: [],
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );

        return true;
      } catch (error) {
        console.error('Error during sign in:', error);
        return false;
      }
    },
    async session({ session, token }) {
      if (session.user) {
        // Fetch user role from database
        try {
          const users = await getUsersCollection();
          const user = await users.findOne({ email: session.user.email });
          
          if (user) {
            (session.user as any).role = user.role;
            (session.user as any).userId = user.userId;
          }
        } catch (error) {
          console.error('Error fetching user role:', error);
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

