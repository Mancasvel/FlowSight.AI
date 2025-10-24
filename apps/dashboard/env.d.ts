declare namespace NodeJS {
  interface ProcessEnv {
    // MongoDB
    MONGODB_URI: string;
    
    // Pusher
    PUSHER_APP_ID: string;
    PUSHER_KEY: string;
    PUSHER_SECRET: string;
    PUSHER_CLUSTER: string;
    NEXT_PUBLIC_PUSHER_KEY: string;
    NEXT_PUBLIC_PUSHER_CLUSTER: string;
    
    // NextAuth
    NEXTAUTH_URL: string;
    NEXTAUTH_SECRET: string;
    
    // GitHub OAuth
    GITHUB_ID: string;
    GITHUB_SECRET: string;
    
    // AI (Optional)
    OPENROUTER_API_KEY?: string;
    OPENAI_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    DEFAULT_AI_MODEL?: string;
    
    // API
    API_SECRET_KEY?: string;
  }
}


