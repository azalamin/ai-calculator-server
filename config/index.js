import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join((process.cwd(), '.env')) })

export default {
    sensitivity_key: process.env.SENSITIVITY_API_KEY,
    openapi_key: process.env.OPENAI_API_KEY,
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    youtubeApiKey: process.env.YOUTUBE_API_KEY,
    youtubeApiKey2: process.env.YOUTUBE_API_KEY2,
    youtubeApiKey3: process.env.YOUTUBE_API_KEY3,
    youtubeApiKey4: process.env.YOUTUBE_API_KEY4,
    channelId: process.env.CHANNEL_ID,
    twitterConsumerKey: process.env.TWITTER_CONSUMER_KEY,
    twitterConsumerSecret: process.env.TWITTER_CONSUMER_SECRET_KEY,
    twitterBearerToken: process.env.TWITTER_BEARER_TOKEN
}