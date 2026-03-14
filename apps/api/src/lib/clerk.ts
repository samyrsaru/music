import { createClerkClient } from '@clerk/backend'

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
})

export async function getUserEmail(clerkUserId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(clerkUserId)
    return user.primaryEmailAddress?.emailAddress || user.emailAddresses[0]?.emailAddress || null
  } catch (error) {
    console.error('Failed to fetch user from Clerk:', error)
    return null
  }
}
